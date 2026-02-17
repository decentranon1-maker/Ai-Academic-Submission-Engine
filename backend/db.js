const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(dbPath);
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA foreign_keys=ON');
  }
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      page_count INTEGER DEFAULT 0,
      content TEXT,
      extracted_keywords TEXT,
      extracted_claims TEXT,
      extracted_topics TEXT,
      status TEXT DEFAULT 'uploaded',
      journal_format TEXT DEFAULT 'APA',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS references_table (
      id TEXT PRIMARY KEY,
      paper_id TEXT,
      title TEXT NOT NULL,
      authors TEXT,
      year INTEGER,
      journal TEXT,
      doi TEXT,
      url TEXT,
      abstract TEXT,
      citation_count INTEGER DEFAULT 0,
      source TEXT DEFAULT 'crossref',
      relevance_score REAL DEFAULT 0,
      quality_score REAL DEFAULT 0,
      quality_explanation TEXT,
      verified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'suggested',
      inserted_at_position INTEGER,
      paragraph_index INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS citation_spots (
      id TEXT PRIMARY KEY,
      paper_id TEXT,
      paragraph_index INTEGER,
      sentence TEXT,
      claim_text TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS citation_suggestions (
      id TEXT PRIMARY KEY,
      spot_id TEXT,
      reference_id TEXT,
      explanation TEXT,
      confidence REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (spot_id) REFERENCES citation_spots(id) ON DELETE CASCADE,
      FOREIGN KEY (reference_id) REFERENCES references_table(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS library_references (
      id TEXT PRIMARY KEY,
      project_name TEXT DEFAULT 'Default',
      title TEXT NOT NULL,
      authors TEXT,
      year INTEGER,
      journal TEXT,
      doi TEXT,
      url TEXT,
      abstract TEXT,
      citation_count INTEGER DEFAULT 0,
      tags TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS similarity_reports (
      id TEXT PRIMARY KEY,
      paper_id TEXT,
      originality_score REAL DEFAULT 100,
      similar_sections TEXT,
      total_checked INTEGER DEFAULT 0,
      flagged_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS copilot_conversations (
      id TEXT PRIMARY KEY,
      paper_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS export_history (
      id TEXT PRIMARY KEY,
      paper_id TEXT,
      format TEXT NOT NULL,
      journal_style TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    )
  `);

  console.log('Database initialized successfully');
}

module.exports = { getDb, run, get, all, initializeDatabase };