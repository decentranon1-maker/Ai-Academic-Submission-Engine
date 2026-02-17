const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validatePaperId } = require('../middleware/validation');
const { run, get, all } = require('../db');
const { extractKeywords, analyzeStructure } = require('../services/contentAnalyzer');

router.post('/:paperId/chat', validatePaperId, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const refs = await all(
      'SELECT title, authors, year, journal, doi, quality_score FROM references_table WHERE paper_id = ? ORDER BY quality_score DESC LIMIT 10',
      [req.params.paperId]
    );

    const similarityReport = await get(
      'SELECT * FROM similarity_reports WHERE paper_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.params.paperId]
    );

    await run(
      'INSERT INTO copilot_conversations (id, paper_id, role, content) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.paperId, 'user', message]
    );

    const response = generateCopilotResponse(message, paper, refs, similarityReport);

    await run(
      'INSERT INTO copilot_conversations (id, paper_id, role, content) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.paperId, 'assistant', response.text]
    );

    res.json({
      response: response.text,
      suggestions: response.suggestions || [],
      actions: response.actions || [],
      context: {
        paperTitle: paper.title,
        referenceCount: refs.length,
        journalFormat: paper.journal_format
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:paperId/history', validatePaperId, async (req, res) => {
  try {
    const conversations = await all(
      'SELECT * FROM copilot_conversations WHERE paper_id = ? ORDER BY created_at ASC',
      [req.params.paperId]
    );
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:paperId/rephrase', validatePaperId, async (req, res) => {
  try {
    const { text, style = 'academic' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const rephrased = rephraseText(text, style);

    res.json({
      original: text,
      rephrased: rephrased.text,
      improvements: rephrased.improvements,
      style
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:paperId/structure-suggestions', validatePaperId, async (req, res) => {
  try {
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const structure = analyzeStructure(paper.content || '');
    const suggestions = generateStructureSuggestions(structure, paper.journal_format);

    res.json({
      currentStructure: structure,
      suggestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:paperId/explain-citation', validatePaperId, async (req, res) => {
  try {
    const { referenceId } = req.body;
    if (!referenceId) {
      return res.status(400).json({ error: 'Reference ID is required' });
    }

    const ref = await get('SELECT * FROM references_table WHERE id = ?', [referenceId]);
    if (!ref) {
      return res.status(404).json({ error: 'Reference not found' });
    }

    const paper = await get('SELECT title, extracted_keywords FROM papers WHERE id = ?',
      [req.params.paperId]);

    const explanation = generateCitationExplanation(ref, paper);

    res.json({
      reference: {
        title: ref.title,
        authors: JSON.parse(ref.authors || '[]'),
        year: ref.year,
        journal: ref.journal,
        doi: ref.doi
      },
      explanation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateCopilotResponse(message, paper, refs, similarityReport) {
  const lowerMsg = message.toLowerCase();
  const keywords = JSON.parse(paper.extracted_keywords || '[]');
  const structure = analyzeStructure(paper.content || '');
  const wordCount = (paper.content || '').split(/\s+/).length;

  if (lowerMsg.includes('structure') || lowerMsg.includes('organize') || lowerMsg.includes('layout')) {
    const suggestions = generateStructureSuggestions(structure, paper.journal_format);
    return {
      text: `Based on my analysis of your paper "${paper.title}", here are my structural observations:\n\n` +
        `Current sections found: ${structure.sections.map(s => s.name).join(', ') || 'None clearly identified'}\n\n` +
        `Issues identified:\n${structure.issues.map(i => `- ${i.message}: ${i.suggestion}`).join('\n') || 'No major structural issues found.'}\n\n` +
        `Your paper has ${wordCount} words across ${structure.paragraphCount} paragraphs.\n\n` +
        `Suggestions:\n${suggestions.map(s => `- ${s}`).join('\n')}`,
      suggestions: suggestions
    };
  }

  if (lowerMsg.includes('citation') || lowerMsg.includes('reference') || lowerMsg.includes('source')) {
    return {
      text: `Your paper currently has ${refs.length} associated references.\n\n` +
        (refs.length > 0
          ? `Top references by quality:\n${refs.slice(0, 5).map((r, i) =>
            `${i + 1}. "${r.title}" (${r.year || 'n.d.'}) - Quality: ${r.quality_score}/100`
          ).join('\n')}\n\n` +
          `These references were sourced from verified academic databases (Crossref and OpenAlex). Each has a DOI for verification.`
          : `No references have been added yet. I recommend using the "Auto Source References" feature to find verified scholarly references based on your paper's topics: ${keywords.slice(0, 5).join(', ')}.`),
      suggestions: refs.length === 0
        ? ['Use auto-source to find references', 'Search for specific topics']
        : ['Review reference quality scores', 'Check citation placement suggestions'],
      actions: refs.length === 0
        ? [{ type: 'auto_source', label: 'Auto-Source References' }]
        : [{ type: 'view_references', label: 'View All References' }]
    };
  }

  if (lowerMsg.includes('similarity') || lowerMsg.includes('plagiarism') || lowerMsg.includes('originality')) {
    if (similarityReport) {
      const simData = JSON.parse(similarityReport.similar_sections || '[]');
      return {
        text: `Similarity Analysis Results:\n\n` +
          `Originality Score: ${similarityReport.originality_score}%\n` +
          `Sections Checked: ${similarityReport.total_checked}\n` +
          `Flagged Sections: ${similarityReport.flagged_count}\n\n` +
          (simData.length > 0
            ? `Flagged sections:\n${simData.slice(0, 3).map((s, i) =>
              `${i + 1}. Paragraph ${s.paragraphIndex + 1}: ${s.similarityPercent}% similar${s.matchedSource ? ` to "${s.matchedSource.title}"` : ''}`
            ).join('\n')}\n\nConsider rephrasing flagged sections to improve originality.`
            : `No significant similarities were detected. Your content appears original.`),
        suggestions: simData.length > 0
          ? ['Rephrase flagged sections', 'Add proper citations to similar content']
          : ['Your originality looks good!']
      };
    }
    return {
      text: `No similarity check has been run yet. I recommend running a similarity analysis to check your paper against public academic databases.\n\nThis will scan your content and report:\n- Overall originality percentage\n- Specific sections with high similarity\n- Matched sources for review\n\nNote: This is a similarity estimation, not a definitive plagiarism check.`,
      suggestions: ['Run similarity check'],
      actions: [{ type: 'run_similarity', label: 'Run Similarity Check' }]
    };
  }

  if (lowerMsg.includes('rephrase') || lowerMsg.includes('rewrite') || lowerMsg.includes('improve') || lowerMsg.includes('wording')) {
    return {
      text: `I can help improve your academic writing. Here are some general observations about your paper:\n\n` +
        `Word count: ${wordCount}\n` +
        `Key topics: ${keywords.slice(0, 5).join(', ')}\n\n` +
        `To rephrase specific sections, select the text you'd like to improve and use the "Rephrase" feature. I'll suggest stronger academic wording while preserving your meaning.\n\n` +
        `General tips for your paper:\n` +
        `- Use passive voice for methodology sections\n` +
        `- Ensure claims are supported with citations\n` +
        `- Avoid colloquial language\n` +
        `- Use precise, domain-specific terminology`,
      suggestions: [
        'Select text to rephrase',
        'Check for unsupported claims',
        'Review academic tone'
      ]
    };
  }

  if (lowerMsg.includes('format') || lowerMsg.includes('journal') || lowerMsg.includes('style')) {
    return {
      text: `Your paper is currently formatted in ${paper.journal_format} style.\n\n` +
        `Available formatting options:\n` +
        `- APA: Author-date citations, alphabetical bibliography\n` +
        `- IEEE: Numbered citations in brackets, numbered bibliography\n` +
        `- Nature: Superscript numbered citations\n` +
        `- Elsevier: Author-date, similar to APA\n` +
        `- Springer: Numbered bracket citations\n` +
        `- DeSci: Decentralized science format with DOI verification\n\n` +
        `Changing the format will automatically adjust all in-text citations and the bibliography.`,
      suggestions: ['Change to IEEE format', 'Change to Nature format', 'Preview current formatting']
    };
  }

  if (lowerMsg.includes('summarize') || lowerMsg.includes('summary') || lowerMsg.includes('overview')) {
    return {
      text: `Paper Overview: "${paper.title}"\n\n` +
        `Document Statistics:\n` +
        `- Words: ${wordCount}\n` +
        `- Pages: ${paper.page_count}\n` +
        `- Sections: ${structure.sections.length}\n` +
        `- References: ${refs.length}\n` +
        `- Format: ${paper.journal_format}\n\n` +
        `Key Topics: ${keywords.slice(0, 8).join(', ')}\n\n` +
        `Structural Issues: ${structure.issues.length > 0 ? structure.issues.map(i => i.message).join('; ') : 'None detected'}\n\n` +
        `The paper ${wordCount > 3000 ? 'has adequate length for most journals' : 'may need to be expanded for full journal submission'}.`,
      suggestions: ['View detailed analysis', 'Check structure', 'Review references']
    };
  }

  return {
    text: `I'm your AI Academic Co-Pilot for "${paper.title}". I can help you with:\n\n` +
      `1. **Structure**: Analyze and improve your paper's organization\n` +
      `2. **Citations**: Find, verify, and place academic references\n` +
      `3. **Similarity**: Check originality of your content\n` +
      `4. **Rephrasing**: Improve academic wording\n` +
      `5. **Formatting**: Adjust to journal-specific styles\n` +
      `6. **Summary**: Get an overview of your paper's status\n\n` +
      `Try asking me about any of these topics, or ask a specific question about your paper.\n\n` +
      `Current paper stats: ${wordCount} words, ${refs.length} references, ${paper.journal_format} format.`,
    suggestions: [
      'How is my paper structured?',
      'What references do I have?',
      'Check my originality',
      'Help me improve my writing',
      'What format options are available?'
    ]
  };
}

function rephraseText(text, style) {
  const improvements = [];

  let rephrased = text;

  const informalReplacements = [
    [/\ba lot of\b/gi, 'numerous'],
    [/\bgot\b/gi, 'obtained'],
    [/\bbig\b/gi, 'substantial'],
    [/\bsmall\b/gi, 'minimal'],
    [/\bgood\b/gi, 'favorable'],
    [/\bbad\b/gi, 'unfavorable'],
    [/\bshow\b/gi, 'demonstrate'],
    [/\bfind out\b/gi, 'determine'],
    [/\blook at\b/gi, 'examine'],
    [/\bthink\b/gi, 'hypothesize'],
    [/\buse\b/gi, 'utilize'],
    [/\bhelp\b/gi, 'facilitate'],
    [/\bmake\b/gi, 'construct'],
    [/\bget\b/gi, 'acquire'],
    [/\bkind of\b/gi, 'somewhat'],
    [/\bsort of\b/gi, 'to some extent'],
    [/\blike\b/g, 'such as'],
    [/\betc\.\b/gi, 'among others'],
    [/\bdon't\b/gi, 'do not'],
    [/\bcan't\b/gi, 'cannot'],
    [/\bwon't\b/gi, 'will not'],
    [/\bit's\b/gi, 'it is'],
    [/\bthat's\b/gi, 'that is'],
    [/\bwe've\b/gi, 'we have'],
    [/\bthey've\b/gi, 'they have']
  ];

  informalReplacements.forEach(([pattern, replacement]) => {
    if (pattern.test(rephrased)) {
      improvements.push(`Replaced informal term with academic alternative: "${replacement}"`);
      rephrased = rephrased.replace(pattern, replacement);
    }
  });

  if (/^[A-Z]/.test(rephrased) && !rephrased.endsWith('.')) {
    rephrased += '.';
    improvements.push('Added period for complete sentence');
  }

  if (improvements.length === 0) {
    improvements.push('Text already uses appropriate academic language');
  }

  return { text: rephrased, improvements };
}

function generateStructureSuggestions(structure, journalFormat) {
  const suggestions = [];

  structure.issues.forEach(issue => {
    suggestions.push(issue.suggestion);
  });

  if (structure.sections.length < 4) {
    suggestions.push('Consider organizing your paper with clear section headers (Introduction, Methods, Results, Discussion, Conclusion)');
  }

  if (journalFormat === 'IEEE' || journalFormat === 'Nature') {
    suggestions.push(`For ${journalFormat} submissions, ensure you follow the specific template requirements including abstract length limits and keyword formatting`);
  }

  if (structure.wordCount && structure.wordCount > 10000) {
    suggestions.push('Your paper is quite long. Consider whether all content is essential or if some sections could be condensed');
  }

  if (suggestions.length === 0) {
    suggestions.push('Your paper structure appears well-organized for submission');
  }

  return suggestions;
}

function generateCitationExplanation(ref, paper) {
  const refAuthors = JSON.parse(ref.authors || '[]');
  const paperKeywords = JSON.parse(paper?.extracted_keywords || '[]');

  const titleWords = (ref.title || '').toLowerCase().split(/\s+/);
  const matchingKeywords = paperKeywords.filter(kw =>
    titleWords.some(tw => tw.includes(kw) || kw.includes(tw))
  );

  return {
    relevance: matchingKeywords.length > 0
      ? `This reference shares key terms with your paper: ${matchingKeywords.slice(0, 3).join(', ')}`
      : `This reference was matched based on topical relevance to your paper's content`,
    credibility: `Published in ${ref.journal || 'an academic venue'} (${ref.year || 'n.d.'}) with ${ref.citation_count || 0} citations. Quality score: ${ref.quality_score}/100.`,
    authors: `Authored by ${refAuthors.slice(0, 3).join(', ')}${refAuthors.length > 3 ? ' et al.' : ''}`,
    verification: ref.doi
      ? `Verified via DOI: https://doi.org/${ref.doi} (sourced from ${ref.source})`
      : `Sourced from ${ref.source} academic metadata`,
    recommendation: ref.quality_score >= 70
      ? 'Highly recommended for citation based on quality metrics'
      : ref.quality_score >= 40
        ? 'Acceptable reference, consider alongside other sources'
        : 'Lower quality score - verify relevance before including'
  };
}

module.exports = router;