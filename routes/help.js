const mongoose = require("mongoose");
const IssueOrder = require("../models/IssueOrder"); // update the path
const Category = require("../models/Category");

(async () => {
  try {
    await mongoose.connect("mongodb+srv://raahimwajid21:kBAB9U7vTluUKYDW@worldwise.u87egbg.mongodb.net/?retryWrites=true&w=majority&appName=worldwise");

    const result = await Category.updateMany(
      { isDeleted: true },
      { $set: { isDeleted: false } }
    );

    console.log(`Updated ${result.modifiedCount} documents.`);
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error updating documents:", error);
  }
})();
