const { v4: uuidv4 } = require('uuid');
const Game = require('../models/game');
const {
  generateGamePipeline,
  generateTitle,
  generateThumbnail,
  iterateGameWithFeedback,
  AVAILABLE_MODELS,
} = require('../chains/gameChain');

// ── In-memory SSE listeners per taskId ────────────────────────────────────
const taskListeners = new Map();

function addListener(taskId, res) {
  if (!taskListeners.has(taskId)) taskListeners.set(taskId, new Set());
  taskListeners.get(taskId).add(res);
}

function removeListener(taskId, res) {
  const set = taskListeners.get(taskId);
  if (set) { set.delete(res); if (set.size === 0) taskListeners.delete(taskId); }
}

function broadcast(taskId, event, data) {
  const set = taskListeners.get(taskId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;

function resolveModel(modelId) {
  const found = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return found ? found.id : DEFAULT_MODEL;
}

// ── Create Task (returns immediately, processes in background) ────────────

async function createTask(prompt, modelId) {
  const taskId = uuidv4();
  const model = resolveModel(modelId);

  const game = await Game.create({
    taskId,
    prompt,
    model,
    status: 'pending',
    message: 'Task queued, starting pipeline...',
  });

  processTask(game).catch((err) => {
    console.error(`Task ${taskId} failed:`, err.message);
  });

  return { taskId, model };
}

// ── Pipeline execution ───────────────────────────────────────────────────

async function processTask(game) {
  const taskId = game.taskId;

  // SSE emitter function
  function emitter(event, data) {
    const logEntry = { event, ...data, timestamp: new Date().toISOString() };
    console.log(`[pipeline:${taskId}] ${data.name || event}: ${data.message}`);
    // Save to pipelineLog
    game.pipelineLog.push(logEntry);
    // Broadcast to SSE clients
    broadcast(taskId, event, data);
  }

  try {
    game.status = 'processing';
    game.message = 'Starting agentic pipeline...';
    await game.save();
    broadcast(taskId, 'status', { status: 'processing', message: game.message });

    // Run pipeline + title in parallel
    const [result, title] = await Promise.all([
      generateGamePipeline(game.prompt, game.model, emitter),
      generateTitle(game.prompt),
    ]);

    game.html = result.code.html;
    game.css = result.code.css;
    game.js = result.code.js;
    game.title = title;
    game.gameDesign = result.gameDesign;
    game.iterations = result.iterations;
    game.passed = result.passed;
    game.status = 'completed';
    game.message = result.passed
      ? `Game ready! Zero errors after ${result.iterations} iteration(s) in ${result.duration}s`
      : `Game delivered with ${result.remainingErrors.length} minor issue(s) after ${result.iterations} iteration(s)`;
    await game.save();

    broadcast(taskId, 'complete', {
      status: 'completed',
      title,
      message: game.message,
      iterations: result.iterations,
      passed: result.passed,
      duration: result.duration,
    });

    // Thumbnail in background
    generateThumbnail(title)
      .then(async (thumbnailUrl) => {
        game.thumbnail = thumbnailUrl;
        await game.save();
        broadcast(taskId, 'thumbnail', { thumbnail: thumbnailUrl });
      })
      .catch((err) => {
        console.error(`Thumbnail failed for ${taskId}:`, err.message);
      });

  } catch (err) {
    console.error(`[pipeline:${taskId}] FAILED:`, err.message);
    game.status = 'failed';
    game.error = err.message;
    game.message = 'Pipeline failed.';
    await game.save();
    broadcast(taskId, 'error', { status: 'failed', error: err.message });
  }
}

// ── Status & queries ─────────────────────────────────────────────────────

async function getTaskStatus(taskId) {
  const game = await Game.findOne({ taskId });
  if (!game) return null;

  const result = {
    taskId: game.taskId,
    status: game.status,
    message: game.message,
  };

  if (game.status === 'completed') {
    result.title = game.title;
    result.model = game.model;
    result.html = game.html;
    result.css = game.css;
    result.js = game.js;
    result.thumbnail = game.thumbnail;
    result.gameDesign = game.gameDesign;
    result.iterations = game.iterations;
    result.passed = game.passed;
  }

  if (game.status === 'failed') {
    result.error = game.error;
  }

  return result;
}

async function getAllGames() {
  return Game.find(
    { status: 'completed' },
    { title: 1, taskId: 1, status: 1, prompt: 1, model: 1, thumbnail: 1, html: 1, css: 1, js: 1, iterations: 1, passed: 1, createdAt: 1, _id: 0 }
  ).sort({ createdAt: -1 });
}

function getAvailableModels() {
  return AVAILABLE_MODELS;
}

async function iterateWithFeedback(taskId, feedback, modelId) {
  const game = await Game.findOne({ taskId, status: 'completed' });
  if (!game) return null;

  const model = resolveModel(modelId || game.model);

  game.status = 'processing';
  game.message = 'Iterating game with your feedback...';
  await game.save();
  broadcast(taskId, 'status', { status: 'processing', message: game.message });

  try {
    function emitter(event, data) {
      broadcast(taskId, event, data);
    }

    const updated = await iterateGameWithFeedback(
      { html: game.html, css: game.css, js: game.js },
      feedback,
      model,
      emitter,
    );

    game.html = updated.html;
    game.css = updated.css;
    game.js = updated.js;
    game.status = 'completed';
    game.message = 'Game updated!';
    game.error = '';
    await game.save();

    broadcast(taskId, 'complete', { status: 'completed', message: game.message });
    return { taskId, status: 'completed', message: game.message };
  } catch (err) {
    game.status = 'completed';
    game.message = `Iteration failed: ${err.message}`;
    await game.save();
    broadcast(taskId, 'error', { status: 'failed', error: err.message });
    throw err;
  }
}

module.exports = {
  createTask,
  getTaskStatus,
  getAllGames,
  getAvailableModels,
  iterateWithFeedback,
  addListener,
  removeListener,
};
