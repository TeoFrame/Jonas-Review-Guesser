# Jonas Review Guesser WebSocket Server

Simple WebSocket server for real-time multiplayer co-op functionality.

## Features

- Room-based multiplayer sessions
- Host/client role management
- Real-time leaderboard tracking
- User reply status tracking
- Automatic host migration

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

Or for production:

```bash
npm start
```

The server will run on `ws://localhost:8080` by default.

### 3. Environment Variables

- `PORT` - Server port (default: 8080)

## Usage

### Connection

Connect to the server with a room ID:

```
ws://localhost:8080/?room=ROOM_CODE
```

### Message Protocol

See the main README or co-op plan for the complete message protocol.

## Deployment

### Railway

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select this repository
4. Set root directory to `server`
5. Railway will auto-detect Node.js and deploy

### Render

1. Create account at [render.com](https://render.com)
2. New Web Service
3. Connect GitHub repository
4. Settings:
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
5. Set environment variable `PORT=10000` (Render requirement)

### Other Platforms

Any Node.js hosting platform that supports WebSockets:
- Fly.io
- Heroku
- DigitalOcean App Platform
- AWS Elastic Beanstalk

## Local Testing

1. Start the server: `npm run dev`
2. Update Chrome extension to connect to `ws://localhost:8080`
3. Test with multiple browser windows

## Production

For production, you'll need to:
1. Deploy the server to a hosting platform
2. Update the WebSocket URL in the Chrome extension
3. Ensure your hosting platform supports WebSocket connections

