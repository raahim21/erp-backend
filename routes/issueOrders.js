const express = require("express");
const IssueOrder = require("../models/IssueOrder");
const Stock = require("../models/Product");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const { body, validationResult } = require("express-validator");
const logAction = require("../utils/logAction");

const router = express.Router();

// Validation middleware for create/update
const issueOrderValidation = [
  body("clientName").isString().trim().notEmpty().withMessage("Client name is required"),
  body("clientPhone").optional().isString().trim(),
  body("customerId").optional().isMongoId().withMessage("Invalid customer ID"),
  body("products").isArray({ min: 1 }).withMessage("At least one product is required"),
  body("products.*.productId").isMongoId().withMessage("Invalid product ID"),
  body("products.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("products.*.unitPrice").isFloat({ min: 0 }).withMessage("Unit price must be non-negative"),
  body("totalAmount").isFloat({ min: 0 }).withMessage("Total amount must be non-negative"),
];

// Create Issue Order
// router.post(
//   "/",
//   auth,
//   requireRole("admin", "manager"),
//   issueOrderValidation,
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ message: errors.array()[0].msg });
//     }

//     try {
//       const { clientName, clientPhone, customerId, products, totalAmount } = req.body;

//       // Validate stock availability
//       for (const item of products) {
//         const totalStock = stock.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
// if (totalStock < item.quantity) {
//   return res.status(400).json({ message: `Insufficient stock for product ID ${item.productId}` });
// }


//       }

//       const issueOrder = new IssueOrder({
//         clientName,
//         clientPhone,
//         customerId,
//         products,
//         totalAmount,
//         userId: req.user.id,
//       });

//       // Update stock
//       for (const item of products) {
//         await Stock.findByIdAndUpdate(
//   item.productId,
//   { $inc: { "inventory.0.quantity": -item.quantity } }
// );

//       }

//       await issueOrder.save();
//       await logAction(req.user.id, "Created issue order");
//       res.status(201).json(issueOrder);
//     } catch (error) {
//       console.error("POST /issueOrders: Error:", error.message);
//       res.status(500).json({ message: error.message });
//     }
//   }
// );

const mongoose = require("mongoose");

router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  issueOrderValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { clientName, clientPhone, customerId, products, totalAmount } = req.body;

      const updatedStocks = [];

      for (const item of products) {
        const stock = await Stock.findById(item.productId).session(session);
        if (!stock || !stock.inventory.length) {
          throw new Error(`No stock found for product ID ${item.productId}`);
        }

        const totalStock = stock.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
        if (totalStock < item.quantity) {
          throw new Error(`Insufficient stock for product ID ${item.productId}`);
        }

        // Deduct from multiple locations
        let remaining = item.quantity;
        const deductions = [];

        for (const inv of stock.inventory) {
          if (remaining <= 0) break;
          const deduction = Math.min(inv.quantity, remaining);
          inv.quantity -= deduction;
          remaining -= deduction;
          if (deduction > 0) deductions.push({ location: inv.location, quantity: deduction });
        }

        await stock.save({ session });
        updatedStocks.push({ productId: item.productId, deductions });
      }

      // Create issue order
      const issueOrder = new IssueOrder({
        clientName,
        clientPhone,
        customerId,
        products,
        totalAmount,
        userId: req.user.id,
      });

      await issueOrder.save({ session });
      await logAction(req.user.id, "Created issue order");

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({ issueOrder, stockChanges: updatedStocks });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("POST /issueOrders: Error:", error.message);
      res.status(400).json({ message: error.message });
    }
  }
);


// Get All Issue Orders (with pagination and search)
router.get("/", auth, async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const filter = {};

    if (search) {
      filter.$or = [
        { clientName: { $regex: search, $options: "i" } },
        { clientPhone: { $regex: search, $options: "i" } },
      ];
    }

    const [issueOrders, totalOrders] = await Promise.all([
      IssueOrder.find(filter)
        .populate("customerId", "name")
        .populate("products.productId", "name")
        .populate("userId", "username")
        .skip(skip)
        .limit(limit),
      IssueOrder.countDocuments(filter),
    ]);

    res.json({
      issueOrders,
      totalResults: totalOrders,
      totalPages: limit > 0 ? Math.ceil(totalOrders / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("GET /issueOrders: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Get Single Issue Order
router.get("/:id", auth, async (req, res) => {
  try {
    const issueOrder = await IssueOrder.findById(req.params.id)
      .populate("customerId", "name")
      .populate("products.productId", "name")
      .populate("userId", "username");
    if (!issueOrder) {
      return res.status(404).json({ message: "Issue Order not found" });
    }
    res.json(issueOrder);
  } catch (error) {
    console.error("GET /issueOrders/:id: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Update Issue Order
router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  issueOrderValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const { clientName, clientPhone, customerId, products, totalAmount } = req.body;

      const issueOrder = await IssueOrder.findById(req.params.id);
      if (!issueOrder) {
        return res.status(404).json({ message: "Issue Order not found" });
      }

      // Revert previous stock changes
      for (const item of issueOrder.products) {
        await Stock.findByIdAndUpdate(
  item.productId,
  { $inc: { "inventory.0.quantity": item.quantity } }
);

      }

      // Validate new stock availability
      for (const item of products) {
        const stock = await Stock.findById(item.productId);
if (!stock || !stock.inventory.length || stock.inventory[0].quantity < item.quantity) {
          return res.status(400).json({ message: `Insufficient stock for product ID ${item.productId}` });
        }
      }

      // Update stock for new products
      for (const item of products) {
        await Stock.findByIdAndUpdate(
  item.productId,
  { $inc: { "inventory.0.quantity": -item.quantity } }
);

      }

      issueOrder.clientName = clientName || issueOrder.clientName;
      issueOrder.clientPhone = clientPhone !== undefined ? clientPhone : issueOrder.clientPhone;
      issueOrder.customerId = customerId !== undefined ? customerId : issueOrder.customerId;
      issueOrder.products = products || issueOrder.products;
      issueOrder.totalAmount = totalAmount || issueOrder.totalAmount;

      await issueOrder.save();
      await logAction(req.user.id, "Updated issue order");
      res.json(issueOrder);
    } catch (error) {
      console.error("PUT /issueOrders/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete Issue Order
router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const issueOrder = await IssueOrder.findById(req.params.id);
      if (!issueOrder) {
        return res.status(404).json({ message: "Issue Order not found" });
      }

      // Revert stock changes
      for (const item of issueOrder.products) {
        await Stock.findByIdAndUpdate(
  item.productId,
  { $inc: { "inventory.0.quantity": item.quantity } }
);

      }

      await issueOrder.deleteOne();
      await logAction(req.user.id, "Deleted issue order");
      res.json({ message: "Issue Order deleted" });
    } catch (error) {
      console.error("DELETE /issueOrders/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;