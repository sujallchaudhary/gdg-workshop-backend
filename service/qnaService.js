const qnaLlm = require('../llm/qnaClient');
const { HumanMessage } = require('@langchain/core/messages');

async function* streamAnswer(question) {
  const stream = await qnaLlm.stream([new HumanMessage(question)]);
  for await (const chunk of stream) {
    if (chunk.content) {
      yield chunk.content;
    }
  }
}

module.exports = { streamAnswer };
