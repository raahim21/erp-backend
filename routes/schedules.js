const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const Schedule = require("../models/Schedule");
const Shift = require("../models/Shift");
const User = require("../models/User");
const LeaveRequest = require("../models/LeaveRequest"); // Import LeaveRequest model
const dateFilter = require("../utils/dateFilter");
const { default: mongoose } = require("mongoose");

// Get all schedules
router.get("/", auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
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
    if (status) {
      query.status = status;
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

// AI Schedule Generation
router.post("/generate-preview", auth, async (req, res) => {
    try {
        const { prompt, startDate, endDate } = req.body;
        if (!prompt || !startDate || !endDate) {
            return res.status(400).json({ msg: "Prompt, start date, and end date are required." });
        }

        const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

        const users = await User.find({}).select("username _id jobPosition availability maxHoursPerWeek").lean();
        const employeeContext = users.map(u => 
            `User ID: ${u._id}, Username: ${u.username}, Job Position: ${u.jobPosition}, Max Weekly Hours: ${u.maxHoursPerWeek}, Availability: ${JSON.stringify(u.availability)}`
        ).join('\n');

        const schema = {
            type: Type.OBJECT,
            properties: {
                shifts: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            date: { type: Type.STRING, description: "The date of the shift in YYYY-MM-DD format." },
                            requiredPositions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        jobPosition: { type: Type.STRING },
                                        count: { type: Type.INTEGER }
                                    },
                                    required: ["jobPosition", "count"]
                                }
                            },
                            assignedEmployees: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        user: { type: Type.OBJECT, properties: { _id: { type: Type.STRING, description: "The user's MongoDB ObjectId." }, username: { type: Type.STRING } } },
                                        startTime: { type: Type.STRING, description: "Start time in HH:MM format." },
                                        endTime: { type: Type.STRING, description: "End time in HH:MM format." }
                                    },
                                    required: ["user", "startTime", "endTime"]
                                }
                            }
                        },
                        required: ["date", "requiredPositions", "assignedEmployees"]
                    }
                }
            }
        };

        const fullPrompt = `You are a helpful assistant that creates work schedules.
        
        **User Request:** "${prompt}"
        
        **Schedule Constraints:**
        - The schedule must be between ${startDate} and ${endDate}.
        - You must respect each employee's availability and their maximum weekly hours.
        - Assign employees only to roles matching their job position.
        - Ensure all required positions in the user's request are filled for each shift.
        - Today's date is ${new Date().toISOString().split('T')[0]}.
        
        **Available Employees:**
        ${employeeContext}
        
        Generate the schedule and provide the output in a valid JSON format according to the provided schema.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const generatedData = JSON.parse(response.text);
        res.json(generatedData);

    } catch (err) {
        console.error("AI Generation Error:", err);
        res.status(500).json({ msg: err.message || "Failed to generate schedule with AI." });
    }
});


// Update a schedule
router.put("/:id", auth, async (req, res) => {
  try {
    const { name, startDate, endDate, notes, status, shifts } = req.body;

    if (!name || !startDate || !endDate) {
      return res
        .status(400)
        .json({ msg: "Name, start date, and end date are required" });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res
        .status(400)
        .json({ msg: "Start date must be before end date" });
    }
    if (status && !["draft", "published", "archived"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status value" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const parseTime = (timeStr) => {
      if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
        throw new Error(`Invalid time format: ${timeStr}. Must be HH:MM`);
      }
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const updateData = {
      name,
      startDate,
      endDate,
      notes: notes || "",
      status: status || "draft",
      updatedAt: new Date(),
    };

    if (Array.isArray(shifts)) {
      const shiftIds = [];
      const processedShifts = await Shift.find({ schedule: req.params.id }).select('_id');
      const existingShiftIds = new Set(processedShifts.map(s => s._id.toString()));

      for (const shiftData of shifts) {
        const { date, requiredPositions, assignedEmployees = [] } = shiftData;

        if (!date || !requiredPositions) {
          return res.status(400).json({ msg: "Shift date and required positions are mandatory." });
        }
        if (new Date(date) < start || new Date(date) > end) {
          return res
            .status(400)
            .json({ msg: "Shift date must be within schedule dates" });
        }

        const validEmployees =
          assignedEmployees?.filter((emp) => emp != null) || [];
        for (const emp of validEmployees) {
            const { startTime, endTime } = emp;
            if (!startTime || !endTime) {
                return res.status(400).json({ msg: "Each assigned employee must have a start and end time." });
            }
            
            const shiftStartMinutes = parseTime(startTime);
            const shiftEndMinutes = parseTime(endTime);
            if (shiftStartMinutes === shiftEndMinutes) {
              return res.status(400).json({ msg: "Shift start and end times cannot be the same." });
            }

            const userId = emp.user?._id || emp.user;
            if(!mongoose.Types.ObjectId.isValid(userId)){
              return res.status(400).json({ msg: `Invalid user ID format: ${userId}` });
            }
            const user = await User.findById(userId);
            if (!user) {
              return res.status(404).json({ msg: `User ${userId} not found` });
            }

            const shiftDate = new Date(date);
            shiftDate.setHours(0,0,0,0);
            const leaveConflict = await LeaveRequest.findOne({
                user: userId,
                status: "Approved",
                startDate: { $lte: shiftDate },
                endDate: { $gte: shiftDate }
            });
            if (leaveConflict) {
                return res.status(400).json({ msg: `Cannot assign ${user.username} as they have an approved leave request.` });
            }

            const dayName = new Date(date).toLocaleString("en-US", { weekday: "short" });
            const dayAvailability = user.availability.find(a => a.day === dayName);
            if (!dayAvailability) {
              return res.status(400).json({ msg: `User ${user.username} is not available on ${dayName}` });
            }
            
            const availableStartMinutes = parseTime(dayAvailability.start);
            const availableEndMinutes = parseTime(dayAvailability.end);
            
            const isShiftOvernight = shiftStartMinutes > shiftEndMinutes;
            const isAvailabilityOvernight = availableStartMinutes > availableEndMinutes;
            let isWithinAvailability = false;

            if (!isAvailabilityOvernight) {
                if (!isShiftOvernight) {
                    isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
                }
            } else {
                if (!isShiftOvernight) {
                    isWithinAvailability = (shiftStartMinutes >= availableStartMinutes && shiftEndMinutes < 24 * 60) || 
                                           (shiftStartMinutes >= 0 && shiftEndMinutes <= availableEndMinutes);
                } else {
                    isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
                }
            }
            
            if (!isWithinAvailability) {
                return res.status(400).json({ msg: `Shift for ${user.username} is outside their available hours of ${dayAvailability.start}-${dayAvailability.end}` });
            }

            const dayOfWeek = shiftDate.getDay();
            const startOfWeek = new Date(shiftDate);
            startOfWeek.setDate(shiftDate.getDate() - dayOfWeek);
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            const weeklyShiftsQuery = { "assignedEmployees.user": userId, date: { $gte: startOfWeek, $lte: endOfWeek }};
            if (shiftData._id && mongoose.Types.ObjectId.isValid(shiftData._id)) {
              weeklyShiftsQuery._id = { $ne: shiftData._id };
            }
            const weeklyShifts = await Shift.find(weeklyShiftsQuery);

            const totalHours = weeklyShifts.reduce((sum, s) => {
              return sum + s.assignedEmployees.reduce((employeeSum, assignment) => {
                if (String(assignment.user) === String(userId)) {
                  const startMinutes = parseTime(assignment.startTime);
                  const endMinutes = parseTime(assignment.endTime);
                  let duration = endMinutes - startMinutes;
                  if (duration < 0) {
                      duration = (24 * 60 - startMinutes) + endMinutes;
                  }
                  return employeeSum + (duration / 60);
                }
                return employeeSum;
              }, 0);
            }, 0);

            let newHours;
            if (shiftEndMinutes < shiftStartMinutes) {
                newHours = ((24 * 60 - shiftStartMinutes) + shiftEndMinutes) / 60;
            } else {
                newHours = (shiftEndMinutes - shiftStartMinutes) / 60;
            }
            
            if (totalHours + newHours > user.maxHoursPerWeek) {
              return res.status(400).json({ msg: `Exceeds max weekly hours for ${user.username}. Current: ${totalHours.toFixed(2)}h. Limit: ${user.maxHoursPerWeek}h.` });
            }
        }

        const employeesForDB = assignedEmployees.map((emp) => ({
          user: new mongoose.Types.ObjectId(emp.user?._id || emp.user),
          startTime: emp.startTime,
          endTime: emp.endTime,
          status: emp.status || "absent",
          enterIn: emp.enterIn || "",
          exitOut: emp.exitOut || "",
        }));

        let updatedShift;
        if (shiftData._id && mongoose.Types.ObjectId.isValid(shiftData._id)) {
          updatedShift = await Shift.findByIdAndUpdate(shiftData._id, { date, requiredPositions, assignedEmployees: employeesForDB }, { new: true, runValidators: true });
        } else {
          updatedShift = new Shift({ schedule: req.params.id, date, requiredPositions, assignedEmployees: employeesForDB });
          await updatedShift.save();
        }
        shiftIds.push(updatedShift._id);
        existingShiftIds.delete(updatedShift._id.toString());
      }
      
      if (existingShiftIds.size > 0) {
        await Shift.deleteMany({ _id: { $in: Array.from(existingShiftIds) } });
      }
      updateData.shifts = shiftIds;
    }

    const schedule = await Schedule.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true, runValidators: true })
      .populate({
        path: "shifts",
        populate: { path: "assignedEmployees.user", model: "User", select: "username jobPosition _id" },
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

  try {
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ msg: "Name, start date, and end date are required" });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);

    const schedule = new Schedule({ name, startDate, endDate, notes: notes || "", status: status || "draft", createdBy: req.user.id });

    const parseTime = (timeStr) => {
      if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
        throw new Error("Time must be in HH:MM format");
      }
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const shiftIds = [];
    for (const shiftData of shifts) {
      const { date, requiredPositions, assignedEmployees } = shiftData;

      if (!date || !requiredPositions) {
        return res.status(400).json({ msg: "Shift date and required positions are required." });
      }
      if (new Date(date) < start || new Date(date) > end) {
        return res.status(400).json({ msg: "Shift date must be within schedule dates" });
      }

      const validEmployees = assignedEmployees?.filter((id) => id != null) || [];
      for (const emp of validEmployees) {
        const { startTime, endTime } = emp;
        if (!startTime || !endTime) {
            return res.status(400).json({ msg: "Each assigned employee must have a start and end time." });
        }
        
        const shiftStartMinutes = parseTime(startTime);
        const shiftEndMinutes = parseTime(endTime);
        if (shiftStartMinutes === shiftEndMinutes) {
            return res.status(400).json({ msg: `Shift start and end times cannot be the same.` });
        }
        
        const userId = emp._id || emp.user?._id || emp.user;
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ msg: `User ${userId} not found` });
        }
        
        const shiftDate = new Date(date);
        shiftDate.setHours(0,0,0,0);
        const leaveConflict = await LeaveRequest.findOne({
            user: userId,
            status: "Approved",
            startDate: { $lte: shiftDate },
            endDate: { $gte: shiftDate }
        });
        if (leaveConflict) {
            return res.status(400).json({ msg: `Cannot assign ${user.username} as they have an approved leave request.` });
        }

        const dayName = new Date(date).toLocaleString("en-US", { weekday: "short" });
        const dayAvailability = user.availability.find(a => a.day === dayName);
        if (!dayAvailability) {
          return res.status(400).json({ msg: `User ${user.username} is not available on ${dayName}` });
        }
        
        const availableStartMinutes = parseTime(dayAvailability.start);
        const availableEndMinutes = parseTime(dayAvailability.end);
        const isShiftOvernight = shiftStartMinutes > shiftEndMinutes;
        const isAvailabilityOvernight = availableStartMinutes > availableEndMinutes;
        let isWithinAvailability = false;

        if (!isAvailabilityOvernight) {
            if (!isShiftOvernight) {
                isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
            }
        } else {
            if (!isShiftOvernight) {
                isWithinAvailability = (shiftStartMinutes >= availableStartMinutes && shiftEndMinutes < 24 * 60) || (shiftStartMinutes >= 0 && shiftEndMinutes <= availableEndMinutes);
            } else {
                isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
            }
        }
        
        if (!isWithinAvailability) {
          return res.status(400).json({ msg: `Shift for ${user.username} is outside their available hours of ${dayAvailability.start}-${dayAvailability.end}` });
        }
        
        const dayOfWeek = shiftDate.getDay();
        const startOfWeek = new Date(shiftDate);
        startOfWeek.setDate(shiftDate.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const weeklyShifts = await Shift.find({ "assignedEmployees.user": userId, date: { $gte: startOfWeek, $lte: endOfWeek }});

        const totalHours = weeklyShifts.reduce((sum, s) => {
            return sum + s.assignedEmployees.reduce((employeeSum, assignment) => {
              if (String(assignment.user) === String(userId)) {
                const startMinutes = parseTime(assignment.startTime);
                const endMinutes = parseTime(assignment.endTime);
                let duration = endMinutes - startMinutes;
                if (duration < 0) {
                    duration = (24 * 60 - startMinutes) + endMinutes;
                }
                return employeeSum + (duration / 60);
              }
              return employeeSum;
            }, 0);
          }, 0);

        let newHours;
        if (shiftEndMinutes < shiftStartMinutes) {
            newHours = ((24 * 60 - shiftStartMinutes) + shiftEndMinutes) / 60;
        } else {
            newHours = (shiftEndMinutes - shiftStartMinutes) / 60;
        }

        if (totalHours + newHours > user.maxHoursPerWeek) {
          return res.status(400).json({ msg: `Exceeds max weekly hours for ${user.username}. Current: ${totalHours.toFixed(2)}h. Limit: ${user.maxHoursPerWeek}h.` });
        }
      }

      let employeesForDB = assignedEmployees.map((emp) => ({
        user: new mongoose.Types.ObjectId(emp._id || emp.user?._id || emp.user),
        startTime: emp.startTime,
        endTime: emp.endTime,
        status: emp.status || "absent",
        enterIn: emp.enterIn || "",
        exitOut: emp.exitOut || "",
      }));

      const shift = new Shift({ schedule: schedule._id, date, requiredPositions, assignedEmployees: employeesForDB });
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
