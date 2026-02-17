const fs = require('fs');
const path = require('path');

async function parseDocument(filePath, fileType) {
  try {
    if (fileType === 'application/pdf') {
      return await parsePDF(filePath);
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType === 'application/msword'
    ) {
      return await parseWord(filePath);
    }
    throw new Error('Unsupported file type');
  } catch (err) {
    console.error('Document parsing error:', err.message);
    return {
      content: '',
      pageCount: 0,
      error: err.message
    };
  }
}

async function parsePDF(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return {
      content: data.text || '',
      pageCount: data.numpages || 0,
      metadata: data.info || {}
    };
  } catch (err) {
    console.error('PDF parse error:', err.message);
    return { content: '', pageCount: 0, error: err.message };
  }
}

async function parseWord(filePath) {
  try {
    const mammoth = require('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    const estimatedPages = Math.max(1, Math.ceil(text.length / 3000));
    return {
      content: text,
      pageCount: estimatedPages,
      metadata: {}
    };
  } catch (err) {
    console.error('Word parse error:', err.message);
    return { content: '', pageCount: 0, error: err.message };
  }
}

function extractParagraphs(content) {
  if (!content) return [];
  return content
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 30);
}

function extractSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

module.exports = { parseDocument, extractParagraphs, extractSentences };