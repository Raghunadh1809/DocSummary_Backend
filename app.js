const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/database");
const errorHandler = require("./middleware/errorHandler");
require("dotenv").config();

const app = express();

// Connect to MongoDB
connectDB();
app.set("trust proxy", 1);
// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  trustProxy: true, // Add this
  message: "Too many requests",
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api/upload", require("./routes/upload"));
app.use("/api/summarize", require("./routes/summarize"));
app.use("/api/summaries", require("./routes/summaries"));

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Document Summary API is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(errorHandler);

// Handle 404
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
