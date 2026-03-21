const vm = require('vm');
const { z } = require('zod');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const nebiusClient = require('../llm/client');
const {
  plannerPrompt,
  coderPrompt,
  promptRephrasePrompt,
  iterateWithFeedbackPrompt,
  autoIteratePrompt,
  titleExtractionPrompt,
  thumbnailPrompt,
  streamingGamePrompt,
} = require('../prompt/gamePrompts');

const GameOutputSchema = z.object({
  html: z.string().describe('Full HTML content for the game page'),
  css: z.string().describe('Full CSS content for styling the game'),
  js: z.string().describe('Full JavaScript content for the game logic'),
});

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

  return new ChatOpenAI({
    model: modelId,
    temperature,
    maxTokens,
    configuration: {
      baseURL: 'https://api.tokenfactory.nebius.com/v1/',
      apiKey: process.env.NEBIUS_API_KEY,
    },
  });
}

const plannerChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', plannerPrompt],
  ['human', '{userPrompt}'],
]);

const coderChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', coderPrompt],
  ['human', 'Implement simple this game plan into a fully playable HTML5 Canvas browser game. Return the complete HTML, CSS, and JS.'],
]);

const retryCoderPrompt = ChatPromptTemplate.fromMessages([
  ['system', coderPrompt],
  ['human', 'Implement this game plan into a fully playable HTML5 Canvas browser game.'],
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
  console.log(`[CHAIN] rephraseUserPrompt -> rephrasing with Llama-3.3-70B...`);
  const llm = getLlm('meta-llama/Llama-3.3-70B-Instruct-fast', 0.7, 1024);
  const chain = rephrasePrompt.pipe(llm);
  const response = await chain.invoke({ userPrompt });
  console.log(`[CHAIN] rephraseUserPrompt -> done`);
  return response.content.trim();
}

async function planGame(userPrompt, modelId) {
  console.log(`[PLANNER] planGame -> model: ${modelId}`);
  console.log(`[PLANNER] planGame -> input prompt: "${userPrompt}"`);
  const llm = getLlm(modelId, 0.7, 4096);
  const chain = plannerChainPrompt.pipe(llm);
  const response = await chain.invoke({ userPrompt });
  const plan = response.content.trim();
  console.log(`[PLANNER] planGame -> plan generated (${plan.length} chars):`);
  console.log('--- GAME PLAN START ---');
  console.log(plan);
  console.log('--- GAME PLAN END ---');
  return plan;
}

async function codeGame(gamePlan, modelId, retryError = null) {
  console.log(`[CODER] codeGame -> model: ${modelId}, retry: ${!!retryError}`);
  const structuredLlm = getLlm(modelId).withStructuredOutput(GameOutputSchema);

  const chain = retryError
    ? retryCoderPrompt.pipe(structuredLlm)
    : coderChainPrompt.pipe(structuredLlm);

  const input = retryError
    ? { gamePlan, retryError }
    : { gamePlan };

  console.log(`[CODER] codeGame -> calling LLM with structured output...`);
  const parsed = await chain.invoke(input);
  console.log(`[CODER] codeGame -> response received (HTML: ${parsed.html.length} chars, CSS: ${parsed.css.length} chars, JS: ${parsed.js.length} chars)`);
  return parsed;
}

async function generateGameCode(userPrompt, modelId = 'moonshotai/Kimi-K2.5', _retryError = null) {
  console.log(`[CHAIN] generateGameCode -> model: ${modelId}, retry: ${!!_retryError}`);

  // Step 1: Rephrase the user prompt (skip on retry)
  const detailedPrompt = _retryError ? userPrompt : await rephraseUserPrompt(userPrompt);
  console.log('[CHAIN] generateGameCode -> detailed prompt:', detailedPrompt);

  // Step 2: Planner agent — break down into game components (skip on retry, reuse plan)
  let gamePlan;
  if (_retryError) {
    gamePlan = detailedPrompt; // on retry, detailedPrompt already contains the plan
  } else {
    gamePlan = await planGame(detailedPrompt, modelId);
  }

  // Step 3: Coder agent — implement the plan as HTML/CSS/JS
  const parsed = await codeGame(gamePlan, modelId, _retryError);

  // Step 4: Validate JS syntax
  try {
    new vm.Script(parsed.js);
    console.log(`[CHAIN] generateGameCode -> JS syntax check PASSED`);
  } catch (syntaxErr) {
    if (_retryError) {
      throw new Error(`Generated JavaScript has syntax errors: ${syntaxErr.message}`);
    }
    console.warn(`[CHAIN] generateGameCode -> JS syntax error, retrying: ${syntaxErr.message}`);
    return generateGameCode(gamePlan, modelId, syntaxErr.message);
  }

  return parsed;
}

async function generateTitle(userPrompt) {
  console.log(`[CHAIN] generateTitle -> generating with Llama-3.3-70B...`);
  const llm = getLlm('meta-llama/Llama-3.3-70B-Instruct-fast', 0.7, 50);
  const chain = titlePrompt.pipe(llm);
  const response = await chain.invoke({ userPrompt });
  console.log(`[CHAIN] generateTitle -> "${response.content.trim()}"`);
  return response.content.trim();
}

async function generateThumbnail(title) {
  console.log(`[CHAIN] generateThumbnail -> generating for "${title}" with flux-dev...`);
  const prompt = thumbnailPrompt.replace('{title}', title);
  const response = await nebiusClient.images.generate({
    model: 'black-forest-labs/flux-dev',
    prompt,
  });
  console.log(`[CHAIN] generateThumbnail -> done`);

  return response.data[0].url || response.data[0].b64_json || '';
}

async function iterateGameWithFeedback(currentGame, feedback, modelId = 'moonshotai/Kimi-K2.5') {
  console.log(`[CHAIN] iterateGameWithFeedback -> model: ${modelId}, feedback: "${feedback.substring(0, 100)}..."`);
  const structuredLlm = getLlm(modelId).withStructuredOutput(GameOutputSchema);
  const chain = feedbackIteratePrompt.pipe(structuredLlm);

  const parsed = await chain.invoke({
    currentHtml: currentGame.html,
    currentCss: currentGame.css,
    currentJs: currentGame.js,
    feedback,
  });
  console.log(`[CHAIN] iterateGameWithFeedback -> response received, validating JS...`);
  new vm.Script(parsed.js);
  console.log(`[CHAIN] iterateGameWithFeedback -> JS syntax check PASSED`);
  return parsed;
}

async function iterateGameAuto(currentGame, modelId='moonshotai/Kimi-K2.5') {
  console.log(`[CHAIN] iterateGameAuto -> model: ${modelId}`);
  const structuredLlm = getLlm(modelId).withStructuredOutput(GameOutputSchema);
  const chain = autoIterateChainPrompt.pipe(structuredLlm);

  const parsed = await chain.invoke({
    currentHtml: currentGame.html,
    currentCss: currentGame.css,
    currentJs: currentGame.js,
  });
  console.log(`[CHAIN] iterateGameAuto -> response received, validating JS...`);
  new vm.Script(parsed.js);
  console.log(`[CHAIN] iterateGameAuto -> JS syntax check PASSED`);
  return parsed;
}

const streamingChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', streamingGamePrompt],
  ['human', '{userPrompt}'],
]);

async function* streamGameGeneration(userPrompt, modelId) {
  console.log(`[CHAIN] streamGameGeneration -> model: ${modelId}`);
  const llm = getLlm(modelId, 0.7, 32768);
  const chain = streamingChainPrompt.pipe(llm);
  const stream = await chain.stream({ userPrompt });

  for await (const chunk of stream) {
    const thinkingContent = chunk.additional_kwargs?.reasoning_content;
    if (thinkingContent) {
      yield { type: 'thinking', content: thinkingContent };
    }

    if (chunk.content) {
      yield {
        type: 'content',
        content: typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content),
      };
    }
  }
}

module.exports = {
  generateGameCode,
  generateTitle,
  generateThumbnail,
  iterateGameWithFeedback,
  iterateGameAuto,
  streamGameGeneration,
  AVAILABLE_MODELS,
};
