let mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
  message: String,
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  type: { type: String, enum: ["info", "warning", "critical"], default: "info" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Notification", notificationSchema);