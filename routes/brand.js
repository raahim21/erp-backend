// const express = require("express");
// const Brand = require('../models/Brand')
// const auth = require("../middleware/auth");
// const requireRole = require("../middleware/roles");
// const logAction = require("../utils/logAction");


// let router = express.Router()

// router.get("/", auth, async (req, res) => {
//   try {
//     const { search, page = 1, limit = 10 } = req.query;
//     const skip = (page - 1) * limit;
//     const filter = search ? { name: { $regex: search, $options: "i" } } : {};

//     const [brands, total] = await Promise.all([
//       Brand.find(filter).skip(skip).limit(parseInt(limit)),
//       Brand.countDocuments(filter),
//     ]);

//     res.json({
//       brands,
//       totalResults: total,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });


// router.post("/", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const { name } = req.body;
//     if (!name) return res.status(400).json({ message: "Name is required" });

//     const brand = new Brand({ name });
//     await brand.save();
//     await logAction(req.user.id, "Created Brand", name);
//     res.status(201).json(brand);
//   } catch (error) {
//     console.log(error)
//     res.status(500).json({ message: error.message });
//   }
// });


// router.delete("/:id", auth, requireRole("admin", "manager"), async (req, res) => {
//   try {
//     const item = await Brand.findById(req.params.id);
//     if (!item || item.isDeleted) {
//       return res.status(404).json({ message: "Not found or already deleted" });
//     }
//     item.isDeleted = true;
//     await item.save();
//     await logAction(req.user.id, "Soft Deleted Brand", `${item.name}`);
//     res.json({ message: `${Brand} archived` });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });



// module.exports = router

// routes/brands.js
const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const { body } = require("express-validator");
const handleValidationErrors = require("../middleware/validation");
const brandsController = require("../controllers/brandsControllers");

const router = express.Router();

router.get("/", auth, brandsController.getBrands);

router.post(
  "/",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").isString().trim().notEmpty().withMessage("Name is required"),
  ],
  handleValidationErrors,
  brandsController.createBrand
);

router.get("/:id", auth, brandsController.getBrandById);

router.put(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  [
    body("name").optional().isString().trim().notEmpty().withMessage("Name must not be empty"),
  ],
  handleValidationErrors,
  brandsController.updateBrand
);

router.delete(
  "/:id",
  auth,
  requireRole("admin", "manager"),
  brandsController.softDeleteBrand
);

module.exports = router;