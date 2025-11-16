/**
 * Co-op Manager - Handles WebSocket connection and multiplayer state
 * Phase 1: Basic connection testing and initialization
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});
  
  // Default server URL (can be overridden)
  const DEFAULT_SERVER_URL = 'ws://localhost:8080';
  
  // Co-op state
  const coopState = {
    client: null,
    isConnected: false,
    roomId: null,
    connectionId: null,
    isHost: false,
    gameState: null,
    serverUrl: DEFAULT_SERVER_URL,
  };

  /**
   * Initialize WebSocket client
   * @param {string} serverUrl - Optional server URL (defaults to localhost)
   */
  function initWebSocketClient(serverUrl = DEFAULT_SERVER_URL) {
    if (!window.wsClient) {
      console.error('WebSocketClient not available. Make sure websocketClient.js is loaded.');
      return false;
    }

    coopState.client = window.wsClient;
    coopState.serverUrl = serverUrl;
    
    // Set up event listeners
    setupEventListeners();
    
    console.log('[Co-op] WebSocket client initialized');
    return true;
  }

  /**
   * Set up event listeners for WebSocket events
   */
  function setupEventListeners() {
    if (!coopState.client) return;

    // Connection opened
    coopState.client.on('open', () => {
      console.log('[Co-op] Connection opened');
      coopState.isConnected = true;
      emitStatusChange();
    });

    // Connected to room
    coopState.client.on('connected', (data) => {
      console.log('[Co-op] Connected to room:', {
        connectionId: data.connectionId,
        role: data.role,
        isHost: data.isHost,
        gameState: data.gameState,
      });
      
      coopState.connectionId = data.connectionId;
      coopState.isHost = data.isHost;
      coopState.gameState = data.gameState;
      coopState.isConnected = true;
      emitStatusChange();
    });

    // User joined
    coopState.client.on('user-joined', (data) => {
      console.log('[Co-op] User joined:', data.user);
      coopState.gameState = data.gameState;
    });

    // User disconnected
    coopState.client.on('user-disconnected', (data) => {
      console.log('[Co-op] User disconnected:', data.connectionId);
      coopState.gameState = data.gameState;
      
      // Check if we became the new host
      if (data.gameState && data.gameState.hostId === coopState.connectionId && !coopState.isHost) {
        coopState.isHost = true;
        console.log('[Co-op] You are now the host!');
        
        // Show notification to user
        if (ns.coopUI && ns.coopUI.showMessage) {
          ns.coopUI.showMessage('You are now the host!', 'success');
        }
        
        emitStatusChange();
      }
    });

    // Host migrated (we became the new host)
    coopState.client.on('host-migrated', (data) => {
      console.log('[Co-op] Host migrated - you are now the host!');
      coopState.connectionId = data.connectionId;
      coopState.isHost = true;
      coopState.gameState = data.gameState;
      
      // Show notification to user
      if (ns.coopUI && ns.coopUI.showMessage) {
        ns.coopUI.showMessage('You are now the host!', 'success');
      }
      
      emitStatusChange();
    });

    // Connection closed
    coopState.client.on('close', () => {
      console.log('[Co-op] Connection closed');
      coopState.isConnected = false;
      emitStatusChange();
    });

    // Reconnection failed
    coopState.client.on('reconnect-failed', () => {
      console.error('[Co-op] Failed to reconnect after multiple attempts');
    });

    // Error
    coopState.client.on('error', (error) => {
      console.error('[Co-op] Error:', error);
    });

    // Game changed
    coopState.client.on('game-changed', (data) => {
      console.log('[Co-op] Game changed:', data.gameId);
      coopState.gameState = data.gameState;
    });

    // Score update
    coopState.client.on('score-update', (data) => {
      console.log('[Co-op] Score update:', data);
      coopState.gameState = data.gameState;
    });

    // Reply status update
    coopState.client.on('reply-status-update', (data) => {
      console.log('[Co-op] Reply status update:', data);
      coopState.gameState = data.gameState;
    });

    // Leaderboard reset
    coopState.client.on('leaderboard-reset', (data) => {
      console.log('[Co-op] Leaderboard reset');
      coopState.gameState = data.gameState;
    });
  }

  /**
   * Connect to a room
   * @param {string} roomId - Room ID to join
   * @param {string} serverUrl - Optional server URL
   * @returns {Promise<void>}
   */
  async function connectToRoom(roomId, serverUrl = null) {
    if (!coopState.client) {
      if (!initWebSocketClient(serverUrl || DEFAULT_SERVER_URL)) {
        throw new Error('Failed to initialize WebSocket client');
      }
    }

    const url = serverUrl || coopState.serverUrl;
    coopState.roomId = roomId;

    try {
      console.log(`[Co-op] Connecting to room "${roomId}" on ${url}...`);
      await coopState.client.connect(url, roomId);
      console.log('[Co-op] Successfully connected to room');
    } catch (error) {
      console.error('[Co-op] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from room
   */
  function disconnect() {
    if (coopState.client && coopState.isConnected) {
      coopState.client.disconnect();
      coopState.isConnected = false;
      coopState.roomId = null;
      coopState.connectionId = null;
      coopState.isHost = false;
      coopState.gameState = null;
      console.log('[Co-op] Disconnected');
      emitStatusChange();
    }
  }

  /**
   * Emit status change event for UI updates
   */
  function emitStatusChange() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('coop-status-change', {
        detail: getStatus()
      }));
    }
  }

  /**
   * Get current connection status
   * @returns {Object} Connection status
   */
  function getStatus() {
    return {
      isConnected: coopState.isConnected,
      roomId: coopState.roomId,
      connectionId: coopState.connectionId,
      isHost: coopState.isHost,
      gameState: coopState.gameState,
      serverUrl: coopState.serverUrl,
    };
  }

  /**
   * Test connection (for Phase 1 testing)
   * @param {string} serverUrl - Server URL to test
   * @param {string} roomId - Room ID to test with
   */
  async function testConnection(serverUrl = DEFAULT_SERVER_URL, roomId = 'test-room') {
    console.log('[Co-op] Starting connection test...');
    console.log(`[Co-op] Server: ${serverUrl}`);
    console.log(`[Co-op] Room: ${roomId}`);

    try {
      await connectToRoom(roomId, serverUrl);
      console.log('[Co-op] ✅ Connection test successful!');
      console.log('[Co-op] Status:', getStatus());
      
      // Test sending a message after 2 seconds
      setTimeout(() => {
        if (coopState.isConnected) {
          console.log('[Co-op] Testing message send...');
          coopState.client.sendUserReady(true);
        }
      }, 2000);
    } catch (error) {
      console.error('[Co-op] ❌ Connection test failed:', error);
      console.log('[Co-op] Make sure the server is running: cd server && npm run dev');
    }
  }

  // Expose API on namespace
  ns.coop = {
    init: initWebSocketClient,
    connect: connectToRoom,
    disconnect: disconnect,
    getStatus: getStatus,
    testConnection: testConnection,
    getState: () => ({ ...coopState }), // Read-only state access
  };

  // Auto-initialize if WebSocketClient is available
  if (typeof window !== 'undefined' && window.wsClient) {
    initWebSocketClient();
    console.log('[Co-op] Auto-initialized WebSocket client');
  } else {
    // Wait for websocketClient to load
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        if (window.wsClient) {
          initWebSocketClient();
          console.log('[Co-op] Auto-initialized WebSocket client (after load)');
        }
      });
    }
  }

  // Expose test function globally for console testing
  // Use setTimeout to ensure window is ready (for content scripts)
  if (typeof window !== 'undefined') {
    // Expose on window directly
    window.testCoopConnection = testConnection;
    
    // Also expose via ReviewGuesser namespace (more reliable)
    ns.testCoopConnection = testConnection;
    
    // Use setTimeout to ensure it's available after script execution
    setTimeout(() => {
      if (!window.testCoopConnection) {
        window.testCoopConnection = testConnection;
      }
      console.log('[Co-op] ✅ Test function available:');
      console.log('  - testCoopConnection(serverUrl, roomId)');
      console.log('  - ReviewGuesser.coop.testConnection(serverUrl, roomId)');
      console.log('  Example: testCoopConnection("ws://localhost:8080", "test-room")');
    }, 100);
  }
})(window);

