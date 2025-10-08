const express = require("express");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const IssueOrder = require("../models/IssueOrder");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const logAction = require("../utils/logAction");

const router = express.Router();

// Middleware for validating request;

// Create Issue Order
router.post("/", auth, requireRole("manager", "admin"), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { clientName, clientPhone, products } = req.body;
    let totalAmount = 0;

    for (const item of products) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.quantity < item.quantity)
        throw new Error(`Insufficient stock for ${product.name}`);
      totalAmount += item.quantity * item.unitPrice;
    }

    const issueOrder = new IssueOrder({
      clientName,
      clientPhone,
      products,
      totalAmount,
      userId: req.user.id,
    });

    for (const item of products) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { quantity: -item.quantity } },
        { session }
      );
    }

    await issueOrder.save({ session });
    await logAction(req.user.id, "Created Issue Order", `${issueOrder.clientName}`);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(issueOrder);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message });
  }
});

// Get list of Issue Orders
router.get("/", auth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  let endDate = req.query.endDate ? new Date(req.query.endDate) : null;
  try {
    const filter = {};
    if (startDate && endDate) {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      filter.issueDate = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      startDate.setHours(0, 0, 0, 0);
      filter.issueDate = { $gte: startDate };
    } else if (endDate) {
      endDate.setHours(23, 59, 59, 999);
      filter.issueDate = { $lte: endDate };
    }

    if (search) filter.clientName = { $regex: search, $options: "i" };

    let ordersQuery = IssueOrder.find(filter).populate({
      path: "products.productId",
      select: "name",
      match: { _id: { $exists: true } },
    });

    if (limit > 0) ordersQuery = ordersQuery.skip(skip).limit(limit);

    const [issueOrders, total] = await Promise.all([
      ordersQuery.lean(),
      IssueOrder.countDocuments(filter),
    ]);

    const sanitizedOrders = issueOrders.map((order) => ({
      ...order,
      products: order.products.filter((p) => p.productId !== null),
    }));

    res.json({
      orders: sanitizedOrders,
      totalResults: total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("GET /issue-orders: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Get single Issue Order
router.get("/:id", auth, async (req, res) => {
  try {
    const issueOrder = await IssueOrder.findById(req.params.id).populate({
      path: "products.productId",
      select: "name",
      match: { _id: { $exists: true } },
    });
    if (!issueOrder)
      return res.status(404).json({ message: "Issue order not found" });

    const sanitizedOrder = {
      ...issueOrder.toObject(),
      products: issueOrder.products.filter((p) => p.productId !== null),
    };
    res.json(sanitizedOrder);
  } catch (error) {
    console.error("GET /issue-orders/:id: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Update Issue Order
router.put(
  "/:id",
  auth,
  requireRole("manager", "admin"),

  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { clientName, clientPhone, products } = req.body;
      const issueOrder = await IssueOrder.findById(req.params.id).session(
        session
      );
      if (!issueOrder) throw new Error("Issue order not found");

      for (const item of issueOrder.products) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: item.quantity } },
          { session }
        );
      }

      let totalAmount = 0;
      for (const item of products) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.quantity < item.quantity)
          throw new Error(`Insufficient stock for ${product.name}`);
        totalAmount += item.quantity * item.unitPrice;
      }

      for (const item of products) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: -item.quantity } },
          { session }
        );
      }

      issueOrder.clientName = clientName;
      issueOrder.clientPhone = clientPhone;
      issueOrder.products = products;
      issueOrder.totalAmount = totalAmount;

      await issueOrder.save({ session });
      await logAction(req.user.id, "Updated Issue Order", `${issueOrder.clientName}`);

      await session.commitTransaction();
      session.endSession();

      res.json(issueOrder);
    } catch (error) {
      console.log(error);
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: error.message });
    }
  }
);

// Delete Issue Order
router.delete(
  "/:id",
  auth,
  requireRole("manager", "admin"),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const issueOrder = await IssueOrder.findById(req.params.id).session(
        session
      );
      if (!issueOrder) throw new Error("Issue order not found");

      for (const item of issueOrder.products) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: item.quantity } },
          { session }
        );
      }

      await issueOrder.deleteOne({ session });
      await logAction(req.user.id, "Deleted Issue Order", `${issueOrder.clientName}`);

      await session.commitTransaction();
      session.endSession();

      res.json({ message: "Issue order deleted" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res.status(400).json({ message: error.message });
    }
  }
);


module.exports = router;
