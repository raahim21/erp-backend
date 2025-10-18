// routes/stockAdjustments.js
const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const Location = require("../models/Location");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const logAction = require("../utils/logAction");

const router = express.Router();

// Create Stock Adjustment
router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId, locationId, quantityChange, note } = req.body;
    if (!productId || !locationId || !quantityChange || isNaN(quantityChange)) {
      throw new Error("Invalid input");
    }

    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error("Product not found");

    const location = await Location.findById(locationId).session(session);
    if (!location) throw new Error("Location not found");

    let inv = product.inventory.find(inv => inv.location.toString() === locationId.toString());
    if (!inv && quantityChange < 0) throw new Error("No inventory to subtract from");
    if (!inv) {
      product.inventory.push({ location: locationId, quantity: quantityChange });
    } else {
      inv.quantity += quantityChange;
      if (inv.quantity < 0) throw new Error("Stock cannot go negative");
    }

    await product.save({ session });

    const movement = new StockMovement({
      productId,
      changeType: "adjustment",
      quantityChange,
      userId: req.user.id,
      note,
    });
    await movement.save({ session });

    await logAction(req.user.id, "Stock Adjustment", `${product.name} at ${location.name}: ${quantityChange}`);

    await session.commitTransaction();
    session.endSession();
    res.status(201).json(movement);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;