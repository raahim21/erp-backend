const AttendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift" },
  date: { type: Date, required: true },
  checkIn: { type: String, default: "" },
  checkOut: { type: String, default: "" },
  status: { type: String, enum: ["on_time", "late", "absent"], default: "absent" },
  remarks: { type: String, default: "" },
});
