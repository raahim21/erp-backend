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
    body("phone").optional({ checkFalsy: true }).isString().trim(),
    body("email").optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body("address").optional({ checkFalsy: true }).isString().trim(),
    body("company").optional({ checkFalsy: true }).isString().trim(),
    body("taxNumber").optional({ checkFalsy: true }).isString().trim(),
    body("notes").optional({ checkFalsy: true }).isString().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, phone, email, address, company, taxNumber, notes } = req.body;

      const existingCustomer = await Customer.findOne({ name, isDeleted: false });
      if(existingCustomer) {
          return res.status(400).json({ message: "A customer with this name already exists."});
      }

      const customer = new Customer({
        name, phone, email, address, company, taxNumber, notes,
        userId: req.user.id,
      });

      await customer.save();
      await logAction(req.user.id, "Created customer", customer.name);
      res.status(201).json(customer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get All Customers (active ones only)
router.get("/", auth, async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const filter = { isDeleted: false };
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
    res.status(500).json({ message: error.message });
  }
});

// Get Single Customer
router.get("/:id", auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Customer
router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").optional().isString().trim().notEmpty().withMessage("Customer name must not be empty"),
    body("phone").optional({ checkFalsy: true }).isString().trim(),
    body("email").optional({ checkFalsy: true }).isEmail().normalizeEmail(),
    body("address").optional({ checkFalsy: true }).isString().trim(),
    body("company").optional({ checkFalsy: true }).isString().trim(),
    body("taxNumber").optional({ checkFalsy: true }).isString().trim(),
    body("notes").optional({ checkFalsy: true }).isString().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);
      if (!customer || customer.isDeleted) {
        return res.status(404).json({ message: "Customer not found" });
      }

      Object.keys(req.body).forEach(key => {
        if(req.body[key] !== undefined) {
          customer[key] = req.body[key];
        }
      });
      
      await customer.save();
      await logAction(req.user.id, "Updated customer", customer.name);
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Soft Delete Customer
router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.id);
      if (!customer || customer.isDeleted) {
        return res.status(404).json({ message: "Customer not found or already deleted" });
      }

      // Check if customer is referenced in any issue orders before archiving
      const issueOrderCount = await IssueOrder.countDocuments({ customerId: req.params.id });
      if (issueOrderCount > 0) {
        return res.status(400).json({ message: "Cannot archive customer with associated issue orders. Please resolve orders first." });
      }

      customer.isDeleted = true;
      await customer.save();
      await logAction(req.user.id, "Soft Deleted customer", customer.name);
      res.json({ message: "Customer archived successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
