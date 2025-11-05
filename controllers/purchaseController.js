// controllers/purchasesController.js
const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const Vendor = require("../models/Vendor");
const Location = require("../models/Location");
const User = require("../models/User");
const logAction = require("../utils/logAction");

exports.createPurchase = async (req, res) => {
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
      unitPrice,
      sellingUnitPrice,
      totalPrice,
      status = "Pending",
      poNumber,
      notes,
    } = req.body;

    // Validate references
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw new Error("Product not found");
    }

    if (type === "Vendor") {
      if (!vendorId) {
        throw new Error("Vendor ID is required for Vendor type");
      }
      const vendor = await Vendor.findById(vendorId).session(session);
      if (!vendor) {
        throw new Error("Vendor not found");
      }
    }

    if (!toLocation) {
      throw new Error("To location is required");
    }
    const toLoc = await Location.findById(toLocation).session(session);
    if (!toLoc) {
      throw new Error("To location not found");
    }

    if (type === "Transfer") {
      if (!fromLocation) {
        throw new Error("From location is required for Transfer type");
      }
      const fromLoc = await Location.findById(fromLocation).session(session);
      if (!fromLoc) {
        throw new Error("From location not found");
      }
    }
    if (unitPrice*quantity!== totalPrice){
            console.log(unitPrice)
      console.log(quantity)
      console.log(totalPrice)
      throw new Error('totalPrice is not the same as the calculated price')
    }


    if (type === "Internal" && !department) {
      throw new Error("Department is required for Internal type");
    }

    // Handle prices
    if (type !== "Transfer") {
      if (unitPrice == null) {
        throw new Error("Unit price is required for non-transfer purchases");
      }
      if (sellingUnitPrice == null) {
        sellingUnitPrice = 0;
      }
      const calculatedTotal = unitPrice * quantity;
      totalPrice = calculatedTotal;
    } else {
      unitPrice = 0;
      sellingUnitPrice = 0;
      totalPrice = 0;
    }

    // Generate poNumber if not provided
    let finalPoNumber = poNumber || `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Check for existing poNumber
    const existingPurchase = await Purchase.findOne({ poNumber: finalPoNumber }).session(session);
    if (existingPurchase) {
      throw new Error("PO Number already exists");
    }

    const purchase = new Purchase({
      type,
      vendorId: type === "Vendor" ? vendorId : undefined,
      department: type === "Internal" ? department : undefined,
      fromLocation: type === "Transfer" ? fromLocation : undefined,
      toLocation,
      productId,
      quantity,
      unitPrice,
      sellingUnitPrice,
      totalPrice,
      status,
      poNumber: finalPoNumber,
      notes,
      userId: req.user.id,
    });

    if (status === "Completed") {
      if (type === "Transfer") {
        let fromInv = product.inventory.find(inv => inv.location.toString() === fromLocation.toString());
        if (!fromInv || fromInv.quantity < quantity) {
          throw new Error("Insufficient stock in from location");
        }
        fromInv.quantity -= quantity;

        let toInv = product.inventory.find(inv => inv.location.toString() === toLocation.toString());
        if (!toInv) {
          product.inventory.push({ location: toLocation, quantity });
        } else {
          toInv.quantity += quantity;
        }

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
        // === WEIGHTED AVERAGE COST PRICE ===
        const totalQtyBefore = product.inventory.reduce((s, i) => s + i.quantity, 0);
        const oldTotalCost = product.costPrice * totalQtyBefore;
        const newTotalCost = oldTotalCost + (unitPrice * quantity);

        product.costPrice = (totalQtyBefore + quantity) > 0
          ? newTotalCost / (totalQtyBefore + quantity)
          : unitPrice;

        if (sellingUnitPrice > 0) product.price = sellingUnitPrice;

        // Now add to inventory
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

      product.inventory = product.inventory.filter(i => i.quantity > 0);
      await product.save({ session });
    }

    await purchase.save({ session });
    await logAction(req.user.id, `Created purchase ${purchase._id}`);
    await session.commitTransaction();
    session.endSession();
    res.status(201).json(purchase);
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("Create Purchase Error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

exports.getPurchases = async (req, res) => {
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

    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

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
      const user = await User.findOne({ username: new RegExp(`^${req.query.username}$`, "i") }).select("_id");
      if (user) filter.userId = user._id;
      else return res.json({ purchases: [], totalResults: 0, totalPages: 0, currentPage: page });
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

    if (limit > 0) purchaseQuery = purchaseQuery.skip(skip).limit(limit);

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
    console.error("Get Purchases Error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getPurchaseById = async (req, res) => {
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
    console.error("Get Purchase By ID Error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updatePurchase = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const {
      vendorId, department, fromLocation, toLocation, productId,
      quantity, unitPrice, sellingUnitPrice, totalPrice, type, status, poNumber, notes
    } = req.body;

    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new Error("Purchase not found");

    let oldProduct = await Product.findById(purchase.productId).session(session);
    if (!oldProduct) throw new Error("Original product not found");
    let newProduct = oldProduct;

    if (productId && productId !== purchase.productId.toString()) {
      newProduct = await Product.findById(productId).session(session);
      if (!newProduct) throw new Error("New product not found");
    }

    const oldType = purchase.type;
    const newType = type || oldType;
    const oldQty = purchase.quantity;
    const newQty = quantity || oldQty;
    const oldStatus = purchase.status;
    const newStatus = status || oldStatus;
    const oldToLoc = purchase.toLocation;
    const newToLoc = toLocation || oldToLoc;
    const oldFromLoc = purchase.fromLocation;
    const newFromLoc = fromLocation || oldFromLoc;

    if (newType === "Vendor") {
      const finalVendorId = vendorId || purchase.vendorId;
      if (!finalVendorId) throw new Error("Vendor ID is required for Vendor type");
      const vendor = await Vendor.findById(finalVendorId).session(session);
      if (!vendor) throw new Error("Vendor not found");
    }

    const finalToLoc = newToLoc;
    const toLocDoc = await Location.findById(finalToLoc).session(session);
    if (!toLocDoc) throw new Error("To location not found");

    if (newType === "Transfer") {
      const finalFromLoc = newFromLoc;
      if (!finalFromLoc) throw new Error("From location is required for Transfer type");
      const fromLocDoc = await Location.findById(finalFromLoc).session(session);
      if (!fromLocDoc) throw new Error("From location not found");
    }

    if (newType === "Internal") {
      const finalDepartment = department || purchase.department;
      if (!finalDepartment) throw new Error("Department is required for Internal type");
    }

    const adjustInventory = (prod, locId, diff) => {
      let inv = prod.inventory.find(inv => inv.location.toString() === locId.toString());
      if (!inv && diff > 0) {
        prod.inventory.push({ location: locId, quantity: diff });
      } else if (inv) {
        inv.quantity += diff;
        if (inv.quantity < 0) throw new Error(`Insufficient stock at location ${locId}`);
      } else if (diff < 0) {
        throw new Error(`No inventory entry to subtract from at location ${locId}`);
      }
    };

    if (oldStatus === "Completed") {
      if (oldType === "Transfer") {
        adjustInventory(oldProduct, oldFromLoc, oldQty);
        adjustInventory(oldProduct, oldToLoc, -oldQty);
      } else {
        adjustInventory(oldProduct, oldToLoc, -oldQty);
      }
    }

    if (newStatus === "Completed") {
      if (newType === "Transfer") {
        adjustInventory(newProduct, newFromLoc, -newQty);
        adjustInventory(newProduct, newToLoc, newQty);

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
        // === WEIGHTED AVERAGE COST PRICE ===
        const costUnit = unitPrice ?? purchase.unitPrice;
        const totalQtyBefore = newProduct.inventory.reduce((s, i) => s + i.quantity, 0);
        const oldTotalCost = newProduct.costPrice * totalQtyBefore;
        const newTotalCost = oldTotalCost + (costUnit * newQty);

        newProduct.costPrice = (totalQtyBefore + newQty) > 0
          ? newTotalCost / (totalQtyBefore + newQty)
          : costUnit;

        if (sellingUnitPrice ?? purchase.sellingUnitPrice > 0) {
          newProduct.price = sellingUnitPrice ?? purchase.sellingUnitPrice;
        }

        adjustInventory(newProduct, newToLoc, newQty);

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

    if (poNumber && poNumber !== purchase.poNumber) {
      const existing = await Purchase.findOne({ poNumber }).session(session);
      if (existing) throw new Error("PO Number already exists");
      purchase.poNumber = poNumber;
    }

    purchase.type = newType;
    if (vendorId) purchase.vendorId = vendorId;
    if (department) purchase.department = department;
    if (fromLocation) purchase.fromLocation = fromLocation;
    if (toLocation) purchase.toLocation = toLocation;
    if (productId) purchase.productId = productId;
    if (quantity) purchase.quantity = quantity;
    if (status) purchase.status = status;
    if (notes) purchase.notes = notes;

    let newUnitPrice = unitPrice ?? purchase.unitPrice ?? 0;
    let newSellingUnitPrice = sellingUnitPrice ?? purchase.sellingUnitPrice ?? 0;
    let newTotalPrice = totalPrice ?? purchase.totalPrice ?? 0;

    if (newType !== "Transfer") {
      if (unitPrice != null || quantity != null) {
        if (newUnitPrice === 0 && unitPrice == null) {
          throw new Error("Unit price is required for non-transfer purchases");
        }
        newTotalPrice = newUnitPrice * newQty;
      }
      purchase.unitPrice = newUnitPrice;
      purchase.sellingUnitPrice = newSellingUnitPrice;
      purchase.totalPrice = newTotalPrice;
    } else {
      purchase.unitPrice = 0;
      purchase.sellingUnitPrice = 0;
      purchase.totalPrice = 0;
    }

    if (newType !== "Vendor") purchase.vendorId = undefined;
    if (newType !== "Internal") purchase.department = undefined;
    if (newType !== "Transfer") purchase.fromLocation = undefined;

    if (newProduct !== oldProduct) await oldProduct.save({ session });
    newProduct.inventory = newProduct.inventory.filter(i => i.quantity > 0);
    await newProduct.save({ session });
    await purchase.save({ session });
    await logAction(req.user.id, `Updated Purchase ${purchase._id}`);

    await session.commitTransaction();
    session.endSession();
    res.json(purchase);
  } catch (error) {
    if (session) await session.abortTransaction().finally(() => session.endSession());
    console.error("Update Purchase Error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

exports.deletePurchase = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new Error("Purchase not found");

    const product = await Product.findById(purchase.productId).session(session);
    if (!product) throw new Error("Product not found");

    if (purchase.status === "Completed") {
      let fromInv = product.inventory.find(inv => inv.location.toString() === purchase.fromLocation?.toString());
      let toInv = product.inventory.find(inv => inv.location.toString() === purchase.toLocation.toString());

      if (purchase.type === "Transfer") {
        if (!fromInv) throw new Error("From location inventory not found");
        fromInv.quantity += purchase.quantity;

        if (!toInv) throw new Error("To location inventory not found");
        toInv.quantity -= purchase.quantity;
        if (toInv.quantity < 0) throw new Error("Cannot reduce stock below zero on deletion");
      } else {
        if (!toInv) throw new Error("To location inventory not found");
        toInv.quantity -= purchase.quantity;
        if (toInv.quantity < 0) throw new Error("Cannot reduce stock below zero on deletion");
      }
      await product.save({ session });
    }

    await purchase.deleteOne({ session });
    await logAction(req.user.id, `Deleted Purchase ${purchase._id}`);

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Purchase deleted successfully" });
  } catch (error) {
    if (session) await session.abortTransaction().finally(() => session.endSession());
    console.error("Delete Purchase Error:", error.message);
    res.status(400).json({ message: error.message });
  }
};