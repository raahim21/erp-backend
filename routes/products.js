const express = require("express");
const mongoose = require("mongoose"); // Added import for mongoose.Types.ObjectId
const Product = require("../models/Product");
const Category = require("../models/Category");
const auth = require("../middleware/auth");
const logAction = require("../utils/logAction");
const requireRole = require("../middleware/roles");
const User = require("../models/User");

const router = express.Router();

// Helper: basic validation
function validateProductInput({ name, price, category, sku }) {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return "Product name is required.";
  }
  if (!sku || typeof sku !== "string" || sku.trim().length === 0) {
    return "SKU is required.";
  }
  if (price !== undefined && (isNaN(price) || price < 0)) {
    return "Price must be a non-negative number.";
  }
  if (!category) {
    return "Category is required.";
  }
  return null;
}

// Create Product
router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const {
      name,
      sku,
      unit,
      manufacturer,
      brand,
      weight,
      returnable,
      sellable,
      purchasable,
      price,
      description,
      category,
      inventory = [],
    } = req.body;

  
    console.log(req.body)
    const validationError = validateProductInput({ name, price, category, sku });
    if (validationError) return res.status(400).json({ message: validationError });

    // Check category exists
    const catExists = await Category.findById(category);
    if (!catExists) return res.status(400).json({ message: "Invalid category" });

    // Validate inventory entries
    for (const inv of inventory) {
      if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
        return res.status(400).json({ message: "Invalid inventory entry" });
      }
    }

    const product = new Product({
      name,
      sku,
      unit,
      manufacturer,
      brand,
      weight,
      returnable,
      sellable,
      purchasable,
      price,
      description,
      category,
      inventory,
      userId: req.user.id,
    });

    await product.save();
    await logAction(req.user.id, "Added Stock Item", `${product.name}`);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// GET /api/products
router.get("/", auth, async (req, res) => {
  try {
    console.log(req.query)
    let { category, page = 1, startDate, endDate, search, username, startQuantity, endQuantity } = req.query;
    page = parseInt(page) || 1;
    if (page < 1) page = 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Base filter
    const match = { isDeleted: false };

    // Dates: if provided, interpret as full datetimes; make endDate inclusive to end of day
    if (startDate) {
      const sd = new Date(startDate);
      if (!isNaN(sd)) match.createdAt = { ...match.createdAt, $gte: sd };
    }
    if (endDate) {
      const ed = new Date(endDate);
      if (!isNaN(ed)) {
        // make it inclusive to the end of the day
        ed.setHours(23, 59, 59, 999);
        match.createdAt = { ...match.createdAt, $lte: ed };
      }
    }

    if (category) {
      try {
        match.category = new mongoose.Types.ObjectId(category);
      } catch (e) {
        return res.status(400).json({ message: "Invalid category ID format" });
      }
    }
    if (search) match.name = { $regex: search, $options: "i" };

    if (username) {
      // case-insensitive username lookup
      const user = await User.findOne({ username: new RegExp(`^${username}$`, "i") }).select("_id");
      if (user) match.userId = user._id;
      else {
        // if user not found, no results
        return res.json({ products: [], totalResults: 0, totalPages: 0, currentPage: page });
      }
    }

    // Build aggregation to support totalQuantity filtering
    const aggPipeline = [
      { $match: match },
      // compute totalQuantity (sum of inventory.quantity)
      {
        $addFields: {
          totalQuantity: {
            $reduce: {
              input: { $ifNull: ["$inventory", []] },
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] },
            },
          },
        },
      },
    ];

    // Apply quantity filter if provided
    const qMin = startQuantity !== undefined ? Number(startQuantity) : undefined;
    const qMax = endQuantity !== undefined ? Number(endQuantity) : undefined;

    if (!isNaN(qMin) && !isNaN(qMax)) {
      aggPipeline.push({ $match: { totalQuantity: { $gte: qMin, $lte: qMax } } });
    } else if (!isNaN(qMin)) {
      aggPipeline.push({ $match: { totalQuantity: { $gte: qMin } } });
    } else if (!isNaN(qMax)) {
      aggPipeline.push({ $match: { totalQuantity: { $lte: qMax } } });
    }

    // Count total matching docs (run separate pipeline)
    const countPipeline = [...aggPipeline, { $count: "total" }];
    const countRes = await Product.aggregate(countPipeline).exec();
    const total = (countRes[0] && countRes[0].total) || 0;

    // Add pagination + lookups
    aggPipeline.push(
      // lookups/populate alternative: populate inventory.location and category via $lookup if you want;
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    );

    // Execute aggregation
    let aggregatedProducts = await Product.aggregate(aggPipeline).exec();

    // If you need populated category and inventory.location, you can populate after aggregation:
    // Convert aggregated docs to ids and then do a find with $in OR manually populate fields.
    // Easiest fix: fetch by ids with populate:
    const ids = aggregatedProducts.map(p => p._id);
    let products = await Product.find({ _id: { $in: ids } })
      .populate("category")
      .populate("inventory.location")
      .exec();

    // Sort the populated products to match the aggregation order (since $in doesn't preserve order)
    products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    res.json({
      products,
      totalResults: total,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Get Single Product
router.get("/:id", auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category")
      .populate("inventory.location");
    if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Product
router.put("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, sku, unit, manufacturer, brand, weight, returnable, sellable, purchasable, price, description, category, inventory } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.isDeleted) return res.status(400).json({ message: "Cannot update a deleted product" });

    // Update fields if provided
    if (name !== undefined) product.name = name;
    if (sku !== undefined) product.sku = sku;
    if (unit !== undefined) product.unit = unit;
    if (manufacturer !== undefined) product.manufacturer = manufacturer;
    if (brand !== undefined) product.brand = brand;
    if (weight !== undefined) product.weight = weight;
    if (returnable !== undefined) product.returnable = returnable;
    if (sellable !== undefined) product.sellable = sellable;
    if (purchasable !== undefined) product.purchasable = purchasable;
    if (price !== undefined) product.price = price;
    if (description !== undefined) product.description = description;
    if (category !== undefined) {
      const catExists = await Category.findById(category);
      if (!catExists) return res.status(400).json({ message: "Invalid category" });
      product.category = category;
    }
    if (inventory !== undefined) {
      for (const inv of inventory) {
        if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
          return res.status(400).json({ message: "Invalid inventory entry" });
        }
      }
      product.inventory = inventory;
    }

    const validationError = validateProductInput(product);
    if (validationError) return res.status(400).json({ message: validationError });

    await product.save();
    await logAction(req.user.id, "Updated Stock Item", `${product.name}`);
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Soft Delete Product
router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found or already deleted" });
    product.isDeleted = true;
    await product.save();
    await logAction(req.user.id, "Soft Deleted Stock Item", `${product.name}`);
    res.json({ message: "Product archived (soft deleted)" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;