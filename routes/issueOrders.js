// const express = require("express");
// const IssueOrder = require("../models/IssueOrder");
// const Product = require("../models/Product");
// const auth = require("../middleware/auth");
// const requireRole = require("../middleware/roles");
// const { body, validationResult } = require("express-validator");
// const logAction = require("../utils/logAction");
// const mongoose = require("mongoose");

// const router = express.Router();

// const issueOrderValidation = [
//   body("clientName").isString().trim().notEmpty().withMessage("Client name is required"),
//   body("clientPhone").optional({ checkFalsy: true }).isString().trim(),
//   body("customerId").optional({ checkFalsy: true }).isMongoId().withMessage("Invalid customer ID"),
//   body("products").isArray({ min: 1 }).withMessage("At least one product is required"),
//   body("products.*.productId").isMongoId().withMessage("Invalid product ID"),
//   body("products.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
//   body("products.*.unitPrice").isFloat({ min: 0 }).withMessage("Unit price must be non-negative"),
//   body("totalAmount").isFloat({ min: 0 }).withMessage("Total amount must be non-negative"),
//   body("issueDate").optional().isISO8601().toDate().withMessage("Invalid issue date format"),
// ];

// // Helper to deduct stock
// const deductStock = async (products, session) => {
//   for (const item of products) {
//     const stock = await Product.findById(item.productId).session(session);
//     if (!stock) throw new Error(`Product not found: ${item.productId}`);
//     if (stock.isDeleted) throw new Error(`Product is archived and cannot be issued: ${stock.name}`);

//     const totalStock = stock.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
//     if (totalStock < item.quantity) {
//       throw new Error(`Insufficient stock for ${stock.name}. Available: ${totalStock}, Required: ${item.quantity}`);
//     }

//     let remainingToDeduct = item.quantity;
//     for (const inv of stock.inventory) {
//       if (remainingToDeduct <= 0) break;
//       const deduction = Math.min(inv.quantity, remainingToDeduct);
//       inv.quantity -= deduction;
//       remainingToDeduct -= deduction;
//     }
//     await stock.save({ session });
//   }
// };

// // Helper to revert stock
// const revertStock = async (products, session) => {
//   for (const item of products) {
//     const stock = await Product.findById(item.productId).session(session);
//     if (stock) {
//       if (stock.inventory && stock.inventory.length > 0) {
//         stock.inventory[0].quantity += item.quantity;
//       } else {
//         // This case is unlikely if stock exists, but as a fallback, create an inventory entry.
//         // The location would be unknown, so this indicates a data issue to be investigated.
//         console.warn(`Product ${stock.name} had no inventory locations. Restoring quantity to a new entry.`);
//         stock.inventory.push({ location: null, quantity: item.quantity });
//       }
//       await stock.save({ session });
//     }
//   }
// };


// // Create Issue Order
// router.post("/", auth, requireRole("admin", "manager"), issueOrderValidation, async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ message: errors.array()[0].msg });
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     const { clientName, clientPhone, customerId, products, totalAmount, issueDate } = req.body;

//     await deductStock(products, session);

//     const issueOrder = new IssueOrder({
//       clientName, clientPhone, customerId, products, totalAmount,
//       issueDate, // If issueDate is provided, it will be used. Otherwise, the schema default applies.
//       userId: req.user.id,
//     });
//     await issueOrder.save({ session });

//     await logAction(req.user.id, "Created issue order", issueOrder._id);
//     await session.commitTransaction();
//     res.status(201).json(issueOrder);
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(400).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// });


// // Get All Issue Orders
// router.get("/", auth, async (req, res) => {
//   try {
//     const search = req.query.search || "";
//     const page = parseInt(req.query.page) || 1;
//     const limit = 5;
//     const skip = (page - 1) * limit;
//     const startDate = req.query.startDate;
//     const endDate = req.query.endDate;
    
//     const filter = { isDeleted: false };
//     if (search) {
//       filter.$or = [
//         { clientName: { $regex: search, $options: "i" } },
//         { clientPhone: { $regex: search, $options: "i" } },
//       ];
//     }
//     if (startDate || endDate) {
//       filter.issueDate = {};
//       if (startDate) {
//         filter.issueDate.$gte = new Date(startDate);
//       }
//       if (endDate) {
//         filter.issueDate.$lte = new Date(endDate);
//       }
//     }
      

    


//     const [issueOrders, totalOrders] = await Promise.all([
//       IssueOrder.find(filter)
//         .populate("customerId", "name")
//         .populate("products.productId", "name")
//         .populate("userId", "username")
//         .sort({ issueDate: -1 })
//         .skip(skip)
//         .limit(limit),
//       IssueOrder.countDocuments(filter),
//     ]);

//     res.json({
//       issueOrders,
//       totalResults: totalOrders,
//       totalPages: limit > 0 ? Math.ceil(totalOrders / limit) : 1,
//       currentPage: page,
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Get Single Issue Order
// router.get("/:id", auth, async (req, res) => {
//   try {
//     const issueOrder = await IssueOrder.findById(req.params.id)
//       .populate("customerId", "name")
//       .populate("products.productId", "name")
//       .populate("userId", "username");
//     if (!issueOrder || issueOrder.isDeleted) {
//       return res.status(404).json({ message: "Issue Order not found" });
//     }
//     res.json(issueOrder);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Update Issue Order
// router.put("/:id", auth, requireRole("admin", "manager"), issueOrderValidation, async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ message: errors.array()[0].msg });
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     const issueOrder = await IssueOrder.findById(req.params.id).session(session);
//     if (!issueOrder || issueOrder.isDeleted) {
//       throw new Error("Issue Order not found");
//     }

//     // Revert previous stock changes
//     await revertStock(issueOrder.products, session);

//     // Apply new stock changes
//     await deductStock(req.body.products, session);
    
//     // Update order details
//     Object.assign(issueOrder, req.body);
//     await issueOrder.save({ session });

//     await logAction(req.user.id, "Updated issue order", issueOrder._id);
//     await session.commitTransaction();
//     res.json(issueOrder);
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(400).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// });

// // Soft Delete Issue Order
// router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     const issueOrder = await IssueOrder.findById(req.params.id).session(session);
//     if (!issueOrder || issueOrder.isDeleted) {
//       return res.status(404).json({ message: "Issue Order not found or already deleted" });
//     }

//     // Revert stock changes
//     await revertStock(issueOrder.products, session);

//     issueOrder.isDeleted = true;
//     await issueOrder.save({ session });
    
//     await logAction(req.user.id, "Deleted issue order", issueOrder._id);
//     await session.commitTransaction();
//     res.json({ message: "Issue Order deleted and stock restored" });
//   } catch (error) {
//     await session.abortTransaction();
//     res.status(500).json({ message: error.message });
//   } finally {
//     session.endSession();
//   }
// });

// module.exports = router;





// routes/issueOrders.js
const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const { body } = require("express-validator");
const handleValidationErrors = require("../middleware/validation");
const issueOrdersController = require("../controllers/issueOrdersController");

const router = express.Router();

const issueOrderValidation = [
  body("clientName").isString().trim().notEmpty().withMessage("Client name is required"),
  body("clientPhone").optional({ nullable: true }).isString().trim(),
  body("customerId").optional().isMongoId().withMessage("Invalid customer ID"),
  body("products").isArray({ min: 1 }).withMessage("At least one product is required"),
  body("products.*.productId").isMongoId().withMessage("Invalid product ID"),
  body("products.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("products.*.unitPrice").isFloat({ min: 0 }).withMessage("Unit price must be non-negative"),
  body("totalAmount").isFloat({ min: 0 }).withMessage("Total amount must be non-negative"),
  body("issueDate").optional().isISO8601().toDate().withMessage("Invalid issue date format"),
];

router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  issueOrderValidation,
  handleValidationErrors,
  issueOrdersController.createIssueOrder
);

router.get("/", auth, issueOrdersController.getIssueOrders);

router.get("/:id", auth, issueOrdersController.getIssueOrderById);

router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  issueOrderValidation,
  handleValidationErrors,
  issueOrdersController.updateIssueOrder
);

router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  issueOrdersController.softDeleteIssueOrder
);

module.exports = router;