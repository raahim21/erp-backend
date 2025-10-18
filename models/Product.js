const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  unit: { type: String, default: "pcs" },
  manufacturer: String,
  brand: String,
  weight: Number,
  returnable: { type: Boolean, default: false },

  inventory: [
    {
      location: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
      quantity: { type: Number, default: 0 },
    },
  ],
  sellable: { type: Boolean, default: true },
  purchasable: { type: Boolean, default: true },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  sku: {
    type:String,
    required:true,
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
  isDeleted: { type: Boolean, default: false }
});

productSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Product", productSchema);
