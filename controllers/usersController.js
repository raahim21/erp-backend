// controllers/usersController.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logAction = require("../utils/logAction");
const dateFilter = require('../utils/dateFilter')

exports.register = async (req, res) => {
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
    await logAction(req.user.id, `Registered new user: ${user.username}`);
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Register user error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    await logAction(req.user.id, `Deleted user: ${user.username}`);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllUsers = async (req, res) => {
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
  } catch (error) {
    console.error("Get all users error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getUsersList = async (req, res) => {
  try {
    const users = await User.find({}).select("username _id jobPosition").lean();
    res.json(users);
  } catch (error) {
    console.error("Get users list error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Get user by ID error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { password, username, role, jobPosition, hourlyRate, maxHoursPerWeek, availability } = req.body;
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      user.username = username;
    }
    if (password) user.password = password;
    if (role) user.role = role;
    if (jobPosition) user.jobPosition = jobPosition;
    if (hourlyRate) user.hourlyRate = hourlyRate;
    if (maxHoursPerWeek) user.maxHoursPerWeek = maxHoursPerWeek;
    if (availability) user.availability = availability;

    await user.save();
    await logAction(req.user.id, `Updated user: ${user.username}`);
    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Update user error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
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
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000 * 3,
    });
    await logAction(user._id, `User logged in: ${user.username}`);
    res.json({ userId: user._id });
  } catch (error) {
    console.error("Login error:", error.message);
    res.clearCookie("token");
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyToken = async (req, res) => {
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
    console.error("Verify token error:", error.message);
    res.clearCookie("token");
    res.status(401).json({ message: "Invalid token" });
  }
};

exports.logout = async (req, res) => {
  try {
    await logAction(req.user.id, `User logged out: ${req.user.username}`);
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};