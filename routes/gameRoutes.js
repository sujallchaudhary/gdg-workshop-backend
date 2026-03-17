const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.get('/models', gameController.getModels);

router.post('/tasks', gameController.submitTask);

router.get('/tasks/:taskId', gameController.getTaskStatus);

// SSE stream — real-time pipeline events
router.get('/tasks/:taskId/stream', gameController.streamTask);

router.get('/games', gameController.getAllGames);

router.post('/tasks/:taskId/iterate', gameController.iterateWithFeedback);

module.exports = router;
