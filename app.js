const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/database");
const errorHandler = require("./middleware/errorHandler");
require("dotenv").config();

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  trustProxy: true,
  message: "Too many requests",
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Connect to MongoDB
const initializeDB = async () => {
  try {
    await connectDB();
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Failed to connect to database:", error.message);
  }
};
initializeDB();

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
    environment: process.env.NODE_ENV || "development",
  });
});

// Root endpoint - fix this
app.get("/", (req, res) => {
  res.json({
    message: "Document Summary API Server",
    status: "running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      upload: "/api/upload",
      summarize: "/api/summarize",
      summaries: "/api/summaries",
      health: "/api/health",
    },
  });
});

// Error handling middleware
app.use(errorHandler);

// Handle 404 - make sure this is last
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      "GET /",
      "GET /api/health",
      "POST /api/upload",
      "POST /api/summarize",
      "GET /api/summaries",
      "GET /api/summaries/:id",
      "DELETE /api/summaries/:id",
    ],
  });
});

const PORT = process.env.PORT || 5000;

// Export for Vercel
module.exports = app;

// Only listen in development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}
