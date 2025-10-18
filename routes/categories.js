
const express = require("express");
const Category = require("../models/Category");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const logAction = require("../utils/logAction");

const router = express.Router();

// Create Category
router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const category = new Category({ name, description });
    await category.save();
    await logAction(req.user.id, "Created Category", name);
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Categories
router.get("/", auth, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const filter = search ? { name: { $regex: search, $options: "i" } } : {};

    const [categories, total] = await Promise.all([
      Category.find(filter).skip(skip).limit(parseInt(limit)),
      Category.countDocuments(filter),
    ]);

    res.json({
      categories,
      totalResults: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Single Category
router.get("/:id", auth, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Category
router.put("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    if (name) category.name = name;
    if (description !== undefined) category.description = description;

    await category.save();
    await logAction(req.user.id, "Updated Category", category.name);
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Category
router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    await logAction(req.user.id, "Deleted Category", category.name);
    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const item = await Category.findById(req.params.id);
    if (!item || item.isDeleted) {
      return res.status(404).json({ message: "Not found or already deleted" });
    }
    item.isDeleted = true;
    await item.save();
    await logAction(req.user.id, "Soft Deleted Category", `${item.name}`);
    res.json({ message: `${Category} archived` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;