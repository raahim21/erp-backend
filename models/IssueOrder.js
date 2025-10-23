const mongoose = require("mongoose");

const issueOrderSchema = new mongoose.Schema({
  clientName: {
    type: String,
    required: true,
    trim: true,
  },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  clientPhone: {
    type: String,
    trim: true,
    default: "",
  },
  products: [
    {
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
        required: true,
        min: 0,
      },
    },
  ],
  issueDate: {
    type: Date,
    default: Date.now,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isDeleted: {
    type: Boolean,
    required:false,
    default:false,
  }
});

module.exports = mongoose.model("IssueOrder", issueOrderSchema);
