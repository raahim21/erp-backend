// const express = require("express");
// const Purchase = require("../models/Purchase");
// const Product = require("../models/Product");
// const StockMovement = require("../models/StockMovement");
// const Vendor = require("../models/Vendor");
// const Location = require("../models/Location");
// const auth = require("../middleware/auth");
// const requireRole = require("../middleware/roles");
// const logAction = require("../utils/logAction");
// const { body } = require("express-validator");
// const User = require("../models/User");
// const { default: mongoose } = require("mongoose");
// const handleValidationErrors = require("../middleware/validation");

// const router = express.Router();

// // Create Purchase
// router.post(
//   "/",
//   auth,
//   requireRole("admin", "manager"),
//   [
//     body("type").isIn(["Vendor", "Internal", "Transfer"]),
//     body("vendorId").if(body("type").equals("Vendor")).isMongoId(),
//     body("department").if(body("type").equals("Internal")).isString().trim().notEmpty(),
//     body("fromLocation").if(body("type").equals("Transfer")).isMongoId(),
//     body("toLocation").isMongoId(), // Required for all to know where to add stock
//     body("productId").isMongoId(),
//     body("quantity").isInt({ min: 1 }),
//     body("totalPrice").isFloat({ min: 0 }),
//     body("status").optional().isIn(["Pending", "Completed", "Cancelled"]),
//     body("poNumber").optional().isString().trim(),
//     body("notes").optional().isString(),
//   ],
//   handleValidationErrors,
//   async (req, res) => {
//     let session;
//     try {
//       session = await mongoose.startSession();
//       session.startTransaction();
//       let {
//         type,
//         vendorId,
//         department,
//         fromLocation,
//         toLocation,
//         productId,
//         quantity,
//         totalPrice,
//         status = "Pending",
//         poNumber,
//         notes,
//       } = req.body;

//       // Validate references
//       const product = await Product.findById(productId).session(session);
//       if (!product) throw new Error("Product not found");

//       if (type === "Vendor" && vendorId) {
//         const vendor = await Vendor.findById(vendorId).session(session);
//         if (!vendor) throw new Error("Vendor not found");
//       }
//       if (toLocation) {
//         const loc = await Location.findById(toLocation).session(session);
//         if (!loc) throw new Error("To location not found");
//       }
//       if (type === "Transfer" && fromLocation) {
//         const loc = await Location.findById(fromLocation).session(session);
//         if (!loc) throw new Error("From location not found");
//       }

//       // Generate poNumber if not provided
//       let finalPoNumber = poNumber || `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

//       // Check for existing poNumber
//       const existingPurchase = await Purchase.findOne({ poNumber: finalPoNumber }).session(session);
//       if (existingPurchase) throw new Error("PO Number already exists");

//       const purchase = new Purchase({
//         type,
//         vendorId: type === "Vendor" ? vendorId : undefined,
//         department: type === "Internal" ? department : undefined,
//         fromLocation: type === "Transfer" ? fromLocation : undefined,
//         toLocation,
//         productId,
//         quantity,
//         totalPrice,
//         status,
//         poNumber: finalPoNumber,
//         notes,
//         userId: req.user.id,
//       });

//       if (status === "Completed") {
//         // Update inventory
//         if (type === "Transfer") {
//           let fromInv = product.inventory.find(inv => inv.location.toString() === fromLocation.toString());
//           if (!fromInv || fromInv.quantity < quantity) throw new Error("Insufficient stock in from location");
//           fromInv.quantity -= quantity;

//           let toInv = product.inventory.find(inv => inv.location.toString() === toLocation.toString());
//           if (!toInv) {
//             product.inventory.push({ location: toLocation, quantity });
//           } else {
//             toInv.quantity += quantity;
//           }

//           // Create StockMovements
//           await new StockMovement({
//             productId,
//             changeType: "transfer",
//             quantityChange: -quantity,
//             referenceId: purchase._id,
//             userId: req.user.id,
//             note: `Transfer out from ${fromLocation}`,
//           }).save({ session });

//           await new StockMovement({
//             productId,
//             changeType: "transfer",
//             quantityChange: quantity,
//             referenceId: purchase._id,
//             userId: req.user.id,
//             note: `Transfer in to ${toLocation}`,
//           }).save({ session });
//         } else {
//           // Vendor or Internal: add to toLocation
//           let toInv = product.inventory.find(inv => inv.location.toString() === toLocation.toString());
//           if (!toInv) {
//             product.inventory.push({ location: toLocation, quantity });
//           } else {
//             toInv.quantity += quantity;
//           }

//           await new StockMovement({
//             productId,
//             changeType: "purchase",
//             quantityChange: quantity,
//             referenceId: purchase._id,
//             userId: req.user.id,
//             note: `${type} purchase added to ${toLocation}`,
//           }).save({ session });
//         }
//         await product.save({ session });
//       }

//       await purchase.save({ session });
//       await logAction(req.user.id, "Created purchase");
//       await session.commitTransaction();
//       session.endSession();
//       res.status(201).json(purchase);
//     } catch (error) {
//       if (session) {
//         await session.abortTransaction();
//         session.endSession();
//       }
//       console.error("POST /purchases: Error:", error.message);
//       res.status(500).json({ message: error.message });
//     }
//   }
// );

// router.get("/", auth, async (req, res) => {
//   try {
//     const search = req.query.search || "";
//     const page = parseInt(req.query.page) || 1;
//     const limit = 10;
//     let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
//     let endDate = req.query.endDate ? new Date(req.query.endDate) : null;
//     const skip = (page - 1) * limit;
//     const filter = {};

//     if (startDate || endDate) {
//       if (startDate) startDate.setHours(0, 0, 0, 0);
//       if (endDate) endDate.setHours(23, 59, 59, 999);
//     }

//     if (req.query.type) {
//       filter.type = req.query.type;
//     }

//     if (req.query.status) {
//       filter.status = req.query.status;
//     }

//     if (startDate && endDate) {
//       filter.purchaseDate = { $gte: startDate, $lte: endDate };
//     } else if (startDate) {
//       filter.purchaseDate = { $gte: startDate };
//     } else if (endDate) {
//       filter.purchaseDate = { $lte: endDate };
//     }

//     if (search) {
//       filter.$or = [
//         { poNumber: { $regex: search, $options: "i" } },
//         { notes: { $regex: search, $options: "i" } },
//       ];
//     }
//     if (req.query.username) {
//       let user = await User.findOne({ username: req.query.username }).select("_id");
//       if (user) filter.userId = user._id;
//     }
//     let purchaseQuery = Purchase.find(filter)
//       .populate("vendorId")
//       .populate("fromLocation")
//       .populate("toLocation")
//       .populate("productId");

//     if (limit > 0) {
//       purchaseQuery = purchaseQuery.skip(skip).limit(limit);
//     }

//     const [purchases, totalPurchases] = await Promise.all([
//       purchaseQuery,
//       Purchase.countDocuments(filter),
//     ]);

//     res.json({
//       purchases,
//       totalResults: totalPurchases,
//       totalPages: limit > 0 ? Math.ceil(totalPurchases / limit) : 1,
//       currentPage: page,
//     });
//   } catch (error) {
//     console.error("GET /purchases: Error:", error.message);
//     res.status(500).json({ message: error.message });
//   }
// });
// // Get Single Purchase
// router.get("/:id", auth, async (req, res) => {
//   try {
//     const purchase = await Purchase.findById(req.params.id)
//       .populate("vendorId")
//       .populate("fromLocation")
//       .populate("toLocation")
//       .populate("productId");
//     if (!purchase) {
//       return res.status(404).json({ message: "Purchase not found" });
//     }
//     res.json(purchase);
//   } catch (error) {
//     console.error("GET /purchases/:id: Error:", error.message);
//     res.status(500).json({ message: error.message });
//   }
// });

// router.put(
//   "/:id",
//   auth,
//   requireRole("admin", "manager"),
//   [
//     body("vendorId").optional().isMongoId(),
//     body("department").optional().isString().trim(),
//     body("fromLocation").optional().isMongoId(),
//     body("toLocation").optional().isMongoId(),
//     body("productId").optional().isMongoId(),
//     body("quantity").optional().isInt({ min: 1 }),
//     body("totalPrice").optional().isFloat({ min: 0 }),
//     body("status").optional().isIn(["Pending", "Completed", "Cancelled"]),
//     body("type").optional().isIn(["Vendor", "Internal", "Transfer"]),
//     body("notes").optional().isString().trim(),
//   ],
//   handleValidationErrors,
//   async (req, res) => {
//     const session = await mongoose.startSession();
//     try {
//       session.startTransaction();

//       const {
//         vendorId,
//         department,
//         fromLocation,
//         toLocation,
//         productId,
//         quantity,
//         totalPrice,
//         type,
//         status,
//         poNumber,
//         notes,
//       } = req.body;

//       const purchase = await Purchase.findById(req.params.id).session(session);
//       if (!purchase) throw new Error("Purchase not found");

//       let oldProduct = await Product.findById(purchase.productId).session(session);
//       if (!oldProduct) throw new Error("Original product not found");
//       let newProduct = oldProduct;

//       // Handle product change
//       if (productId && productId !== purchase.productId.toString()) {
//         newProduct = await Product.findById(productId).session(session);
//         if (!newProduct) throw new Error("New product not found");
//       }

//       // Determine changes
//       const oldType = purchase.type;
//       const newType = type || oldType;
//       const oldQty = purchase.quantity;
//       const newQty = quantity || oldQty;
//       const qtyDiff = newQty - oldQty;
//       const oldStatus = purchase.status;
//       const newStatus = status || oldStatus;
//       const oldToLoc = purchase.toLocation;
//       const newToLoc = toLocation || oldToLoc;
//       const oldFromLoc = purchase.fromLocation;
//       const newFromLoc = fromLocation || oldFromLoc;

//       // Function to adjust inventory
//       const adjustInventory = (prod, locId, diff) => {
//         let inv = prod.inventory.find(inv => inv.location.toString() === locId.toString());
//         if (!inv && diff > 0) {
//           prod.inventory.push({ location: locId, quantity: diff });
//         } else if (inv) {
//           inv.quantity += diff;
//           if (inv.quantity < 0) throw new Error("Stock cannot go negative");
//         } else if (diff < 0) {
//           throw new Error("No inventory entry to subtract from");
//         }
//       };

//       // Reverse old effects if Completed
//       if (oldStatus === "Completed") {
//         if (oldType === "Transfer") {
//           adjustInventory(oldProduct, oldFromLoc, oldQty); // Add back to from
//           adjustInventory(oldProduct, oldToLoc, -oldQty); // Subtract from to
//         } else {
//           adjustInventory(oldProduct, oldToLoc, -oldQty); // Subtract from to
//         }
//       }

//       // Apply new effects if newStatus Completed
//       if (newStatus === "Completed") {
//         if (newType === "Transfer") {
//           adjustInventory(newProduct, newFromLoc, -newQty); // Subtract from from
//           adjustInventory(newProduct, newToLoc, newQty); // Add to to

//           // StockMovements
//           await new StockMovement({
//             productId: newProduct._id,
//             changeType: "transfer",
//             quantityChange: -newQty,
//             referenceId: purchase._id,
//             userId: req.user.id,
//             note: `Transfer out from ${newFromLoc}`,
//           }).save({ session });

//           await new StockMovement({
//             productId: newProduct._id,
//             changeType: "transfer",
//             quantityChange: newQty,
//             referenceId: purchase._id,
//             userId: req.user.id,
//             note: `Transfer in to ${newToLoc}`,
//           }).save({ session });
//         } else {
//           adjustInventory(newProduct, newToLoc, newQty); // Add to to

//           await new StockMovement({
//             productId: newProduct._id,
//             changeType: "purchase",
//             quantityChange: newQty,
//             referenceId: purchase._id,
//             userId: req.user.id,
//             note: `${newType} purchase added to ${newToLoc}`,
//           }).save({ session });
//         }
//       }

//       // PO uniqueness check
//       if (poNumber && poNumber !== purchase.poNumber) {
//         const existing = await Purchase.findOne({ poNumber }).session(session);
//         if (existing) throw new Error("PO Number already exists");
//         purchase.poNumber = poNumber;
//       }

//       // Update fields
//       purchase.type = newType;
//       if (vendorId) purchase.vendorId = vendorId;
//       if (department) purchase.department = department;
//       if (fromLocation) purchase.fromLocation = fromLocation;
//       if (toLocation) purchase.toLocation = toLocation;
//       if (productId) purchase.productId = productId;
//       if (quantity) purchase.quantity = quantity;
//       if (totalPrice) purchase.totalPrice = totalPrice;
//       if (status) purchase.status = status;
//       if (notes) purchase.notes = notes;

//       // Validate conditional fields based on new type
//       if (newType === "Transfer") {
//         if (!purchase.fromLocation || !purchase.toLocation) throw new Error("fromLocation and toLocation required for Transfer");
//         purchase.vendorId = undefined;
//         purchase.department = undefined;
//       } else if (newType === "Internal") {
//         if (!purchase.department) throw new Error("Department required for Internal type");
//         purchase.vendorId = undefined;
//         purchase.fromLocation = undefined;
//       } else if (newType === "Vendor") {
//         if (!purchase.vendorId) throw new Error("Vendor required for Vendor type");
//         purchase.department = undefined;
//         purchase.fromLocation = undefined;
//       }

//       if (newProduct !== oldProduct) await oldProduct.save({ session });
//       await newProduct.save({ session });
//       await purchase.save({ session });
//       await logAction(req.user.id, "Updated Purchase");

//       await session.commitTransaction();
//       session.endSession();
//       res.json(purchase);
//     } catch (error) {
//       if (session) {
//         await session.abortTransaction();
//         session.endSession();
//       }
//       console.error("PUT /purchases/:id: Error:", error.message);
//       res.status(500).json({ message: error.message });
//     }
//   }
// );

// // Delete Purchase
// router.delete(
//   "/:id",
//   auth,
//   requireRole("admin", "manager"),
//   async (req, res) => {
//     let session;
//     try {
//       session = await mongoose.startSession();
//       session.startTransaction();

//       const purchase = await Purchase.findById(req.params.id).session(session);
//       if (!purchase) throw new Error("Purchase not found");

//       const product = await Product.findById(purchase.productId).session(session);
//       if (!product) throw new Error("Product not found");

//       if (purchase.status === "Completed") {
//         if (purchase.type === "Transfer") {
//           product.inventory.find(inv => inv.location.toString() === purchase.fromLocation.toString()).quantity += purchase.quantity;
//           product.inventory.find(inv => inv.location.toString() === purchase.toLocation.toString()).quantity -= purchase.quantity;
//         } else {
//           product.inventory.find(inv => inv.location.toString() === purchase.toLocation.toString()).quantity -= purchase.quantity;
//         }
//         await product.save({ session });

//         // Optional: delete or mark StockMovements, but for now, leave as history
//       }

//       await purchase.deleteOne({ session });
//       await logAction(req.user.id, "Deleted Purchase");

//       await session.commitTransaction();
//       session.endSession();

//       res.json({ message: "Purchase deleted" });
//     } catch (error) {
//       if (session) {
//         await session.abortTransaction();
//         session.endSession();
//       }
//       console.error("DELETE /purchases/:id: Error:", error.message);
//       res.status(500).json({ message: error.message });
//     }
//   }
// );

// module.exports = router;


// purchases.js (updated route)
const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const Vendor = require("../models/Vendor");
const Location = require("../models/Location");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const logAction = require("../utils/logAction");
const { body } = require("express-validator");
const User = require("../models/User");
const { default: mongoose } = require("mongoose");
const handleValidationErrors = require("../middleware/validation");

const router = express.Router();

// Create Purchase
router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  [
    body("type").isIn(["Vendor", "Internal", "Transfer"]),
    body("vendorId").if(body("type").equals("Vendor")).isMongoId(),
    body("department").if(body("type").equals("Internal")).isString().trim().notEmpty(),
    body("fromLocation").if(body("type").equals("Transfer")).isMongoId(),
    body("toLocation").isMongoId(), // Required for all to know where to add stock
    body("productId").isMongoId(),
    body("quantity").isInt({ min: 1 }),
    body("totalPrice").isFloat({ min: 0 }),
    body("status").optional().isIn(["Pending", "Completed", "Cancelled"]),
    body("poNumber").optional().isString().trim(),
    body("notes").optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      let {
        type,
        vendorId,
        department,
        fromLocation,
        toLocation,
        productId,
        quantity,
        totalPrice,
        status = "Pending",
        poNumber,
        notes,
      } = req.body;

      // Validate references
      const product = await Product.findById(productId).session(session);
      if (!product) throw new Error("Product not found");

      if (type === "Vendor" && vendorId) {
        const vendor = await Vendor.findById(vendorId).session(session);
        if (!vendor) throw new Error("Vendor not found");
      }
      if (toLocation) {
        const loc = await Location.findById(toLocation).session(session);
        if (!loc) throw new Error("To location not found");
      }
      if (type === "Transfer" && fromLocation) {
        const loc = await Location.findById(fromLocation).session(session);
        if (!loc) throw new Error("From location not found");
      }

      // Generate poNumber if not provided
      let finalPoNumber = poNumber || `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Check for existing poNumber
      const existingPurchase = await Purchase.findOne({ poNumber: finalPoNumber }).session(session);
      if (existingPurchase) throw new Error("PO Number already exists");

      const purchase = new Purchase({
        type,
        vendorId: type === "Vendor" ? vendorId : undefined,
        department: type === "Internal" ? department : undefined,
        fromLocation: type === "Transfer" ? fromLocation : undefined,
        toLocation,
        productId,
        quantity,
        totalPrice,
        status,
        poNumber: finalPoNumber,
        notes,
        userId: req.user.id,
      });

      if (status === "Completed") {
        // Update inventory
        if (type === "Transfer") {
          let fromInv = product.inventory.find(inv => inv.location.toString() === fromLocation.toString());
          if (!fromInv || fromInv.quantity < quantity) throw new Error("Insufficient stock in from location");
          fromInv.quantity -= quantity;

          let toInv = product.inventory.find(inv => inv.location.toString() === toLocation.toString());
          if (!toInv) {
            product.inventory.push({ location: toLocation, quantity });
          } else {
            toInv.quantity += quantity;
          }

          // Create StockMovements
          await new StockMovement({
            productId,
            changeType: "transfer",
            quantityChange: -quantity,
            referenceId: purchase._id,
            userId: req.user.id,
            note: `Transfer out from ${fromLocation}`,
          }).save({ session });

          await new StockMovement({
            productId,
            changeType: "transfer",
            quantityChange: quantity,
            referenceId: purchase._id,
            userId: req.user.id,
            note: `Transfer in to ${toLocation}`,
          }).save({ session });
        } else {
          // Vendor or Internal: add to toLocation
          let toInv = product.inventory.find(inv => inv.location.toString() === toLocation.toString());
          if (!toInv) {
            product.inventory.push({ location: toLocation, quantity });
          } else {
            toInv.quantity += quantity;
          }

          await new StockMovement({
            productId,
            changeType: "purchase",
            quantityChange: quantity,
            referenceId: purchase._id,
            userId: req.user.id,
            note: `${type} purchase added to ${toLocation}`,
          }).save({ session });
        }
        await product.save({ session });
      }

      await purchase.save({ session });
      await logAction(req.user.id, "Created purchase");
      await session.commitTransaction();
      session.endSession();
      res.status(201).json(purchase);
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      console.error("POST /purchases: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /api/purchases
router.get("/", auth, async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    let endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const skip = (page - 1) * limit;
    const filter = {};

    if (startDate || endDate) {
      if (startDate) startDate.setHours(0, 0, 0, 0);
      if (endDate) endDate.setHours(23, 59, 59, 999);
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (startDate && endDate) {
      filter.purchaseDate = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      filter.purchaseDate = { $gte: startDate };
    } else if (endDate) {
      filter.purchaseDate = { $lte: endDate };
    }

    if (search) {
      filter.$or = [
        { poNumber: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }
    if (req.query.username) {
      // case-insensitive username lookup
      const user = await User.findOne({ username: new RegExp(`^${req.query.username}$`, "i") }).select("_id");
      if (user) filter.userId = user._id;
      else {
        return res.json({ purchases: [], totalResults: 0, totalPages: 0, currentPage: page });
      }
    }

    if (req.query.startQuantity || req.query.endQuantity) {
      filter.quantity = {};
      if (req.query.startQuantity) filter.quantity.$gte = Number(req.query.startQuantity);
      if (req.query.endQuantity) filter.quantity.$lte = Number(req.query.endQuantity);
    }

    let purchaseQuery = Purchase.find(filter)
      .populate("vendorId", "name")
      .populate("fromLocation", "name")
      .populate("toLocation", "name")
      .populate("productId", "name");

    if (limit > 0) {
      purchaseQuery = purchaseQuery.skip(skip).limit(limit);
    }

    const [purchases, totalPurchases] = await Promise.all([
      purchaseQuery,
      Purchase.countDocuments(filter),
    ]);

    res.json({
      purchases,
      totalResults: totalPurchases,
      totalPages: limit > 0 ? Math.ceil(totalPurchases / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("GET /purchases: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Get Single Purchase
router.get("/:id", auth, async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate("vendorId", "name")
      .populate("fromLocation", "name")
      .populate("toLocation", "name")
      .populate("productId", "name");
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    res.json(purchase);
  } catch (error) {
    console.error("GET /purchases/:id: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Update Purchase
router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("type").optional().isIn(["Vendor", "Internal", "Transfer"]),
    body("vendorId").if(body("type").equals("Vendor")).isMongoId(),
    body("department").if(body("type").equals("Internal")).isString().trim(),
    body("fromLocation").if(body("type").equals("Transfer")).isMongoId(),
    body("toLocation").optional().isMongoId(),
    body("productId").optional().isMongoId(),
    body("quantity").optional().isInt({ min: 1 }),
    body("totalPrice").optional().isFloat({ min: 0 }),
    body("status").optional().isIn(["Pending", "Completed", "Cancelled"]),
    body("notes").optional().isString().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const {
        vendorId,
        department,
        fromLocation,
        toLocation,
        productId,
        quantity,
        totalPrice,
        type,
        status,
        poNumber,
        notes,
      } = req.body;

      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) throw new Error("Purchase not found");

      let oldProduct = await Product.findById(purchase.productId).session(session);
      if (!oldProduct) throw new Error("Original product not found");
      let newProduct = oldProduct;

      // Handle product change
      if (productId && productId !== purchase.productId.toString()) {
        newProduct = await Product.findById(productId).session(session);
        if (!newProduct) throw new Error("New product not found");
      }

      // Determine changes
      const oldType = purchase.type;
      const newType = type || oldType;
      const oldQty = purchase.quantity;
      const newQty = quantity || oldQty;
      const qtyDiff = newQty - oldQty;
      const oldStatus = purchase.status;
      const newStatus = status || oldStatus;
      const oldToLoc = purchase.toLocation;
      const newToLoc = toLocation || oldToLoc;
      const oldFromLoc = purchase.fromLocation;
      const newFromLoc = fromLocation || oldFromLoc;

      // Function to adjust inventory
      const adjustInventory = (prod, locId, diff) => {
        let inv = prod.inventory.find(inv => inv.location.toString() === locId.toString());
        if (!inv && diff > 0) {
          prod.inventory.push({ location: locId, quantity: diff });
        } else if (inv) {
          inv.quantity += diff;
          if (inv.quantity < 0) throw new Error("Stock cannot go negative");
        } else if (diff < 0) {
          throw new Error("No inventory entry to subtract from");
        }
      };

      // Reverse old effects if Completed
      if (oldStatus === "Completed") {
        if (oldType === "Transfer") {
          adjustInventory(oldProduct, oldFromLoc, oldQty); // Add back to from
          adjustInventory(oldProduct, oldToLoc, -oldQty); // Subtract from to
        } else {
          adjustInventory(oldProduct, oldToLoc, -oldQty); // Subtract from to
        }
      }

      // Apply new effects if newStatus Completed
      if (newStatus === "Completed") {
        if (newType === "Transfer") {
          adjustInventory(newProduct, newFromLoc, -newQty); // Subtract from from
          adjustInventory(newProduct, newToLoc, newQty); // Add to to

          // StockMovements
          await new StockMovement({
            productId: newProduct._id,
            changeType: "transfer",
            quantityChange: -newQty,
            referenceId: purchase._id,
            userId: req.user.id,
            note: `Transfer out from ${newFromLoc}`,
          }).save({ session });

          await new StockMovement({
            productId: newProduct._id,
            changeType: "transfer",
            quantityChange: newQty,
            referenceId: purchase._id,
            userId: req.user.id,
            note: `Transfer in to ${newToLoc}`,
          }).save({ session });
        } else {
          adjustInventory(newProduct, newToLoc, newQty); // Add to to

          await new StockMovement({
            productId: newProduct._id,
            changeType: "purchase",
            quantityChange: newQty,
            referenceId: purchase._id,
            userId: req.user.id,
            note: `${newType} purchase added to ${newToLoc}`,
          }).save({ session });
        }
      }

      // PO uniqueness check
      if (poNumber && poNumber !== purchase.poNumber) {
        const existing = await Purchase.findOne({ poNumber }).session(session);
        if (existing) throw new Error("PO Number already exists");
        purchase.poNumber = poNumber;
      }

      // Update fields
      purchase.type = newType;
      if (vendorId) purchase.vendorId = vendorId;
      if (department) purchase.department = department;
      if (fromLocation) purchase.fromLocation = fromLocation;
      if (toLocation) purchase.toLocation = toLocation;
      if (productId) purchase.productId = productId;
      if (quantity) purchase.quantity = quantity;
      if (totalPrice) purchase.totalPrice = totalPrice;
      if (status) purchase.status = status;
      if (notes) purchase.notes = notes;

      // Validate conditional fields based on new type
      if (newType === "Transfer") {
        if (!purchase.fromLocation || !purchase.toLocation) throw new Error("fromLocation and toLocation required for Transfer");
        purchase.vendorId = undefined;
        purchase.department = undefined;
      } else if (newType === "Internal") {
        if (!purchase.department) throw new Error("Department required for Internal type");
        purchase.vendorId = undefined;
        purchase.fromLocation = undefined;
      } else if (newType === "Vendor") {
        if (!purchase.vendorId) throw new Error("Vendor required for Vendor type");
        purchase.department = undefined;
        purchase.fromLocation = undefined;
      }

      if (newProduct !== oldProduct) await oldProduct.save({ session });
      await newProduct.save({ session });
      await purchase.save({ session });
      await logAction(req.user.id, "Updated Purchase");

      await session.commitTransaction();
      session.endSession();
      res.json(purchase);
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      console.error("PUT /purchases/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete Purchase
router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) throw new Error("Purchase not found");

      const product = await Product.findById(purchase.productId).session(session);
      if (!product) throw new Error("Product not found");

      if (purchase.status === "Completed") {
        if (purchase.type === "Transfer") {
          product.inventory.find(inv => inv.location.toString() === purchase.fromLocation.toString()).quantity += purchase.quantity;
          product.inventory.find(inv => inv.location.toString() === purchase.toLocation.toString()).quantity -= purchase.quantity;
        } else {
          product.inventory.find(inv => inv.location.toString() === purchase.toLocation.toString()).quantity -= purchase.quantity;
        }
        await product.save({ session });

        // Optional: delete or mark StockMovements, but for now, leave as history
      }

      await purchase.deleteOne({ session });
      await logAction(req.user.id, "Deleted Purchase");

      await session.commitTransaction();
      session.endSession();

      res.json({ message: "Purchase deleted" });
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      console.error("DELETE /purchases/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;