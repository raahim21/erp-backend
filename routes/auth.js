const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logAction = require("../utils/logAction");
let auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const bcrypt = require("bcrypt");
const router = express.Router();
const dateFilter = require("../utils/dateFilter");

// Register

router.delete(
  "/users/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const { id } = req.params;

      let user = await User.findByIdAndDelete(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await logAction(req.user.id, `Deleted User: ${user.username}`);
      res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.get("/users-all", auth, async (req, res) => {
  try {
    const { username, startDate, endDate } = req.query;
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 5; // Default limit
    let skip = (page - 1) * limit;
    let query = {};
    if (username) {
      query.username = { $regex: username, $options: "i" };
    }

    query = dateFilter.applyDateFilter(
      query,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    console.log(query);
    const users = await User.find(query)
      .select("username _id jobPosition")
      .skip(skip)
      .limit(limit) // Limit to prevent overwhelming the response
      .lean();

    const totalResults = await User.countDocuments(query);
    const totalPages = Math.ceil(totalResults / limit);
    res.json({
      users,
      totalPages: totalPages,
      totalResults: users.length,
      currentPage: page,
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get(
  "/users/:id",
  auth,

  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      let filter = {};
      if (req.query.username) {
        filter.username = { $regex: req.query.username, $options: "i" }; // case-insensitive
      } else {
        filter._id = req.query.id;
      }
      let users = await User.findOne({ _id: req.params.id });
      res.json(users);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.put("/users/:id", async (req, res) => {
  try {
    let { password } = req.body;
    console.log(req.body);
    const { id } = req.params;
    let user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update password if provided
    if (password) {
      user.password = password;
    }

    // Update other fields if provided
    // Add fields like username, role, jobPosition, etc., if needed
    if (req.body.username) user.username = req.body.username;
    if (req.body.role) user.role = req.body.role;
    if (req.body.jobPosition) user.jobPosition = req.body.jobPosition;
    if (req.body.hourlyRate) user.hourlyRate = req.body.hourlyRate;
    if (req.body.maxHoursPerWeek)
      user.maxHoursPerWeek = req.body.maxHoursPerWeek;
    if (req.body.availability) user.availability = req.body.availability;

    await user.save(); // Triggers pre("save") middleware to hash password if modified

    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post(
  "/users",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Username and password are required" });
      }
      const existingUser = await User.findOne({ username });

      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const user = new User({ ...req.body });
      await user.save();
      await logAction(req.user.id, "Registered New User");
      res.status(201).json({ message: "User created successfully" });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.clearCookie("token");
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user || !(await user.matchPassword(password))) {
      res.clearCookie("token");
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });
    console.log("Login: Token set in cookie:", token); // Debug log
    await logAction(user._id, "Logged in");
    res.json({ userId: user._id });
  } catch (error) {
    console.error("Login error:", error);
    res.clearCookie("token");
    res.status(500).json({ message: error.message });
  }
});

// Verify Token
router.get("/verify", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id role");
    if (!user) {
      res.clearCookie("token");
      return res.status(401).json({ message: "User not found" });
    }
    console.log("Verify: User fetched:", user); // Debug log
    res.json({ userId: user._id, role: user.role });
  } catch (error) {
    console.error("Verify error:", error);
    res.clearCookie("token");
    res.status(401).json({ message: "Invalid token" });
  }
});

// Logout
router.post("/logout", auth, async (req, res) => {
  try {
    let user = req.user;
    await logAction(user.id, "User Logged out");
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
