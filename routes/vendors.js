const express = require("express");
const Vendor = require("../models/Vendor");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const { body } = require("express-validator");
const handleValidationErrors = require("../middleware/validation");
const logAction = require("../utils/logAction");

const router = express.Router();

// Create Vendor
router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").isString().trim().notEmpty().withMessage("Vendor name is required"),
    body("phone").optional().isString().trim(),
    body("email").optional().isEmail().normalizeEmail(),
    body("address").optional().isString().trim(),
    body("company").optional().isString().trim(),
    body("taxNumber").optional().isString().trim(),
    body("notes").optional().isString().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, phone, email, address, company, taxNumber, notes } = req.body;

      const vendor = new Vendor({
        name,
        phone,
        email,
        address,
        company,
        taxNumber,
        notes,
        userId: req.user.id,
      });

      await vendor.save();
      await logAction(req.user.id, "Created vendor");
      res.status(201).json(vendor);
    } catch (error) {
      console.error("POST /vendors: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get All Vendors (with pagination and search)
router.get("/", auth, async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [vendors, totalVendors] = await Promise.all([
      Vendor.find(filter).skip(skip).limit(limit),
      Vendor.countDocuments(filter),
    ]);

    res.json({
      vendors,
      totalResults: totalVendors,
      totalPages: limit > 0 ? Math.ceil(totalVendors / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("GET /vendors: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Get Single Vendor
router.get("/:id", auth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.json(vendor);
  } catch (error) {
    console.error("GET /vendors/:id: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Update Vendor
router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").optional().isString().trim().notEmpty().withMessage("Vendor name is required"),
    body("phone").optional().isString().trim(),
    body("email").optional().isEmail().normalizeEmail(),
    body("address").optional().isString().trim(),
    body("company").optional().isString().trim(),
    body("taxNumber").optional().isString().trim(),
    body("notes").optional().isString().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, phone, email, address, company, taxNumber, notes } = req.body;

      const vendor = await Vendor.findById(req.params.id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      vendor.name = name || vendor.name;
      vendor.phone = phone !== undefined ? phone : vendor.phone;
      vendor.email = email !== undefined ? email : vendor.email;
      vendor.address = address !== undefined ? address : vendor.address;
      vendor.company = company !== undefined ? company : vendor.company;
      vendor.taxNumber = taxNumber !== undefined ? taxNumber : vendor.taxNumber;
      vendor.notes = notes !== undefined ? notes : vendor.notes;

      await vendor.save();
      await logAction(req.user.id, "Updated vendor");
      res.json(vendor);
    } catch (error) {
      console.error("PUT /vendors/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete Vendor
router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const vendor = await Vendor.findById(req.params.id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      // Optional: Check if vendor is referenced in any purchases
      const purchaseCount = await Purchase.countDocuments({ vendorId: req.params.id });
      if (purchaseCount > 0) {
        return res.status(400).json({ message: "Cannot delete vendor with associated purchases" });
      }

      await vendor.deleteOne();
      await logAction(req.user.id, "Deleted vendor");
      res.json({ message: "Vendor deleted" });
    } catch (error) {
      console.error("DELETE /vendors/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;