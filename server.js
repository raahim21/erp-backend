const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const authRouter = require("./routes/auth"); // Your auth routes
const productRoutes = require("./routes/products");
const issueOrderRoutes = require("./routes/issueOrders");
const purchaseRoutes = require("./routes/purchases");
const vendorRoutes = require("./routes/vendors");
const scheduleRoutes = require("./routes/Schedule");
const logRoutes = require("./routes/logs");
const dashboardRoutes = require("./routes/dashboard");
const shiftRoutes = require("./routes/shift");
const customerRoutes = require('./routes/customers')
const categoryRoutes = require('./routes/categories')
const locationRoutes = require('./routes/locations.js')
const stockMovementRoutes = require('./routes/stockMovements.js')
const stockAdjustmentRoutes = require('./routes/stockAdjustments.js')
const notificationRoutes = require('./routes/notifications.js')
const brandRoutes = require('./routes/brand.js')
const dummy  = require('./routes/dummy.js')
const leaveRoutes = require('./routes/leave.js')

const app = express();

app.use(
  cors({
    origin: [
       "http://localhost:5173",
      "https://erptikvah.netlify.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());



app.use("/api/auth", authRouter);
let PORT = process.env.PORT || 5000
// Placeholder routes (replace with your actual routes)
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/issue-orders", issueOrderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/categories", categoryRoutes);
app.use('/api/customers', customerRoutes)
app.use('/api/locations', locationRoutes)
app.use('/api/stockMovements', stockMovementRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/stockAdjustments', stockAdjustmentRoutes)
app.use('/api/brands', brandRoutes)
app.use("/api/vendors", vendorRoutes);
app.use("/api/leave", leaveRoutes);


// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"));

// Routes


// app.listen(process.env.PORT, () => console.log("Server running on port 5000"));
app.listen(5000, () => console.log("Server running on port 5000"));
