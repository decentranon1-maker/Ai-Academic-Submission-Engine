const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const upload = require('../middleware/upload');
const { validatePaperId } = require('../middleware/validation');
const { run, get, all } = require('../db');
const { parseDocument } = require('../services/documentParser');
const { extractKeywords, extractTopics, extractClaims, analyzeStructure } = require('../services/contentAnalyzer');

const MAX_PAGES = 100;

router.post('/upload', upload.single('paper'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const paperId = uuidv4();
    const { originalname, path: filePath, mimetype, size } = req.file;

    const parsed = await parseDocument(filePath, mimetype);

    if (parsed.pageCount > MAX_PAGES) {
      return res.status(400).json({
        error: `Document exceeds maximum page limit of ${MAX_PAGES} pages`
      });
    }

    const content = parsed.content || '';
    const keywords = extractKeywords(content);
    const topics = extractTopics(content);
    const claims = extractClaims(content);
    const structure = analyzeStructure(content);

    let title = originalname.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length > 0 && lines[0].length < 200) {
      title = lines[0];
    }

    await run(
      `INSERT INTO papers (id, title, original_filename, file_path, file_type, file_size, page_count, content, extracted_keywords, extracted_claims, extracted_topics, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paperId, title, originalname, filePath, mimetype, size,
        parsed.pageCount, content,
        JSON.stringify(keywords),
        JSON.stringify(claims),
        JSON.stringify(topics),
        'analyzed'
      ]
    );

    res.json({
      id: paperId,
      title,
      filename: originalname,
      fileType: mimetype,
      fileSize: size,
      pageCount: parsed.pageCount,
      keywords,
      topics,
      claims: claims.slice(0, 10),
      structure,
      status: 'analyzed'
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process document: ' + err.message });
  }
});

router.get('/:paperId', validatePaperId, async (req, res) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    paper.extracted_keywords = JSON.parse(paper.extracted_keywords || '[]');
    paper.extracted_claims = JSON.parse(paper.extracted_claims || '[]');
    paper.extracted_topics = JSON.parse(paper.extracted_topics || '[]');

    res.json(paper);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const papers = await all(
      'SELECT id, title, original_filename, file_type, file_size, page_count, status, journal_format, created_at FROM papers ORDER BY created_at DESC'
    );
    res.json(papers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:paperId', validatePaperId, async (req, res) => {
  try {
    await run('DELETE FROM papers WHERE id = ?', [req.params.paperId]);
    res.json({ message: 'Paper deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:paperId/format', validatePaperId, async (req, res) => {
  try {
    const { journal_format } = req.body;
    const validFormats = ['APA', 'IEEE', 'DeSci', 'Nature', 'Elsevier', 'Springer'];
    if (!validFormats.includes(journal_format)) {
      return res.status(400).json({ error: 'Invalid journal format', validFormats });
    }

    await run(
      'UPDATE papers SET journal_format = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [journal_format, req.params.paperId]
    );

    res.json({ message: 'Format updated', journal_format });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:paperId/content', validatePaperId, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const keywords = extractKeywords(content);
    const topics = extractTopics(content);
    const claims = extractClaims(content);

    await run(
      `UPDATE papers SET content = ?, extracted_keywords = ?, extracted_claims = ?, extracted_topics = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [content, JSON.stringify(keywords), JSON.stringify(claims), JSON.stringify(topics), req.params.paperId]
    );

    res.json({ message: 'Content updated', keywords, topics, claimCount: claims.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;