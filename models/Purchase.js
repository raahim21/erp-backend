const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["Vendor", "Internal", "Transfer"],
    required: true,
  },
  supplier: {
    type: String,
    trim: true,
    required: function(){
    return this.type == 'Vendor'
    },
  },
  department: {
    type: String,
    required: function(){
    return this.type == 'Internal'
    },
    trim: true,
  },

toLocation: {
  type: String,
  required: function() {
    return this.type === "Transfer";
  },
  trim: true,
},
fromLocation: {
  type: String,
  required: function() {
    return this.type === "Transfer";
  },
  trim: true,
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
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ status: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
