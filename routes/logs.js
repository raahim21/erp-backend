// const express = require("express");
// const auth = require("../middleware/auth");
// const Logs = require("../models/Log");
// const User = require("../models/User");
// const requireRole = require("../middleware/roles");
// const { getDateFilter } = require("../utils/dateFilter");

// const router = express.Router();

// router.get(
//   "/get-user-logs",
//   auth,
//   requireRole("manager", "admin"),
//   async (req, res) => {
//     try {
//       let startDate = req.query.startDate
//         ? new Date(req.query.startDate)
//         : null;
//       let endDate = req.query.endDate ? new Date(req.query.endDate) : null;

//       let currentPage = parseInt(req.query.page) || 1;
//       let limit = parseInt(req.query.limit) || 10;
//       let skip = (currentPage - 1) * limit;
//       let search = req.query.search ? req.query.search.trim() : "";
//       let searchFilter = {};
//       // Build search filter
//       if (startDate && endDate) {
//         searchFilter.createdAt = { $gte: startDate, $lte: endDate };
//       } else if (startDate) {
//         searchFilter.createdAt = { $gte: startDate };
//       } else if (endDate) {
//         searchFilter.createdAt = { $lte: endDate };
//       }
//       if (search) {
//         // let userId = await User.find({ username: search }).select("_id");
//         searchFilter.action = { $regex: search, $options: "i" };
        
//       }
//       // searchFilter.createdAt = {$lte:'', $gte:''};
//       if (req.query.username) {
//         let userId = await User.find({ username: req.query.username }).select(
//           "_id"
//         );

//         searchFilter.userId = userId;
//       }
//       let user = await User.findOne({ _id: req.user.id });

//       if (user.role === "admin") {
//         let query = { ...searchFilter };
//         let totalDocs = await Logs.countDocuments(query);
//         let myLogs = await Logs.find(query)
//           .populate("userId")
//           .skip(skip)
//           .limit(limit)
//           .sort({ createdAt: -1 });

//         return res.json({
//           data: myLogs,
//           totalPages: Math.ceil(totalDocs / limit),
//           currentPage,
//         });
//       }

//       // Manager: search all logs from all users
//       let query = { userId: req.user.id, ...searchFilter };
//       let totalDocs = await Logs.countDocuments(query);
//       let myLogs = await Logs.find(query)
//         .skip(skip)
//         .limit(limit)
//         .populate("userId")
//         .sort({ createdAt: -1 });

//       res.json({
//         data: myLogs,
//         totalPages: Math.ceil(totalDocs / limit),
//         currentPage,
//       });
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: "Server error" });
//     }
//   }
// );

// module.exports = router;


const express = require("express");
const auth = require("../middleware/auth");
const Log = require("../models/Log"); // Fixed model name to Log
const User = require("../models/User");
const requireRole = require("../middleware/roles");
const { getDateFilter } = require("../utils/dateFilter");

const router = express.Router();

router.get(
  "/get-user-logs",
  auth,
  requireRole("manager", "admin"),
  async (req, res) => {
    try {
      let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
      let endDate = req.query.endDate ? new Date(req.query.endDate) : null;

      let currentPage = parseInt(req.query.page) || 1;
      let limit = parseInt(req.query.limit) || 10;
      let skip = (currentPage - 1) * limit;
      let search = req.query.search ? req.query.search.trim() : "";
      let searchFilter = {};
      // Build search filter
      if (startDate && endDate) {
        searchFilter.createdAt = { $gte: startDate, $lte: endDate };
      } else if (startDate) {
        searchFilter.createdAt = { $gte: startDate };
      } else if (endDate) {
        searchFilter.createdAt = { $lte: endDate };
      }
      if (search) {
        searchFilter.action = { $regex: search, $options: "i" };
      }
      if (req.query.username) {
        let user = await User.findOne({ username: req.query.username }).select("_id");
        if (user) searchFilter.userId = user._id;
      }
      let user = await User.findOne({ _id: req.user.id });

      let query;
      if (user.role === "admin") {
        query = { ...searchFilter };
      } else {
        // Manager: only own logs
        query = { userId: req.user.id, ...searchFilter };
      }

      let totalDocs = await Log.countDocuments(query);
      let myLogs = await Log.find(query)
        .populate("userId", "username")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      res.json({
        data: myLogs,
        totalPages: Math.ceil(totalDocs / limit),
        currentPage,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;