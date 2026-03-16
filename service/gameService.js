const { v4: uuidv4 } = require('uuid');
const Game = require('../models/game');
const {
  generateGameCode,
  generateTitle,
  generateThumbnail,
} = require('../chains/gameChain');

async function createTask(prompt) {
  const taskId = uuidv4();

  const game = await Game.create({
    taskId,
    prompt,
    status: 'pending',
    message: 'Task queued, waiting to start...',
  });

  processTask(game).catch((err) => {
    console.error(`Task ${taskId} failed:`, err.message);
  });

  return { taskId };
}

async function processTask(game) {
  try {
    game.status = 'processing';
    game.message = 'Generating game code and title...';
    await game.save();

    const [gameCode, title] = await Promise.all([
      generateGameCode(game.prompt),
      generateTitle(game.prompt),
    ]);

    game.html = gameCode.html;
    game.css = gameCode.css;
    game.js = gameCode.js;
    game.title = title;
    game.status = 'completed';
    game.message = 'Game ready! Generating thumbnail...';
    await game.save();

    generateThumbnail(title)
      .then(async (thumbnailUrl) => {
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
    { title: 1, taskId: 1, thumbnail: 1, createdAt: 1, _id: 0 }
  ).sort({ createdAt: -1 });

  return games;
}

module.exports = {
  createTask,
  getTaskStatus,
  getAllGames,
};
