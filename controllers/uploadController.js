const fs = require("fs").promises;
const { parsePDF } = require("../utils/pdfParser");
const { extractTextFromPDF } = require("../utils/pdfTextExtract");
const { extractTextFromImage } = require("../utils/ocr");

// Add this validation function at the top
const validateExtractedText = (text, originalName) => {
  if (!text || text.trim().length < 50) {
    return {
      isValid: false,
      message: "Insufficient text extracted. This appears to be a scanned PDF.",
    };
  }

  // Count meaningful words (at least 3 letters)
  const words = text
    .split(/\s+/)
    .filter((word) => word.length >= 3 && /[a-zA-Z]/.test(word));

  if (words.length < 10) {
    return {
      isValid: false,
      message: `Only ${words.length} meaningful words found. Document may be image-based.`,
    };
  }

  return { isValid: true };
};

const extractTextFromDocument = async (filePath, fileType, originalName) => {
  const startTime = Date.now();

  try {
    let extractedText = "";
    let additionalInfo = {};
    let extractionMethod = "direct";

    if (fileType === "pdf") {
      let pdfResult;

      // Try primary PDF parsing first
      try {
        console.log("Attempting primary PDF extraction...");
        pdfResult = await parsePDF(filePath);
        extractionMethod = "pdf_parse";
      } catch (primaryError) {
        console.log("Primary PDF extraction failed, trying alternative...");

        // Try alternative PDF extraction
        try {
          pdfResult = await extractTextFromPDF(filePath);
          extractionMethod = "pdf_alternative";
        } catch (alternativeError) {
          console.log("All PDF extraction methods failed");
          throw new Error("All PDF text extraction methods failed");
        }
      }

      extractedText = pdfResult.text;

      console.log("PDF Extraction Results:");
      console.log(`- Method: ${extractionMethod}`);
      console.log(`- Pages: ${pdfResult.pages}`);
      console.log(`- Text Length: ${pdfResult.textLength} characters`);
      console.log(`- Word Count: ${pdfResult.wordCount} words`);
      console.log(`- Success: ${pdfResult.success}`);

      // Log sample of extracted text for debugging
      if (extractedText && extractedText.length > 0) {
        console.log("Extracted text sample:", extractedText.substring(0, 300));
      }

      additionalInfo = {
        pages: pdfResult.pages,
        extractionMethod: extractionMethod,
        textLength: pdfResult.textLength,
        wordCount: pdfResult.wordCount,
        success: pdfResult.success,
      };

      // Add validation here - FIXED
      const validation = validateExtractedText(extractedText, originalName);
      if (!validation.isValid) {
        console.log("Text validation failed:", validation.message);

        // Enhance the text with guidance
        extractedText = `${extractedText}

Document: ${originalName}
Pages: ${pdfResult.pages}
Extracted Characters: ${pdfResult.textLength}
Meaningful Words: ${validation.message.split(" ")[1]}

Note: This appears to be a scanned PDF or contains minimal text. For better results:
• Convert scanned PDFs to JPG/PNG images and upload those
• Ensure text-based PDFs have selectable text
• Check if the PDF is password protected`;
      }
    } else {
      // Image file - use OCR
      extractionMethod = "ocr";
      try {
        console.log("Starting OCR processing...");
        const ocrResult = await extractTextFromImage(filePath);
        extractedText = ocrResult.text;
        additionalInfo = {
          extractionMethod: "ocr",
          confidence: Math.round(ocrResult.confidence),
          textLength: extractedText.length,
          wordCount: extractedText.split(/\s+/).filter((w) => w.length > 0)
            .length,
        };
        console.log(
          `OCR completed with ${additionalInfo.confidence}% confidence`
        );

        // Validate OCR results
        const validation = validateExtractedText(extractedText, originalName);
        if (!validation.isValid) {
          console.log("OCR text validation failed:", validation.message);
        }
      } catch (ocrError) {
        throw new Error(`OCR processing failed: ${ocrError.message}`);
      }
    }

    const processingTime = Date.now() - startTime;

    // Final validation - FIXED (using the actual extractedText variable)
    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error(
        "Unable to extract sufficient text from the document.\n\n" +
          "For PDF files, this usually indicates:\n" +
          "• Scanned PDF (image-based, no selectable text)\n" +
          "• Password protection\n" +
          "• Complex formatting\n\n" +
          "Solution: Convert scanned PDFs to images and upload those."
      );
    }

    return {
      extractedText,
      processingTime,
      extractionMethod,
      ...additionalInfo,
    };
  } catch (error) {
    throw new Error(`Text extraction failed: ${error.message}`);
  }
};

const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;
    const isPDF = req.file.mimetype === "application/pdf";
    const fileType = isPDF ? "pdf" : "image";

    console.log(`\n=== Processing ${fileType.toUpperCase()} ===`);
    console.log(`File: ${originalName}`);
    console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    const extractionResult = await extractTextFromDocument(
      filePath,
      fileType,
      originalName
    );

    // Clean up temporary file
    try {
      await fs.unlink(filePath);
      console.log("Temporary file cleaned up");
    } catch (cleanupError) {
      console.warn("Cleanup warning:", cleanupError.message);
    }

    console.log(`Extraction completed in ${extractionResult.processingTime}ms`);
    console.log(`Method: ${extractionResult.extractionMethod}`);
    console.log(
      `Results: ${extractionResult.textLength} chars, ${extractionResult.wordCount} words`
    );
    console.log("=== Processing complete ===\n");

    const response = {
      success: true,
      message: "Document processed successfully",
      extractedText: extractionResult.extractedText,
      filename: req.file.filename,
      originalName: originalName,
      fileType: fileType,
      fileSize: fileSize,
      processingTime: extractionResult.processingTime,
      extractionMethod: extractionResult.extractionMethod,
      textLength: extractionResult.textLength,
      wordCount: extractionResult.wordCount,
    };

    // Add optional fields
    if (extractionResult.pages) response.pages = extractionResult.pages;
    if (extractionResult.confidence)
      response.confidence = extractionResult.confidence;
    if (extractionResult.error) response.warning = extractionResult.error;

    res.json(response);
  } catch (error) {
    // Clean up on error
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.warn("Error cleanup failed:", cleanupError.message);
      }
    }

    console.error("Upload error:", error.message);
    next(error);
  }
};

module.exports = { uploadDocument };
