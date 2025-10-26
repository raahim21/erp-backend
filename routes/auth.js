const express = require("express");
const jwt =require("jsonwebtoken");
const User = require("../models/User");
const logAction = require("../utils/logAction");
let auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const router = express.Router();
const dateFilter = require("../utils/dateFilter");

// Register
router.post(
  "/users",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const { username, password, role, jobPosition, hourlyRate, maxHoursPerWeek, availability } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const user = new User({
        username,
        password,
        role: role || "staff",
        jobPosition,
        hourlyRate,
        maxHoursPerWeek,
        availability,
      });
      await user.save();
      await logAction(req.user.id, "Registered New User");
      res.status(201).json({ message: "User created successfully" });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

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
    let limit = parseInt(req.query.limit) || 5;
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

    const users = await User.find(query)
      .select("username _id jobPosition role createdAt")
      .skip(skip)
      .limit(limit)
      .lean();

    const totalResults = await User.countDocuments(query);
    const totalPages = Math.ceil(totalResults / limit);
    res.json({
      users,
      totalPages,
      totalResults: totalResults,
      currentPage: page,
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Get all users for selection dropdowns
router.get("/users/list", auth, async (req, res) => {
  try {
    const users = await User.find({}).select("username _id jobPosition").lean();
    res.json(users);
  } catch (err) {
    console.error("Error fetching users list:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

router.get(
  "/users/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select("-password");
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.put("/users/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { password, username, role, jobPosition, hourlyRate, maxHoursPerWeek, availability } = req.body;
    const { id } = req.params;
    let user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (password) user.password = password;
    if (username) user.username = username;
    if (role) user.role = role;
    if (jobPosition) user.jobPosition = jobPosition;
    if (hourlyRate) user.hourlyRate = hourlyRate;
    if (maxHoursPerWeek) user.maxHoursPerWeek = maxHoursPerWeek;
    if (availability) user.availability = availability;

    await user.save();
    await logAction(req.user.id, "Updated User", user.username);
    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.clearCookie("token");
      return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user || !(await user.matchPassword(password))) {
      res.clearCookie("token");
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.cookie("token", token, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      // sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
       secure: true,               // ALWAYS true for SameSite=None
  sameSite: "none",           // Required for cross-origin cookies
      maxAge: 24 * 60 * 60 * 1000 * 3,
    });
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
    const user = await User.findById(decoded.id).select("_id role username");
    if (!user) {
      res.clearCookie("token");
      return res.status(401).json({ message: "User not found" });
    }

    res.json({ userId: user._id, role: user.role });
  } catch (error) {
    console.error("Verify error:", error);
    res.clearCookie("token");
    res.status(401).json({ message: "Invalid token" });
  }
});
// router.get("/verify", async (req, res) => {
//   try {
//     const token = req.cookies.token;
//     if (!token) return res.status(401).json({ message: "No token provided" });

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id).select("_id role username");
//     if (!user) return res.status(401).json({ message: "User not found" });

//     res.json({ id: user._id, role: user.role, username: user.username });
//   } catch (error) {
//     res.status(401).json({ message: "Invalid token" });
//   }
// });


// Logout
router.post("/logout", auth, async (req, res) => {
  try {
    let user = req.user;
    await logAction(user.id, "User Logged out");
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
