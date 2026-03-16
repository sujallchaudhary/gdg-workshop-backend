const OpenAI = require('openai');
const azureClient = new OpenAI({
  baseURL: process.env.AZURE_AI_FOUNDRY_ENDPOINT,
  apiKey: process.env.AZURE_AI_FOUNDRY_KEY,
});

module.exports = azureClient;
