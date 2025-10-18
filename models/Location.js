const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: String,
  notes: String,
  isDeleted: { type: Boolean, default: false }
});

module.exports = mongoose.model("Location", locationSchema);
