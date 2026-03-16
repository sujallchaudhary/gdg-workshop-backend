const vm = require('vm');
const { z } = require('zod');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const nebiusClient = require('../llm/client');
const {
  gameGenerationPrompt,
  promptRephrasePrompt,
  iterateWithFeedbackPrompt,
  autoIteratePrompt,
  titleExtractionPrompt,
  thumbnailPrompt,
} = require('../prompt/gamePrompts');

const GameOutputSchema = z.object({
  html: z.string().describe('Full HTML content for the game page'),
  css: z.string().describe('Full CSS content for styling the game'),
  js: z.string().describe('Full JavaScript content for the game logic'),
});

const AZURE_MODELS = new Set([
  'claude-opus-4-6',
  'claude-sonnet-4-5',
  'gpt-4o',
]);

const GEMINI_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview'


]);

const AVAILABLE_MODELS = [
  { id: 'zai-org/GLM-5',                        label: 'GLM-5 (Nebius)',            provider: 'nebius' },
  { id: 'meta-llama/Llama-3.3-70B-Instruct-fast', label: 'Llama 3.3 70B (Nebius)',  provider: 'nebius' },
  { id: 'MiniMaxAI/MiniMax-M2.1',             label: 'MiniMax M2.1 (Nebius)',          provider: 'nebius' },
  { id: 'moonshotai/Kimi-K2.5',            label: 'Kimi K2.5 (Nebius)',            provider: 'nebius' },
  { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', label: 'Qwen3 Coder 480B (Nebius)', provider: 'nebius' },
  { id: 'gemini-2.5-flash',                     label: 'Gemini 2.5 Flash (Google)', provider: 'gemini' },
  { id: 'gemini-2.5-pro',                       label: 'Gemini 2.5 Pro (Google)',   provider: 'gemini' },
  { id: 'gemini-3-flash-preview',               label: 'Gemini 3 Flash Preview (Google)', provider: 'gemini' },
  { id: 'gemini-3.1-flash-lite-preview',        label: 'Gemini 3.1 Flash Lite Preview (Google)', provider: 'gemini' },
  { id: 'gemini-3.1-pro-preview',               label: 'Gemini 3.1 Pro Preview (Google)', provider: 'gemini' },
];

function getLlm(modelId, temperature = 0.7, maxTokens = 32768) {
  if (GEMINI_MODELS.has(modelId)) {
    return new ChatGoogleGenerativeAI({
      model: modelId,
      temperature,
      maxOutputTokens: maxTokens,
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  const isAzure = AZURE_MODELS.has(modelId);
  return new ChatOpenAI({
    model: modelId,
    temperature,
    maxTokens,
    configuration: {
      baseURL: isAzure
        ? process.env.AZURE_AI_FOUNDRY_ENDPOINT
        : 'https://api.tokenfactory.nebius.com/v1/',
      apiKey: isAzure
        ? process.env.AZURE_AI_FOUNDRY_KEY
        : process.env.NEBIUS_API_KEY,
    },
  });
}

const gamePrompt = ChatPromptTemplate.fromMessages([
  ['system', gameGenerationPrompt],
  ['human', '{userPrompt}'],
]);

const retryGamePrompt = ChatPromptTemplate.fromMessages([
  ['system', gameGenerationPrompt],
  ['human', '{userPrompt}'],
  ['assistant', '[previous attempt contained a JavaScript syntax error]'],
  ['human', 'Your previous response had a JavaScript syntax error: {retryError}\nPlease regenerate the game with valid, error-free JavaScript.'],
]);

const rephrasePrompt = ChatPromptTemplate.fromMessages([
  ['system', promptRephrasePrompt],
  ['human', '{userPrompt}'],
]);

const titlePrompt = ChatPromptTemplate.fromMessages([
  ['system', titleExtractionPrompt],
  ['human', '{userPrompt}'],
]);

const feedbackIteratePrompt = ChatPromptTemplate.fromMessages([
  ['system', iterateWithFeedbackPrompt],
  ['human', '{feedback}'],
]);

const autoIterateChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', autoIteratePrompt],
  ['human', 'Review and fix any issues in this game. Return the complete improved version.'],
]);

async function rephraseUserPrompt(userPrompt) {
  const llm = getLlm('meta-llama/Llama-3.3-70B-Instruct-fast', 0.7, 1024);
  const chain = rephrasePrompt.pipe(llm);
  const response = await chain.invoke({ userPrompt });
  return response.content.trim();
}

async function generateGameCode(userPrompt, modelId = 'zai-org/GLM-5', _retryError = null) {
  const detailedPrompt = _retryError ? userPrompt : await rephraseUserPrompt(userPrompt);
  console.log('Detailed game prompt:', detailedPrompt);

  const structuredLlm = getLlm(modelId).withStructuredOutput(GameOutputSchema);

  const chain = _retryError
    ? retryGamePrompt.pipe(structuredLlm)
    : gamePrompt.pipe(structuredLlm);

  const input = _retryError
    ? { userPrompt: detailedPrompt, retryError: _retryError }
    : { userPrompt: detailedPrompt };

  const parsed = await chain.invoke(input);
  try {
    new vm.Script(parsed.js);
  } catch (syntaxErr) {
    if (_retryError) {
      throw new Error(`Generated JavaScript has syntax errors: ${syntaxErr.message}`);
    }
    console.warn(`JS syntax error in generated code, retrying: ${syntaxErr.message}`);
    return generateGameCode(userPrompt, modelId, syntaxErr.message);
  }

  return parsed;
}

async function generateTitle(userPrompt) {
  const llm = getLlm('meta-llama/Llama-3.3-70B-Instruct-fast', 0.7, 50);
  const chain = titlePrompt.pipe(llm);
  const response = await chain.invoke({ userPrompt });
  return response.content.trim();
}

async function generateThumbnail(title) {
  const prompt = thumbnailPrompt.replace('{title}', title);
  const response = await nebiusClient.images.generate({
    model: 'black-forest-labs/flux-dev',
    prompt,
  });

  return response.data[0].url || response.data[0].b64_json || '';
}

async function iterateGameWithFeedback(currentGame, feedback, modelId = 'zai-org/GLM-5') {
  const structuredLlm = getLlm(modelId).withStructuredOutput(GameOutputSchema);
  const chain = feedbackIteratePrompt.pipe(structuredLlm);

  const parsed = await chain.invoke({
    currentHtml: currentGame.html,
    currentCss: currentGame.css,
    currentJs: currentGame.js,
    feedback,
  });
  new vm.Script(parsed.js);
  return parsed;
}

async function iterateGameAuto(currentGame, modelId = 'zai-org/GLM-5') {
  const structuredLlm = getLlm(modelId).withStructuredOutput(GameOutputSchema);
  const chain = autoIterateChainPrompt.pipe(structuredLlm);

  const parsed = await chain.invoke({
    currentHtml: currentGame.html,
    currentCss: currentGame.css,
    currentJs: currentGame.js,
  });
  new vm.Script(parsed.js);
  return parsed;
}

module.exports = {
  generateGameCode,
  generateTitle,
  generateThumbnail,
  iterateGameWithFeedback,
  iterateGameAuto,
  AVAILABLE_MODELS,
};
