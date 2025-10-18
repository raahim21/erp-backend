const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const Brand = require("../models/Brand");
const Category = require("../models/Category"); // Assume this model exists based on Product ref
const Customer = require("../models/Customer");
const IssueOrder = require("../models/IssueOrder");
const Location = require("../models/Location");
const Product = require("../models/Product");
const Purchase = require("../models/Purchase");
const StockMovement = require("../models/StockMovement");
const Vendor = require("../models/Vendor");
const User = require("../models/User");
const logAction = require("../utils/logAction");

const router = express.Router();

// Assume Category model if not provided
// const categorySchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   isDeleted: { type: Boolean, default: false }
// });
// const Category = mongoose.model("Category", categorySchema);

// Dummy Data Route - POST /api/dummy-data (admin only)
router.post("/dummy-data", auth, requireRole("admin"), async (req, res) => {
  try {
    // Clear existing data (optional - comment out if you don't want to delete)
    // await Brand.deleteMany({});
    // await Category.deleteMany({});
    // await Customer.deleteMany({});
    // await IssueOrder.deleteMany({});
    // await Location.deleteMany({});
    // await Product.deleteMany({});
    // await Purchase.deleteMany({});
    // await StockMovement.deleteMany({});
    // await Vendor.deleteMany({});
    // await User.deleteMany({});

    // Dummy Brands
    const brands = await Brand.insertMany([
      { name: "Redmi" },
      { name: "Carefour" },
      { name: "Nikkai" },
      { name: "Apple" },
      { name: "Dell" },
    ]);

    // Dummy Categories
    const categories = await Category.insertMany([
      { name: "Utensils" },
      { name : 'Vegetables' },
      { name: "Rice" },
      { name: "Books" },
      { name: "Home Appliances" },
    ]);

    // Dummy Locations
    const locations = await Location.insertMany([
      { name: "Warehouse 1", address: "123 Main St", notes: "Main storage" },
      { name: "Store Front", address: "456 Retail Ave", notes: "Customer facing" },
      { name: "Branch Office", address: "789 Branch Rd", notes: "Regional branch" },
    ]);

    // Dummy Vendors
    const vendors = await Vendor.insertMany([
      { name: "Vendor One", phone: "123-456-7890", email: "vendor1@example.com", address: "Vendor St 1", company: "Vendor Co", taxNumber: "TAX123", notes: "Reliable supplier" },
      { name: "Vendor Two", phone: "987-654-3210", email: "vendor2@example.com", address: "Vendor St 2", company: "Supplier Inc", taxNumber: "TAX456", notes: "Fast delivery" },
      { name: "Vendor Three", phone: "555-555-5555", email: "vendor3@example.com", address: "Vendor St 3", company: "Wholesale Ltd", taxNumber: "TAX789", notes: "Bulk discounts" },
      { name: "Vendor Four", phone: "111-222-3333", email: "vendor4@example.com", address: "Vendor St 4", company: "Import Exports", taxNumber: "TAX101", notes: "International" },
      { name: "Vendor Five", phone: "444-555-6666", email: "vendor5@example.com", address: "Vendor St 5", company: "Local Goods", taxNumber: "TAX202", notes: "Local sourcing" },
    ]);

    // Dummy Customers
    const customers = await Customer.insertMany([
      { name: "Customer One", phone: "123-456-7890", email: "customer1@example.com", address: "Customer St 1", company: "Buyer Co", taxNumber: "TAX123", notes: "Regular buyer" },
      { name: "Customer Two", phone: "987-654-3210", email: "customer2@example.com", address: "Customer St 2", company: "Retail Inc", taxNumber: "TAX456", notes: "High volume" },
      { name: "Customer Three", phone: "555-555-5555", email: "customer3@example.com", address: "Customer St 3", company: "Online Shop", taxNumber: "TAX789", notes: "E-commerce" },
      { name: "Customer Four", phone: "111-222-3333", email: "customer4@example.com", address: "Customer St 4", company: "Wholesale Buyer", taxNumber: "TAX101", notes: "Bulk purchases" },
      { name: "Customer Five", phone: "444-555-6666", email: "customer5@example.com", address: "Customer St 5", company: "Local Store", taxNumber: "TAX202", notes: "Local retail" },
    ]);

    // Dummy Users (hash passwords)
    const hashedPassword = await bcrypt.hash("password123", 10);
    const users = await User.insertMany([
      { username: "admin1", password: hashedPassword, role: "admin", jobPosition: "Administrator", hourlyRate: 50, maxHoursPerWeek: 40, availability: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
      { username: "manager1", password: hashedPassword, role: "manager", jobPosition: "Manager", hourlyRate: 40, maxHoursPerWeek: 40, availability: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
      { username: "staff1", password: hashedPassword, role: "staff", jobPosition: "Staff", hourlyRate: 20, maxHoursPerWeek: 40, availability: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
    ]);

    // Dummy Products
    const products = await Product.insertMany([
      { name: "Product 1", unit: "pcs", manufacturer: "Manu A", brand: brands[0]._id, weight: 1.5, returnable: true, sellable: true, purchasable: true, price: 10.99, sku: "SKU001", description: "Test product 1", category: categories[0]._id, userId: users[0]._id, inventory: [{ location: locations[0]._id, quantity: 100 }] },
      { name: "Product 2", unit: "kg", manufacturer: "Manu B", brand: brands[1]._id, weight: 2.0, returnable: false, sellable: true, purchasable: true, price: 20.49, sku: "SKU002", description: "Test product 2", category: categories[1]._id, userId: users[0]._id, inventory: [{ location: locations[1]._id, quantity: 50 }] },
      { name: "Product 3", unit: "liter", manufacturer: "Manu C", brand: brands[2]._id, weight: 0.5, returnable: true, sellable: true, purchasable: true, price: 5.99, sku: "SKU003", description: "Test product 3", category: categories[2]._id, userId: users[0]._id, inventory: [{ location: locations[2]._id, quantity: 200 }] },
      { name: "Product 4", unit: "pcs", manufacturer: "Manu D", brand: brands[3]._id, weight: 3.0, returnable: false, sellable: true, purchasable: true, price: 15.29, sku: "SKU004", description: "Test product 4", category: categories[3]._id, userId: users[0]._id, inventory: [{ location: locations[0]._id, quantity: 75 }] },
      { name: "Product 5", unit: "kg", manufacturer: "Manu E", brand: brands[4]._id, weight: 1.0, returnable: true, sellable: true, purchasable: true, price: 8.79, sku: "SKU005", description: "Test product 5", category: categories[4]._id, userId: users[0]._id, inventory: [{ location: locations[1]._id, quantity: 150 }] },
      { name: "Product 6", unit: "pcs", manufacturer: "Manu F", brand: brands[0]._id, weight: 2.5, returnable: false, sellable: true, purchasable: true, price: 12.99, sku: "SKU006", description: "Test product 6", category: categories[0]._id, userId: users[0]._id, inventory: [{ location: locations[2]._id, quantity: 90 }] },
      { name: "Product 7", unit: "liter", manufacturer: "Manu G", brand: brands[1]._id, weight: 0.8, returnable: true, sellable: true, purchasable: true, price: 7.49, sku: "SKU007", description: "Test product 7", category: categories[1]._id, userId: users[0]._id, inventory: [{ location: locations[0]._id, quantity: 120 }] },
      { name: "Product 8", unit: "kg", manufacturer: "Manu H", brand: brands[2]._id, weight: 4.0, returnable: false, sellable: true, purchasable: true, price: 18.99, sku: "SKU008", description: "Test product 8", category: categories[2]._id, userId: users[0]._id, inventory: [{ location: locations[1]._id, quantity: 60 }] },
      { name: "Product 9", unit: "pcs", manufacturer: "Manu I", brand: brands[3]._id, weight: 1.2, returnable: true, sellable: true, purchasable: true, price: 9.99, sku: "SKU009", description: "Test product 9", category: categories[3]._id, userId: users[0]._id, inventory: [{ location: locations[2]._id, quantity: 180 }] },
      { name: "Product 10", unit: "liter", manufacturer: "Manu J", brand: brands[4]._id, weight: 3.5, returnable: false, sellable: true, purchasable: true, price: 14.59, sku: "SKU010", description: "Test product 10", category: categories[4]._id, userId: users[0]._id, inventory: [{ location: locations[0]._id, quantity: 40 }] },
    ]);

    // Dummy Purchases
    const purchases = await Purchase.insertMany([
      { type: "Vendor", vendorId: vendors[0]._id, productId: products[0]._id, quantity: 50, totalPrice: 549.5, status: "Completed", poNumber: "PO001", notes: "First purchase", userId: users[0]._id, fromLocation: undefined, toLocation: locations[0]._id, department: undefined },
      { type: "Internal", vendorId: undefined, productId: products[1]._id, quantity: 30, totalPrice: 614.7, status: "Pending", poNumber: "PO002", notes: "Internal req", userId: users[1]._id, fromLocation: undefined, toLocation: locations[1]._id, department: "Sales" },
      { type: "Transfer", vendorId: undefined, productId: products[2]._id, quantity: 100, totalPrice: 599, status: "Completed", poNumber: "PO003", notes: "Transfer between locations", userId: users[2]._id, fromLocation: locations[0]._id, toLocation: locations[2]._id, department: undefined },
      { type: "Vendor", vendorId: vendors[1]._id, productId: products[3]._id, quantity: 75, totalPrice: 1146.75, status: "Cancelled", poNumber: "PO004", notes: "Cancelled purchase", userId: users[0]._id, fromLocation: undefined, toLocation: locations[0]._id, department: undefined },
      { type: "Internal", vendorId: undefined, productId: products[4]._id, quantity: 150, totalPrice: 1318.5, status: "Completed", poNumber: "PO005", notes: "Large internal req", userId: users[1]._id, fromLocation: undefined, toLocation: locations[1]._id, department: "Production" },
    ]);

    // Dummy Issue Orders
    const issueOrders = await IssueOrder.insertMany([
      { clientName: "Client 1", customerId: customers[0]._id, clientPhone: "123-456-7890", products: [{ productId: products[0]._id, quantity: 10, unitPrice: 10.99 }], totalAmount: 109.9, userId: users[0]._id },
      { clientName: "Client 2", customerId: customers[1]._id, clientPhone: "987-654-3210", products: [{ productId: products[1]._id, quantity: 20, unitPrice: 20.49 }], totalAmount: 409.8, userId: users[1]._id },
      { clientName: "Client 3", customerId: customers[2]._id, clientPhone: "555-555-5555", products: [{ productId: products[2]._id, quantity: 50, unitPrice: 5.99 }], totalAmount: 299.5, userId: users[2]._id },
      { clientName: "Client 4", customerId: customers[3]._id, clientPhone: "111-222-3333", products: [{ productId: products[3]._id, quantity: 30, unitPrice: 15.29 }], totalAmount: 458.7, userId: users[0]._id },
      { clientName: "Client 5", customerId: customers[4]._id, clientPhone: "444-555-6666", products: [{ productId: products[4]._id, quantity: 40, unitPrice: 8.79 }], totalAmount: 351.6, userId: users[1]._id },
    ]);

    // Dummy Stock Movements (linked to purchases and issue orders)
    const stockMovements = await StockMovement.insertMany([
      { productId: products[0]._id, changeType: "purchase", quantityChange: 50, referenceId: purchases[0]._id, userId: users[0]._id, note: "From purchase PO001" },
      { productId: products[1]._id, changeType: "purchase", quantityChange: 30, referenceId: purchases[1]._id, userId: users[1]._id, note: "From purchase PO002" },
      { productId: products[2]._id, changeType: "transfer", quantityChange: -100, referenceId: purchases[2]._id, userId: users[2]._id, note: "Transfer out" },
      { productId: products[2]._id, changeType: "transfer", quantityChange: 100, referenceId: purchases[2]._id, userId: users[2]._id, note: "Transfer in" },
      { productId: products[3]._id, changeType: "adjustment", quantityChange: -20, referenceId: null, userId: users[0]._id, note: "Stock adjustment" },
      { productId: products[0]._id, changeType: "sale", quantityChange: -10, referenceId: issueOrders[0]._id, userId: users[0]._id, note: "From issue order" },
      { productId: products[1]._id, changeType: "sale", quantityChange: -20, referenceId: issueOrders[1]._id, userId: users[1]._id, note: "From issue order" },
      { productId: products[2]._id, changeType: "sale", quantityChange: -50, referenceId: issueOrders[2]._id, userId: users[2]._id, note: "From issue order" },
      { productId: products[3]._id, changeType: "sale", quantityChange: -30, referenceId: issueOrders[3]._id, userId: users[0]._id, note: "From issue order" },
      { productId: products[4]._id, changeType: "sale", quantityChange: -40, referenceId: issueOrders[4]._id, userId: users[1]._id, note: "From issue order" },
    ]);

    await logAction(req.user.id, "Populated dummy data");
    console.log('sucess!')
    console.log('sucess!')
    console.log('sucess!')
    console.log('sucess!')
    console.log('sucess!')
    console.log('sucess!')
    console.log('sucess!')

    res.json({ message: "Dummy data populated successfully", insertedCounts: {
      brands: brands.length,
      categories: categories.length,
      locations: locations.length,
      vendors: vendors.length,
      customers: customers.length,
      users: users.length,
      products: products.length,
      purchases: purchases.length,
      issueOrders: issueOrders.length,
      stockMovements: stockMovements.length,
    } });
  } catch (error) {
    console.error("POST /dummy-data: Error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;