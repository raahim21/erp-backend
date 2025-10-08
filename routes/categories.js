const express = require("express");
const Category = require("../models/Category");
const logAction = require("../utils/logAction");
const router = express.Router();

// GET all categories (with optional search)
router.get("/", async (req, res) => {
  try {
    const search = req.query.search || "";
    const categories = await Category.find({
      name: { $regex: search, $options: "i" }, // case-insensitive search
    });
    res.json(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST create a new category
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const category = new Category({ name, description });
    await logAction(req.user.id, "Added Stock Item", `${category.name}`);
    const saved = await category.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Error adding category:", err);
    res.status(500).json({ message: "Failed to create category" });
  }
});
module.exports = router;
