// // models/Product.js
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  unit: { type: String, default: "pcs" },
  manufacturer: String,
  brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
  weight: Number,
  sellingPrice:{
    type:Number,
    default:0,
    required:true
  },
  returnable: { type: Boolean, default: false },
  inventory: [
    {
      location: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
      quantity: { type: Number, default: 0, required:false },
    },
  ],
  sellable: { type: Boolean, default: true },
  purchasable: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  sku: { type: String, required: true },
  description: { type: String, default: "testing" },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },

  // NEW: Weighted Average Cost Price
  costPrice: { type: Number, default: 0, min: 0 },
});

productSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Product", productSchema);