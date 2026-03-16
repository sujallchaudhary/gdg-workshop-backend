const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema(
  {
    taskId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      default: '',
    },
    prompt: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    html: {
      type: String,
      default: '',
    },
    css: {
      type: String,
      default: '',
    },
    js: {
      type: String,
      default: '',
    },
    thumbnail: {
      type: String,
      default: '',
    },
    error: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Game', gameSchema);
