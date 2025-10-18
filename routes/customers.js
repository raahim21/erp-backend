const express = require("express");
const Customer = require("../models/Customer");
const IssueOrder = require("../models/IssueOrder");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const { body } = require("express-validator");
const handleValidationErrors = require("../middleware/validation");
const logAction = require("../utils/logAction");

const router = express.Router();

// Create Customer
router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").isString().trim().notEmpty().withMessage("Customer name is required"),
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

      const customer = new Customer({
        name,
        phone,
        email,
        address,
        company,
        taxNumber,
        notes,
        userId: req.user.id,
      });

      await customer.save();
      await logAction(req.user.id, "Created customer");
      res.status(201).json(customer);
    } catch (error) {
      console.error("POST /customers: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get All Customers (with pagination and search)
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

    const [customers, totalCustomers] = await Promise.all([
      Customer.find(filter).skip(skip).limit(limit),
      Customer.countDocuments(filter),
    ]);

    res.json({
      customers,
      totalResults: totalCustomers,
      totalPages: limit > 0 ? Math.ceil(totalCustomers / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("GET /customers: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Get Single Customer
router.get("/:id", auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    console.error("GET /customers/:id: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// Update Customer
router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").optional().isString().trim().notEmpty().withMessage("Customer name is required"),
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

      const customer = await Customer.findById(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      customer.name = name || customer.name;
      customer.phone = phone !== undefined ? phone : customer.phone;
      customer.email = email !== undefined ? email : customer.email;
      customer.address = address !== undefined ? address : customer.address;
      customer.company = company !== undefined ? company : customer.company;
      customer.taxNumber = taxNumber !== undefined ? taxNumber : customer.taxNumber;
      customer.notes = notes !== undefined ? notes : customer.notes;

      await customer.save();
      await logAction(req.user.id, "Updated customer");
      res.json(customer);
    } catch (error) {
      console.error("PUT /customers/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete Customer
router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Check if customer is referenced in any issue orders
      const issueOrderCount = await IssueOrder.countDocuments({ customerId: req.params.id });
      if (issueOrderCount > 0) {
        return res.status(400).json({ message: "Cannot delete customer with associated issue orders" });
      }

      await customer.deleteOne();
      await logAction(req.user.id, "Deleted customer");
      res.json({ message: "Customer deleted" });
    } catch (error) {
      console.error("DELETE /customers/:id: Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;