require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./database/connection');
const gameRoutes = require('./routes/gameRoutes');
const qnaRoutes = require('./routes/qnaRoutes');
const errorHandler = require('./middlewares/errorHandler');

const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  if (Object.keys(req.body || {}).length) console.log('[REQ] Body:', JSON.stringify(req.body));
  res.on('finish', () => {
    console.log(`[RES] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', gameRoutes);
app.use('/api/qna', qnaRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

const PORT = process.env.PORT;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
