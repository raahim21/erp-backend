const Product = require("../models/Product");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const User = require("../models/User");
const logAction = require("../utils/logAction");
const mongoose = require("mongoose");

// Validation
function validateProductInput({ name, price, category, sku }) {
  if (!name || !name.trim()) return "Product name is required.";
  if (!sku || !sku.trim()) return "SKU is required.";
  if (price !== undefined && (isNaN(price) || price < 0)) return "Price must be a non-negative number.";
  if (!category) return "Category is required.";
  return null;
}

// CREATE
exports.createProduct = async (data, userId) => {
  const { name, sku, unit, manufacturer, brand, weight, returnable, sellable,
    purchasable, price, description, category, inventory = [] } = data;

  const validationError = validateProductInput({ name, price, category, sku });
  if (validationError) throw new Error(validationError);

  const catExists = await Category.findById(category);
  if (!catExists) throw new Error("Invalid category");

  if (brand) {
    const brandExists = await Brand.findById(brand);
    if (!brandExists) throw new Error("Invalid brand");
  }

  inventory.forEach(inv => {
    if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
      throw new Error("Invalid inventory entry");
    }
  });

  const product = new Product({ name, sku, unit, manufacturer, brand: brand || null,
    weight, returnable, sellable, purchasable, price, description, category, inventory, userId });

  await product.save();
  await logAction(userId, "Added Stock Item", name);
  return product;
};

// GET ALL with filters, pagination, search, quantity
exports.getProducts = async (queryParams) => {
  let { category, page = 1, startDate, endDate, search, username, startQuantity, endQuantity } = queryParams;
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
    const user = await User.findOne({ username: new RegExp(`^${username}$`, "i") }).select("_id");
    if (user) match.userId = user._id;
    else return { products: [], totalResults: 0, totalPages: 0, currentPage: page };
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
  if (Object.keys(quantityMatch).length > 0) {
      aggPipeline.push({ $match: { totalQuantity: quantityMatch } });
  }

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
  return { products, totalResults, totalPages, currentPage: page };
};

// GET SINGLE
exports.getProductById = async (id) => {
  const product = await Product.findById(id)
    .populate("category")
    .populate("brand")
    .populate("inventory.location");

  if (!product || product.isDeleted) throw new Error("Product not found");
  return product;
};

// UPDATE
exports.updateProduct = async (id, updateData, userId) => {
  const product = await Product.findById(id);
  if (!product || product.isDeleted) throw new Error("Product not found");

  delete updateData._id;
  delete updateData.userId;
  delete updateData.createdAt;
  delete updateData.updatedAt;

  if (updateData.category) {
      const catExists = await Category.findById(updateData.category);
      if (!catExists) throw new Error("Invalid category");
  }

  if (updateData.brand) {
    const brandExists = await Brand.findById(updateData.brand);
    if (!brandExists) throw new Error("Invalid brand");
  } else if (updateData.brand === "" || updateData.brand === null) {
    updateData.brand = null;
  }

  if (updateData.inventory) {
      for (const inv of updateData.inventory) {
          if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
              throw new Error("Invalid inventory entry");
          }
      }
  }

  Object.assign(product, updateData);

  const validationError = validateProductInput(product);
  if (validationError) throw new Error(validationError);

  const updatedProduct = await product.save();
  await logAction(userId, "Updated Stock Item", updatedProduct.name);
  return updatedProduct;
};

// DELETE (Soft)
exports.deleteProduct = async (id, userId) => {
  const product = await Product.findById(id);
  if (!product || product.isDeleted) throw new Error("Product not found or already deleted");
  product.isDeleted = true;
  await product.save();
  await logAction(userId, "Soft Deleted Stock Item", product.name);
  return { message: "Product archived successfully" };
};
