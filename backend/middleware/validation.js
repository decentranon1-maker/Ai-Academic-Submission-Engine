function validatePaperId(req, res, next) {
  const { paperId } = req.params;
  if (!paperId || typeof paperId !== 'string' || paperId.length < 10) {
    return res.status(400).json({ error: 'Invalid paper ID' });
  }
  next();
}

function validateReferenceBody(req, res, next) {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Reference title is required' });
  }
  next();
}

function validateExportFormat(req, res, next) {
  const validFormats = ['pdf', 'docx'];
  const format = req.body.format || req.query.format || 'pdf';
  if (!validFormats.includes(format)) {
    return res.status(400).json({ error: 'Invalid export format. Use pdf or docx.' });
  }
  req.exportFormat = format;
  next();
}

function validateJournalStyle(req, res, next) {
  const validStyles = ['APA', 'IEEE', 'DeSci', 'Nature', 'Elsevier', 'Springer'];
  const style = req.body.style || req.body.journal_format || req.query.style;
  if (style && !validStyles.includes(style)) {
    return res.status(400).json({
      error: 'Invalid journal style',
      validStyles
    });
  }
  next();
}

module.exports = {
  validatePaperId,
  validateReferenceBody,
  validateExportFormat,
  validateJournalStyle
};