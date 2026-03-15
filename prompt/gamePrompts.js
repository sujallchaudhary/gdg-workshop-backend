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
{"html": "<full html content>", "css": "<full css content>", "js": "<full javascript content>"}`;

const titleExtractionPrompt = `Extract a short, catchy game title (2-5 words) from this game description. Return ONLY the title text, nothing else.`;

const thumbnailPrompt = `Create a simple, colorful 2D game thumbnail illustration for a game called "{title}". The image should be pixel-art style, vibrant, with a dark background. Show key game elements in an appealing composition. No text in the image.`;

module.exports = {
  gameGenerationPrompt,
  titleExtractionPrompt,
  thumbnailPrompt,
};
