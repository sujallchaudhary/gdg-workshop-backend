const vm = require('vm');
const { z } = require('zod');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const nebiusClient = require('../llm/client');
const {
  plannerPrompt,
  coderPrompt,
  debuggerPrompt,
  iterateWithFeedbackPrompt,
  titleExtractionPrompt,
  thumbnailPrompt,
} = require('../prompt/gamePrompts');

// ─── Schemas ────────────────────────────────────────────────────────────────

const GameDesignSchema = z.object({
  title: z.string(),
  concept: z.string(),
  coreMechanics: z.array(z.string()),
  playerControls: z.record(z.any()),
  enemyObstacleBehavior: z.string(),
  winCondition: z.string(),
  loseCondition: z.string(),
  scoring: z.string(),
  difficultyProgression: z.string(),
  visualStyle: z.string(),
  assetRequirements: z.string(),
});

const GameCodeSchema = z.object({
  html: z.string().describe('Full HTML content for the game page'),
  css: z.string().describe('Full CSS content for styling the game'),
  js: z.string().describe('Full JavaScript content for the game logic'),
});

// ─── Model config ───────────────────────────────────────────────────────────

const GEMINI_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
]);

const AVAILABLE_MODELS = [
  { id: 'zai-org/GLM-5',                          label: 'GLM-5 (Nebius)',                          provider: 'nebius' },
  { id: 'meta-llama/Llama-3.3-70B-Instruct-fast', label: 'Llama 3.3 70B (Nebius)',                  provider: 'nebius' },
  { id: 'MiniMaxAI/MiniMax-M2.1',                 label: 'MiniMax M2.1 (Nebius)',                   provider: 'nebius' },
  { id: 'moonshotai/Kimi-K2.5',                   label: 'Kimi K2.5 (Nebius)',                      provider: 'nebius' },
  { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',   label: 'Qwen3 Coder 480B (Nebius)',               provider: 'nebius' },
  { id: 'gemini-2.5-flash',                        label: 'Gemini 2.5 Flash (Google)',               provider: 'gemini' },
  { id: 'gemini-2.5-pro',                          label: 'Gemini 2.5 Pro (Google)',                 provider: 'gemini' },
  { id: 'gemini-3-flash-preview',                  label: 'Gemini 3 Flash Preview (Google)',         provider: 'gemini' },
  { id: 'gemini-3.1-flash-lite-preview',           label: 'Gemini 3.1 Flash Lite Preview (Google)',  provider: 'gemini' },
  { id: 'gemini-3.1-pro-preview',                  label: 'Gemini 3.1 Pro Preview (Google)',         provider: 'gemini' },
];

const FAST_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-fast';
const MAX_HEAL_ITERATIONS = 5;

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

// ─── SSE helper ─────────────────────────────────────────────────────────────

function emit(emitter, event, data) {
  if (emitter) emitter(event, data);
}

// ─── Prompt Templates ───────────────────────────────────────────────────────

const plannerChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', plannerPrompt],
  ['human', '{userPrompt}'],
]);

const coderChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', coderPrompt],
  ['human', 'Generate the complete game based on the design document above.'],
]);

const debuggerChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', debuggerPrompt],
  ['human', 'Fix the errors listed above and return the complete corrected game.'],
]);

const titleChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', titleExtractionPrompt],
  ['human', '{userPrompt}'],
]);

const feedbackChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', iterateWithFeedbackPrompt],
  ['human', '{feedback}'],
]);

// ─── Step 3: Static Validation ──────────────────────────────────────────────

function staticValidate(code) {
  const errors = [];

  // JS syntax check
  try {
    new vm.Script(code.js, { filename: 'game.js' });
  } catch (err) {
    errors.push({
      type: 'syntax',
      message: err.message,
      line: err.lineNumber || null,
    });
  }

  // Check for common pitfalls
  const js = code.js || '';

  // Undeclared obvious mistakes
  if (/\bwhile\s*\(\s*true\s*\)/.test(js) && !/break|return/.test(js)) {
    errors.push({ type: 'logic', message: 'Potential infinite while(true) loop without break/return' });
  }

  // Missing requestAnimationFrame
  if (/canvas|Canvas/.test(js) && !/requestAnimationFrame/.test(js)) {
    errors.push({ type: 'logic', message: 'Canvas game missing requestAnimationFrame game loop' });
  }

  // Missing canvas reference
  if (/getContext/.test(js) && !/getElementById|querySelector/.test(js) && !/document\.createElement/.test(js)) {
    errors.push({ type: 'logic', message: 'getContext called without getting a canvas element reference' });
  }

  // HTML structure check
  const html = code.html || '';
  if (!/canvas/i.test(html) && !/canvas/i.test(js)) {
    errors.push({ type: 'structure', message: 'No <canvas> element found in HTML' });
  }

  return errors;
}

// ─── Step 4: Dynamic Sandbox Testing ────────────────────────────────────────

function sandboxTest(code) {
  const errors = [];

  try {
    // Create a sandboxed context simulating browser globals
    const canvasMock = {
      width: 800, height: 600,
      style: {},
      getContext: () => ({
        fillRect: () => {}, clearRect: () => {}, strokeRect: () => {},
        fillText: () => {}, strokeText: () => {}, measureText: () => ({ width: 0 }),
        beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
        arc: () => {}, rect: () => {}, fill: () => {}, stroke: () => {},
        drawImage: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
        scale: () => {}, setTransform: () => {}, resetTransform: () => {},
        clip: () => {}, font: '', fillStyle: '', strokeStyle: '',
        lineWidth: 1, globalAlpha: 1, textAlign: '', textBaseline: '',
        shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
        canvas: { width: 800, height: 600 },
      }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      addEventListener: () => {}, removeEventListener: () => {},
      focus: () => {},
    };

    let rafCallCount = 0;
    const maxRafCalls = 300; // ~5 seconds at 60fps

    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
      setTimeout: (fn) => { try { fn(); } catch (e) { errors.push({ type: 'runtime', message: `setTimeout callback error: ${e.message}` }); } },
      setInterval: () => 0,
      clearTimeout: () => {}, clearInterval: () => {},
      requestAnimationFrame: (fn) => {
        rafCallCount++;
        if (rafCallCount <= maxRafCalls) {
          try { fn(rafCallCount * 16.67); } catch (e) {
            errors.push({ type: 'runtime', message: `Game loop error at frame ${rafCallCount}: ${e.message}` });
          }
        }
        return rafCallCount;
      },
      cancelAnimationFrame: () => {},
      document: {
        getElementById: () => canvasMock,
        querySelector: () => canvasMock,
        querySelectorAll: () => [],
        createElement: (tag) => tag === 'canvas' ? canvasMock : { style: {}, appendChild: () => {}, addEventListener: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
        body: { appendChild: () => {}, style: {} },
        documentElement: { style: {} },
      },
      window: {},
      navigator: { userAgent: 'sandbox' },
      Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Error, Map, Set,
      parseInt, parseFloat, isNaN, isFinite, undefined, NaN, Infinity,
      Image: function() { this.src = ''; this.onload = null; this.onerror = null; },
      Audio: function() { this.play = () => Promise.resolve(); this.pause = () => {}; this.volume = 1; },
      performance: { now: () => Date.now() },
      alert: () => {},
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script(code.js, { filename: 'game.js', timeout: 10000 });
    script.runInContext(context, { timeout: 10000 });

    if (rafCallCount === 0 && /requestAnimationFrame/.test(code.js)) {
      // Game registered rAF but loop never ran — might be okay if it's event-driven
    }

  } catch (err) {
    if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      errors.push({ type: 'runtime', message: 'Script execution timed out — possible infinite loop' });
    } else {
      errors.push({ type: 'runtime', message: err.message });
    }
  }

  return errors;
}

// ─── Main Orchestrator Pipeline ─────────────────────────────────────────────

async function generateGamePipeline(userPrompt, modelId = 'zai-org/GLM-5', emitter = null) {
  const startTime = Date.now();

  // ── Step 1: Planner Agent ──────────────────────────────────────────────
  emit(emitter, 'step', { step: 1, name: 'planner', status: 'running', message: 'Analyzing prompt and creating game design document...' });

  let gameDesign;
  try {
    const plannerLlm = getLlm(FAST_MODEL, 0.7, 4096).withStructuredOutput(GameDesignSchema);
    const plannerChain = plannerChainPrompt.pipe(plannerLlm);
    gameDesign = await plannerChain.invoke({ userPrompt });
    emit(emitter, 'step', { step: 1, name: 'planner', status: 'done', message: 'Game design document created', data: gameDesign });
  } catch (err) {
    emit(emitter, 'step', { step: 1, name: 'planner', status: 'error', message: `Planner failed: ${err.message}` });
    throw new Error(`Planner Agent failed: ${err.message}`);
  }

  // ── Step 2: Coder Agent ────────────────────────────────────────────────
  emit(emitter, 'step', { step: 2, name: 'coder', status: 'running', message: `Generating game code with ${modelId}...` });

  let gameCode;
  try {
    const coderLlm = getLlm(modelId, 0.7, 32768).withStructuredOutput(GameCodeSchema);
    const coderChain = coderChainPrompt.pipe(coderLlm);
    gameCode = await coderChain.invoke({ gameDesign: JSON.stringify(gameDesign, null, 2) });
    emit(emitter, 'step', { step: 2, name: 'coder', status: 'done', message: `Code generated: ${gameCode.js?.length || 0} chars JS` });
  } catch (err) {
    emit(emitter, 'step', { step: 2, name: 'coder', status: 'error', message: `Coder failed: ${err.message}` });
    throw new Error(`Coder Agent failed: ${err.message}`);
  }

  // ── Steps 3-5: Validation + Sandbox + Self-Healing Loop ────────────────
  let iteration = 0;
  let allErrors = [];

  while (iteration < MAX_HEAL_ITERATIONS) {
    iteration++;
    allErrors = [];

    // Step 3: Static validation
    emit(emitter, 'step', { step: 3, name: 'validator', status: 'running', message: `Static validation (iteration ${iteration})...`, iteration });
    const staticErrors = staticValidate(gameCode);

    if (staticErrors.length > 0) {
      emit(emitter, 'step', { step: 3, name: 'validator', status: 'failed', message: `${staticErrors.length} static error(s) found`, errors: staticErrors, iteration });
      allErrors.push(...staticErrors);
    } else {
      emit(emitter, 'step', { step: 3, name: 'validator', status: 'passed', message: 'Static validation passed', iteration });

      // Step 4: Dynamic sandbox (only if static passed)
      emit(emitter, 'step', { step: 4, name: 'sandbox', status: 'running', message: `Sandbox testing (iteration ${iteration})...`, iteration });
      const sandboxErrors = sandboxTest(gameCode);

      if (sandboxErrors.length > 0) {
        emit(emitter, 'step', { step: 4, name: 'sandbox', status: 'failed', message: `${sandboxErrors.length} runtime error(s) found`, errors: sandboxErrors, iteration });
        allErrors.push(...sandboxErrors);
      } else {
        emit(emitter, 'step', { step: 4, name: 'sandbox', status: 'passed', message: 'Sandbox testing passed — zero errors!', iteration });
      }
    }

    // If no errors, break out — game is clean
    if (allErrors.length === 0) break;

    // Step 5: Debugger Agent (self-heal)
    emit(emitter, 'step', {
      step: 5, name: 'debugger', status: 'running',
      message: `Debugging iteration ${iteration}/${MAX_HEAL_ITERATIONS}...`,
      errors: allErrors, iteration,
    });

    try {
      const debugLlm = getLlm(modelId, 0.3, 32768).withStructuredOutput(GameCodeSchema);
      const debugChain = debuggerChainPrompt.pipe(debugLlm);
      const errorReport = allErrors.map((e, i) => `${i + 1}. [${e.type}] ${e.message}${e.line ? ` (line ${e.line})` : ''}`).join('\n');
      gameCode = await debugChain.invoke({
        currentHtml: gameCode.html,
        currentCss: gameCode.css,
        currentJs: gameCode.js,
        errors: errorReport,
      });
      emit(emitter, 'step', { step: 5, name: 'debugger', status: 'done', message: `Debugger produced fixed code (iteration ${iteration})`, iteration });
    } catch (err) {
      emit(emitter, 'step', { step: 5, name: 'debugger', status: 'error', message: `Debugger failed: ${err.message}`, iteration });
      // If debugger fails, break and return whatever we have
      break;
    }
  }

  // ── Step 6: Final Delivery ─────────────────────────────────────────────
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = allErrors.length === 0;

  emit(emitter, 'step', {
    step: 6, name: 'delivery', status: passed ? 'done' : 'warning',
    message: passed
      ? `Game delivered — zero errors after ${iteration} iteration(s) in ${duration}s`
      : `Game delivered with ${allErrors.length} remaining issue(s) after ${MAX_HEAL_ITERATIONS} iterations in ${duration}s`,
    iterations: iteration,
    duration,
    passed,
  });

  return {
    gameDesign,
    code: gameCode,
    iterations: iteration,
    passed,
    remainingErrors: allErrors,
    duration,
  };
}

// ─── Title generation (fast) ────────────────────────────────────────────────

async function generateTitle(userPrompt) {
  const llm = getLlm(FAST_MODEL, 0.7, 50);
  const chain = titleChainPrompt.pipe(llm);
  const response = await chain.invoke({ userPrompt });
  return response.content.trim();
}

// ─── Thumbnail generation ───────────────────────────────────────────────────

async function generateThumbnail(title) {
  const prompt = thumbnailPrompt.replace('{title}', title);
  const response = await nebiusClient.images.generate({
    model: 'black-forest-labs/flux-dev',
    prompt,
  });
  return response.data[0].url || response.data[0].b64_json || '';
}

// ─── Iterate with feedback (user-driven, also uses validation loop) ─────────

async function iterateGameWithFeedback(currentGame, feedback, modelId = 'zai-org/GLM-5', emitter = null) {
  emit(emitter, 'step', { step: 5, name: 'feedback', status: 'running', message: 'Applying your feedback...' });

  const llm = getLlm(modelId, 0.7, 32768).withStructuredOutput(GameCodeSchema);
  const chain = feedbackChainPrompt.pipe(llm);

  let gameCode = await chain.invoke({
    currentHtml: currentGame.html,
    currentCss: currentGame.css,
    currentJs: currentGame.js,
    feedback,
  });

  // Run validation loop on the result
  for (let i = 0; i < 3; i++) {
    const staticErrors = staticValidate(gameCode);
    const sandboxErrors = staticErrors.length === 0 ? sandboxTest(gameCode) : [];
    const allErrors = [...staticErrors, ...sandboxErrors];
    if (allErrors.length === 0) break;

    emit(emitter, 'step', { step: 5, name: 'debugger', status: 'running', message: `Auto-fixing ${allErrors.length} error(s) (iteration ${i + 1})...` });
    const debugLlm = getLlm(modelId, 0.3, 32768).withStructuredOutput(GameCodeSchema);
    const debugChain = debuggerChainPrompt.pipe(debugLlm);
    const errorReport = allErrors.map((e, idx) => `${idx + 1}. [${e.type}] ${e.message}`).join('\n');
    gameCode = await debugChain.invoke({
      currentHtml: gameCode.html, currentCss: gameCode.css, currentJs: gameCode.js,
      errors: errorReport,
    });
  }

  new vm.Script(gameCode.js); // final syntax check
  return gameCode;
}

module.exports = {
  generateGamePipeline,
  generateTitle,
  generateThumbnail,
  iterateGameWithFeedback,
  AVAILABLE_MODELS,
};
