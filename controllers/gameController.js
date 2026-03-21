const gameService = require('../service/gameService');

async function submitTask(req, res, next) {
  try {
    const { prompt, model } = req.body;
    console.log(`[CTRL] submitTask -> prompt: "${prompt}", model: ${model || 'default'}`);
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'A non-empty "prompt" field is required' });
    }

    const result = await gameService.createTask(prompt.trim(), model);
    console.log(`[CTRL] submitTask -> created taskId: ${result.taskId}`);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function getTaskStatus(req, res, next) {
  try {
    const { taskId } = req.params;
    console.log(`[CTRL] getTaskStatus -> taskId: ${taskId}`);
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

function getModels(req, res) {
  return res.status(200).json({ models: gameService.getAvailableModels() });
}

async function iterateWithFeedback(req, res, next) {
  try {
    const { taskId } = req.params;
    const { feedback, model } = req.body;
    console.log(`[CTRL] iterateWithFeedback -> taskId: ${taskId}, model: ${model || 'default'}`);
    if (!taskId) {
      return res.status(400).json({ error: 'taskId parameter is required' });
    }
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      return res.status(400).json({ error: 'A non-empty "feedback" field is required' });
    }

    const result = await gameService.iterateWithFeedback(taskId, feedback.trim(), model);
    if (!result) {
      return res.status(404).json({ error: 'Completed game not found for this taskId' });
    }
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function iterateAutomatic(req, res, next) {
  try {
    const { taskId } = req.params;
    const { model } = req.body;
    console.log(`[CTRL] iterateAutomatic -> taskId: ${taskId}, model: ${model || 'default'}`);
    if (!taskId) {
      return res.status(400).json({ error: 'taskId parameter is required' });
    }

    const result = await gameService.iterateAutomatic(taskId, model);
    if (!result) {
      return res.status(404).json({ error: 'Completed game not found for this taskId' });
    }
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function streamTask(req, res, next) {
  try {
    const { prompt, model } = req.body;
    console.log(`[CTRL] streamTask -> prompt: "${prompt}", model: ${model || 'default'}`);
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'A non-empty "prompt" field is required' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let aborted = false;
    req.on('close', () => { aborted = true; });

    const ALLOWED_EVENT_TYPES = new Set(['thinking', 'content']);
    const generator = gameService.streamGeneration(prompt.trim(), model);
    for await (const chunk of generator) {
      if (aborted) break;
      const eventType = ALLOWED_EVENT_TYPES.has(chunk.type) ? chunk.type : 'content';
      res.write(`event: ${eventType}\ndata: ${JSON.stringify({ content: chunk.content })}\n\n`);
    }

    if (!aborted) {
      res.write(`event: done\ndata: {}\n\n`);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      console.error(`[CTRL] streamTask error: ${err.message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream generation failed' })}\n\n`);
      res.end();
    }
  }
}

module.exports = {
  submitTask,
  getTaskStatus,
  getAllGames,
  getModels,
  iterateWithFeedback,
  iterateAutomatic,
  streamTask,
};
