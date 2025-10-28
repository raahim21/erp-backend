const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const logAction = require("../utils/logAction");
const mongoose = require("mongoose");

// Helper: basic validation
function validateProductInput({ name, price, category, sku }) {
  if (!name || typeof name !== "string" || name.trim().length === 0) return "Product name is required.";
  if (!sku || typeof sku !== "string" || sku.trim().length === 0) return "SKU is required.";
  if (price !== undefined && (isNaN(price) || price < 0)) return "Price must be a non-negative number.";
  if (!category) return "Category is required.";
  return null;
}

// Create Product
exports.createProduct = async (req, res) => {
  try {
    const {
      name, sku, unit, manufacturer, brand, weight, returnable, sellable,
      purchasable, price, description, category, inventory = [],
    } = req.body;

    const validationError = validateProductInput({ name, price, category, sku });
    if (validationError) return res.status(400).json({ message: validationError });

    const catExists = await Category.findById(category);
    if (!catExists) return res.status(400).json({ message: "Invalid category" });

    if (brand) {
      const brandExists = await Brand.findById(brand);
      if (!brandExists) return res.status(400).json({ message: "Invalid brand" });
    }

    for (const inv of inventory) {
      if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
        return res.status(400).json({ message: "Invalid inventory entry" });
      }
    }

    const product = new Product({
      name, sku, unit, manufacturer,
      brand: brand || null,
      weight, returnable, sellable, purchasable, price,
      description, category, inventory, userId: req.user.id,
    });

    await product.save();
    await logAction(req.user.id, "Added Stock Item", `${product.name}`);
    res.status(201).json(product);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get products with filters
exports.getProducts = async (req, res) => {
  try {
    let { category, page = 1, startDate, endDate, search, username, startQuantity, endQuantity } = req.query;
    page = parseInt(page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const match = { isDeleted: false };

    if (startDate) match.createdAt = { ...match.createdAt, $gte: new Date(startDate) };
    if (endDate) {
      const ed = new Date(endDate);
      ed.setHours(23, 59, 59, 999);
      match.createdAt = { ...match.createdAt, $lte: ed };
    }

    if (category) match.category = new mongoose.Types.ObjectId(category);
    if (search) match.name = { $regex: search, $options: "i" };

    if (username) {
      const user = await require("../models/User").findOne({ username: new RegExp(`^${username}$`, "i") }).select("_id");
      if (user) match.userId = user._id;
      else return res.json({ products: [], totalResults: 0, totalPages: 0, currentPage: page });
    }

    const aggPipeline = [
      { $match: match },
      { $addFields: { totalQuantity: { $sum: "$inventory.quantity" } } },
    ];

    const qMin = startQuantity !== undefined ? Number(startQuantity) : undefined;
    const qMax = endQuantity !== undefined ? Number(endQuantity) : undefined;
    const quantityMatch = {};
    if (!isNaN(qMin)) quantityMatch.$gte = qMin;
    if (!isNaN(qMax)) quantityMatch.$lte = qMax;
    if (Object.keys(quantityMatch).length > 0) aggPipeline.push({ $match: { totalQuantity: quantityMatch } });

    const countPipeline = [...aggPipeline, { $count: "total" }];
    const countResult = await Product.aggregate(countPipeline);
    const totalResults = countResult[0]?.total || 0;

    aggPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "category" } },
      { $lookup: { from: "brands", localField: "brand", foreignField: "_id", as: "brand" } },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "locations", localField: "inventory.location", foreignField: "_id", as: "locationObjects" } },
      { $addFields: {
          inventory: {
            $map: {
              input: "$inventory",
              as: "inv",
              in: {
                location: { $arrayElemAt: [ "$locationObjects", { $indexOfArray: [ "$locationObjects._id", "$$inv.location" ] } ] },
                quantity: "$$inv.quantity"
              }
            }
          }
      }},
      { $project: { locationObjects: 0 } }
    );

    const products = await Product.aggregate(aggPipeline);
    const totalPages = Math.ceil(totalResults / limit);

    res.json({ products, totalResults, totalPages, currentPage: page });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single product
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category")
      .populate("brand")
      .populate("inventory.location");

    if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const product = await Product.findById(id);
    if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found" });

    // sanitize
    delete updateData._id;
    delete updateData.userId;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    if (updateData.category) {
      const catExists = await Category.findById(updateData.category);
      if (!catExists) return res.status(400).json({ message: "Invalid category" });
    }

    if (updateData.brand) {
      const brandExists = await Brand.findById(updateData.brand);
      if (!brandExists) return res.status(400).json({ message: "Invalid brand" });
    } else if (updateData.brand === "" || updateData.brand === null) updateData.brand = null;

    if (updateData.inventory) {
      for (const inv of updateData.inventory) {
        if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) return res.status(400).json({ message: "Invalid inventory entry" });
      }
    }

    Object.assign(product, updateData);

    const validationError = validateProductInput(product);
    if (validationError) return res.status(400).json({ message: validationError });

    const updatedProduct = await product.save();
    await logAction(req.user.id, "Updated Stock Item", updatedProduct.name);
    res.json(updatedProduct);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Soft delete
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found or already deleted" });

    product.isDeleted = true;
    await product.save();
    await logAction(req.user.id, "Soft Deleted Stock Item", product.name);

    res.json({ message: "Product archived successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
