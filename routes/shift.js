// const express = require("express");
// const router = express.Router();
// const auth = require("../middleware/auth");
// const Shift = require("../models/Shift");
// const Schedule = require("../models/Schedule");
// const User = require("../models/User");
// const LeaveRequest = require("../models/LeaveRequest");
// const { default: mongoose } = require("mongoose");

// const parseTime = (timeStr) => {
//   if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
//     throw new Error(`Invalid time format: ${timeStr}. Must be HH:MM`);
//   }
//   const [hours, minutes] = timeStr.split(":").map(Number);
//   return hours * 60 + minutes;
// };

// const validateEmployeeAssignment = async (emp, date, shiftIdToExclude) => {
//     const { user: userId, startTime, endTime } = emp;
//     if (!userId || !startTime || !endTime) {
//         throw new Error("Each assigned employee must have a user ID, start time, and end time.");
//     }
    
//     const shiftStartMinutes = parseTime(startTime);
//     const shiftEndMinutes = parseTime(endTime);

//     if (shiftStartMinutes === shiftEndMinutes) {
//         throw new Error(`Shift start and end times cannot be the same.`);
//     }

//     const user = await User.findById(userId);
//     if (!user) throw new Error(`User with ID ${userId} not found`);

//     const shiftDate = new Date(date);
//     shiftDate.setHours(0,0,0,0);

//     const leaveConflict = await LeaveRequest.findOne({
//         user: userId,
//         status: "Approved",
//         startDate: { $lte: shiftDate },
//         endDate: { $gte: shiftDate }
//     });
//     if (leaveConflict) {
//         throw new Error(`Cannot assign ${user.username} due to an approved leave request.`);
//     }

//     const dayName = shiftDate.toLocaleString("en-US", { weekday: "short" });
//     const dayAvailability = user.availability.find(a => a.day === dayName);
//     if (!dayAvailability) {
//         throw new Error(`User ${user.username} is not available on ${dayName}.`);
//     }
    
//     const availableStartMinutes = parseTime(dayAvailability.start);
//     const availableEndMinutes = parseTime(dayAvailability.end);

//     const isShiftOvernight = shiftStartMinutes > shiftEndMinutes;
//     const isAvailabilityOvernight = availableStartMinutes > availableEndMinutes;

//     let isWithinAvailability = false;
//     if (!isAvailabilityOvernight) { // Same-day availability
//         if (!isShiftOvernight) { // Same-day shift
//             isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
//         }
//         // Overnight shift cannot be in same-day availability, so isWithinAvailability remains false
//     } else { // Overnight availability
//         if (!isShiftOvernight) { // Same-day shift (e.g., 23:00-23:30 or 01:00-02:00 within 22:00-06:00 availability)
//             isWithinAvailability = (shiftStartMinutes >= availableStartMinutes && shiftEndMinutes < 24 * 60) || 
//                                    (shiftStartMinutes >= 0 && shiftEndMinutes <= availableEndMinutes);
//         } else { // Overnight shift
//             isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
//         }
//     }
    
//     if (!isWithinAvailability) {
//         throw new Error(`Shift for ${user.username} is outside their available hours of ${dayAvailability.start}-${dayAvailability.end}.`);
//     }

//     const dayOfWeek = shiftDate.getDay();
//     const startOfWeek = new Date(shiftDate);
//     startOfWeek.setDate(shiftDate.getDate() - dayOfWeek);
//     startOfWeek.setHours(0, 0, 0, 0);
//     const endOfWeek = new Date(startOfWeek);
//     endOfWeek.setDate(startOfWeek.getDate() + 6);
//     endOfWeek.setHours(23, 59, 59, 999);

//     const weeklyShiftsQuery = { "assignedEmployees.user": userId, date: { $gte: startOfWeek, $lte: endOfWeek } };
//     if (shiftIdToExclude) {
//         weeklyShiftsQuery._id = { $ne: shiftIdToExclude };
//     }
//     const weeklyShifts = await Shift.find(weeklyShiftsQuery);

//     const totalHours = weeklyShifts.reduce((sum, s) => {
//         const shiftHours = s.assignedEmployees.reduce((employeeSum, assignment) => {
//             if (String(assignment.user) === String(userId)) {
//                 const startMinutes = parseTime(assignment.startTime);
//                 const endMinutes = parseTime(assignment.endTime);
//                 let duration = endMinutes - startMinutes;
//                 if (duration < 0) { // Overnight shift
//                     duration = (24 * 60 - startMinutes) + endMinutes;
//                 }
//                 return employeeSum + (duration / 60);
//             }
//             return employeeSum;
//         }, 0);
//         return sum + shiftHours;
//     }, 0);

//     let newHours;
//     if (shiftEndMinutes < shiftStartMinutes) { // Overnight
//         newHours = ((24 * 60 - shiftStartMinutes) + shiftEndMinutes) / 60;
//     } else {
//         newHours = (shiftEndMinutes - shiftStartMinutes) / 60;
//     }

//     if (totalHours + newHours > user.maxHoursPerWeek) {
//         throw new Error(`Exceeds max weekly hours for ${user.username}. Current: ${totalHours.toFixed(2)}h. Limit: ${user.maxHoursPerWeek}h.`);
//     }
// };

// // Create a shift
// router.post("/", auth, async (req, res) => {
//   try {
//     const { schedule: scheduleId, date, requiredPositions, assignedEmployees = [] } = req.body;
//     if (!scheduleId) return res.status(400).json({ msg: "Schedule ID is required." });
//     if (!date) return res.status(400).json({ msg: "Date is required." });

//     const scheduleDoc = await Schedule.findById(scheduleId);
//     if (!scheduleDoc) return res.status(404).json({ msg: "Schedule not found." });

//     const shiftDate = new Date(date);
//     if (shiftDate < new Date(scheduleDoc.startDate) || shiftDate > new Date(scheduleDoc.endDate)) {
//       return res.status(400).json({ msg: "Shift date must be within schedule date range." });
//     }
    
//     for (const emp of assignedEmployees) {
//         await validateEmployeeAssignment(emp, date, null);
//     }
    
//     const employeesForDB = assignedEmployees.map(emp => ({ ...emp, user: new mongoose.Types.ObjectId(emp.user) }));
//     const shift = new Shift({ schedule: scheduleId, date, requiredPositions, assignedEmployees: employeesForDB });
//     await shift.save();

//     await Schedule.findByIdAndUpdate(scheduleId, { $push: { shifts: shift._id } });
//     res.status(201).json(shift);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ msg: err.message || "Server error" });
//   }
// });

// // Update a shift
// router.put("/:id", auth, async (req, res) => {
//   try {
//     const { schedule: scheduleId, date, requiredPositions, assignedEmployees = [] } = req.body;
//     if (!scheduleId || !date) return res.status(400).json({ msg: "Schedule ID and date are required." });

//     const scheduleDoc = await Schedule.findById(scheduleId);
//     if (!scheduleDoc) return res.status(404).json({ msg: "Schedule not found." });
    
//     const shiftDate = new Date(date);
//     if (shiftDate < new Date(scheduleDoc.startDate) || shiftDate > new Date(scheduleDoc.endDate)) {
//         return res.status(400).json({ msg: "Shift date must be within schedule date range." });
//     }

//     for (const emp of assignedEmployees) {
//         await validateEmployeeAssignment(emp, date, req.params.id);
//     }

//     const employeesForDB = assignedEmployees.map(emp => ({ ...emp, user: new mongoose.Types.ObjectId(emp.user) }));
//     const updatedShift = await Shift.findByIdAndUpdate(
//       req.params.id,
//       { $set: { schedule: scheduleId, date, requiredPositions, assignedEmployees: employeesForDB } },
//       { new: true, runValidators: true }
//     );

//     if (!updatedShift) return res.status(404).json({ msg: "Shift not found." });
//     res.json(updatedShift);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ msg: err.message || "Server error" });
//   }
// });

// // Delete a shift
// router.delete("/:id", auth, async (req, res) => {
//   try {
//     const shift = await Shift.findById(req.params.id);
//     if (!shift) {
//       return res.status(404).json({ msg: "Shift not found." });
//     }
//     await Schedule.findByIdAndUpdate(shift.schedule, { $pull: { shifts: shift._id } });
//     await Shift.deleteOne({ _id: req.params.id });
//     res.status(200).json({ msg: "Shift deleted successfully." });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ msg: "Server error" });
//   }
// });

// module.exports = router;


const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Shift = require("../models/Shift");
const Schedule = require("../models/Schedule");
const User = require("../models/User");
const LeaveRequest = require("../models/LeaveRequest");
const { default: mongoose } = require("mongoose");

const parseTime = (timeStr) => {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error(`Invalid time format: ${timeStr}. Must be HH:MM`);
  }
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

const validateEmployeeAssignment = async (emp, date, shiftIdToExclude) => {
    const { user: userId, startTime, endTime } = emp;
    if (!userId || !startTime || !endTime) {
        throw new Error("Each assigned employee must have a user ID, start time, and end time.");
    }
    
    const shiftStartMinutes = parseTime(startTime);
    const shiftEndMinutes = parseTime(endTime);

    if (shiftStartMinutes === shiftEndMinutes) {
        throw new Error(`Shift start and end times cannot be the same.`);
    }

    const user = await User.findById(userId);
    if (!user) throw new Error(`User with ID ${userId} not found`);

    const shiftDate = new Date(date);
    shiftDate.setHours(0,0,0,0);

    const leaveConflict = await LeaveRequest.findOne({
        user: userId,
        status: "Approved",
        startDate: { $lte: shiftDate },
        endDate: { $gte: shiftDate }
    });
    if (leaveConflict) {
        throw new Error(`Cannot assign ${user.username} due to an approved leave request.`);
    }

    const dayName = shiftDate.toLocaleString("en-US", { weekday: "short" });
    const dayAvailability = user.availability.find(a => a.day === dayName);
    if (!dayAvailability) {
        throw new Error(`User ${user.username} is not available on ${dayName}.`);
    }
    
    const availableStartMinutes = parseTime(dayAvailability.start);
    const availableEndMinutes = parseTime(dayAvailability.end);

    const isShiftOvernight = shiftStartMinutes > shiftEndMinutes;
    const isAvailabilityOvernight = availableStartMinutes > availableEndMinutes;

    let isWithinAvailability = false;
    if (!isAvailabilityOvernight) { // Same-day availability
        if (!isShiftOvernight) { // Same-day shift
            isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
        }
        // Overnight shift cannot be in same-day availability, so isWithinAvailability remains false
    } else { // Overnight availability
        if (!isShiftOvernight) { // Same-day shift (e.g., 23:00-23:30 or 01:00-02:00 within 22:00-06:00 availability)
            isWithinAvailability = (shiftStartMinutes >= availableStartMinutes && shiftEndMinutes < 24 * 60) || 
                                   (shiftStartMinutes >= 0 && shiftEndMinutes <= availableEndMinutes);
        } else { // Overnight shift
            isWithinAvailability = shiftStartMinutes >= availableStartMinutes && shiftEndMinutes <= availableEndMinutes;
        }
    }
    
    if (!isWithinAvailability) {
        throw new Error(`Shift for ${user.username} is outside their available hours of ${dayAvailability.start}-${dayAvailability.end}.`);
    }

    const dayOfWeek = shiftDate.getDay();
    const startOfWeek = new Date(shiftDate);
    startOfWeek.setDate(shiftDate.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weeklyShiftsQuery = { "assignedEmployees.user": userId, date: { $gte: startOfWeek, $lte: endOfWeek } };
    if (shiftIdToExclude && mongoose.Types.ObjectId.isValid(shiftIdToExclude)) {
        weeklyShiftsQuery._id = { $ne: shiftIdToExclude };
    }
    const weeklyShifts = await Shift.find(weeklyShiftsQuery);

    const totalHours = weeklyShifts.reduce((sum, s) => {
        const shiftHours = s.assignedEmployees.reduce((employeeSum, assignment) => {
            if (String(assignment.user) === String(userId)) {
                const startMinutes = parseTime(assignment.startTime);
                const endMinutes = parseTime(assignment.endTime);
                let duration = endMinutes - startMinutes;
                if (duration < 0) { // Overnight shift
                    duration = (24 * 60 - startMinutes) + endMinutes;
                }
                return employeeSum + (duration / 60);
            }
            return employeeSum;
        }, 0);
        return sum + shiftHours;
    }, 0);

    let newHours;
    if (shiftEndMinutes < shiftStartMinutes) { // Overnight
        newHours = ((24 * 60 - shiftStartMinutes) + shiftEndMinutes) / 60;
    } else {
        newHours = (shiftEndMinutes - shiftStartMinutes) / 60;
    }

    if (totalHours + newHours > user.maxHoursPerWeek) {
        throw new Error(`Exceeds max weekly hours for ${user.username}. Current: ${totalHours.toFixed(2)}h. Limit: ${user.maxHoursPerWeek}h.`);
    }
};

// Create a shift
router.post("/", auth, async (req, res) => {
  try {
    const { schedule: scheduleId, date, requiredPositions, assignedEmployees = [] } = req.body;
    if (!scheduleId) return res.status(400).json({ msg: "Schedule ID is required." });
    if (!date) return res.status(400).json({ msg: "Date is required." });

    const scheduleDoc = await Schedule.findById(scheduleId);
    if (!scheduleDoc) return res.status(404).json({ msg: "Schedule not found." });

    const shiftDate = new Date(date);
    if (shiftDate < new Date(scheduleDoc.startDate) || shiftDate > new Date(scheduleDoc.endDate)) {
      return res.status(400).json({ msg: "Shift date must be within schedule date range." });
    }
    
    for (const emp of assignedEmployees) {
        await validateEmployeeAssignment(emp, date, null);
    }
    
    const employeesForDB = assignedEmployees.map(emp => ({ ...emp, user: new mongoose.Types.ObjectId(emp.user) }));
    const shift = new Shift({ schedule: scheduleId, date, requiredPositions, assignedEmployees: employeesForDB });
    await shift.save();

    await Schedule.findByIdAndUpdate(scheduleId, { $push: { shifts: shift._id } });
    res.status(201).json(shift);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message || "Server error" });
  }
});

// Update a shift
router.put("/:id", auth, async (req, res) => {
  try {
    const { schedule: scheduleId, date, requiredPositions, assignedEmployees = [] } = req.body;
    if (!scheduleId || !date) return res.status(400).json({ msg: "Schedule ID and date are required." });

    const scheduleDoc = await Schedule.findById(scheduleId);
    if (!scheduleDoc) return res.status(404).json({ msg: "Schedule not found." });
    
    const shiftDate = new Date(date);
    if (shiftDate < new Date(scheduleDoc.startDate) || shiftDate > new Date(scheduleDoc.endDate)) {
        return res.status(400).json({ msg: "Shift date must be within schedule date range." });
    }

    for (const emp of assignedEmployees) {
        await validateEmployeeAssignment(emp, date, req.params.id);
    }

    const employeesForDB = assignedEmployees.map(emp => ({ ...emp, user: new mongoose.Types.ObjectId(emp.user) }));
    const updatedShift = await Shift.findByIdAndUpdate(
      req.params.id,
      { $set: { schedule: scheduleId, date, requiredPositions, assignedEmployees: employeesForDB } },
      { new: true, runValidators: true }
    );

    if (!updatedShift) return res.status(404).json({ msg: "Shift not found." });
    res.json(updatedShift);
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
      return res.status(404).json({ msg: "Shift not found." });
    }
    await Schedule.findByIdAndUpdate(shift.schedule, { $pull: { shifts: shift._id } });
    await Shift.deleteOne({ _id: req.params.id });
    res.status(200).json({ msg: "Shift deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
