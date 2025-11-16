# Phase 1 Client Testing Guide

This guide helps you test the WebSocket client connection for the co-op multiplayer functionality.

## Quick Test

### Method 1: Browser Console (Easiest)

1. **Start the server:**
   ```bash
   cd server
   npm install  # if not done already
   npm run dev
   ```
   Server should start on `ws://localhost:8080`

2. **Load the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project root directory

3. **Open a Steam page:**
   - Navigate to any Steam game page (e.g., `https://store.steampowered.com/app/730/`)

4. **Open browser console (F12) and test:**
   
   **Important:** Make sure you're in the correct console context:
   - The extension scripts run in an isolated context
   - You may need to check the console dropdown to select the right context
   - Or use the ReviewGuesser namespace directly (more reliable)
   
   ```javascript
   // Method 1: Use ReviewGuesser namespace (most reliable)
   ReviewGuesser.coop.testConnection('ws://localhost:8080', 'test-room')
   
   // Method 2: Direct function (if available)
   testCoopConnection('ws://localhost:8080', 'test-room')
   
   // Or use the co-op manager directly
   ReviewGuesser.coop.connect('test-room', 'ws://localhost:8080')
   
   // Check status
   ReviewGuesser.coop.getStatus()
   
   // Disconnect
   ReviewGuesser.coop.disconnect()
   ```
   
   **If functions are not available:**
   - Reload the extension: Go to `chrome://extensions/` → Click reload on your extension
   - Reload the Steam page
   - Check console for `[Co-op]` messages to verify scripts loaded
   - Try: `window.ReviewGuesser.coop.testConnection('ws://localhost:8080', 'test-room')`

### Method 2: Test HTML Page

1. **Start the server:**
   ```bash
   cd server
   npm run dev
   ```

2. **Open the test page:**
   - Open `server/test-client.html` in your browser
   - Or serve it with a simple HTTP server:
     ```bash
     # Python 3
     python -m http.server 8000
     # Then open http://localhost:8000/server/test-client.html
     ```

3. **Test connection:**
   - Enter server URL: `ws://localhost:8080`
   - Enter room ID: `test-room` (or generate random)
   - Click "Connect"
   - Try sending test messages

### Method 3: Multiple Browser Windows

1. **Start the server:**
   ```bash
   cd server
   npm run dev
   ```

2. **Open two browser windows:**
   - Window 1: Connect to room "test-room" as host
   - Window 2: Connect to same room "test-room" as client

3. **Test in console:**
   ```javascript
   // Window 1 (Host)
   ReviewGuesser.coop.connect('test-room', 'ws://localhost:8080')
   
   // Window 2 (Client) - same room
   ReviewGuesser.coop.connect('test-room', 'ws://localhost:8080')
   
   // Window 1 - Send a message
   ReviewGuesser.coop.getState().client.sendUserReady(true)
   
   // Window 2 - Should receive the message
   ```
   
   **Note:** If `ReviewGuesser` is not available, check:
   - Extension is loaded and enabled
   - Page is reloaded after extension installation
   - Console context is correct (extension context, not page context)

## Expected Console Output

When connection is successful, you should see:

```
[Co-op] WebSocket client initialized
[Co-op] Auto-initialized WebSocket client
[Co-op] Test function available: testCoopConnection(serverUrl, roomId)
[Co-op] Connecting to room "test-room" on ws://localhost:8080...
WebSocket connected
[Co-op] Connection opened
[Co-op] Connected to room: {connectionId: "...", role: "host", isHost: true, ...}
[Co-op] ✅ Connection test successful!
```

## Troubleshooting

### "WebSocketClient not available"
- Make sure `websocketClient.js` is loaded before `coopManager.js`
- Check manifest.json has correct script order
- Reload the extension

### "Connection failed" or "WebSocket error"
- Make sure the server is running: `cd server && npm run dev`
- Check server URL is correct (default: `ws://localhost:8080`)
- Check browser console for detailed error messages
- Try the test HTML page to isolate extension issues

### "Failed to reconnect"
- Server might be down
- Check firewall settings
- Verify server is accessible

## Testing Checklist

- [ ] Server starts without errors
- [ ] Can connect from browser console
- [ ] Can connect from test HTML page
- [ ] Multiple clients can join same room
- [ ] Host/client roles are assigned correctly
- [ ] Messages are received by other clients
- [ ] Disconnection works properly
- [ ] Reconnection works after disconnect

## Next Steps

Once Phase 1 testing is complete:
- ✅ Server is running
- ✅ Client can connect
- ✅ Multiple users can join same room
- ✅ Messages are being sent/received

Proceed to **Phase 2**: Add UI controls (Share, Join buttons) and integrate with the game logic.

