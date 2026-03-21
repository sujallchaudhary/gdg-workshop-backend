const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');

const qnaLlm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash-lite',
  apiKey: process.env.GEMINI_QNA_API_KEY,
  temperature: 0.7,
  streaming: true,
});

module.exports = qnaLlm;
