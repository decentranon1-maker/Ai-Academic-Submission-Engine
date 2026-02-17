const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validatePaperId } = require('../middleware/validation');
const { run, get, all } = require('../db');
const { extractKeywords, extractTopics, extractClaims, detectCitationSpots, analyzeStructure } = require('../services/contentAnalyzer');
const { searchReferences, calculateQualityScore } = require('../services/referenceService');

router.get('/:paperId', validatePaperId, async (req, res) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const content = paper.content || '';
    const keywords = extractKeywords(content);
    const topics = extractTopics(content);
    const claims = extractClaims(content);
    const structure = analyzeStructure(content);

    res.json({
      paperId: req.params.paperId,
      title: paper.title,
      keywords,
      topics,
      claims: claims.slice(0, 20),
      structure,
      wordCount: content.split(/\s+/).length,
      pageCount: paper.page_count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:paperId/citation-spots', validatePaperId, async (req, res) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const spots = detectCitationSpots(paper.content || '');

    for (const spot of spots) {
      const spotId = uuidv4();
      await run(
        `INSERT OR REPLACE INTO citation_spots (id, paper_id, paragraph_index, sentence, claim_text, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [spotId, req.params.paperId, spot.paragraphIndex, spot.sentence, spot.claimText, spot.reason, 'pending']
      );
      spot.id = spotId;
    }

    res.json({
      paperId: req.params.paperId,
      count: spots.length,
      spots
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:paperId/suggest-citations/:spotId', validatePaperId, async (req, res) => {
  try {
    const spot = await get('SELECT * FROM citation_spots WHERE id = ? AND paper_id = ?',
      [req.params.spotId, req.params.paperId]);

    if (!spot) {
      return res.status(404).json({ error: 'Citation spot not found' });
    }

    const searchQuery = spot.claim_text.substring(0, 150);
    const references = await searchReferences(searchQuery, 3);

    const suggestions = [];
    for (const ref of references) {
      const quality = calculateQualityScore(ref);
      const refId = uuidv4();
      const suggId = uuidv4();

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

      const explanation = `This reference is relevant because it discusses topics related to: "${searchQuery.substring(0, 80)}...". ${quality.explanation}`;

      await run(
        `INSERT INTO citation_suggestions (id, spot_id, reference_id, explanation, confidence, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [suggId, req.params.spotId, refId, explanation, quality.score / 100, 'pending']
      );

      suggestions.push({
        id: suggId,
        reference: {
          ...ref,
          id: refId,
          qualityScore: quality.score,
          qualityExplanation: quality.explanation
        },
        explanation,
        confidence: quality.score / 100,
        status: 'pending'
      });
    }

    res.json({
      spotId: req.params.spotId,
      claim: spot.claim_text,
      suggestions
    });
  } catch (err) {
    console.error('Citation suggestion error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/citation-suggestion/:suggId/:action', async (req, res) => {
  try {
    const { action } = req.params;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or reject' });
    }

    const status = action === 'accept' ? 'accepted' : 'rejected';
    await run('UPDATE citation_suggestions SET status = ? WHERE id = ?',
      [status, req.params.suggId]);

    if (action === 'accept') {
      const sugg = await get('SELECT reference_id FROM citation_suggestions WHERE id = ?',
        [req.params.suggId]);
      if (sugg) {
        await run("UPDATE references_table SET status = 'accepted' WHERE id = ?",
          [sugg.reference_id]);
      }
    }

    res.json({ message: `Citation suggestion ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:paperId/literature-review', validatePaperId, async (req, res) => {
  try {
    const refs = await all(
      "SELECT * FROM references_table WHERE paper_id = ? AND status = 'accepted' ORDER BY year DESC",
      [req.params.paperId]
    );

    if (refs.length === 0) {
      return res.status(400).json({
        error: 'No accepted references found. Accept some references first.'
      });
    }

    const parsedRefs = refs.map(ref => ({
      ...ref,
      authors: JSON.parse(ref.authors || '[]')
    }));

    const themes = {};
    parsedRefs.forEach(ref => {
      const words = (ref.title + ' ' + (ref.abstract || '')).toLowerCase().split(/\s+/);
      const keywords = words.filter(w => w.length > 5);
      keywords.forEach(kw => {
        if (!themes[kw]) themes[kw] = [];
        themes[kw].push(ref);
      });
    });

    const topThemes = Object.entries(themes)
      .filter(([, refs]) => refs.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);

    const paragraphs = [];

    paragraphs.push({
      type: 'introduction',
      text: `This literature review examines ${parsedRefs.length} scholarly works relevant to the research topic. The reviewed studies span from ${Math.min(...parsedRefs.map(r => r.year || 9999))} to ${Math.max(...parsedRefs.map(r => r.year || 0))}, providing a comprehensive overview of the current state of knowledge in this field.`
    });

    const grouped = {};
    parsedRefs.forEach(ref => {
      const decade = ref.year ? `${Math.floor(ref.year / 5) * 5}s` : 'undated';
      if (!grouped[decade]) grouped[decade] = [];
      grouped[decade].push(ref);
    });

    Object.entries(grouped).sort().forEach(([period, periodRefs]) => {
      const authorMentions = periodRefs.map(ref => {
        const firstAuthor = ref.authors[0] || 'Unknown';
        const lastName = firstAuthor.split(' ').pop();
        return `${lastName} (${ref.year || 'n.d.'})`;
      });

      const refTitles = periodRefs.map(r => r.title).join('. ');
      paragraphs.push({
        type: 'thematic',
        text: `Several studies from this period contribute to our understanding. ${authorMentions.join(', ')} investigated related aspects of the field. These works collectively address key questions and provide foundational evidence for ongoing research. Notable contributions include work on: ${refTitles.substring(0, 300)}.`
      });
    });

    const recentRefs = parsedRefs.filter(r => r.year && r.year >= new Date().getFullYear() - 3);
    const olderRefs = parsedRefs.filter(r => r.year && r.year < new Date().getFullYear() - 5);

    if (recentRefs.length > 0 && olderRefs.length > 0) {
      paragraphs.push({
        type: 'comparison',
        text: `Comparing recent literature with earlier works reveals evolving perspectives. While earlier studies (${olderRefs.slice(0, 2).map(r => `${(r.authors[0] || 'Unknown').split(' ').pop()}, ${r.year}`).join('; ')}) established foundational frameworks, more recent research (${recentRefs.slice(0, 2).map(r => `${(r.authors[0] || 'Unknown').split(' ').pop()}, ${r.year}`).join('; ')}) has expanded upon these concepts with updated methodologies and findings.`
      });
    }

    paragraphs.push({
      type: 'gap_identification',
      text: `Despite the substantial body of work reviewed, several research gaps remain. The existing literature could benefit from further investigation into the intersections of these studies' findings, particularly regarding methodology validation and cross-domain applicability. Future research should address these gaps to strengthen the evidence base.`
    });

    res.json({
      paperId: req.params.paperId,
      referencesUsed: parsedRefs.length,
      paragraphs,
      themes: topThemes.map(([theme, refs]) => ({
        theme,
        referenceCount: refs.length
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;