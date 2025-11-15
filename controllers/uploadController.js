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

// New function to parse PDF from buffer
const parsePDFFromBuffer = async (fileBuffer, originalName) => {
  try {
    console.log("Parsing PDF from buffer...");

    // Try primary PDF parsing first
    try {
      console.log("Attempting primary PDF extraction from buffer...");
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(fileBuffer);

      let text = pdfData.text;
      const pages = pdfData.numpages;

      console.log(`PDF parsed successfully: ${pages} pages`);

      // Clean the text
      text = text
        .replace(/[•\-\*]\s*/g, "")
        .replace(/[^\w\s.,!?;:()@#$%^&*+=/\\"'-]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const wordCount = text
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 2 && /[a-zA-Z]/.test(word) && !/^[0-9\W]+$/.test(word)
        ).length;

      const textLength = text.length;

      console.log(
        `Extraction results: ${textLength} characters, ${wordCount} meaningful words`
      );

      // Check if we got meaningful text
      if (wordCount < 10) {
        console.log(
          "Primary extraction got minimal text, trying alternative..."
        );
        throw new Error("Minimal text extracted");
      }

      return {
        text: text,
        pages: pages,
        textLength: textLength,
        wordCount: wordCount,
        success: true,
        method: "pdf-parse",
      };
    } catch (primaryError) {
      console.log("Primary PDF parsing failed, trying alternative methods...");

      // For serverless, we'll use a simplified alternative approach
      // Convert buffer to string and try to extract text
      const bufferString = fileBuffer.toString("utf8");
      const alternativeResult = await extractTextFromPDFBuffer(bufferString);

      return {
        text: alternativeResult.text,
        pages: alternativeResult.pages,
        textLength: alternativeResult.textLength,
        wordCount: alternativeResult.wordCount,
        success: alternativeResult.textLength > 0,
        method: "alternative",
      };
    }
  } catch (error) {
    console.error("PDF buffer parsing failed:", error);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
};

// Alternative PDF extraction from buffer
const extractTextFromPDFBuffer = async (pdfContent) => {
  let extractedText = "";

  // Method 1: Text between parentheses (most common)
  const parenMatches = pdfContent.match(/\((.*?)\)/g) || [];
  for (const match of parenMatches) {
    let text = match.slice(1, -1);
    text = text.replace(/\\(.)/g, "$1");
    extractedText += text + " ";
  }

  // Method 2: Text between angle brackets (TJ/Tj operators)
  const bracketMatches = pdfContent.match(/<([^>]+)>/g) || [];
  for (const match of bracketMatches) {
    let text = match.slice(1, -1);
    text = text.replace(/\\(.)/g, "$1");
    extractedText += text + " ";
  }

  // Clean extracted text
  extractedText = extractedText
    .replace(/[^\w\s.,!?;:()@#$%^&*+=/\\"'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const pages = Math.max(1, Math.ceil(extractedText.split(/\s+/).length / 300));
  const wordCount = extractedText
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 && /[a-zA-Z]/.test(word) && !/^[0-9\W]+$/.test(word)
    ).length;

  return {
    text: extractedText,
    pages: pages,
    textLength: extractedText.length,
    wordCount: wordCount,
  };
};

// OCR from buffer (simplified for serverless)
const extractTextFromImageBuffer = async (imageBuffer, originalName) => {
  // For serverless environments, OCR is challenging
  // You might want to use a cloud-based OCR service instead
  throw new Error(
    "Image OCR processing is not available in this environment. " +
      "Please use PDF files with selectable text or consider using a cloud OCR service."
  );
};

const extractTextFromDocument = async (fileBuffer, fileType, originalName) => {
  const startTime = Date.now();

  try {
    let extractedText = "";
    let additionalInfo = {};
    let extractionMethod = "direct";

    if (fileType === "pdf") {
      let pdfResult;

      try {
        console.log("Attempting PDF extraction from buffer...");
        pdfResult = await parsePDFFromBuffer(fileBuffer, originalName);
        extractionMethod = pdfResult.method;
      } catch (pdfError) {
        console.log("PDF extraction failed:", pdfError.message);
        throw new Error(`PDF processing failed: ${pdfError.message}`);
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

      // Add validation
      const validation = validateExtractedText(extractedText, originalName);
      if (!validation.isValid) {
        console.log("Text validation failed:", validation.message);

        // Enhance the text with guidance
        extractedText = `${extractedText}

Document: ${originalName}
Pages: ${pdfResult.pages}
Extracted Characters: ${pdfResult.textLength}
Meaningful Words: ${pdfResult.wordCount}

Note: ${validation.message}

For better results:
• Ensure PDFs have selectable text (not scanned images)
• Check if the PDF is password protected
• Try a different PDF file`;
      }
    } else {
      // Image file - use OCR
      extractionMethod = "ocr";
      try {
        console.log("Starting OCR processing...");
        const ocrResult = await extractTextFromImageBuffer(
          fileBuffer,
          originalName
        );
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

    // Final validation
    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error(
        "Unable to extract sufficient text from the document.\n\n" +
          "For PDF files, this usually indicates:\n" +
          "• Scanned PDF (image-based, no selectable text)\n" +
          "• Password protection\n" +
          "• Complex formatting\n\n" +
          "Solution: Use PDF files with selectable text."
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

    const fileBuffer = req.file.buffer; // Use buffer instead of file path
    const originalName = req.file.originalname;
    const fileSize = req.file.size;
    const isPDF = req.file.mimetype === "application/pdf";
    const fileType = isPDF ? "pdf" : "image";

    console.log(`\n=== Processing ${fileType.toUpperCase()} ===`);
    console.log(`File: ${originalName}`);
    console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Processing from memory buffer: ${fileBuffer.length} bytes`);

    const extractionResult = await extractTextFromDocument(
      fileBuffer,
      fileType,
      originalName
    );

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
    if (extractionResult.success !== undefined)
      response.success = extractionResult.success;

    res.json(response);
  } catch (error) {
    console.error("Upload error:", error.message);

    // Provide more specific error messages
    let userMessage = error.message;
    let statusCode = 500;

    if (
      error.message.includes("scanned PDF") ||
      error.message.includes("minimal text")
    ) {
      statusCode = 400;
      userMessage =
        "The document appears to be a scanned PDF or contains minimal text. Please upload a PDF with selectable text.";
    } else if (error.message.includes("OCR processing")) {
      statusCode = 400;
      userMessage =
        "Image processing is not available. Please upload PDF files only.";
    } else if (error.message.includes("password protected")) {
      statusCode = 400;
      userMessage =
        "The PDF appears to be password protected. Please upload an unprotected PDF.";
    }

    res.status(statusCode).json({
      error: userMessage,
      details:
        "This is a serverless environment with limited file processing capabilities.",
    });
  }
};

module.exports = { uploadDocument };
