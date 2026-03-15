const client = require('../llm/client');
const {
  gameGenerationPrompt,
  titleExtractionPrompt,
  thumbnailPrompt,
} = require('../prompt/gamePrompts');

async function generateGameCode(userPrompt) {
  const response = await client.chat.completions.create({
    model: 'zai-org/GLM-5',
    messages: [
      { role: 'system', content: gameGenerationPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 8192,
  });

  const content = response.choices[0].message.content.trim();

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON');
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  if (!parsed.html || !parsed.css || !parsed.js) {
    throw new Error('LLM response missing required fields (html, css, js)');
  }

  return parsed;
}

async function generateTitle(userPrompt) {
  const response = await client.chat.completions.create({
    model: 'zai-org/GLM-5',
    messages: [
      { role: 'system', content: titleExtractionPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 50,
  });

  return response.choices[0].message.content.trim();
}

async function generateThumbnail(title) {
  const prompt = thumbnailPrompt.replace('{title}', title);
  const response = await client.images.generate({
    model: 'black-forest-labs/flux-dev',
    prompt,
  });

  return response.data[0].url || response.data[0].b64_json || '';
}

module.exports = {
  generateGameCode,
  generateTitle,
  generateThumbnail,
};
