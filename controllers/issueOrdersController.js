// controllers/issueOrdersController.js
const mongoose = require("mongoose");
const IssueOrder = require("../models/IssueOrder");
const Product = require("../models/Product");
const logAction = require("../utils/logAction");


const deductStock = async (products, session) => {
  for (const item of products) {
    const stock = await Product.findById(item.productId).session(session);
    if (!stock) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    if (stock.isDeleted) {
      throw new Error(`Product is archived and cannot be issued: ${stock.name}`);
    }

    const totalStock = stock.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
    if (totalStock < item.quantity) {
      throw new Error(`Insufficient stock for ${stock.name}. Available: ${totalStock}, Required: ${item.quantity}`);
    }

    let remainingToDeduct = item.quantity;
    // Sort inventory by quantity descending to deduct from highest first
    const sortedInv = stock.inventory.slice().sort((a, b) => b.quantity - a.quantity);
    for (const inv of sortedInv) {
      if (remainingToDeduct <= 0) break;
      const deduction = Math.min(inv.quantity, remainingToDeduct);
      inv.quantity -= deduction;
      remainingToDeduct -= deduction;
    }
    await stock.save({ session });
  }
};

const revertStock = async (products, session) => {
  for (const item of products) {
    const stock = await Product.findById(item.productId).session(session);
    if (!stock) {
      continue; // Skip if product no longer exists
    }
    if (stock.inventory.length === 0) {
      throw new Error(`Cannot revert stock for ${stock.name}: no inventory locations`);
    }

    // Add back to the location with the highest quantity
    const maxInv = stock.inventory.reduce((max, inv) => (inv.quantity > max.quantity ? inv : max), stock.inventory[0]);
    maxInv.quantity += item.quantity;

    await stock.save({ session });
  }
};

exports.createIssueOrder = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const { clientName, clientPhone, customerId, products, totalAmount, issueDate } = req.body;

    // Deduct stock first
    await deductStock(products, session);

    // Map products to include current costPrice
    const issueOrderProducts = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw new Error(`Product not found: ${item.productId}`);
        return {
          ...item,
          costPrice: product.costPrice, // save cost at time of sale
        };
      })
    );

    const issueOrder = new IssueOrder({
      clientName,
      clientPhone,
      customerId,
      products: issueOrderProducts,
      totalAmount,
      issueDate,
      userId: req.user.id,
    });

    await issueOrder.save({ session });

    await logAction(req.user.id, `Created issue order ${issueOrder._id}`);
    await session.commitTransaction();
    res.status(201).json(issueOrder);

  } catch (error) {
    if (session) await session.abortTransaction();
    console.error("Create issue order error:", error.message);
    res.status(400).json({ message: error.message });
  } finally {
    if (session) session.endSession();
  }
};

exports.getIssueOrders = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const filter = { isDeleted: false };
    if (search) {
      filter.$or = [
        { clientName: { $regex: search, $options: "i" } },
        { clientPhone: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.issueDate = {};
      if (startDate) {
        filter.issueDate.$gte = startDate;
        startDate.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        filter.issueDate.$lte = endDate;
        endDate.setHours(23, 59, 59, 999);
      }
    }

    const [issueOrders, totalOrders] = await Promise.all([
      IssueOrder.find(filter)
        .populate("customerId", "name")
        .populate("products.productId", "name")
        .populate("userId", "username")
        .sort({ issueDate: -1 })
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
    console.error("Get issue orders error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getIssueOrderById = async (req, res) => {
  try {
    const issueOrder = await IssueOrder.findById(req.params.id)
      .populate("customerId", "name")
      .populate("products.productId", "name")
      .populate("userId", "username");
    if (!issueOrder || issueOrder.isDeleted) {
      return res.status(404).json({ message: "Issue Order not found" });
    }
    res.json(issueOrder);
  } catch (error) {
    console.error("Get issue order by ID error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateIssueOrder = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const issueOrder = await IssueOrder.findById(req.params.id).session(session);
    if (!issueOrder || issueOrder.isDeleted) {
      throw new Error("Issue Order not found");
    }

    // Revert previous stock changes
    await revertStock(issueOrder.products, session);

    const { clientName, clientPhone, customerId, products, totalAmount, issueDate } = req.body;

    // If products are provided, map them to include current costPrice (like in create)
    let updatedProducts = products;
    if (products) {
      updatedProducts = await Promise.all(
        products.map(async (item) => {
          const product = await Product.findById(item.productId).session(session);
          if (!product) throw new Error(`Product not found: ${item.productId}`);
          return {
            ...item,
            costPrice: product.costPrice, // Refresh to current cost at time of update
          };
        })
      );
    }

    // Apply new stock changes (using updatedProducts if provided)
    await deductStock(updatedProducts || issueOrder.products, session);

    // Update order details
    if (clientName) issueOrder.clientName = clientName;
    if (clientPhone !== undefined) issueOrder.clientPhone = clientPhone;
    if (customerId) issueOrder.customerId = customerId;
    if (updatedProducts) issueOrder.products = updatedProducts;
    if (totalAmount) issueOrder.totalAmount = totalAmount;
    if (issueDate) issueOrder.issueDate = issueDate;

    await issueOrder.save({ session });

    await logAction(req.user.id, `Updated issue order ${issueOrder._id}`);
    await session.commitTransaction();
    res.json(issueOrder);
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    console.error("Update issue order error:", error.message);
    res.status(400).json({ message: error.message });
  } finally {
    if (session) session.endSession();
  }
};

exports.softDeleteIssueOrder = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const issueOrder = await IssueOrder.findById(req.params.id).session(session);
    if (!issueOrder || issueOrder.isDeleted) {
      throw new Error("Issue Order not found or already deleted");
    }

    // Revert stock changes
    await revertStock(issueOrder.products, session);

    issueOrder.isDeleted = true;
    await issueOrder.save({ session });

    await logAction(req.user.id, `Soft deleted issue order ${issueOrder._id}`);
    await session.commitTransaction();
    res.json({ message: "Issue Order archived and stock restored" });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    console.error("Soft delete issue order error:", error.message);
    res.status(400).json({ message: error.message });
  } finally {
    if (session) session.endSession();
  }
};