// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");
// const Purchase = require("./Purchase");
// const Log = require("./Log");
// const IssueOrder = require("./IssueOrder");
// const Shift = require("./Shift");

// const userSchema = new mongoose.Schema({
//   username: {
//     type: String,
//     required: true,
//     unique: true,
//     trim: true,
//   },
//   password: {
//     type: String,
//     required: true,
//   },
//   role: {
//     type: String,
//     enum: ["admin", "manager", "staff"],
//     default: "admin", // Default role if none provided
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now, // gives current date when doc is made
//   },

//   jobPosition: { type: String, default: "none" }, // e.g., cashier, supervisor
//   hourlyRate: { type: Number, default: 0 }, // e.g., 15.00
//   maxHoursPerWeek: { type: Number, default: 40 }, // e.g., 40
//   availability: { type: Array, default: [] },
// });

// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// module.exports = mongoose.model("User", userSchema);



const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "manager", "staff"],
    default: "staff",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  jobPosition: { type: String, default: "none" },
  hourlyRate: { type: Number, default: 0 },
  maxHoursPerWeek: { type: Number, default: 40 },
  availability: [
    {
      day: {
        type: String,
        enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
      start: { type: String, validate: { validator: v => /^\d{2}:\d{2}$/.test(v) } },
      end: { type: String, validate: { validator: v => /^\d{2}:\d{2}$/.test(v) } },
    },
  ],
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
