const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["Vendor", "Internal", "Transfer"],
    required: true,
  },

  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: function() {
      return this.type === "Vendor";
    },
  },

  department: {
    type: String,
    required: function(){
      return this.type === 'Internal';
    },
    trim: true,
  },

  fromLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location",
    required: function() {
      return this.type === "Transfer";
    },
  },
  toLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location",
    required: true, // Made always required to match code logic (stock added to toLocation for all types)
  },

  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    min: 0,
    default: 0,
    required: function() {
      return this.type !== "Transfer";
    },
  },
  sellingUnitPrice: {
    type: Number,
    min: 0,
    default: 0,
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  purchaseDate: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["Pending", "Completed", "Cancelled"],
    default: "Pending",
  },
  poNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },
  notes: {
    type: String,
    trim: true,
    default: "",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

purchaseSchema.index({ purchaseDate: 1 });
purchaseSchema.index({ vendorId: 1 });
purchaseSchema.index({ status: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);