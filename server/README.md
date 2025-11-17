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

The server requires SSL certificates and will run on `wss://` (secure WebSocket).

### 3. Environment Variables

- `PORT` - Server port (default: 443)
- `SSL_KEY_PATH` - Path to SSL private key file (required)
- `SSL_CERT_PATH` - Path to SSL certificate file (required)

**SSL/WSS is required (for HTTPS pages like Steam):**

1. **Generate SSL certificates** (self-signed for development):
   ```bash
   npm run generate-cert
   ```
   
   This works on all platforms (Windows, Linux, Mac) and doesn't require OpenSSL.

2. **Set environment variables:**
   ```bash
   # Linux/Mac
   export SSL_KEY_PATH=$(pwd)/certs/private.key
   export SSL_CERT_PATH=$(pwd)/certs/certificate.crt
   
   # Windows
   set SSL_KEY_PATH=%CD%\certs\private.key
   set SSL_CERT_PATH=%CD%\certs\certificate.crt
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

**Important Notes:**

- **Self-signed certificates**: Browsers will show a security warning when connecting to a server with self-signed certificates. Users must:
  1. First visit the WebSocket URL directly in their browser (e.g., `https://31.43.142.49:443`) 
  2. Click "Advanced" and accept the security warning to allow the certificate
  3. After accepting, the extension will be able to connect to the server from Steam pages
  
- **Production**: For production, use certificates from a trusted Certificate Authority (e.g., Let's Encrypt) to avoid browser warnings.

The server requires SSL certificates to start. It will exit with an error if SSL_KEY_PATH or SSL_CERT_PATH are not set.

## Usage

### Connection

Connect to the server with a room ID:

```
wss://your-server.com:443/?room=ROOM_CODE
```

Note: The server only supports secure WebSocket (wss://) connections.

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

