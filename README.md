# gdg-workshop-backend

A Node.js backend that generates playable 2D browser games using LLM (Nebius API). Submit a prompt describing a game and receive complete HTML, CSS, and JavaScript code along with a generated thumbnail.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your NEBIUS_API_KEY and MONGODB_URI in .env
npm start
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEBIUS_API_KEY` | API key for the Nebius token factory |
| `MONGODB_URI` | MongoDB connection string |
| `PORT` | Server port (default: 3000) |

## API Endpoints

### POST /api/tasks
Submit a game generation task.

**Body:** `{ "prompt": "Create a snake game" }`

**Response:** `{ "taskId": "uuid" }`

### GET /api/tasks/:taskId
Get the status and result of a task.

**Response (pending/processing):** `{ "taskId": "...", "status": "processing" }`

**Response (completed):**
```json
{
  "taskId": "...",
  "status": "completed",
  "title": "Snake Game",
  "html": "...",
  "css": "...",
  "js": "...",
  "thumbnail": "..."
}
```

### GET /api/games
List all completed games (titles only).

**Response:** `{ "games": [{ "taskId": "...", "title": "...", "thumbnail": "...", "createdAt": "..." }] }`

## Project Structure

```
controllers/   - Request handlers
middlewares/   - Express middleware (error handling)
prompt/        - LLM prompt templates
routes/        - Express route definitions
service/       - Business logic layer
llm/           - LLM client configuration
chains/        - LLM chain functions (code gen, image gen)
models/        - Mongoose models
```

