// routes/notifications.js
const express = require("express");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const logAction = require("../utils/logAction");

const router = express.Router();

// Get Notifications (filter by read, type, product)
router.get("/", auth, async (req, res) => {
  try {
    const { read, type, productId, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const filter = {};
    if (read !== undefined) filter.read = read === "true";
    if (type) filter.type = type;
    if (productId) filter.productId = productId;

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate("productId"),
      Notification.countDocuments(filter),
    ]);

    res.json({
      notifications,
      totalResults: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark Notification as Read
router.put("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    notification.read = true;
    await notification.save();
    await logAction(req.user.id, "Marked Notification as Read", notification.message);
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create Notification (for admin/manager, or system-generated)
router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { message, productId, type } = req.body;
    if (!message) return res.status(400).json({ message: "Message is required" });

    const notification = new Notification({ message, productId, type });
    await notification.save();
    await logAction(req.user.id, "Created Notification", message);
    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Notification
router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    await logAction(req.user.id, "Deleted Notification", notification.message);
    res.json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;