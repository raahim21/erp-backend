const express = require("express");
const router = express.Router();

const Product = require("../models/Product");
const Purchase = require("../models/Purchase");
const IssueOrder = require("../models/IssueOrder");

router.get("/stats", async (req, res) => {
  try {
    // --- Products ---
    const totalProducts = await Product.countDocuments({ isDeleted: false });



    const profitData = await IssueOrder.aggregate([
  { $unwind: "$products" },
  { $match: { isDeleted: false } },
  {
    $lookup: {
      from: "products",
      localField: "products.productId",
      foreignField: "_id",
      as: "productDetails",
    },
  },
  { $unwind: "$productDetails" },
  {
    $group: {
      _id: null,
      totalRevenue: { $sum: { $multiply: ["$products.quantity", "$products.unitPrice"] } },
      totalCost: { $sum: { $multiply: ["$products.quantity", "$productDetails.costPrice"] } },
    },
  },
  {
    $project: {
      totalRevenue: 1,
      totalCost: 1,
      totalProfit: { $subtract: ["$totalRevenue", "$totalCost"] },
    },
  },
]);



    const totalStockData = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: "$inventory" },
      { $group: { _id: null, totalStock: { $sum: "$inventory.quantity" } } },
    ]);
    const totalStock = totalStockData[0]?.totalStock || 0;

    const lowestStockProducts = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $addFields: { totalQuantity: { $sum: "$inventory.quantity" } } },
      { $sort: { totalQuantity: 1 } },
      { $limit: 3 },
      { $project: { name: 1, quantity: "$totalQuantity" } },
    ]);

    const lowStockItems = await Product.aggregate([
      { $match: { isDeleted: false } },
      { $addFields: { totalQuantity: { $sum: "$inventory.quantity" } } },
      { $match: { totalQuantity: { $lte: 5 } } },
    ]);

    // --- Purchases ---
    const totalPurchasesData = await Purchase.aggregate([
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
        },
      },
    ]);

    const topSuppliers = await Purchase.aggregate([
      { $match: { type: "Vendor" } },
      { $group: { _id: "$vendorId", totalSpent: { $sum: "$totalPrice" } } },
      { $sort: { totalSpent: -1 } },
      { $limit: 3 },
      { $lookup: { from: "vendors", localField: "_id", foreignField: "_id", as: "vendor" } },
      { $unwind: "$vendor" },
      { $project: { _id: "$vendor.name", totalSpent: 1 } },
    ]);

    const purchasesByType = await Purchase.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 }, totalSpent: { $sum: "$totalPrice" } } },
      { $sort: { count: -1 } },
    ]);

    // --- Issue Orders ---
    const totalIssuesData = await IssueOrder.aggregate([
      { $group: { _id: null, totalIssues: { $sum: 1 } } },
    ]);
    const totalProductsIssuedData = await IssueOrder.aggregate([
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalProductsIssued: { $sum: "$products.quantity" },
        },
      },
    ]);
    const totalRevenueData = await IssueOrder.aggregate([
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);

    // --- Send all stats ---
    res.json({
      products: {
        totalProducts: totalProducts || 0,
        totalStock: totalStock || 0,
        lowestStockProducts,
        lowStockItems,
      },
      purchases: {
        totalPurchases: totalPurchasesData[0]?.totalPurchases || 0,
        totalSpent: totalPurchasesData[0]?.totalSpent || 0,
        topSuppliers,
        purchasesByType,
      },
      issues: {
        totalIssues: totalIssuesData[0]?.totalIssues || 0,
        totalProductsIssued:
          totalProductsIssuedData[0]?.totalProductsIssued || 0,
        totalRevenue: totalRevenueData[0]?.totalRevenue || 0,
      },

      profit: profitData[0]?.totalProfit || 0

    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/sales-report", async function (req, res) {
//   async function getReport(period = "daily", numOfDays = 7, includeProducts = false) {
//   const now = new Date();

//   // Start date
//   const then = new Date();
//   then.setHours(0, 0, 0, 0); // start of today
//   then.setDate(then.getDate() - (numOfDays - 1)); // go back numOfDays

//   const pipeline = [{ $match: { issueDate: { $gte: then, $lte: now } } }];

//   if (includeProducts) pipeline.push({ $unwind: "$products" });

//   let groupId;

//   if (period === "daily") {
//     groupId = {
//       day: { $dayOfMonth: "$issueDate" },
//       month: { $month: "$issueDate" },
//       year: { $year: "$issueDate" },
//     };
//   } else if (period === "weekly") {
//     pipeline.push({
//       $addFields: {
//         relativeWeek: {
//           $floor: {
//             $divide: [
//               { $subtract: ["$issueDate", then] },
//               1000 * 60 * 60 * 24 * 7, // milliseconds per week
//             ],
//           },
//         },
//       },
//     });
//     groupId = { week: "$relativeWeek" };
//   } else if (period === "monthly") {
//     groupId = {
//       month: { $month: "$issueDate" },
//       year: { $year: "$issueDate" },
//     };
//   } else {
//     throw new Error("Invalid period. Use daily, weekly, or monthly.");
//   }

//   pipeline.push({
//     $group: {
//       _id: groupId,
//       revenue: { $sum: "$totalAmount" },
//       orders: { $sum: 1 },
//       ...(includeProducts ? { productsSold: { $sum: "$products.quantity" } } : {}),
//     },
//   });

//   // Sort by group fields
//   const sortObj = {};
//   if (period === "daily") {
//     sortObj["_id.year"] = 1;
//     sortObj["_id.month"] = 1;
//     sortObj["_id.day"] = 1;
//   } else if (period === "weekly") {
//     sortObj["_id.week"] = 1;
//   } else if (period === "monthly") {
//     sortObj["_id.year"] = 1;
//     sortObj["_id.month"] = 1;
//   }
//   pipeline.push({ $sort: sortObj });
//   const result = await IssueOrder.aggregate(pipeline);
//   return result;
// }


async function getReport(period = "daily", numOfDays = 7, includeProducts = false) {
  const now = new Date();
  const then = new Date();
  then.setHours(0, 0, 0, 0);
  then.setDate(then.getDate() - (numOfDays - 1));

  const pipeline = [
    { $match: { issueDate: { $gte: then, $lte: now }, isDeleted: false } },
    { $unwind: "$products" },
    {
      $lookup: {
        from: "products",
        localField: "products.productId",
        foreignField: "_id",
        as: "productDetails",
      },
    },
    { $unwind: "$productDetails" },
  ];

  let groupId;
  if (period === "daily") {
    groupId = {
      day: { $dayOfMonth: "$issueDate" },
      month: { $month: "$issueDate" },
      year: { $year: "$issueDate" },
    };
  } else if (period === "weekly") {
    pipeline.push({
      $addFields: {
        relativeWeek: {
          $floor: {
            $divide: [
              { $subtract: ["$issueDate", then] },
              1000 * 60 * 60 * 24 * 7,
            ],
          },
        },
      },
    });
    groupId = { week: "$relativeWeek" };
  } else if (period === "monthly") {
    groupId = {
      month: { $month: "$issueDate" },
      year: { $year: "$issueDate" },
    };
  } else {
    throw new Error("Invalid period. Use daily, weekly, or monthly.");
  }

  pipeline.push({
    $group: {
      _id: groupId,
      revenue: { $sum: { $multiply: ["$products.quantity", "$products.unitPrice"] } },
      cost: { $sum: { $multiply: ["$products.quantity", "$productDetails.costPrice"] } },
      orders: { $sum: 1 },
      ...(includeProducts ? { productsSold: { $sum: "$products.quantity" } } : {}),
    },
  });

  pipeline.push({
    $project: {
      _id: 1,
      revenue: 1,
      cost: 1,
       profit: {
    $round: [{ $subtract: ["$revenue", "$cost"] }, 2],
  },
      orders: 1,
      ...(includeProducts ? { productsSold: 1 } : {}),
    },
  });

  const sortObj = {};
  if (period === "daily") {
    sortObj["_id.year"] = 1;
    sortObj["_id.month"] = 1;
    sortObj["_id.day"] = 1;
  } else if (period === "weekly") {
    sortObj["_id.week"] = 1;
  } else if (period === "monthly") {
    sortObj["_id.year"] = 1;
    sortObj["_id.month"] = 1;
  }
  pipeline.push({ $sort: sortObj });

  const result = await IssueOrder.aggregate(pipeline);
  return result;
}




  const { period, numOfDays, includeProducts } = req.query;
  if(period=='weekly' && numOfDays < 7){
     return res.json([]); // return empty array instead of {message: ...}
  }
  if(period=='monthly' && numOfDays < 28){
     return res.json([]); // return empty array instead of {message: ...}
  }
  try {
    const report = await getReport(period, parseInt(numOfDays), includeProducts === "true");
    res.json(report);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/top-products", async (req, res) => {
  try {
    const topProducts = await IssueOrder.aggregate([
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productId",
          totalSold: { $sum: "$products.quantity" },
          revenue: { $sum: { $multiply: ["$products.quantity", "$products.unitPrice"] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
    ]);
    res.json(topProducts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

