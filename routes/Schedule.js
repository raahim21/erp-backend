const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const Schedule = require("../models/Schedule");
const Shift = require("../models/Shift");
const User = require("../models/User");
const dateFilter = require("../utils/dateFilter");
const { default: mongoose } = require("mongoose");

// Get all schedules
router.get("/", auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 1,
      search,
      status,
      startDate,
      endDate,
      username,
    } = req.query;
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    query = dateFilter.applyDateFilter(
      query,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    if (username) {
      const createdBy = await User.findOne({ username: username });
      if (createdBy) {
        query.createdBy = createdBy._id;
      }
    }

    const totalResults = await Schedule.countDocuments(query);
    const totalPages = Math.ceil(totalResults / limit);

    const schedules = await Schedule.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate({
        path: "shifts",
        populate: {
          path: "assignedEmployees.user",
          model: "User",
          select: "username _id jobPosition",
        },
      })
      .populate("createdBy");
    res.json({ schedules, totalResults, totalPages, page: Number(page) });
  } catch (err) {
    console.error("Error fetching schedules:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Get a single schedule
router.get("/:id", auth, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate({
        path: "shifts",
        populate: {
          path: "assignedEmployees.user",
          model: "User",
          select: "username jobPosition _id",
        },
      })
      .populate("createdBy", "username _id")
      .lean();
    if (!schedule) {
      return res.status(404).json({ msg: "Schedule not found" });
    }
    schedule.shifts = Array.isArray(schedule.shifts) ? schedule.shifts : [];
    res.json(schedule);
  } catch (err) {
    console.error("Error fetching schedule:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Update a schedule
router.put("/:id", auth, async (req, res) => {
  try {
    const { name, startDate, endDate, notes, status, shifts } = req.body;

    // Validate required fields
    if (!name || !startDate || !endDate) {
      return res
        .status(400)
        .json({ msg: "Name, start date, and end date are required" });
    }

    // Validate date range
    if (new Date(startDate) >= new Date(endDate)) {
      return res
        .status(400)
        .json({ msg: "Start date must be before end date" });
    }

    // Validate status
    if (status && !["draft", "published", "archived"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status value" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Parse "HH:MM" (24h) into total minutes
    const parseTime = (timeStr) => {
      if (!/^\d{2}:\d{2}$/.test(timeStr)) {
        throw new Error("Time must be in HH:MM format");
      }
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    // Prepare update data
    const updateData = {
      name,
      startDate,
      endDate,
      notes: notes || "",
      status: status || "draft",
      updatedAt: new Date(),
    };

    // Only update shifts array if provided
    if (Array.isArray(shifts)) {
      const shiftIds = [];
      for (const shiftData of shifts) {
        const { date, startTime, endTime, requiredPositions, assignedEmployees = [] } = shiftData;

        if (!date || !startTime || !endTime) {
          return res.status(400).json({ msg: "All shift fields are required" });
        }
        if (new Date(date) < start || new Date(date) > end) {
          return res
            .status(400)
            .json({ msg: "Shift date must be within schedule dates" });
        }

        const startMinutes = parseTime(startTime);
        const endMinutes = parseTime(endTime);

        if (!requiredPositions.length) {
          return res
            .status(400)
            .json({ msg: "At least one required position is needed" });
        }

        for (const pos of requiredPositions) {
          if (!pos.jobPosition || pos.count < 1) {
            return res
              .status(400)
              .json({ msg: "Position and count are required" });
          }
        }

        const totalRequired = requiredPositions.reduce(
          (sum, pos) => sum + pos.count,
          0
        );
        const validEmployees =
          assignedEmployees?.filter((emp) => emp != null) || [];
        if (validEmployees.length > totalRequired) {
          return res.status(400).json({ msg: "Too many employees assigned" });
        }

        for (const emp of validEmployees) {
          const userId = emp.user?._id || emp._id;
          const user = await User.findById(userId);
          if (!user) {
            return res.status(404).json({ msg: `User ${userId} not found` });
          }
          if (
            !requiredPositions.some((pos) => pos.jobPosition === user.jobPosition)
          ) {
            return res
              .status(400)
              .json({ msg: `User ${user.username} job position does not match` });
          }
          const dayName = new Date(date).toLocaleString("en-US", {
            weekday: "short",
          });
          const isAvailable = user.availability.some(
            (avail) => avail.includes(dayName) || avail.includes("all")
          );
          if (!isAvailable) {
            return res
              .status(400)
              .json({ msg: `User ${user.username} not available on ${dayName}` });
          }
          const weeklyShifts = await Shift.find({
            "assignedEmployees.user": userId,
            date: {
              $gte: new Date(date).setDate(new Date(date).getDate() - 7),
              $lte: date,
            },
          });
          const totalHours = weeklyShifts.reduce((sum, s) => {
            const startMins = parseTime(s.startTime);
            const endMins = parseTime(s.endTime);
            return sum + (endMins - startMins) / 60;
          }, 0);
          const newHours = (endMinutes - startMinutes) / 60;
          if (totalHours + newHours > user.maxHoursPerWeek) {
            return res
              .status(400)
              .json({ msg: `Exceeds max hours for user ${user.username}` });
          }
        }

        const employeesForDB = assignedEmployees.map((emp) => ({
          user: new mongoose.Types.ObjectId(emp.user?._id || emp._id),
          status: emp.status || "absent",
          enterIn: emp.enterIn || "",
          exitOut: emp.exitOut || "",
        }));

        let updatedShift;
        if (shiftData._id) {
          updatedShift = await Shift.findByIdAndUpdate(
            shiftData._id,
            {
              date,
              startTime,
              endTime,
              requiredPositions,
              assignedEmployees: employeesForDB,
            },
            { new: true, runValidators: true }
          );
          if (!updatedShift) {
            return res
              .status(404)
              .json({ msg: `Shift ${shiftData._id} not found` });
          }
        } else {
          updatedShift = new Shift({
            schedule: req.params.id,
            date,
            startTime,
            endTime,
            requiredPositions,
            assignedEmployees: employeesForDB,
          });
          await updatedShift.save();
        }
        shiftIds.push(updatedShift._id);
      }
      updateData.shifts = shiftIds;
    }

    // Update the schedule
    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate({
      path: "shifts",
      populate: {
        path: "assignedEmployees.user",
        model: "User",
        select: "username jobPosition _id",
      },
    });

    if (!schedule) {
      return res.status(404).json({ msg: "Schedule not found" });
    }

    res.json({ msg: "Schedule updated successfully", schedule });
  } catch (err) {
    console.error("Error updating schedule:", err);
    res.status(500).json({ msg: err.message || "Server error" });
  }
});

// Create a schedule
router.post("/", auth, requireRole("Manager", "Admin"), async (req, res) => {
  const { name, startDate, endDate, notes, status, shifts = [] } = req.body;
  console.log(
    "Creating schedule with data:",
    req.body.shifts[0]?.assignedEmployees
  );

  try {
    // Validate schedule
    if (!name || !startDate || !endDate) {
      return res
        .status(400)
        .json({ msg: "Name, start date, and end date are required" });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (status && !["draft", "published", "archived"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status value" });
    }

    // Create schedule
    const schedule = new Schedule({
      name,
      startDate,
      endDate,
      notes: notes || "",
      status: status || "draft",
      createdBy: req.user.id,
    });

    // Parse "HH:MM" (24h) into total minutes
    const parseTime = (timeStr) => {
      if (!/^\d{2}:\d{2}$/.test(timeStr)) {
        throw new Error("Time must be in HH:MM format");
      }
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    // Create shifts
    const shiftIds = [];
    for (const shiftData of shifts) {
      const { date, startTime, endTime, requiredPositions, assignedEmployees } =
        shiftData;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ msg: "All shift fields are required" });
      }
      if (new Date(date) < start || new Date(date) > end) {
        return res
          .status(400)
          .json({ msg: "Shift date must be within schedule dates" });
      }

      const startMinutes = parseTime(startTime);
      const endMinutes = parseTime(endTime);

      if (!requiredPositions.length) {
        return res
          .status(400)
          .json({ msg: "At least one required position is needed" });
      }

      for (const pos of requiredPositions) {
        if (!pos.jobPosition || pos.count < 1) {
          return res
            .status(400)
            .json({ msg: "Position and count are required" });
        }
      }

      const totalRequired = requiredPositions.reduce(
        (sum, pos) => sum + pos.count,
        0
      );
      const validEmployees =
        assignedEmployees?.filter((id) => id != null) || [];
      if (validEmployees.length > totalRequired) {
        return res.status(400).json({ msg: "Too many employees assigned" });
      }

      for (const emp of validEmployees) {
        const userId = emp._id || emp.user?._id || emp.user;
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ msg: `User ${userId} not found` });
        }
        if (
          !requiredPositions.some((pos) => pos.jobPosition === user.jobPosition)
        ) {
          return res
            .status(400)
            .json({ msg: `User ${user.username} job position does not match` });
        }
        const dayName = new Date(date).toLocaleString("en-US", {
          weekday: "short",
        });
        const isAvailable = user.availability.some(
          (avail) => avail.includes(dayName) || avail.includes("all")
        );
        if (!isAvailable) {
          return res
            .status(400)
            .json({ msg: `User ${user.username} not available on ${dayName}` });
        }
        const weeklyShifts = await Shift.find({
          "assignedEmployees.user": userId,
          date: {
            $gte: new Date(date).setDate(new Date(date).getDate() - 7),
            $lte: date,
          },
        });
        const totalHours = weeklyShifts.reduce((sum, s) => {
          const startMins = parseTime(s.startTime);
          const endMins = parseTime(s.endTime);
          return sum + (endMins - startMins) / 60;
        }, 0);
        const newHours = (endMinutes - startMinutes) / 60;
        if (totalHours + newHours > user.maxHoursPerWeek) {
          return res
            .status(400)
            .json({ msg: `Exceeds max hours for user ${user.username}` });
        }
      }

      let employeesForDB = assignedEmployees.map((emp) => ({
        user: new mongoose.Types.ObjectId(emp._id || emp.user?._id || emp.user),
        status: emp.status || "absent",
        enterIn: emp.enterIn || "",
        exitOut: emp.exitOut || "",
      }));

      const shift = new Shift({
        schedule: schedule._id,
        date,
        startTime,
        endTime,
        requiredPositions,
        assignedEmployees: employeesForDB,
      });

      await shift.save();
      shiftIds.push(shift._id);
    }

    schedule.shifts = shiftIds;
    await schedule.save();

    let populatedSchedule = await schedule.populate({
      path: "shifts",
      populate: { path: "assignedEmployees.user" },
    });

    res.status(201).json(populatedSchedule);
  } catch (err) {
    console.error("Error creating schedule:", err);
    res.status(500).json({ msg: err.message || "Server error" });
  }
});

// Delete a schedule
router.delete("/:id", auth, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ msg: "Schedule not found" });
    }
    await Shift.deleteMany({ schedule: req.params.id });
    await Schedule.deleteOne({ _id: req.params.id });
    res.status(200).json({ msg: "Schedule and associated shifts deleted" });
  } catch (err) {
    console.error("Error deleting schedule:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;