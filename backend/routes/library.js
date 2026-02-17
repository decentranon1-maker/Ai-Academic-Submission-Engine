const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { project } = req.query;
    let refs;
    if (project) {
      refs = await all(
        'SELECT * FROM library_references WHERE project_name = ? ORDER BY created_at DESC',
        [project]
      );
    } else {
      refs = await all('SELECT * FROM library_references ORDER BY created_at DESC');
    }

    const parsed = refs.map(ref => ({
      ...ref,
      tags: ref.tags ? JSON.parse(ref.tags) : []
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects', async (req, res) => {
  try {
    const projects = await all(
      'SELECT DISTINCT project_name, COUNT(*) as count FROM library_references GROUP BY project_name ORDER BY project_name'
    );
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, authors, year, journal, doi, url, abstract, citationCount, projectName, tags, notes } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const id = uuidv4();
    await run(
      `INSERT INTO library_references (id, project_name, title, authors, year, journal, doi, url, abstract, citation_count, tags, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectName || 'Default',
        title,
        typeof authors === 'string' ? authors : JSON.stringify(authors || []),
        year || null,
        journal || '',
        doi || '',
        url || '',
        abstract || '',
        citationCount || 0,
        JSON.stringify(tags || []),
        notes || ''
      ]
    );

    res.json({ id, message: 'Reference saved to library' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-from-paper', async (req, res) => {
  try {
    const { referenceId, projectName } = req.body;

    if (!referenceId) {
      return res.status(400).json({ error: 'Reference ID is required' });
    }

    const ref = await get('SELECT * FROM references_table WHERE id = ?', [referenceId]);
    if (!ref) {
      return res.status(404).json({ error: 'Reference not found' });
    }

    const id = uuidv4();
    await run(
      `INSERT INTO library_references (id, project_name, title, authors, year, journal, doi, url, abstract, citation_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectName || 'Default',
        ref.title,
        ref.authors,
        ref.year,
        ref.journal,
        ref.doi,
        ref.url,
        ref.abstract,
        ref.citation_count
      ]
    );

    res.json({ id, message: 'Reference saved to library' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:refId', async (req, res) => {
  try {
    const { title, authors, year, journal, doi, projectName, tags, notes } = req.body;

    await run(
      `UPDATE library_references SET
        title = COALESCE(?, title),
        authors = COALESCE(?, authors),
        year = COALESCE(?, year),
        journal = COALESCE(?, journal),
        doi = COALESCE(?, doi),
        project_name = COALESCE(?, project_name),
        tags = COALESCE(?, tags),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        title,
        authors ? (typeof authors === 'string' ? authors : JSON.stringify(authors)) : null,
        year,
        journal,
        doi,
        projectName,
        tags ? JSON.stringify(tags) : null,
        notes,
        req.params.refId
      ]
    );

    res.json({ message: 'Library reference updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:refId', async (req, res) => {
  try {
    await run('DELETE FROM library_references WHERE id = ?', [req.params.refId]);
    res.json({ message: 'Reference removed from library' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;