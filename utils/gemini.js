const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Try gemini-2.5-flash first, then fallback to other models
    this.availableModels = [
      "gemini-2.0-flash-exp", // Latest experimental version
      "gemini-2.0-flash", // Stable 2.0 flash
      "gemini-1.5-flash", // Reliable 1.5 flash
      "gemini-1.5-flash-8b", // Lightweight version
      "gemini-1.5-pro", // Pro version as fallback
      "gemini-pro", // Original pro
    ];

    this.currentModelIndex = 0;
    this.model = null;
    this.initializeModel();

    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.isServiceAvailable = true;
  }

  initializeModel() {
    if (this.currentModelIndex >= this.availableModels.length) {
      return false;
    }

    const modelName = this.availableModels[this.currentModelIndex];
    console.log(`Initializing Gemini model: ${modelName}`);

    try {
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192, // Increased for longer summaries
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      });
      return true;
    } catch (error) {
      console.error(`Failed to initialize model ${modelName}:`, error.message);
      return false;
    }
  }

  async switchToNextModel() {
    this.currentModelIndex++;
    if (this.currentModelIndex < this.availableModels.length) {
      console.log(
        `Switching to model: ${this.availableModels[this.currentModelIndex]}`
      );
      return this.initializeModel();
    }
    return false;
  }

  async testModel() {
    try {
      // Quick test with timeout
      const testPromise = this.model.generateContent("Respond with 'OK' only.");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      );

      const result = await Promise.race([testPromise, timeoutPromise]);
      const response = await result.response;
      const text = response.text().toLowerCase().trim();
      return text.includes("ok");
    } catch (error) {
      console.log(`Model test failed: ${error.message}`);
      return false;
    }
  }

  async generateSummary(text, length = "medium") {
    let lastError;

    // If service was marked unavailable, do a quick check
    if (!this.isServiceAvailable) {
      const quickCheck = await this.quickServiceCheck();
      if (!quickCheck) {
        throw new Error(
          "AI service is currently unavailable. Please try again in a few minutes."
        );
      }
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (!text || text.trim().length === 0) {
          throw new Error("No text content to summarize");
        }

        const lengthConstraints = {
          short: "3-4 paragraphs",
          medium: "5-6 paragraphs",
          long: "7-9 paragraphs",
        };

        const cleanText = this.cleanInputText(text, length);

        console.log(
          `Attempt ${attempt} with ${
            this.availableModels[this.currentModelIndex]
          }: ${cleanText.length} chars for ${length} summary`
        );

        const prompt = this.buildSummaryPrompt(
          cleanText,
          length,
          lengthConstraints
        );

        console.log("Sending request to Gemini API...");
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        console.log(`✓ Summary generated: ${summary.length} characters`);

        const paragraphCount = (summary.match(/\n\s*\n/g) || []).length + 1;
        console.log(`✓ Paragraphs: ${paragraphCount}`);

        // Mark service as available
        this.isServiceAvailable = true;
        return summary;
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt} failed:`, error.message);

        // Handle different error types
        if (this.shouldSwitchModel(error)) {
          console.log("Model issue detected, switching to next model...");
          const hasNextModel = await this.switchToNextModel();
          if (!hasNextModel) {
            this.isServiceAvailable = false;
            throw new Error(
              "All AI models are currently unavailable. This is usually temporary - please try again in 5-10 minutes."
            );
          }
          // Reset attempt counter when switching models
          attempt = 0;
          await this.delay(1500);
          continue;
        }

        if (attempt < this.maxRetries) {
          const delayTime = this.retryDelay * attempt;
          console.log(`Retrying in ${delayTime / 1000} seconds...`);
          await this.delay(delayTime);
        }
      }
    }

    this.isServiceAvailable = false;
    throw this.handleGeminiError(lastError);
  }

  buildSummaryPrompt(text, length, lengthConstraints) {
    const lengthDesc = lengthConstraints[length] || lengthConstraints.medium;

    return `Please provide a comprehensive and well-structured summary of the following document text.

SUMMARY REQUIREMENTS:
- Length: ${lengthDesc}
- Format: Multiple well-structured paragraphs
- Content: Cover all main ideas, key points, and important details
- Style: Clear, concise, and organized
- Focus: Essential information that captures the document's core content

DOCUMENT TEXT:
"${text}"

Please create a thorough summary that would help someone understand the document's main content without reading the entire text. Organize the summary into logical paragraphs that flow naturally.`;
  }

  shouldSwitchModel(error) {
    const errorMsg = error.message.toLowerCase();
    return (
      errorMsg.includes("404") ||
      errorMsg.includes("not found") ||
      errorMsg.includes("model") ||
      errorMsg.includes("unavailable") ||
      errorMsg.includes("overload") ||
      errorMsg.includes("not supported") ||
      errorMsg.includes("invalid model")
    );
  }

  async quickServiceCheck() {
    try {
      // Quick check with shorter timeout
      const testPromise = this.model.generateContent("Say 'ready'");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      );

      const result = await Promise.race([testPromise, timeoutPromise]);
      if (result) {
        const response = await result.response;
        this.isServiceAvailable = true;
        return true;
      }
    } catch (error) {
      console.log("Quick service check failed:", error.message);
    }
    return false;
  }

  handleGeminiError(error) {
    const errorMsg = error.message.toLowerCase();

    if (
      errorMsg.includes("503") ||
      errorMsg.includes("overload") ||
      errorMsg.includes("unavailable")
    ) {
      return new Error(
        "AI service is temporarily overloaded. This is common with free tier usage. Please wait 1-2 minutes and try again."
      );
    } else if (errorMsg.includes("quota") || errorMsg.includes("exceeded")) {
      return new Error(
        "API quota exceeded. You may have reached your free tier limits. Please try again later or check your Google Cloud Console."
      );
    } else if (
      errorMsg.includes("api key") ||
      errorMsg.includes("invalid") ||
      errorMsg.includes("auth")
    ) {
      return new Error(
        "Invalid API configuration. Please check your GEMINI_API_KEY environment variable."
      );
    } else if (errorMsg.includes("safety") || errorMsg.includes("content")) {
      return new Error(
        "Content was blocked for safety reasons. Please try a different document."
      );
    } else if (errorMsg.includes("timeout")) {
      return new Error(
        "AI service is responding slowly. Please try again in a moment."
      );
    } else if (errorMsg.includes("model") || errorMsg.includes("not found")) {
      return new Error(
        "The AI model is not available in your region or API version. Trying alternative models..."
      );
    } else {
      return new Error(`Summary generation failed: ${error.message}`);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanInputText(text, length = "medium") {
    const lengthLimits = {
      short: 8000,
      medium: 15000,
      long: 25000,
    };

    const limit = lengthLimits[length] || 12000;

    // Clean and limit text
    return text
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .substring(0, limit)
      .trim();
  }

  // Simple direct summarization
  async generateSummarySimple(text, length = "medium") {
    try {
      const cleanText = this.cleanInputText(text, length);
      return await this.generateSummary(cleanText, length);
    } catch (error) {
      // If all else fails, provide a basic fallback
      if (
        error.message.includes("unavailable") ||
        error.message.includes("overload") ||
        error.message.includes("quota")
      ) {
        return this.generateFallbackSummary(text, length);
      }
      throw error;
    }
  }

  // Basic fallback summary when AI is unavailable
  generateFallbackSummary(text, length) {
    console.log("Using fallback summary method");

    // Extract meaningful sentences
    const sentences = text.split(/[.!?]+/).filter((s) => {
      const clean = s.trim();
      return clean.length > 20 && clean.split(/\s+/).length > 4;
    });

    // Determine how many sentences based on length
    const sentenceCount =
      length === "short" ? 8 : length === "medium" ? 12 : 18;
    const selectedSentences = sentences.slice(0, sentenceCount);

    // Group into paragraphs
    const sentencesPerParagraph =
      length === "short" ? 2 : length === "medium" ? 3 : 4;
    let paragraphs = [];

    for (let i = 0; i < selectedSentences.length; i += sentencesPerParagraph) {
      const paragraphSentences = selectedSentences.slice(
        i,
        i + sentencesPerParagraph
      );
      if (paragraphSentences.length > 0) {
        const paragraph =
          paragraphSentences.map((s) => s.trim()).join(". ") + ".";
        paragraphs.push(paragraph);
      }
    }

    const fallbackSummary = paragraphs.join("\n\n");

    return `Summary (AI Service Temporarily Unavailable - Basic Extraction):\n\n${fallbackSummary}\n\nNote: This is a basic text extraction. For an AI-generated summary with better understanding, please try again in a few minutes when the AI service is available.`;
  }

  // Method to get current model info
  getCurrentModel() {
    return this.availableModels[this.currentModelIndex];
  }

  // Method to get all available models
  getAvailableModels() {
    return this.availableModels;
  }
}

module.exports = new GeminiService();
