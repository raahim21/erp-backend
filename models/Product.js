const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },

  description: {
    type: String,
    required: false,
    default: "testing",
  },
  category:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'Category',
    required:true,

  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

productSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Product", productSchema);
