const mongoose = require("mongoose");
const IssueOrder = require("../models/IssueOrder"); // update the path

(async () => {
  try {
    await mongoose.connect("mongodb+srv://raahimwajid21:kBAB9U7vTluUKYDW@worldwise.u87egbg.mongodb.net/?retryWrites=true&w=majority&appName=worldwise");

    const result = await IssueOrder.updateMany(
      { isDeleted: true },
      { $set: { isDeleted: false } }
    );

    console.log(`Updated ${result.modifiedCount} documents.`);
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error updating documents:", error);
  }
})();
