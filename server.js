const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const authRouter = require("./routes/auth"); // Your auth routes
const productRoutes = require("./routes/products");
const issueOrderRoutes = require("./routes/issueOrders");
const purchaseRoutes = require("./routes/purchases");
const scheduleRoutes = require("./routes/Schedule");
const logRoutes = require("./routes/logs");
const dashboardRoutes = require("./routes/dashboard");
const shiftRoutes = require("./routes/shift");
const categoryRoutes = require('./routes/categories')
const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"));

// Routes
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


app.listen(PORT, () => console.log("Server running on port 5000"));
