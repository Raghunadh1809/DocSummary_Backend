const mongoose = require("mongoose");

const summarySchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
      enum: ["pdf", "image"],
    },
    extractedText: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    summaryLength: {
      type: String,
      required: true,
      enum: ["short", "medium", "long"],
      default: "medium",
    },
    aiProvider: {
      type: String,
      default: "gemini",
    },
    processingTime: {
      type: Number, // in milliseconds
      default: 0,
    },
    fileSize: {
      type: Number, // in bytes
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
summarySchema.index({ createdAt: -1 });
summarySchema.index({ originalName: "text", summary: "text" });

module.exports = mongoose.model("Summary", summarySchema);
