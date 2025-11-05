const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/roles");
const productController = require("../controllers/productsController");

const router = express.Router();

router.post("/", auth, requireRole("admin", "manager"), productController.createProduct);
router.get("/", auth, productController.getProducts);
router.get("/:id", auth, productController.getProductById);
router.put("/:id", auth, requireRole("admin", "manager"), productController.updateProduct);
router.delete("/:id", auth, requireRole("admin", "manager"), productController.deleteProduct);

module.exports = router;
