const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validatePaperId } = require('../middleware/validation');
const { run, get, all } = require('../db');
const { searchReferences, calculateQualityScore } = require('../services/referenceService');

router.post('/search', async (req, res) => {
  try {
    const { query, paperId, maxResults = 10 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const references = await searchReferences(query, Math.min(maxResults, 20));

    const enriched = references.map(ref => {
      const quality = calculateQualityScore(ref);
      return {
        ...ref,
        id: uuidv4(),
        qualityScore: quality.score,
        qualityExplanation: quality.explanation,
        status: 'suggested'
      };
    });

    if (paperId) {
      for (const ref of enriched) {
        await run(
          `INSERT INTO references_table (id, paper_id, title, authors, year, journal, doi, url, abstract, citation_count, source, quality_score, quality_explanation, verified, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ref.id, paperId, ref.title, JSON.stringify(ref.authors),
            ref.year, ref.journal, ref.doi, ref.url, ref.abstract,
            ref.citationCount, ref.source, ref.qualityScore,
            ref.qualityExplanation, ref.verified ? 1 : 0, 'suggested'
          ]
        );
      }
    }

    res.json({
      query,
      count: enriched.length,
      references: enriched
    });
  } catch (err) {
    console.error('Reference search error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/paper/:paperId', validatePaperId, async (req, res) => {
  try {
    const refs = await all(
      'SELECT * FROM references_table WHERE paper_id = ? ORDER BY quality_score DESC',
      [req.params.paperId]
    );

    const parsed = refs.map(ref => ({
      ...ref,
      authors: JSON.parse(ref.authors || '[]'),
      verified: ref.verified === 1
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:refId/accept', async (req, res) => {
  try {
    await run(
      "UPDATE references_table SET status = 'accepted' WHERE id = ?",
      [req.params.refId]
    );
    res.json({ message: 'Reference accepted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:refId/reject', async (req, res) => {
  try {
    await run(
      "UPDATE references_table SET status = 'rejected' WHERE id = ?",
      [req.params.refId]
    );
    res.json({ message: 'Reference rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:refId', async (req, res) => {
  try {
    const { title, authors, year, journal, doi } = req.body;
    await run(
      `UPDATE references_table SET title = COALESCE(?, title), authors = COALESCE(?, authors), year = COALESCE(?, year), journal = COALESCE(?, journal), doi = COALESCE(?, doi) WHERE id = ?`,
      [title, authors ? JSON.stringify(authors) : null, year, journal, doi, req.params.refId]
    );
    res.json({ message: 'Reference updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:refId', async (req, res) => {
  try {
    await run('DELETE FROM references_table WHERE id = ?', [req.params.refId]);
    res.json({ message: 'Reference deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auto-source/:paperId', validatePaperId, async (req, res) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const keywords = JSON.parse(paper.extracted_keywords || '[]');
    const topics = JSON.parse(paper.extracted_topics || '[]');

    const searchTerms = [];
    if (topics.length > 0) {
      topics.slice(0, 3).forEach(t => {
        searchTerms.push(typeof t === 'string' ? t : t.topic);
      });
    }
    if (keywords.length > 0) {
      const keywordGroups = [];
      for (let i = 0; i < keywords.length; i += 3) {
        keywordGroups.push(keywords.slice(i, i + 3).join(' '));
      }
      searchTerms.push(...keywordGroups.slice(0, 2));
    }

    if (searchTerms.length === 0) {
      searchTerms.push(paper.title || '');
    }

    const allRefs = [];
    for (const term of searchTerms.slice(0, 4)) {
      const refs = await searchReferences(term, 5);
      allRefs.push(...refs);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const seen = new Set();
    const unique = allRefs.filter(ref => {
      const key = ref.doi || ref.title.toLowerCase().substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const enriched = [];
    for (const ref of unique.slice(0, 15)) {
      const quality = calculateQualityScore(ref);
      const refId = uuidv4();

      await run(
        `INSERT OR IGNORE INTO references_table (id, paper_id, title, authors, year, journal, doi, url, abstract, citation_count, source, quality_score, quality_explanation, verified, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          refId, req.params.paperId, ref.title, JSON.stringify(ref.authors),
          ref.year, ref.journal, ref.doi, ref.url, ref.abstract,
          ref.citationCount, ref.source, quality.score,
          quality.explanation, 1, 'suggested'
        ]
      );

      enriched.push({
        ...ref,
        id: refId,
        qualityScore: quality.score,
        qualityExplanation: quality.explanation
      });
    }

    res.json({
      paperId: req.params.paperId,
      searchTermsUsed: searchTerms,
      count: enriched.length,
      references: enriched
    });
  } catch (err) {
    console.error('Auto-source error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;