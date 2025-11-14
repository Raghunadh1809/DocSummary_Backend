const pdfParse = require("pdf-parse");
const fs = require("fs").promises;
const { extractTextFromPDF } = require("./pdfTextExtract");

const parsePDF = async (filePath) => {
  try {
    console.log("Reading PDF file...");
    const dataBuffer = await fs.readFile(filePath);

    console.log("Parsing PDF with pdf-parse...");

    const pdfData = await pdfParse(dataBuffer);
    let text = pdfData.text;
    const pages = pdfData.numpages;

    console.log(`PDF parsed successfully: ${pages} pages`);

    // Clean the text
    text = cleanText(text);

    const wordCount = countMeaningfulWords(text);
    const textLength = text.length;

    console.log(
      `Extraction results: ${textLength} characters, ${wordCount} meaningful words`
    );

    // Check if we got meaningful text
    if (wordCount < 10 || isMostlySpecialChars(text)) {
      console.log("Primary extraction got minimal text, trying alternative...");
      throw new Error("Minimal text extracted");
    }

    // Log sample of meaningful text
    if (textLength > 0) {
      const sample = getMeaningfulSample(text);
      console.log("Sample extracted text:", sample);
    }

    return {
      text: text,
      pages: pages,
      textLength: textLength,
      wordCount: wordCount,
      success: true,
      info: pdfData.info,
      method: "pdf-parse",
    };
  } catch (error) {
    console.log("Primary PDF parsing failed, trying alternative methods...");
    return await parsePDFWithFallback(filePath, error);
  }
};

const parsePDFWithFallback = async (filePath, originalError) => {
  try {
    // Try alternative PDF extraction
    console.log("Attempting alternative PDF extraction...");
    const alternativeResult = await extractTextFromPDF(filePath);

    // Clean and validate the alternative result
    alternativeResult.text = cleanText(alternativeResult.text);
    alternativeResult.wordCount = countMeaningfulWords(alternativeResult.text);
    alternativeResult.method = "alternative";

    console.log(
      `Alternative extraction: ${alternativeResult.textLength} chars, ${alternativeResult.wordCount} meaningful words`
    );

    // Check if alternative method got meaningful content
    if (
      alternativeResult.wordCount > 5 &&
      !isMostlySpecialChars(alternativeResult.text)
    ) {
      const sample = getMeaningfulSample(alternativeResult.text);
      console.log("Alternative sample:", sample);
      return alternativeResult;
    }

    // If still no meaningful text, try OCR as last resort
    console.log("Both methods failed, document may be scanned/image-based");
    throw new Error("No meaningful text could be extracted from PDF");
  } catch (fallbackError) {
    console.error("All PDF extraction methods failed:");
    console.error("- Primary error:", originalError.message);
    console.error("- Fallback error:", fallbackError.message);

    throw new Error(
      `PDF text extraction failed. This appears to be a scanned PDF or contains minimal text.\n\n` +
        `Solutions:\n` +
        `• Convert scanned PDFs to JPG/PNG images and upload those\n` +
        `• Ensure the PDF has selectable text\n` +
        `• Try a different PDF file`
    );
  }
};

const cleanText = (text) => {
  if (!text) return "";

  return text
    .replace(/[•\-\*]\s*/g, "") // Remove bullet points
    .replace(/[^\w\s.,!?;:()@#$%^&*+=/\\"'-]/g, " ") // Keep only readable chars
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
    .trim();
};

const countMeaningfulWords = (text) => {
  if (!text) return 0;

  return text.split(/\s+/).filter(
    (word) =>
      word.length > 2 && // At least 3 characters
      /[a-zA-Z]/.test(word) && // Contains letters
      !/^[0-9\W]+$/.test(word) // Not just numbers/special chars
  ).length;
};

const isMostlySpecialChars = (text) => {
  if (!text) return true;

  const meaningfulChars = text.replace(/[^\w\s]/g, "").length;
  const totalChars = text.replace(/\s/g, "").length;

  if (totalChars === 0) return true;

  return meaningfulChars / totalChars < 0.3; // Less than 30% meaningful chars
};

const getMeaningfulSample = (text, length = 200) => {
  if (!text) return "";

  // Find the first meaningful section
  const words = text.split(/\s+/);
  let meaningfulStart = 0;

  for (let i = 0; i < words.length; i++) {
    if (words[i].length > 3 && /[a-zA-Z]/.test(words[i])) {
      meaningfulStart = i;
      break;
    }
  }

  const sampleText = words
    .slice(meaningfulStart, meaningfulStart + 20)
    .join(" ");
  return (
    sampleText.substring(0, length) + (sampleText.length > length ? "..." : "")
  );
};

module.exports = { parsePDF };
