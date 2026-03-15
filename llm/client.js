const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
  apiKey: process.env.NEBIUS_API_KEY || 'placeholder',
});

module.exports = client;
