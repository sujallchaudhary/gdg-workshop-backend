const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.post('/tasks', gameController.submitTask);

router.get('/tasks/:taskId', gameController.getTaskStatus);

router.get('/games', gameController.getAllGames);

module.exports = router;
