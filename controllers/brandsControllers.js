// controllers/brandsController.js
const Brand = require('../models/Brand');
const logAction = require("../utils/logAction");

exports.getBrands = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const filter = { isDeleted: false };
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const [brands, total] = await Promise.all([
      Brand.find(filter).sort({ name: 1 }).skip(skip).limit(parseInt(limit)),
      Brand.countDocuments(filter),
    ]);

    res.json({
      brands,
      totalResults: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Get brands error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.createBrand = async (req, res) => {
  try {
    let { name } = req.body;
    name = name.trim();
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const existingBrand = await Brand.findOne({ name: new RegExp(`^${name}$`, "i"), isDeleted: false });
    if (existingBrand) {
      return res.status(400).json({ message: "A brand with this name already exists." });
    }

    const brand = new Brand({ name });
    await brand.save();
    await logAction(req.user.id, "Created brand", name);
    res.status(201).json(brand);
  } catch (error) {
    console.error("Create brand error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ message: "Brand not found" });
    }
    res.json(brand);
  } catch (error) {
    console.error("Get brand by ID error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateBrand = async (req, res) => {
  try {
    const { name } = req.body;
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ message: "Brand not found" });
    }

    let updatedName = brand.name;
    if (name) {
      updatedName = name.trim();
      if (!updatedName) {
        return res.status(400).json({ message: "Name must not be empty" });
      }
      const existingBrand = await Brand.findOne({ name: new RegExp(`^${updatedName}$`, "i"), isDeleted: false, _id: { $ne: req.params.id } });
      if (existingBrand) {
        return res.status(400).json({ message: "A brand with this name already exists." });
      }
      brand.name = updatedName;
    }

    await brand.save();
    await logAction(req.user.id, "Updated brand", updatedName);
    res.json(brand);
  } catch (error) {
    console.error("Update brand error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.softDeleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) {
      return res.status(404).json({ message: "Brand not found or already deleted" });
    }
    brand.isDeleted = true;
    await brand.save();
    await logAction(req.user.id, "Soft deleted brand", brand.name);
    res.json({ message: "Brand archived successfully" });
  } catch (error) {
    console.error("Soft delete brand error:", error.message);
    res.status(500).json({ message: error.message });
  }
};