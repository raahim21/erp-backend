// controllers/categoriesController.js
const Category = require("../models/Category");
const logAction = require("../utils/logAction");

exports.createCategory = async (req, res) => {
  try {
    let { name, description } = req.body;
    name = name.trim();
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const existingCategory = await Category.findOne({ name: new RegExp(`^${name}$`, "i"), isDeleted: false });
    if (existingCategory) {
      return res.status(400).json({ message: "A category with this name already exists." });
    }

    const category = new Category({ name, description });
    await category.save();
    await logAction(req.user.id, "Created category", name);
    res.status(201).json(category);
  } catch (error) {
    console.error("Create category error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = { isDeleted: false };
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const [categories, total] = await Promise.all([
      Category.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum),
      Category.countDocuments(filter),
    ]);

    res.json({
      categories,
      totalResults: total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error("Get categories error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    console.error("Get category by ID error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) {
      return res.status(404).json({ message: "Category not found" });
    }

    let updatedName = category.name;
    if (name) {
      updatedName = name.trim();
      if (!updatedName) {
        return res.status(400).json({ message: "Name must not be empty" });
      }
      const existingCategory = await Category.findOne({ name: new RegExp(`^${updatedName}$`, "i"), isDeleted: false, _id: { $ne: req.params.id } });
      if (existingCategory) {
        return res.status(400).json({ message: "A category with this name already exists." });
      }
      category.name = updatedName;
    }
    if (description !== undefined) category.description = description;

    await category.save();
    await logAction(req.user.id, "Updated category", updatedName);
    res.json(category);
  } catch (error) {
    console.error("Update category error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.softDeleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) {
      return res.status(404).json({ message: "Category not found or already deleted" });
    }
    category.isDeleted = true;
    await category.save();
    await logAction(req.user.id, "Soft deleted category", category.name);
    res.json({ message: "Category archived successfully" });
  } catch (error) {
    console.error("Soft delete category error:", error.message);
    res.status(500).json({ message: error.message });
  }
};