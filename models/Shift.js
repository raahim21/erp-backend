

const mongoose = require("mongoose");

const EmployeeAssignmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  startTime: {
    type: String,
    required: true,
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Start time must be in HH:MM format"],
  },
  endTime: {
    type: String,
    required: true,
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "End time must be in HH:MM format"],
  },
  status: {
    type: String,
    enum: ["present", "absent", "late", "leave"],
    default: "absent",
  },
  enterIn: {
      type: String,
      default: ''
  },
  exitOut: {
    type: String,
    default: ''
  },
});

const ShiftSchema = new mongoose.Schema({
  schedule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Schedule",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  requiredPositions: [
    {
      _id: false,
      jobPosition: String,
      count: Number,
    },
  ],
  assignedEmployees: [EmployeeAssignmentSchema],
});

module.exports = mongoose.model("Shift", ShiftSchema);

