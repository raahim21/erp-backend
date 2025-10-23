// const LeaveRequestSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   startDate: { type: Date, required: true },
//   endDate: { type: Date, required: true },
//   reason: { type: String, trim: true },
//   status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
//   createdAt: { type: Date, default: Date.now },
// });

const mongoose = require("mongoose");

const LeaveRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  leaveType: {
    type: String,
    required: true,
    enum: ["Vacation", "Sick Leave", "Personal", "Unpaid"],
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ["Pending", "Approved", "Denied"],
    default: "Pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("LeaveRequest", LeaveRequestSchema);
