const { v4: uuidv4 } = require('uuid');
const Game = require('../models/game');
const {
  generateGameCode,
  generateTitle,
  generateThumbnail,
  iterateGameWithFeedback,
  iterateGameAuto,
  AVAILABLE_MODELS,
} = require('../chains/gameChain');

const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;

function resolveModel(modelId) {
  const found = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return found ? found.id : DEFAULT_MODEL;
}

async function createTask(prompt, modelId) {
  const taskId = uuidv4();
  const model = resolveModel(modelId);
  console.log(`[SVC] createTask -> taskId: ${taskId}, model: ${model}, prompt: "${prompt}"`);

  const game = await Game.create({
    taskId,
    prompt,
    model,
    status: 'pending',
    message: 'Task queued, waiting to start...',
  });
  console.log(`[SVC] createTask -> saved to DB, starting background processing...`);

  processTask(game).catch((err) => {
    console.error(`[SVC] Task ${taskId} failed:`, err.message);
  });

  return { taskId, model };
}

async function processTask(game) {
  try {
    console.log(`[SVC] processTask -> starting for taskId: ${game.taskId}`);
    game.status = 'processing';
    game.message = 'Generating game code and title...';
    await game.save();

    console.log(`[SVC] processTask -> generating code + title in parallel...`);
    const startTime = Date.now();
    const [gameCode, title] = await Promise.all([
      generateGameCode(game.prompt, game.model),
      generateTitle(game.prompt),
    ]);
    console.log(`[SVC] processTask -> code + title generated in ${Date.now() - startTime}ms`);
    console.log(`[SVC] processTask -> title: "${title}"`);

    game.html = gameCode.html;
    game.css = gameCode.css;
    game.js = gameCode.js;
    game.title = title;
    game.status = 'completed';
    game.message = 'Game ready! Generating thumbnail...';
    await game.save();

    console.log(`[SVC] processTask -> generating thumbnail for "${title}"...`);
    generateThumbnail(title)
      .then(async (thumbnailUrl) => {
        console.log(`[SVC] processTask -> thumbnail generated for taskId: ${game.taskId}`);
        game.thumbnail = thumbnailUrl;
        game.message = 'Game ready!';
        await game.save();
      })
      .catch((err) => {
        console.error(`Thumbnail generation failed for ${game.taskId}:`, err.message);
        game.message = 'Game ready! Thumbnail generation failed.';
        game.save().catch((saveErr) => {
          console.error(`Failed to save thumbnail error state for ${game.taskId}:`, saveErr.message);
        });
      });
  } catch (err) {
    console.error(`[SVC] processTask -> FAILED for taskId: ${game.taskId} -> ${err.message}`);
    game.status = 'failed';
    game.error = err.message;
    game.message = 'Game generation failed.';
    await game.save();
  }
}

async function getTaskStatus(taskId) {
  const game = await Game.findOne({ taskId });
  if (!game) {
    return null;
  }

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
  }

  if (game.status === 'failed') {
    result.error = game.error;
  }

  return result;
}

async function getAllGames() {
  const games = await Game.find(
    { status: 'completed' },
    { title: 1, taskId: 1, status: 1, prompt: 1, model: 1, thumbnail: 1, html: 1, css: 1, js: 1, createdAt: 1, _id: 0 }
  ).sort({ createdAt: -1 });

  return games;
}

function getAvailableModels() {
  return AVAILABLE_MODELS;
}

async function iterateWithFeedback(taskId, feedback, modelId) {
  console.log(`[SVC] iterateWithFeedback -> taskId: ${taskId}`);
  const game = await Game.findOne({ taskId, status: 'completed' });
  if (!game) return null;

  const model = resolveModel(modelId || game.model);
  console.log(`[SVC] iterateWithFeedback -> using model: ${model}`);

  game.status = 'processing';
  game.message = 'Iterating game with your feedback...';
  await game.save();

  try {
    const updated = await iterateGameWithFeedback(
      { html: game.html, css: game.css, js: game.js },
      feedback,
      model,
    );

    game.html = updated.html;
    game.css = updated.css;
    game.js = updated.js;
    game.status = 'completed';
    game.message = 'Game updated!';
    game.error = '';
    await game.save();

    return { taskId, status: 'completed', message: game.message };
  } catch (err) {
    game.status = 'completed'; // keep old code playable
    game.message = `Iteration failed: ${err.message}`;
    await game.save();
    throw err;
  }
}

async function iterateAutomatic(taskId, modelId) {
  console.log(`[SVC] iterateAutomatic -> taskId: ${taskId}`);
  const game = await Game.findOne({ taskId, status: 'completed' });
  if (!game) return null;

  const model = resolveModel(modelId || game.model);
  console.log(`[SVC] iterateAutomatic -> using model: ${model}`);

  game.status = 'processing';
  game.message = 'Auto-reviewing and fixing game...';
  await game.save();

  try {
    const updated = await iterateGameAuto(
      { html: game.html, css: game.css, js: game.js },
      model,
    );

    game.html = updated.html;
    game.css = updated.css;
    game.js = updated.js;
    game.status = 'completed';
    game.message = 'Game auto-fixed!';
    game.error = '';
    await game.save();

    return { taskId, status: 'completed', message: game.message };
  } catch (err) {
    game.status = 'completed'; // keep old code playable
    game.message = `Auto-iteration failed: ${err.message}`;
    await game.save();
    throw err;
  }
}

module.exports = {
  createTask,
  getTaskStatus,
  getAllGames,
  getAvailableModels,
  iterateWithFeedback,
  iterateAutomatic,
};
