const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs").promises;

// Enhanced image preprocessing for better OCR results
const preprocessImage = async (imagePath) => {
  try {
    const processedImage = await sharp(imagePath)
      .grayscale() // Convert to grayscale
      .normalize({ lower: 5, upper: 95 }) // Enhance contrast
      .sharpen({ sigma: 1.5 }) // Sharpen image
      .median(2) // Noise reduction
      .toBuffer();

    return processedImage;
  } catch (error) {
    console.warn(
      "Image preprocessing failed, using original image:",
      error.message
    );
    return await fs.readFile(imagePath);
  }
};

const extractTextFromImage = async (filePath) => {
  try {
    console.log("Starting OCR processing for:", filePath);

    const processedImage = await preprocessImage(filePath);

    const { data } = await Tesseract.recognize(
      processedImage,
      "eng", // English language
      {
        logger: (progress) => {
          if (progress.status === "recognizing text") {
            console.log(
              `OCR Progress: ${Math.round(progress.progress * 100)}%`
            );
          }
        },
        // Enhanced OCR configuration
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:-()[]{}@#$%^&*+=/\\\"'",
        preserve_interword_spaces: "1",
      }
    );

    console.log(
      `OCR completed. Confidence: ${data.confidence}, Text length: ${data.text.length}`
    );

    return {
      text: data.text,
      confidence: data.confidence,
      words: data.words?.length || 0,
    };
  } catch (error) {
    console.error("OCR processing error:", error);
    throw new Error(`OCR processing failed: ${error.message}`);
  }
};

module.exports = {
  extractTextFromImage,
  preprocessImage,
};
