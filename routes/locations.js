// // routes/locations.js
// const express = require("express");
// const Location = require("../models/Location");
// const auth = require("../middleware/auth");
// const requireRole = require("../middleware/roles");
// const logAction = require("../utils/logAction");

// const router = express.Router();

// // Create Location
// router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const { name, address, notes } = req.body;
//     if (!name) return res.status(400).json({ message: "Name is required" });

//     const location = new Location({ name, address, notes });
//     await location.save();
//     await logAction(req.user.id, "Created Location", name);
//     res.status(201).json(location);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Get All Locations
// router.get("/", auth, async (req, res) => {
//   try {
//     const { search, page = 1, limit = 10 } = req.query;
//     const skip = (page - 1) * limit;
//     const filter = search ? { name: { $regex: search, $options: "i" } } : {};

//     const [locations, total] = await Promise.all([
//       Location.find(filter).skip(skip).limit(parseInt(limit)),
//       Location.countDocuments(filter),
//     ]);

//     res.json({
//       locations,
//       totalResults: total,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Get Single Location
// router.get("/:id", auth, async (req, res) => {
//   try {
//     const location = await Location.findById(req.params.id);
//     if (!location) return res.status(404).json({ message: "Location not found" });
//     res.json(location);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Update Location
// router.put("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const { name, address, notes } = req.body;
//     const location = await Location.findById(req.params.id);
//     if (!location) return res.status(404).json({ message: "Location not found" });

//     if (name) location.name = name;
//     if (address !== undefined) location.address = address;
//     if (notes !== undefined) location.notes = notes;

//     await location.save();
//     await logAction(req.user.id, "Updated Location", location.name);
//     res.json(location);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // Delete Location
// router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const item = await Location.findById(req.params.id);
//     if (!item || item.isDeleted) {
//       return res.status(404).json({ message: "Not found or already deleted" });
//     }
//     item.isDeleted = true;
//     await item.save();
//     await logAction(req.user.id, "Soft Deleted Location", `${item.name}`);
//     res.json({ message: `${Location} archived` });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// module.exports = router;

// routes/locations.js
const express = require("express");
const Location = require("../models/Location");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const logAction = require("../utils/logAction");

const router = express.Router();

// Create Location
router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, address, notes } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Name is required" });
    }

    const existingLocation = await Location.findOne({ name: name.trim(), isDeleted: false });
    if (existingLocation) {
        return res.status(400).json({ message: "A location with this name already exists." });
    }

    const location = new Location({ name, address, notes });
    await location.save();
    await logAction(req.user.id, "Created Location", name);
    res.status(201).json(location);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get All Locations (active ones only)
router.get("/", auth, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    
    const filter = { isDeleted: false };
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const [locations, total] = await Promise.all([
      Location.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum),
      Location.countDocuments(filter),
    ]);

    res.json({
      locations,
      totalResults: total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Single Location
router.get("/:id", auth, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location || location.isDeleted) {
      return res.status(404).json({ message: "Location not found" });
    }
    res.json(location);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Location
router.put("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, address, notes } = req.body;
    const location = await Location.findById(req.params.id);
    if (!location || location.isDeleted) {
      return res.status(404).json({ message: "Location not found" });
    }

    if (name) location.name = name;
    if (address !== undefined) location.address = address;
    if (notes !== undefined) location.notes = notes;

    await location.save();
    await logAction(req.user.id, "Updated Location", location.name);
    res.json(location);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Soft Delete Location
router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const item = await Location.findById(req.params.id);
    if (!item || item.isDeleted) {
      return res.status(404).json({ message: "Location not found or already deleted" });
    }
    item.isDeleted = true;
    await item.save();
    await logAction(req.user.id, "Soft Deleted Location", `${item.name}`);
    res.json({ message: "Location archived successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
