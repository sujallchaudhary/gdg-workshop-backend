const { streamAnswer } = require('../service/qnaService');

async function askQuestion(req, res, next) {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'A non-empty "question" field is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = streamAnswer(question.trim());
    for await (const token of stream) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      return next(err);
    }
    res.end();
  }
}

module.exports = { askQuestion };
