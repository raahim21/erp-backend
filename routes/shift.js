const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Shift = require("../models/Shift");
const Schedule = require("../models/Schedule");
const User = require("../models/User");

// Create a shift
router.post("/", auth, async (req, res) => {
  try {
    const {
      schedule,
      date,
      startTime,
      endTime,
      requiredPositions,
      assignedEmployees,
    } = req.body;

    // Validate required fields
    if (!schedule) {
      return res.status(400).json({ msg: "Schedule ID is required" });
    }
    if (!date || !startTime || !endTime) {
      return res
        .status(400)
        .json({ msg: "Date, start time, and end time are required" });
    }

    // Validate schedule exists
    const scheduleDoc = await Schedule.findById(schedule);
    if (!scheduleDoc) {
      return res.status(404).json({ msg: "Schedule not found" });
    }

    // Parse AM/PM time to minutes
    const parseTime = (timeStr) => {
      const [time, period] = timeStr.split(" ");
      if (!/^\d{2}:\d{2}$/.test(time) || !/^(AM|PM)$/i.test(period)) {
        throw new Error("Time must be in HH:MM AM/PM format");
      }
      let [hours, minutes] = time.split(":").map(Number);
      if (period.toUpperCase() === "PM" && hours !== 12) hours += 12;
      if (period.toUpperCase() === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    // Validate dates and times
    if (
      new Date(date) < new Date(scheduleDoc.startDate) ||
      new Date(date) > new Date(scheduleDoc.endDate)
    ) {
      return res
        .status(400)
        .json({ msg: "Shift date must be within schedule dates" });
    }

    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes >= endMinutes) {
      return res
        .status(400)
        .json({ msg: "Start time must be before end time" });
    }

    // Validate required positions
    if (!requiredPositions || !requiredPositions.length) {
      return res
        .status(400)
        .json({ msg: "At least one required position is needed" });
    }
    for (const pos of requiredPositions) {
      if (!pos.jobPosition || pos.count < 1) {
        return res.status(400).json({ msg: "Position and count are required" });
      }
    }

    // Validate assigned employees
    const validEmployees = assignedEmployees?.filter((id) => id != null) || [];
    const totalRequired = requiredPositions.reduce(
      (sum, pos) => sum + pos.count,
      0
    );
    if (validEmployees.length > totalRequired) {
      return res.status(400).json({ msg: "Too many employees assigned" });
    }

    for (const userId of validEmployees) {
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
        assignedEmployees: userId,
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

    // Create shift
    const shift = new Shift({
      schedule,
      date,
      startTime,
      endTime,
      requiredPositions,
      assignedEmployees: validEmployees,
    });
    await shift.save();

    // Update schedule with new shift ID
    await Schedule.findByIdAndUpdate(schedule, {
      $push: { shifts: shift._id },
    });

    res.status(201).json(shift);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message || "Server error" });
  }
});

// Update a shift
router.put("/:id", auth, async (req, res) => {
  try {
    const {
      schedule,
      date,
      startTime,
      endTime,
      requiredPositions,
      assignedEmployees,
    } = req.body;

    // Validate required fields
    if (!schedule || !date || !startTime || !endTime) {
      return res.status(400).json({
        msg: "Schedule ID, date, start time, and end time are required",
      });
    }

    // Validate schedule exists
    const scheduleDoc = await Schedule.findById(schedule);
    if (!scheduleDoc) {
      return res.status(404).json({ msg: "Schedule not found" });
    }

    // Parse AM/PM time to minutes
    const parseTime = (timeStr) => {
      const [time, period] = timeStr.split(" ");
      if (!/^\d{2}:\d{2}$/.test(time) || !/^(AM|PM)$/i.test(period)) {
        throw new Error("Time must be in HH:MM AM/PM format");
      }
      let [hours, minutes] = time.split(":").map(Number);
      if (period.toUpperCase() === "PM" && hours !== 12) hours += 12;
      if (period.toUpperCase() === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    // Validate dates and times
    if (
      new Date(date) < new Date(scheduleDoc.startDate) ||
      new Date(date) > new Date(scheduleDoc.endDate)
    ) {
      return res
        .status(400)
        .json({ msg: "Shift date must be within schedule dates" });
    }

    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes >= endMinutes) {
      return res
        .status(400)
        .json({ msg: "Start time must be before end time" });
    }

    // Validate required positions
    if (!requiredPositions || !requiredPositions.length) {
      return res
        .status(400)
        .json({ msg: "At least one required position is needed" });
    }
    for (const pos of requiredPositions) {
      if (!pos.jobPosition || pos.count < 1) {
        return res.status(400).json({ msg: "Position and count are required" });
      }
    }

    // Validate assigned employees
    const validEmployees = assignedEmployees?.filter((id) => id != null) || [];
    const totalRequired = requiredPositions.reduce(
      (sum, pos) => sum + pos.count,
      0
    );
    if (validEmployees.length > totalRequired) {
      return res.status(400).json({ msg: "Too many employees assigned" });
    }

    for (const userId of validEmployees) {
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
        assignedEmployees: userId,
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

    // Update shift
    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          schedule,
          date,
          startTime,
          endTime,
          requiredPositions,
          assignedEmployees: validEmployees,
        },
      },
      { new: true, runValidators: true }
    );

    if (!shift) {
      return res.status(404).json({ msg: "Shift not found" });
    }

    res.json(shift);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message || "Server error" });
  }
});

// Delete a shift
router.delete("/:id", auth, async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res.status(404).json({ msg: "Shift not found" });
    }
    await Schedule.findByIdAndUpdate(shift.schedule, {
      $pull: { shifts: shift._id },
    });
    await Shift.deleteOne({ _id: req.params.id });
    res.status(200).json({ msg: "Shift deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
