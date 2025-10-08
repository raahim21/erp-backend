const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
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
    body("supplier").isString().optional(),
    body("type").isString().notEmpty(),
    body("department").isString().optional(),
    body("toLocation").isString().optional(),
    body("fromLocation").isString().optional(),
    body("productId").isMongoId(),
    body("quantity").isInt({ min: 1 }), // no negative or zero
    body("totalPrice").isFloat({ min: 0 }),
    body("status").optional().isIn(["Pending", "Completed", "Cancelled"]),
    body("notes").optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    let session
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      let {
        supplier,
        productId,
        quantity,
        totalPrice,
        type,
        fromLocation,
        toLocation,
        department,
        status,
        poNumber,
        notes,
      } = req.body;
      const product = await Product.findById(productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Product not found" });
      }
      // Generate poNumber if not provided

      let finalPoNumber =
        poNumber || `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Check for existing poNumber
      const existingPurchase = await Purchase.findOne({
        poNumber: finalPoNumber,
      }).session(session);
      if (existingPurchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "PO Number already exists" });
      }
      const purchase = new Purchase({
          type,
        supplier,
        department,
        fromLocation,
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
  product.quantity += quantity;
} 

      await product.save({ session });

      await purchase.save({ session });

      await logAction(req.user.id, "Created purchase");
      await session.commitTransaction();
      session.endSession();
      res.status(201).json(purchase);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("POST /purchases: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

router.get("/", auth, async (req, res) => {
  try {
    console.log(req.query)
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    let endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const skip = (page - 1) * limit;
    const filter = {};

    if (startDate || endDate) {
      startDate.setHours(0, 0, 0, 0); // start of day
      endDate.setHours(23, 59, 59, 999); // end of day
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
      endDate.setHours(23, 59, 59, 999);
      filter.purchaseDate = { $lte: endDate };
    }

    if (search) {
      filter.supplier = { $regex: search, $options: "i" };
    }
    if (req.query.username) {
      let user = await User.findOne({ username: req.query.username }).select(
        "_id"
      );

      if (user) filter.userId = user._id;
    }
    let purchaseQuery = Purchase.find(filter);

    if (limit > 0) {
      purchaseQuery = purchaseQuery
        .skip(skip)
        .limit(limit)
        .populate("productId");
    }

    const [purchases, totalPurchases] = await Promise.all([
      purchaseQuery,
      Purchase.countDocuments(filter),
    ]);
    
    res.json({
      purchases: purchases, // Always in .data
      totalResults: totalPurchases, // Always here
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
  console.log("GET /purchases/:id: Request for ID:", req.params.id);
  try {
    const purchase = await Purchase.findById(req.params.id).populate(
      "productId"
    );
    if (!purchase) {
      console.log("GET /purchases/:id: Not found or unauthorized");
      return res.status(404).json({ message: "Purchase not found" });
    }
    res.json(purchase);
  } catch (error) {
    console.error("GET /purchases/:id: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});


router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("supplier").optional().isString().trim(),
    body("productId").optional().isMongoId(),
    body("quantity").optional().isInt({ min: 1 }),
    body("totalPrice").optional().isFloat({ min: 0 }),
    body("status").optional().isIn(["Pending", "Completed", "Cancelled"]),
    body("type").optional().isString().notEmpty(),
    body("fromLocation").optional().isString(),
    body("toLocation").optional().isString(),
    body("department").optional().isString(),
    body("notes").optional().isString().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const {
        supplier,
        productId,
        quantity,
        totalPrice,
        type,
        fromLocation,
        toLocation,
        department,
        status,
        poNumber,
        notes,
      } = req.body;

      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) throw new Error("Purchase not found");

      const oldProduct = await Product.findById(purchase.productId).session(session);
      if (!oldProduct) throw new Error("Original product not found");
      let newProduct = oldProduct;

      // Handle product change
      if (productId && productId !== purchase.productId.toString()) {
        newProduct = await Product.findById(productId).session(session);
        if (!newProduct) throw new Error("New product not found");
      }

      // Determine quantity difference
      const oldQty = purchase.quantity;
      const newQty = quantity || oldQty;
      const qtyDiff = newQty - oldQty;

      // Adjust stock based on status changes and productId
      const oldStatus = purchase.status;
      const newStatus = status || oldStatus;

      const adjustStock = async (prod, diff) => {
        prod.quantity += diff;
      
        if (prod.quantity < 0)
          return res.status(500).json({ message: "Stock can't go negative" });;
        await prod.save({ session });
      };

      // 1. Product changed
      if (productId && productId !== purchase.productId.toString()) {
        if (oldStatus === "Completed") {
          // Subtract old quantity from old product
          await adjustStock(oldProduct, -oldQty);
          // Add new quantity to new product
          await adjustStock(newProduct, newQty);
        }
      } else {
        // Same product, check quantity change
        if (oldStatus === "Completed") {
          await adjustStock(oldProduct, qtyDiff);
        }
      }

      // 2. Status change effects
      if (oldStatus !== newStatus) {
        if (oldStatus === "Pending" && newStatus === "Completed") {
          // We just received products
          await adjustStock(newProduct, newQty);
        } else if (oldStatus === "Completed" && newStatus === "Cancelled") {
          // Return products
          await adjustStock(newProduct, -newQty);
        } else if (oldStatus === "Completed" && newStatus === "Pending") {
          // Rollback received products
          await adjustStock(newProduct, -newQty);
        }
        // Pending → Cancelled: no stock change
        // Cancelled → Completed: treat like new Completed? add stock
        else if (oldStatus === "Cancelled" && newStatus === "Completed") {
          await adjustStock(newProduct, newQty);
        }
      }

      // PO uniqueness check
      if (poNumber && poNumber !== purchase.poNumber) {
        const existingPurchase = await Purchase.findOne({ poNumber }).session(session);
        if (existingPurchase) throw new Error("PO Number already exists");
        purchase.poNumber = poNumber;
      }

      // Update fields
      if (supplier) purchase.supplier = supplier;
      if (productId) purchase.productId = productId;
      if (quantity) purchase.quantity = quantity;
      if (totalPrice) purchase.totalPrice = totalPrice;
      if (status) purchase.status = status;
      if (type) purchase.type = type;
      if (fromLocation) purchase.fromLocation = fromLocation;
      if (toLocation) purchase.toLocation = toLocation;
      if (department) purchase.department = department;
      if (notes) purchase.notes = notes;

      // Type validation and cleanup
      if (type === "Transfer") {
        if (!fromLocation || !toLocation) throw new Error("fromLocation and toLocation required for Transfer");
        purchase.supplier = "";
        purchase.department = "";
      } else if (type === "Internal") {
        if (!department) throw new Error("Department required for Internal type");
        purchase.fromLocation = "";
        purchase.toLocation = "";
      } else if (type === "Vendor") {
        if (!supplier) throw new Error("Supplier required for Vendor type");
        purchase.fromLocation = "";
        purchase.toLocation = "";
        purchase.department = "";
      }

      await purchase.save({ session });
      await logAction(req.user.id, "Updated Purchase");

      await session.commitTransaction();
      session.endSession();
      res.json(purchase);

    } catch (error) {
      if (session) {
        try { await session.abortTransaction(); } catch (_) {}
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
    try {
      let session = await mongoose.startSession();
      session.startTransaction();

      const purchase = await Purchase.findById(req.params.id).session(session);
      // if dose'nt exist send error
      if (!purchase) {
        session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Purchase not found" });
      }
      const product = await Product.findById(purchase.productId).session(
        session
      );
      if (!product) {
        throw new Error("Product not found");
      }


      // if completed and you delete a purchase reduce the stock, if the purchase is pending you dont't
      if(purchase.status == 'Completed'){

        
      // if (product.quantity < purchase.quantity && purchase.status=='Completed') {
      //   throw new Error("Not enough stock to delete this purchase");
      // }

        await Product.findByIdAndUpdate(
        purchase.productId,
        {
          $inc: { quantity: -purchase.quantity },
        },
        { session }
      );
      }
      await purchase.deleteOne({ session });
      await logAction(req.user.id, "Deleted Purchase");

      await session.commitTransaction();
      session.endSession();

      res.json({ message: "Purchase deleted" });
    } catch (error) {
      console.error("DELETE /purchases/:id: Error:", error.message);
      await session.abortTransaction();
      session.endSession();
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
