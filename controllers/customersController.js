// controllers/customersController.js
const Customer = require("../models/Customer");
const IssueOrder = require("../models/IssueOrder");
const logAction = require("../utils/logAction");

exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, email, address, company, taxNumber, notes } = req.body;

    const existingCustomer = await Customer.findOne({ name: new RegExp(`^${name}$`, "i"), isDeleted: false });
    if (existingCustomer) {
      return res.status(400).json({ message: "A customer with this name already exists." });
    }

    const customer = new Customer({
      name, phone, email, address, company, taxNumber, notes,
      userId: req.user.id,
    });

    await customer.save();
    await logAction(req.user.id, "Created customer", customer.name);
    res.status(201).json(customer);
  } catch (error) {
    console.error("Create customer error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getCustomers = async (req, res) => {
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
      Customer.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      Customer.countDocuments(filter),
    ]);

    res.json({
      customers,
      totalResults: totalCustomers,
      totalPages: limit > 0 ? Math.ceil(totalCustomers / limit) : 1,
      currentPage: page,
    });
  } catch (error) {
    console.error("Get customers error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    console.error("Get customer by ID error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const { name, phone, email, address, company, taxNumber, notes } = req.body;

    let updatedName = customer.name;
    if (name) {
      updatedName = name;
      const existingCustomer = await Customer.findOne({ name: new RegExp(`^${name}$`, "i"), isDeleted: false, _id: { $ne: req.params.id } });
      if (existingCustomer) {
        return res.status(400).json({ message: "A customer with this name already exists." });
      }
      customer.name = name;
    }
    if (phone !== undefined) customer.phone = phone;
    if (email !== undefined) customer.email = email;
    if (address !== undefined) customer.address = address;
    if (company !== undefined) customer.company = company;
    if (taxNumber !== undefined) customer.taxNumber = taxNumber;
    if (notes !== undefined) customer.notes = notes;

    await customer.save();
    await logAction(req.user.id, "Updated customer", updatedName);
    res.json(customer);
  } catch (error) {
    console.error("Update customer error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

exports.softDeleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: "Customer not found or already deleted" });
    }

    const issueOrderCount = await IssueOrder.countDocuments({ customerId: req.params.id });
    if (issueOrderCount > 0) {
      return res.status(400).json({ message: "Cannot archive customer with associated issue orders. Please resolve orders first." });
    }

    customer.isDeleted = true;
    await customer.save();
    await logAction(req.user.id, "Soft deleted customer", customer.name);
    res.json({ message: "Customer archived successfully" });
  } catch (error) {
    console.error("Soft delete customer error:", error.message);
    res.status(500).json({ message: error.message });
  }
};