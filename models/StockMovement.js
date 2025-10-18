let mongoose = require('mongoose')

const stockMovementSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  changeType: { type: String, enum: ["purchase", "sale", "adjustment", "transfer"], required: true },
  quantityChange: { type: Number, required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId }, // purchase or issue order ID
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  note: String,
  createdAt: { type: Date, default: Date.now },
});


module.exports = mongoose.model("StockMovement", stockMovementSchema);
