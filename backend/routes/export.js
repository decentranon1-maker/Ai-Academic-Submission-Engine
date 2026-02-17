const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validatePaperId } = require('../middleware/validation');
const { get, all, run } = require('../db');
const { generatePDF } = require('../services/exportService');
const { generateBibliography, formatInTextCitation } = require('../services/citationFormatter');

router.post('/:paperId/pdf', validatePaperId, async (req, res) => {
  try {
    const { style } = req.body;
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const refs = await all(
      "SELECT * FROM references_table WHERE paper_id = ? AND status = 'accepted' ORDER BY quality_score DESC",
      [req.params.paperId]
    );

    const exportStyle = style || paper.journal_format || 'APA';
    const pdfBuffer = await generatePDF(paper, refs, exportStyle);

    await run(
      'INSERT INTO export_history (id, paper_id, format, journal_style) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.paperId, 'pdf', exportStyle]
    );

    const filename = `${(paper.title || 'paper').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${exportStyle}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:paperId/bibliography', validatePaperId, async (req, res) => {
  try {
    const { style = 'APA' } = req.query;
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const refs = await all(
      "SELECT * FROM references_table WHERE paper_id = ? AND status = 'accepted' ORDER BY quality_score DESC",
      [req.params.paperId]
    );

    const parsedRefs = refs.map(ref => ({
      ...ref,
      authors: JSON.parse(ref.authors || '[]')
    }));

    const bibliography = generateBibliography(parsedRefs, style || paper.journal_format);

    const inTextCitations = parsedRefs.map((ref, idx) => ({
      referenceId: ref.id,
      title: ref.title,
      inText: formatInTextCitation(ref, style || paper.journal_format, idx + 1)
    }));

    res.json({
      style: style || paper.journal_format,
      referenceCount: parsedRefs.length,
      bibliography,
      inTextCitations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:paperId/preview', validatePaperId, async (req, res) => {
  try {
    const { style } = req.query;
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const refs = await all(
      "SELECT * FROM references_table WHERE paper_id = ? AND status = 'accepted' ORDER BY quality_score DESC",
      [req.params.paperId]
    );

    const parsedRefs = refs.map(ref => ({
      ...ref,
      authors: JSON.parse(ref.authors || '[]')
    }));

    const exportStyle = style || paper.journal_format || 'APA';
    const bibliography = generateBibliography(parsedRefs, exportStyle);

    res.json({
      title: paper.title,
      style: exportStyle,
      content: paper.content,
      bibliography,
      referenceCount: parsedRefs.length,
      wordCount: (paper.content || '').split(/\s+/).length,
      pageCount: paper.page_count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;