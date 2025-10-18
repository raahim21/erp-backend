let mongoose = require('mongoose')

let brandSchema = mongoose.Schema({
    name: {
    type: String,
    required: true,
    trim: true
  },
  isDeleted: { type: Boolean, default: false }
})

const Brand = mongoose.model("Brand", brandSchema);
module.exports = Brand


