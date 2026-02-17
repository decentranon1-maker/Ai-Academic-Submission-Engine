const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validatePaperId } = require('../middleware/validation');
const { run, get } = require('../db');
const { checkSimilarity } = require('../services/similarityService');

router.post('/:paperId', validatePaperId, async (req, res) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    if (!paper.content || paper.content.length < 100) {
      return res.status(400).json({ error: 'Paper content is too short for similarity analysis' });
    }

    const results = await checkSimilarity(paper.content);
    const reportId = uuidv4();

    await run(
      `INSERT INTO similarity_reports (id, paper_id, originality_score, similar_sections, total_checked, flagged_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reportId,
        req.params.paperId,
        results.originalityScore,
        JSON.stringify(results.similarSections),
        results.totalChecked,
        results.flaggedCount,
        'completed'
      ]
    );

    res.json({
      id: reportId,
      paperId: req.params.paperId,
      originalityScore: results.originalityScore,
      totalChecked: results.totalChecked,
      flaggedCount: results.flaggedCount,
      similarSections: results.similarSections,
      disclaimer: 'This is a similarity estimation based on public academic metadata. It is not a definitive plagiarism report. Results are indicative and should be used as guidance only.'
    });
  } catch (err) {
    console.error('Similarity check error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:paperId', validatePaperId, async (req, res) => {
  try {
    const report = await get(
      'SELECT * FROM similarity_reports WHERE paper_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.paperId]
    );

    if (!report) {
      return res.status(404).json({ error: 'No similarity report found for this paper' });
    }

    report.similar_sections = JSON.parse(report.similar_sections || '[]');

    res.json({
      ...report,
      disclaimer: 'This is a similarity estimation based on public academic metadata.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;