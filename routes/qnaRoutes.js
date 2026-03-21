const express = require('express');
const router = express.Router();
const qnaController = require('../controllers/qnaController');

router.post('/ask', qnaController.askQuestion);

module.exports = router;
