// routes/customers.js
const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const { body } = require("express-validator");
const handleValidationErrors = require("../middleware/validation");
const customersController = require("../controllers/customersController");

const router = express.Router();

router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").isString().trim().notEmpty().withMessage("Customer name is required"),
    body("phone").optional({ nullable: true }).isString().trim(),
    body("email").optional({ nullable: true }).isEmail().normalizeEmail(),
    body("address").optional({ nullable: true }).isString().trim(),
    body("company").optional({ nullable: true }).isString().trim(),
    body("taxNumber").optional({ nullable: true }).isString().trim(),
    body("notes").optional({ nullable: true }).isString().trim(),
  ],
  handleValidationErrors,
  customersController.createCustomer
);

router.get("/", auth, customersController.getCustomers);

router.get("/:id", auth, customersController.getCustomerById);

router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").optional().isString().trim().notEmpty().withMessage("Customer name must not be empty"),
    body("phone").optional({ nullable: true }).isString().trim(),
    body("email").optional({ nullable: true }).isEmail().normalizeEmail(),
    body("address").optional({ nullable: true }).isString().trim(),
    body("company").optional({ nullable: true }).isString().trim(),
    body("taxNumber").optional({ nullable: true }).isString().trim(),
    body("notes").optional({ nullable: true }).isString().trim(),
  ],
  handleValidationErrors,
  customersController.updateCustomer
);

router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  customersController.softDeleteCustomer
);

module.exports = router;