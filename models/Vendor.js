let mongoose = require('mongoose')
const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true }, // vendor's company or person name
  phone: String,
  email: String,
  address: String,
  company: String,
  taxNumber: String, // optional tax registration ID
  notes: String,     // random extra info
},
{ timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);