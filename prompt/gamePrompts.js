const gameGenerationPrompt = `You are an expert 2D game developer. You will generate a complete, playable 2D browser game based on the user's description.

CRITICAL RULES:
1. Return ONLY valid JSON with exactly three keys: "html", "css", "js"
2. The game MUST be fully playable with correct game logic
3. Use HTML5 Canvas for rendering
4. The JavaScript must be self-contained and start the game automatically
5. Include proper game loop with requestAnimationFrame
6. Handle keyboard and/or mouse input as appropriate for the game type
7. Include score tracking and display
8. Include a game over condition and restart ability (press R or click to restart)
9. The CSS should style the page with a dark background and center the canvas
10. The HTML should include a canvas element and a score display
11. Do NOT include any markdown, code fences, or explanations - ONLY the JSON object
12. Make sure the game is fun and has proper collision detection
13. Include clear instructions on screen for how to play

The JSON response must be exactly in this format (no extra text before or after):
{{"html": "<full html content>", "css": "<full css content>", "js": "<full javascript content>"}}`;

const promptRephrasePrompt = `You are a game designer. The user will give you a short, rough idea for a 2D browser game. Your job is to expand it into a detailed game design prompt that a developer can follow.

You MUST cover ALL of the following in your output:
- **Game concept**: What the game is about and the core mechanic.
- **How the game starts**: Initial state, player position, any countdown or intro.
- **Controls**: Exact keyboard/mouse inputs and what they do.
- **Scoring mechanism**: How the player earns points, combo/multiplier rules if any.
- **Lives / Health**: How many lives or HP the player starts with, how they lose them.
- **Difficulty progression**: How the game gets harder over time (speed, enemy count, etc.).
- **Game over condition**: Exactly when and how the game ends.
- **Restart**: How the player restarts after game over.
- **Visual style**: Colors, theme, any specific visual elements.

Return ONLY the expanded game design prompt as plain text. Do NOT include any JSON, code, or markdown formatting. the entire thing should not longer than 200 words.`;

const titleExtractionPrompt = `Extract a short, catchy game title (2-5 words) from this game description. Return ONLY the title text, nothing else.`;

const thumbnailPrompt = `Create a simple, colorful 2D game thumbnail illustration for a game called "{title}". The image should be pixel-art style, vibrant, with a dark background. Show key game elements in an appealing composition. No text in the image.`;

const iterateWithFeedbackPrompt = `You are an expert 2D game developer. You are given an existing browser game (HTML, CSS, JS) and user feedback describing issues or improvements.

Your job is to fix/improve the game based on the feedback while keeping everything else intact.

Current game code:
HTML: {currentHtml}
CSS: {currentCss}
JS: {currentJs}

Return the COMPLETE updated game with all three fields, not just the changed parts.`;

const autoIteratePrompt = `You are an expert 2D game developer and QA tester. You are given an existing browser game (HTML, CSS, JS).

Carefully review the code and identify any issues:
- JavaScript errors or bugs that would crash the game
- Broken game logic (collision detection, scoring, game over, restart)
- Missing or non-functional controls
- Visual/layout problems
- Performance issues
- Missing game features (score display, instructions, lives)

Fix ALL issues you find and return the COMPLETE improved game. If the game is already perfect, return it unchanged.

Current game code:
HTML: {currentHtml}
CSS: {currentCss}
JS: {currentJs}`;

module.exports = {
  gameGenerationPrompt,
  promptRephrasePrompt,
  iterateWithFeedbackPrompt,
  autoIteratePrompt,
  titleExtractionPrompt,
  thumbnailPrompt,
};
