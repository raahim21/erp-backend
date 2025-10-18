const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Customer's company or person name
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  address: { type: String, trim: true },
  company: { type: String, trim: true },
  taxNumber: { type: String, trim: true }, // Optional tax registration ID
  notes: { type: String, trim: true }, // Random extra info
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

module.exports = mongoose.model("Customer", customerSchema);