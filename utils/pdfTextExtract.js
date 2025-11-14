const fs = require("fs").promises;

const extractTextFromPDF = async (filePath) => {
  try {
    console.log("Using enhanced alternative PDF text extraction...");
    const dataBuffer = await fs.readFile(filePath);

    // Try multiple encodings
    const extractions = [];

    // UTF-8 extraction
    try {
      const pdfTextUTF8 = dataBuffer.toString("utf8");
      const textUTF8 = extractTextFromPDFContent(pdfTextUTF8);
      if (textUTF8 && textUTF8.length > 50) {
        extractions.push({
          text: textUTF8,
          encoding: "utf8",
          length: textUTF8.length,
        });
      }
    } catch (e) {}

    // Latin-1 extraction
    try {
      const pdfTextLatin = dataBuffer.toString("latin1");
      const textLatin = extractTextFromPDFContent(pdfTextLatin);
      if (textLatin && textLatin.length > 50) {
        extractions.push({
          text: textLatin,
          encoding: "latin1",
          length: textLatin.length,
        });
      }
    } catch (e) {}

    // Binary extraction for some PDFs
    try {
      const pdfTextBinary = dataBuffer.toString("binary");
      const textBinary = extractTextFromPDFContent(pdfTextBinary);
      if (textBinary && textBinary.length > 50) {
        extractions.push({
          text: textBinary,
          encoding: "binary",
          length: textBinary.length,
        });
      }
    } catch (e) {}

    // Choose the best extraction
    let bestExtraction = extractions.sort((a, b) => b.length - a.length)[0];

    if (!bestExtraction) {
      // If no good extraction, try raw text extraction
      const rawText = extractRawText(dataBuffer);
      bestExtraction = {
        text: rawText,
        encoding: "raw",
        length: rawText.length,
      };
    }

    const pages = estimatePages(bestExtraction.text);
    const wordCount = countMeaningfulWords(bestExtraction.text);
    const textLength = bestExtraction.text.length;

    console.log(
      `Alternative extraction (${bestExtraction.encoding}): ${textLength} chars, ${wordCount} meaningful words`
    );

    return {
      text: bestExtraction.text,
      pages: pages,
      textLength: textLength,
      wordCount: wordCount,
      success: textLength > 0,
      encoding: bestExtraction.encoding,
    };
  } catch (error) {
    console.error("Enhanced alternative PDF extraction failed:", error);
    throw error;
  }
};

const extractTextFromPDFContent = (pdfContent) => {
  let extractedText = "";

  // Method 1: Text between parentheses (most common)
  const parenMatches = pdfContent.match(/\((.*?)\)/g) || [];
  for (const match of parenMatches) {
    let text = match.slice(1, -1);
    text = text.replace(/\\(.)/g, "$1"); // Remove escape sequences
    extractedText += text + " ";
  }

  // Method 2: Text between angle brackets (TJ/Tj operators)
  const bracketMatches = pdfContent.match(/<([^>]+)>/g) || [];
  for (const match of bracketMatches) {
    let text = match.slice(1, -1);
    text = text.replace(/\\(.)/g, "$1");
    extractedText += text + " ";
  }

  // Method 3: Look for text streams
  const streamMatches = pdfContent.match(/stream[\s\S]*?endstream/gi) || [];
  for (const stream of streamMatches) {
    // Extract text between BT and ET (text blocks)
    const textBlocks = stream.match(/BT[\s\S]*?ET/gi) || [];
    for (const block of textBlocks) {
      // Extract text content from the block
      const blockText = block
        .replace(/BT|ET/g, "")
        .replace(/\(([^)]+)\)/g, "$1");
      extractedText += blockText + " ";
    }
  }

  return cleanExtractedText(extractedText);
};

const extractRawText = (buffer) => {
  // Last resort: extract any readable text sequences
  const text = buffer.toString("latin1");
  const words = text.match(/[a-zA-Z]{3,}/g) || [];
  return words.join(" ");
};

const estimatePages = (text) => {
  const avgWordsPerPage = 300;
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / avgWordsPerPage));
};

const cleanExtractedText = (text) => {
  if (!text) return "";

  return text
    .replace(/[^\w\s.,!?;:()@#$%^&*+=/\\"'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const countMeaningfulWords = (text) => {
  if (!text) return 0;

  return text
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 && /[a-zA-Z]/.test(word) && !/^[0-9\W]+$/.test(word)
    ).length;
};

module.exports = { extractTextFromPDF, countMeaningfulWords };
