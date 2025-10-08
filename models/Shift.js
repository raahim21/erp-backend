// const mongoose = require("mongoose");

// const ShiftSchema = new mongoose.Schema({
//   schedule: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Schedule",
//     required: true,
//   },
//   date: { type: Date, required: true },
//   startTime: { type: String, required: true }, // e.g., "09:00 AM"
//   endTime: { type: String, required: true }, // e.g., "05:00 PM"
//   requiredPositions: [
//     {
//       jobPosition: { type: String, required: true }, // e.g., "cashier"
//       count: { type: Number, required: true, min: 1 }, // how many needed
//     },
//   ],
//   assignedEmployees: [
//     {
//       user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//       status: { type: String, enum: ["present", "absent"], default: "absent" },
//       enterIn: { type: String, default: "" },
//       exitOut: { type: String, default: "" },
//     },
//   ],
// });

// // Prevent overlapping shifts for the same user

// ShiftSchema.pre("save", async function (next) {
//   const shift = this;

//   // Normalize times to HH:MM (24h)
//   const parseTime = (timeStr) => {
//     console.log("Parsing time (Shift.js):", timeStr);
//     if (!/^\d{2}:\d{2}$/.test(timeStr)) {
//       throw new Error("Time must be in HH:MM format");
//     }
//     const [hours, minutes] = timeStr.split(":").map(Number);
//     return hours * 60 + minutes;
//   };

//   const shiftStart = parseTime(shift.startTime);
//   const shiftEnd = parseTime(shift.endTime);

//   // rest of your overlap-checking logic...
//   next();
// });

// module.exports = mongoose.model("Shift", ShiftSchema);


const mongoose = require("mongoose");
const ShiftSchema = new mongoose.Schema({
schedule: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
date: { type: Date, required: true },
startTime: { type: String, required: true },
endTime: { type: String, required: true },
requiredPositions: [
{
jobPosition: { type: String, required: true },
count: { type: Number, required: true, min: 1 },
},
],
assignedEmployees: [
{
user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
status: {
type: String,
enum: ["present", "absent", "late", "leave"],
default: "absent",
},
enterIn: { type: String, default: "" },
exitOut: { type: String, default: "" },
},
],
});
module.exports = mongoose.model("Shift", ShiftSchema);