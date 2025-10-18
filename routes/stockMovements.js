// routes/stockMovements.js
const express = require("express");
const StockMovement = require("../models/StockMovement");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");

const router = express.Router();

// Get Stock Movements (filter by product, changeType, date)
router.get("/", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { productId, changeType, startDate, endDate, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const filter = {};
    if (productId) filter.productId = productId;
    if (changeType) filter.changeType = changeType;
    if (startDate) filter.createdAt = { $gte: new Date(startDate) };
    if (endDate) filter.createdAt = { ...filter.createdAt, $lte: new Date(endDate) };

    const [movements, total] = await Promise.all([
      StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate("productId").populate("userId").populate("referenceId"),
      StockMovement.countDocuments(filter),
    ]);

    res.json({
      movements,
      totalResults: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// No create/update/delete as these are system-generated audit logs

module.exports = router;