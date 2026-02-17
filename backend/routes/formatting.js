const express = require('express');
const router = express.Router();
const { validatePaperId, validateJournalStyle } = require('../middleware/validation');
const { get, all, run } = require('../db');
const { formatReference, formatInTextCitation, generateBibliography, getJournalFormatting } = require('../services/citationFormatter');

router.get('/styles', (req, res) => {
  const styles = {
    APA: {
      name: 'APA (7th Edition)',
      description: 'American Psychological Association style. Author-date in-text citations with alphabetical reference list.',
      inTextExample: '(Smith et al., 2023)',
      bibExample: 'Smith, J. A., & Doe, R. B. (2023). Title of article. *Journal Name*.',
      settings: getJournalFormatting('APA')
    },
    IEEE: {
      name: 'IEEE',
      description: 'Institute of Electrical and Electronics Engineers style. Numbered citations in square brackets.',
      inTextExample: '[1]',
      bibExample: '[1] J. A. Smith and R. B. Doe, "Title of article," *Journal Name*, 2023.',
      settings: getJournalFormatting('IEEE')
    },
    DeSci: {
      name: 'DeSci DAO',
      description: 'Decentralized Science format with DOI verification emphasis.',
      inTextExample: '(Smith, 2023)',
      bibExample: 'Smith, J. A. (2023). "Title." Journal. DOI: 10.xxx [Verified via decentralized metadata]',
      settings: getJournalFormatting('DeSci')
    },
    Nature: {
      name: 'Nature',
      description: 'Nature journal format with superscript numbered references.',
      inTextExample: 'Smith et al. (ref. 1)',
      bibExample: '1. Smith, J. A., Doe, R. B. Title of article. *Nature* (2023).',
      settings: getJournalFormatting('Nature')
    },
    Elsevier: {
      name: 'Elsevier',
      description: 'Elsevier journal format, similar to APA with author-date citations.',
      inTextExample: '(Smith et al., 2023)',
      bibExample: 'Smith, J. A., & Doe, R. B. (2023). Title of article. *Journal Name*.',
      settings: getJournalFormatting('Elsevier')
    },
    Springer: {
      name: 'Springer',
      description: 'Springer journal format with numbered bracket citations.',
      inTextExample: '[1]',
      bibExample: 'Smith, J. A. & Doe, R. B. (2023) Title of article. *Journal Name*.',
      settings: getJournalFormatting('Springer')
    }
  };

  res.json(styles);
});

router.post('/:paperId/apply', validatePaperId, validateJournalStyle, async (req, res) => {
  try {
    const { style } = req.body;
    const paper = await get('SELECT * FROM papers WHERE id = ?', [req.params.paperId]);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    await run(
      'UPDATE papers SET journal_format = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [style, req.params.paperId]
    );

    const refs = await all(
      "SELECT * FROM references_table WHERE paper_id = ? AND status = 'accepted'",
      [req.params.paperId]
    );

    const parsedRefs = refs.map(ref => ({
      ...ref,
      authors: JSON.parse(ref.authors || '[]')
    }));

    const bibliography = generateBibliography(parsedRefs, style);
    const inTextCitations = parsedRefs.map((ref, idx) => ({
      referenceId: ref.id,
      title: ref.title,
      inText: formatInTextCitation(ref, style, idx + 1)
    }));

    const formatting = getJournalFormatting(style);

    res.json({
      style,
      formatting,
      bibliography,
      inTextCitations,
      referenceCount: parsedRefs.length,
      message: `Paper formatted in ${style} style`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:paperId/preview-all', validatePaperId, async (req, res) => {
  try {
    const refs = await all(
      "SELECT * FROM references_table WHERE paper_id = ? AND status = 'accepted'",
      [req.params.paperId]
    );

    const parsedRefs = refs.map(ref => ({
      ...ref,
      authors: JSON.parse(ref.authors || '[]')
    }));

    const styles = ['APA', 'IEEE', 'DeSci', 'Nature', 'Elsevier', 'Springer'];
    const previews = {};

    styles.forEach(style => {
      previews[style] = {
        bibliography: generateBibliography(parsedRefs, style),
        inTextSample: parsedRefs.length > 0
          ? formatInTextCitation(parsedRefs[0], style, 1)
          : 'No accepted references',
        settings: getJournalFormatting(style)
      };
    });

    res.json(previews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;