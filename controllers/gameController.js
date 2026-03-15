const gameService = require('../service/gameService');

async function submitTask(req, res, next) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'A non-empty "prompt" field is required' });
    }

    const result = await gameService.createTask(prompt.trim());
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function getTaskStatus(req, res, next) {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId parameter is required' });
    }

    const result = await gameService.getTaskStatus(taskId);
    if (!result) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getAllGames(req, res, next) {
  try {
    const games = await gameService.getAllGames();
    return res.status(200).json({ games });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitTask,
  getTaskStatus,
  getAllGames,
};
