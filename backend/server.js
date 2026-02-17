const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');

const paperRoutes = require('./routes/papers');
const referenceRoutes = require('./routes/references');
const analysisRoutes = require('./routes/analysis');
const copilotRoutes = require('./routes/copilot');
const similarityRoutes = require('./routes/similarity');
const exportRoutes = require('./routes/export');
const libraryRoutes = require('./routes/library');
const formattingRoutes = require('./routes/formatting');

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['*'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/papers', paperRoutes);
app.use('/api/references', referenceRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/similarity', similarityRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/formatting', formattingRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`AI Academic Submission Engine running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;