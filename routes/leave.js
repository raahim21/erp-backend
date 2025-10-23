const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const LeaveRequest = require("../models/LeaveRequest");
const User = require("../models/User");

// Create a leave request
router.post("/", auth, async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  try {
    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ msg: "All fields are required" });
    }
    if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ msg: "Start date cannot be after end date." });
    }

    const newRequest = new LeaveRequest({
      user: req.user.id,
      leaveType,
      startDate,
      endDate,
      reason,
    });

    const leaveRequest = await newRequest.save();
    res.status(201).json(leaveRequest);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// Get all leave requests (for admins/managers)
router.get("/", auth, requireRole("Admin", "Manager"), async (req, res) => {
  try {
    const requests = await LeaveRequest.find().populate("user", "username").sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// Get leave requests for the logged-in user
router.get("/my-requests", auth, async (req, res) => {
    try {
      const requests = await LeaveRequest.find({ user: req.user.id }).sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
});


// Update leave request status (for admins/managers)
router.put("/:id/status", auth, requireRole("Admin", "Manager"), async (req, res) => {
    const { status } = req.body;
    try {
        if (!["Approved", "Denied"].includes(status)) {
            return res.status(400).json({ msg: "Invalid status" });
        }
        let request = await LeaveRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ msg: "Leave request not found" });
        }

        request.status = status;
        await request.save();
        const populatedRequest = await LeaveRequest.findById(request._id).populate("user", "username");
        res.json(populatedRequest);

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
