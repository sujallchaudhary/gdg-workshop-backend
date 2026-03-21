const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.get('/models', gameController.getModels);

router.post('/tasks', gameController.submitTask);

router.get('/tasks/:taskId', gameController.getTaskStatus);

router.get('/games', gameController.getAllGames);

router.post('/tasks/:taskId/iterate', gameController.iterateWithFeedback);
router.post('/tasks/:taskId/auto-iterate', gameController.iterateAutomatic);

router.post('/stream', gameController.streamTask);

module.exports = router;
