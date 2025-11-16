# WebSocket Co-op Setup Guide

This guide explains how to set up and use the WebSocket-based co-op multiplayer functionality.

## Server Setup

### Local Development

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm run dev
   ```
   
   The server will run on `ws://localhost:8080`

3. **Test the connection:**
   - Open browser console
   - Try connecting: `new WebSocket('ws://localhost:8080?room=TEST')`

### Production Deployment

#### Option 1: Railway (Recommended - Easiest)

1. Go to [railway.app](https://railway.app) and sign up
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. In project settings:
   - Set **Root Directory** to `server`
   - Railway will auto-detect Node.js
5. Deploy! Railway will give you a URL like `your-app.railway.app`
6. Your WebSocket URL will be: `wss://your-app.railway.app` (note: `wss://` for secure)

#### Option 2: Render

1. Go to [render.com](https://render.com) and sign up
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Settings:
   - **Name**: `jonas-review-guesser-server`
   - **Root Directory**: `server`
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
   - **Environment**: `Node`
5. Add environment variable: `PORT=10000`
6. Deploy! Your WebSocket URL will be: `wss://your-app.onrender.com`

#### Option 3: Fly.io

1. Install Fly CLI: `npm install -g @fly/cli`
2. In the `server` directory, run: `fly launch`
3. Follow the prompts
4. Deploy: `fly deploy`
5. Your WebSocket URL will be: `wss://your-app.fly.dev`

## Chrome Extension Configuration

### Setting the Server URL

You'll need to configure the WebSocket server URL in the extension. This can be done in a few ways:

1. **Hardcode for testing** (in `src/websocketClient.js`):
   ```javascript
   const DEFAULT_SERVER_URL = 'ws://localhost:8080'; // Local
   // or
   const DEFAULT_SERVER_URL = 'wss://your-server.com'; // Production
   ```

2. **Use environment variable** (requires build step):
   - Create a config file that gets replaced during build
   - Or use Chrome storage API to let users configure it

3. **For Phase 2 implementation:**
   - Add a settings UI in the extension
   - Store server URL in Chrome storage
   - Default to localhost for development

### Testing Locally

1. Start the server: `cd server && npm run dev`
2. Load the extension in Chrome (developer mode)
3. The extension will connect to `ws://localhost:8080`
4. Test with multiple browser windows/tabs

### Testing Production

1. Deploy server to Railway/Render/etc.
2. Update extension code with production WebSocket URL
3. Reload extension
4. Test with friends!

## Message Protocol

### Client → Server

```javascript
// Connect
ws://server.com?room=ROOM_CODE

// Guess
{ type: 'guess', guess: 12345, gameId: 'appid123' }

// Correct guess
{ type: 'correct-guess' }

// Next game (host only)
{ type: 'next-game', gameId: 'appid456' }

// User ready
{ type: 'user-ready', hasReplied: true }

// Reset leaderboard (host only)
{ type: 'reset-leaderboard' }
```

### Server → Client

```javascript
// Connected
{ type: 'connected', connectionId: '...', role: 'host'|'client', isHost: boolean, gameState: {...} }

// User joined
{ type: 'user-joined', user: {...}, gameState: {...} }

// User disconnected
{ type: 'user-disconnected', connectionId: '...', gameState: {...} }

// Guess broadcast
{ type: 'guess', userId: '...', userName: '...', guess: 12345, gameId: '...' }

// Score update
{ type: 'score-update', userId: '...', userName: '...', newScore: 5, gameState: {...} }

// Game changed
{ type: 'game-changed', gameId: '...', gameState: {...} }

// Reply status update
{ type: 'reply-status-update', userId: '...', userName: '...', hasReplied: true, gameState: {...} }

// Leaderboard reset
{ type: 'leaderboard-reset', gameState: {...} }

// Error
{ type: 'error', message: '...' }
```

## Room Codes

Room codes are simple strings (e.g., "ABC123"). The extension will generate random 6-character codes when creating a room. Users join by entering the same room code.

## Security Notes

- For production, always use `wss://` (secure WebSocket)
- Consider adding authentication if needed
- Rate limiting may be needed for production
- Validate all incoming messages on the server

## Next Steps

1. Deploy the server to a hosting platform
2. Update the extension with the server URL
3. Proceed to Phase 2: Implement UI controls and connection logic

