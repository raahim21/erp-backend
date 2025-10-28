// const express = require("express");
// const mongoose = require("mongoose");
// const Product = require("../models/Product");
// const Category = require("../models/Category");
// const Brand = require("../models/Brand"); // 1. Import the Brand model
// const auth = require("../middleware/auth");
// const logAction = require("../utils/logAction");
// const requireRole = require("../middleware/roles");
// const User = require("../models/User");
// const { createProduct } = require("../controllers/productController");

// const router = express.Router();

// // Helper: basic validation
// function validateProductInput({ name, price, category, sku }) {
//   if (!name || typeof name !== "string" || name.trim().length === 0) {
//     return "Product name is required.";
//   }
//   if (!sku || typeof sku !== "string" || sku.trim().length === 0) {
//     return "SKU is required.";
//   }
//   if (price !== undefined && (isNaN(price) || price < 0)) {
//     return "Price must be a non-negative number.";
//   }
//   if (!category) {
//     return "Category is required.";
//   }
//   return null;
// }

// // Create Product
// router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const {
//       name, sku, unit, manufacturer, brand, weight, returnable, sellable,
//       purchasable, price, description, category, inventory = [],
//     } = req.body;

//     const validationError = validateProductInput({ name, price, category, sku });
//     if (validationError) return res.status(400).json({ message: validationError });

//     // Check if category exists
//     const catExists = await Category.findById(category);
//     if (!catExists) return res.status(400).json({ message: "Invalid category" });

//     // 2. Validate that the Brand ID exists before creating the product
//     if (brand) {
//       const brandExists = await Brand.findById(brand);
//       if (!brandExists) return res.status(400).json({ message: "Invalid brand" });
//     }

//     // Validate inventory entries
//     for (const inv of inventory) {
//       if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
//         return res.status(400).json({ message: "Invalid inventory entry" });
//       }
//     }

//     const product = new Product({
//       name, sku, unit, manufacturer,
//       brand: brand || null, // Saves the ObjectId or null if not provided
//       weight, returnable, sellable, purchasable, price,
//       description, category, inventory, userId: req.user.id,
//     });

//     await product.save();
//     await logAction(req.user.id, "Added Stock Item", `${product.name}`);
//     res.status(201).json(product);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // GET /api/products (Refactored for performance)
// router.get("/", auth, async (req, res) => {
//   try {
//     // ... (rest of the code is unchanged and already handles this correctly)
//     let { category, page = 1, startDate, endDate, search, username, startQuantity, endQuantity } = req.query;
//     page = parseInt(page, 10) || 1;
//     const limit = 10;
//     const skip = (page - 1) * limit;

//     const match = { isDeleted: false };

//     if (startDate) match.createdAt = { ...match.createdAt, $gte: new Date(startDate) };
//     if (endDate) {
//       const ed = new Date(endDate);
//       ed.setHours(23, 59, 59, 999);
//       match.createdAt = { ...match.createdAt, $lte: ed };
//     }

//     if (category) match.category = new mongoose.Types.ObjectId(category);
//     if (search) match.name = { $regex: search, $options: "i" };

//     if (username) {
//       const user = await User.findOne({ username: new RegExp(`^${username}$`, "i") }).select("_id");
//       if (user) match.userId = user._id;
//       else return res.json({ products: [], totalResults: 0, totalPages: 0, currentPage: page });
//     }

//     const aggPipeline = [
//       { $match: match },
//       { $addFields: { totalQuantity: { $sum: "$inventory.quantity" } } },
//     ];

//     const qMin = startQuantity !== undefined ? Number(startQuantity) : undefined;
//     const qMax = endQuantity !== undefined ? Number(endQuantity) : undefined;
//     const quantityMatch = {};
//     if (!isNaN(qMin)) quantityMatch.$gte = qMin;
//     if (!isNaN(qMax)) quantityMatch.$lte = qMax;
//     if (Object.keys(quantityMatch).length > 0) {
//         aggPipeline.push({ $match: { totalQuantity: quantityMatch } });
//     }

//     const countPipeline = [...aggPipeline, { $count: "total" }];
//     const countResult = await Product.aggregate(countPipeline);
//     const totalResults = countResult[0]?.total || 0;

//     aggPipeline.push(
//       { $sort: { createdAt: -1 } },
//       { $skip: skip },
//       { $limit: limit },
//       { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "category" } },
//       // 3. This aggregation pipeline already correctly looks up and unwinds the brand reference. No change was needed here.
//       { $lookup: { from: "brands", localField: "brand", foreignField: "_id", as: "brand" } },
//       { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
//       { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
//       { $lookup: { from: "locations", localField: "inventory.location", foreignField: "_id", as: "locationObjects" } },
//       { $addFields: {
//           inventory: {
//             $map: {
//               input: "$inventory",
//               as: "inv",
//               in: {
//                 location: { $arrayElemAt: [ "$locationObjects", { $indexOfArray: [ "$locationObjects._id", "$$inv.location" ] } ] },
//                 quantity: "$$inv.quantity"
//               }
//             }
//           }
//       }},
//       { $project: { locationObjects: 0 } }
//     );

//     const products = await Product.aggregate(aggPipeline);
//     const totalPages = Math.ceil(totalResults / limit);

//     res.json({ products, totalResults, totalPages, currentPage: page });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });


// router.get("/:id", auth, async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id)
//       .populate("category")
//       .populate("brand") // <== THIS IS THE CRITICAL LINE
//       .populate("inventory.location");
      
//     if (!product || product.isDeleted) {
//       return res.status(404).json({ message: "Product not found" });
//     }

//     res.json(product);
//   } catch (error) {
//     // Also, add better error logging for yourself
//     console.error("Error fetching product by ID:", error); 
//     res.status(500).json({ message: error.message });
//   }
// });
// // Update Product
// router.put("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const { id } = req.params;
//     const updateData = req.body;

//     const product = await Product.findById(id);
//     if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found" });

//     // Sanitize update data
//     delete updateData._id;
//     delete updateData.userId;
//     delete updateData.createdAt;
//     delete updateData.updatedAt;
    
//     // Validate category if being changed
//     if (updateData.category) {
//         const catExists = await Category.findById(updateData.category);
//         if (!catExists) return res.status(400).json({ message: "Invalid category" });
//     }

//     // 5. Validate Brand ID on update and handle unsetting the brand
//     if (updateData.brand) {
//       const brandExists = await Brand.findById(updateData.brand);
//       if (!brandExists) return res.status(400).json({ message: "Invalid brand" });
//     } else if (updateData.brand === "" || updateData.brand === null) {
//       // If front-end sends an empty string or null, set the field to null
//       updateData.brand = null;
//     }

//     // Validate inventory
//     if (updateData.inventory) {
//         for (const inv of updateData.inventory) {
//             if (!inv.location || isNaN(inv.quantity) || inv.quantity < 0) {
//                 return res.status(400).json({ message: "Invalid inventory entry" });
//             }
//         }
//     }
    
//     Object.assign(product, updateData);

//     const validationError = validateProductInput(product);
//     if (validationError) return res.status(400).json({ message: validationError });

//     const updatedProduct = await product.save();

//     await logAction(req.user.id, "Updated Stock Item", `${updatedProduct.name}`);
//     res.json(updatedProduct);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Soft Delete Product
// router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product || product.isDeleted) return res.status(404).json({ message: "Product not found or already deleted" });
//     product.isDeleted = true;
//     await product.save();
//     await logAction(req.user.id, "Soft Deleted Stock Item", `${product.name}`);
//     res.json({ message: "Product archived successfully" });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// module.exports = router;





const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const productController = require("../controllers/products.controller");

const router = express.Router();

router.post("/", auth, requireRole("admin", "manager"), productController.createProduct);
router.get("/", auth, productController.getProducts);
router.get("/:id", auth, productController.getProductById);
router.put("/:id", auth, requireRole("admin", "manager"), productController.updateProduct);
router.delete("/:id", auth, requireRole("admin", "manager"), productController.deleteProduct);

module.exports = router;
