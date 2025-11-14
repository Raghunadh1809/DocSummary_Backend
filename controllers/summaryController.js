const Summary = require("../models/Summary");
const geminiService = require("../utils/gemini");

const generateSummary = async (req, res, next) => {
  try {
    const {
      text,
      length = "medium",
      filename,
      originalName,
      fileType,
    } = req.body;

    if (!text || text.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "No text provided for summarization" });
    }

    if (!["short", "medium", "long"].includes(length)) {
      return res
        .status(400)
        .json({ error: "Invalid summary length. Use short, medium, or long." });
    }

    console.log(`Generating ${length} summary for: ${originalName}`);
    console.log(`Text length: ${text.length} characters`);
    const startTime = Date.now();

    let summaryText;
    let usedFallback = false;

    try {
      summaryText = await geminiService.generateSummarySimple(text, length);
    } catch (error) {
      // Check if it's a temporary service issue
      if (
        error.message.includes("unavailable") ||
        error.message.includes("overload")
      ) {
        console.log("AI service unavailable, using fallback summary");
        summaryText = geminiService.generateFallbackSummary(text, length);
        usedFallback = true;
      } else {
        throw error;
      }
    }

    const processingTime = Date.now() - startTime;

    const paragraphCount = (summaryText.match(/\n\s*\n/g) || []).length + 1;
    console.log(
      `✓ Summary completed: ${paragraphCount} paragraphs in ${processingTime}ms`
    );

    // Save to database
    const summaryRecord = new Summary({
      filename,
      originalName,
      fileType,
      extractedText:
        text.substring(0, 3000) + (text.length > 3000 ? "..." : ""),
      summary: summaryText,
      summaryLength: length,
      aiProvider: usedFallback ? "fallback" : "gemini",
      processingTime,
      fileSize: req.body.fileSize || 0,
      usedFallback: usedFallback,
    });

    await summaryRecord.save();

    const response = {
      success: true,
      summary: summaryText,
      summaryLength: length,
      aiProvider: usedFallback ? "fallback" : "gemini",
      processingTime,
      createdAt: summaryRecord.createdAt,
      id: summaryRecord._id,
      originalName,
      fileType,
      paragraphCount: paragraphCount,
    };

    if (usedFallback) {
      response.notice =
        "AI service was temporarily unavailable. This is a basic extraction - for better results, try again in a few minutes.";
      response.retrySuggested = true;
    }

    res.json(response);
  } catch (error) {
    console.error("Summary generation error:", error.message);

    // User-friendly error messages
    let statusCode = 500;
    let userMessage = error.message;
    let retrySuggested = true;

    if (
      error.message.includes("API key") ||
      error.message.includes("invalid")
    ) {
      statusCode = 500;
      userMessage = "Service configuration error. Please contact support.";
      retrySuggested = false;
    } else if (error.message.includes("quota")) {
      statusCode = 429;
      userMessage =
        "API quota exceeded. This is common with free tier limits. Please try again tomorrow or upgrade your plan.";
      retrySuggested = false;
    } else if (error.message.includes("unavailable")) {
      statusCode = 503;
      userMessage =
        "AI service is temporarily overloaded. This is common during peak hours. Please try again in 1-2 minutes.";
      retrySuggested = true;
    }

    res.status(statusCode).json({
      error: userMessage,
      retrySuggested: retrySuggested,
      details:
        "This is usually a temporary issue with the free Gemini API tier.",
    });
  }
};

module.exports = { generateSummary };
