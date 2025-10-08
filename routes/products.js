const express = require("express");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const logAction = require("../utils/logAction");

const router = express.Router();

const requireRole = require("../middleware/roles");
const User = require("../models/User");

// Helper: basic validation
function validateProductInput({ name, quantity, price }) {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return "Product name is required.";
  }
  if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
    return "Quantity must be a non-negative number.";
  }
  if (price !== undefined && (isNaN(price) || price < 0)) {
    return "Price must be a non-negative number.";
  }
  return null;
}

// Create Product
router.post("/", auth, requireRole("admin", 'manager'), async (req, res) => {
  try {
    const { name, quantity, price, description, category } = req.body;
    console.log(req.body)
    const validationError = validateProductInput({ name, quantity, price });
    if (validationError)
      return res.status(400).json({ message: validationError });

    const product = new Product({
      name,
      quantity,
      price,
      description,
      category,
      userId: req.user.id,
    });
    await product.save();
    await logAction(req.user.id, "Added Stock Item", `${product.name}`);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", auth, async (req, res) => {
  let { category } = req.query
  let page = parseInt(req.query.page) || 1;
  if (page < 1) page = 1; // ✅ fix negative skip

  const limit = 10;
  const skip = (page - 1) * limit;

  let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  let endDate = req.query.endDate ? new Date(req.query.endDate) : null;

  const search = req.query.search || "";

  try {
    const filter = {};

    if (startDate && endDate) {
      filter.createdAt = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      filter.createdAt = { $gte: startDate };
    } else if (endDate) {
      filter.createdAt = { $lte: endDate };
    }
    if(category){
      filter.category = category
    }
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    if (req.query.username) {
      let user = await User.findOne({ username: req.query.username }).select(
        "_id"
      );
      if (user) {
        filter.userId = user._id;
      }
    }

    filter.isDeleted = false;
    let productsQuery = Product.find(filter);

    if (limit > 0) {
      productsQuery = productsQuery.skip(skip).limit(limit);
    }

    const [products, total] = await Promise.all([
      productsQuery,
      Product.countDocuments(filter),
    ]);

    res.json({
      products,
      totalResults: total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Single Product
router.get("/:id", auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Product
router.put("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, price } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.isDeleted) {
      return res
        .status(400)
        .json({ message: "Cannot update a deleted product" });
    }

    if (name !== undefined) product.name = name;
    if (price !== undefined) product.price = price;

    const validationError = validateProductInput(product);
    if (validationError)
      return res.status(400).json({ message: validationError });

    await product.save();
    await logAction(req.user.id, "Updated Stock Item", `${product.name}`);
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Product
router.delete("/:id", auth, requireRole("admin", "staff"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res
        .status(404)
        .json({ message: "Product not found or already deleted" });
    }
    product.isDeleted = true;
    await product.save();
    await logAction(req.user.id, "Soft Deleted Stock Item",`${product.name}`);

    res.json({ message: "Product archived (soft deleted)" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
