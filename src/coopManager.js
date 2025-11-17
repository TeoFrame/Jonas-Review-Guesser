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
    userId: null, // Persistent user ID for reconnection
    nickname: null, // User's nickname
    gameState: null,
    serverUrl: DEFAULT_SERVER_URL,
    isReconnecting: false, // Flag to prevent infinite reconnection loops
    reconnectAttempts: 0, // Track reconnection attempts
    maxReconnectAttempts: 5, // Maximum reconnection attempts
  };

  /**
   * Get or create persistent user ID
   */
  async function getOrCreateUserId() {
    if (coopState.userId) {
      return coopState.userId;
    }

    // Try to get from sessionStorage first (for current session)
    try {
      const sessionUserId = sessionStorage.getItem('coopUserId');
      if (sessionUserId) {
        coopState.userId = sessionUserId;
        console.log('[Co-op] Retrieved userId from sessionStorage:', sessionUserId);
        return coopState.userId;
      }
    } catch (error) {
      console.warn('[Co-op] Could not read user ID from sessionStorage:', error);
    }

    // Try to get from chrome.storage (persistent across sessions)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get(['coopUserId']);
        if (result.coopUserId) {
          coopState.userId = result.coopUserId;
          // Also save to sessionStorage for faster access
          try {
            sessionStorage.setItem('coopUserId', result.coopUserId);
          } catch (e) {
            // Ignore sessionStorage errors
          }
          console.log('[Co-op] Retrieved userId from chrome.storage:', result.coopUserId);
          return coopState.userId;
        }
      } catch (error) {
        console.warn('[Co-op] Could not read user ID from chrome.storage:', error);
      }
    }

    // Generate new user ID
    let userId;
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        userId = `user_${crypto.randomUUID()}`;
      } else {
        userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
    } catch (e) {
      // Fallback if crypto.randomUUID fails
      userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    if (!userId || typeof userId !== 'string') {
      throw new Error('Failed to generate userId');
    }
    
    coopState.userId = userId;

    // Save to both storages
    try {
      sessionStorage.setItem('coopUserId', userId);
    } catch (e) {
      // Ignore sessionStorage errors
    }
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.local.set({ coopUserId: userId });
      } catch (error) {
        console.warn('[Co-op] Could not save user ID to chrome.storage:', error);
      }
    }

    console.log('[Co-op] Generated new userId:', userId);
    return userId;
  }

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
        gameState: data.gameState,
      });
      
      coopState.connectionId = data.connectionId;
      coopState.gameState = data.gameState;
      coopState.isConnected = true;
      coopState.isReconnecting = false; // Reset reconnection flag on successful connection
      coopState.reconnectAttempts = 0; // Reset reconnection attempts on successful connection
      
      // Reset navigation flag on successful connection
      if (coopState.client) {
        coopState.client.isNavigating = false;
      }
      
      // Store userId from gameState if available (find user with matching connectionId)
      if (data.gameState && data.gameState.users) {
        const user = Object.values(data.gameState.users).find(u => u.id === data.connectionId);
        if (user && user.userId) {
          // Update our userId if server assigned a different one (shouldn't happen, but just in case)
          if (coopState.userId !== user.userId) {
            console.log('[Co-op] Server assigned different userId:', user.userId, 'vs our:', coopState.userId);
            coopState.userId = user.userId;
            // Save it
            try {
              sessionStorage.setItem('coopUserId', user.userId);
              if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ coopUserId: user.userId });
              }
            } catch (e) {
              // Ignore storage errors
            }
          }
          
          // If user already has a name, use it (reconnection)
          if (user.name && !coopState.nickname) {
            coopState.nickname = user.name;
          }
        }
      }
      
      // Ensure userId is set (should already be set, but double-check)
      if (!coopState.userId) {
        console.warn('[Co-op] No userId after connection, generating one...');
        getOrCreateUserId().catch(err => console.error('[Co-op] Error generating userId:', err));
      }
      
      // Send nickname to server if we have one
      // If nickname was provided via connect() call, it's already set
      // Otherwise, prompt for it (only on first connection, not reconnection)
      if (!coopState.nickname) {
        // Only prompt if we don't have a saved nickname
        const savedNickname = sessionStorage.getItem('coopNickname');
        if (savedNickname) {
          coopState.nickname = savedNickname;
        } else {
          const nickname = prompt('Enter your nickname:') || '';
          const trimmedNickname = nickname.trim();
          if (trimmedNickname) {
            coopState.nickname = trimmedNickname;
            // Save nickname to sessionStorage
            try {
              sessionStorage.setItem('coopNickname', trimmedNickname);
            } catch (e) {
              // Ignore storage errors
            }
          } else {
            // Use default name if user cancels
            coopState.nickname = `User ${coopState.userId ? coopState.userId.slice(-6) : 'Unknown'}`;
          }
        }
      }
      
      // Send nickname to server
      if (coopState.client && coopState.isConnected && coopState.nickname) {
        coopState.client.sendUserReady(true, coopState.nickname);
      }
      
      // Save connection info immediately after successful connection
      // This is critical for reconnection after page navigation
      if (coopState.roomId) {
        console.log('[Co-op] Saving connection info after successful connection...');
        saveConnectionInfo(coopState.roomId, coopState.serverUrl).then(() => {
          // Verify save worked
          getSavedConnectionInfo().then(verify => {
            if (verify && verify.roomId === coopState.roomId) {
              console.log('[Co-op] ✅ Connection info verified saved correctly');
            } else {
              console.error('[Co-op] ❌ Connection info save verification failed!', verify);
            }
          });
        });
      } else {
        console.warn('[Co-op] No roomId to save!');
      }
      
      emitStatusChange();
    });

    // User joined
    coopState.client.on('user-joined', (data) => {
      console.log('[Co-op] User joined:', data.user);
      coopState.gameState = data.gameState;
      emitStatusChange();
    });

    // Reply counts updated
    coopState.client.on('reply-counts-update', (data) => {
      console.log('[Co-op] Reply counts updated:', data);
      console.log('[Co-op] GameState:', data.gameState);
      console.log('[Co-op] CurrentGameStats:', data.gameState?.currentGameStats);
      console.log('[Co-op] RoomStatus:', data.gameState?.roomStatus);
      if (data.gameState) {
        coopState.gameState = data.gameState;
      }
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('coop-reply-counts-update', {
        detail: data
      }));
    });

    // Next game vote updated
    coopState.client.on('next-game-vote-update', (data) => {
      console.log('[Co-op] Next game vote updated:', data);
      // Update gameState, merging with existing state to preserve other fields
      if (data.gameState) {
        if (coopState.gameState) {
          // Merge the update into existing gameState
          coopState.gameState = {
            ...coopState.gameState,
            ...data.gameState,
            // Ensure nextGameVotes is updated
            nextGameVotes: data.gameState.nextGameVotes || data.nextGameVotes || coopState.gameState.nextGameVotes,
          };
        } else {
          coopState.gameState = data.gameState;
        }
      }
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('coop-next-game-vote-update', {
        detail: data
      }));
    });

    // Next game selected (voting complete)
    coopState.client.on('next-game-selected', (data) => {
      console.log('[Co-op] Next game selected:', data.option, data.gameId);
      if (data.gameState) {
        coopState.gameState = data.gameState;
      }
      // Dispatch event for navigation
      window.dispatchEvent(new CustomEvent('coop-next-game-selected', {
        detail: data
      }));
    });

    // User disconnected
    coopState.client.on('user-disconnected', (data) => {
      console.log('[Co-op] User disconnected:', data.connectionId);
      coopState.gameState = data.gameState;
    });

    // Connection closed
    coopState.client.on('close', () => {
      console.log('[Co-op] Connection closed');
      coopState.isConnected = false;
      emitStatusChange();
    });

    // Handle reconnect-needed event from WebSocket client
    coopState.client.on('reconnect-needed', async (data) => {
      // Don't reconnect if client is navigating (new page will handle it)
      if (coopState.client && coopState.client.isNavigating) {
        console.log('[Co-op] Client is navigating, skipping reconnection');
        return;
      }
      
      // Prevent infinite reconnection loops
      if (coopState.isReconnecting) {
        console.log('[Co-op] Already reconnecting, ignoring reconnect-needed event');
        return;
      }
      
      // Check if we've exceeded max attempts
      if (coopState.reconnectAttempts >= coopState.maxReconnectAttempts) {
        console.log('[Co-op] Max reconnection attempts reached, stopping reconnection');
        return;
      }
      
      console.log('[Co-op] Reconnection needed, attempting reconnect with userId...', data);
      if (data && data.roomId && data.serverUrl) {
        coopState.isReconnecting = true;
        coopState.reconnectAttempts++;
        
        // Add a delay before reconnecting to avoid immediate loops
        const delay = Math.min(1000 * Math.pow(2, coopState.reconnectAttempts - 1), 10000); // Exponential backoff, max 10s
        console.log(`[Co-op] Waiting ${delay}ms before reconnection attempt ${coopState.reconnectAttempts}...`);
        
        setTimeout(async () => {
          // Check again if navigating before attempting reconnection
          if (coopState.client && coopState.client.isNavigating) {
            console.log('[Co-op] Navigation detected during reconnection delay, cancelling');
            coopState.isReconnecting = false;
            return;
          }
          
          try {
            // Ensure we have userId before reconnecting
            const userId = data.userId || await getOrCreateUserId();
            if (userId) {
              await connectToRoom(data.roomId, data.serverUrl);
              // Reset attempts on successful connection
              coopState.reconnectAttempts = 0;
            } else {
              console.error('[Co-op] Cannot reconnect: no userId available');
            }
          } catch (error) {
            console.error('[Co-op] Reconnection failed:', error);
          } finally {
            coopState.isReconnecting = false;
          }
        }, delay);
      }
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
      
      // Emit event for navigation handler
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('coop-game-changed', {
          detail: data
        }));
      }
    });

    // Score update
    coopState.client.on('score-update', (data) => {
      console.log('[Co-op] Score update:', data);
      // Update gameState, merging with existing state to preserve other fields
      if (data.gameState) {
        if (coopState.gameState) {
          coopState.gameState = {
            ...coopState.gameState,
            ...data.gameState,
            users: data.gameState.users || coopState.gameState.users,
          };
        } else {
          coopState.gameState = data.gameState;
        }
      }
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('coop-score-update', {
        detail: data
      }));
    });

    // Reply status update
    coopState.client.on('reply-status-update', (data) => {
      console.log('[Co-op] Reply status update:', data);
      coopState.gameState = data.gameState;
    });

    // Leaderboard reset
    coopState.client.on('leaderboard-reset', (data) => {
      console.log('[Co-op] Leaderboard reset');
      if (data.gameState) {
        if (coopState.gameState) {
          coopState.gameState = {
            ...coopState.gameState,
            ...data.gameState,
            users: data.gameState.users || coopState.gameState.users,
          };
        } else {
          coopState.gameState = data.gameState;
        }
      }
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('coop-leaderboard-reset', {
        detail: data
      }));
    });
  }

  /**
   * Save connection info to sessionStorage for reconnection after page navigation
   */
  async function saveConnectionInfo(roomId, serverUrl) {
    console.log('[Co-op] Attempting to save connection info:', { roomId, serverUrl });
    
    try {
      const userId = await getOrCreateUserId();
      sessionStorage.setItem('coopRoomId', roomId);
      sessionStorage.setItem('coopServerUrl', serverUrl);
      sessionStorage.setItem('coopConnected', 'true');
      sessionStorage.setItem('coopUserId', userId);
      
      // Save nickname if available
      if (coopState.nickname) {
        sessionStorage.setItem('coopNickname', coopState.nickname);
      }
      
      console.log('[Co-op] ✅ Connection info saved to sessionStorage:', {
        roomId,
        serverUrl,
        userId,
        nickname: coopState.nickname,
      });
      
      // Verify it was saved
      const verify = {
        roomId: sessionStorage.getItem('coopRoomId'),
        connected: sessionStorage.getItem('coopConnected'),
      };
      console.log('[Co-op] Verification - saved data:', verify);
    } catch (error) {
      console.error('[Co-op] ❌ Error saving connection info:', error);
    }
  }

  /**
   * Clear connection info from sessionStorage
   */
  async function clearConnectionInfo() {
    try {
      sessionStorage.removeItem('coopRoomId');
      sessionStorage.removeItem('coopServerUrl');
      sessionStorage.removeItem('coopConnected');
      // Note: We keep coopUserId and coopNickname so user keeps same ID and nickname across sessions
      console.log('[Co-op] Connection info cleared from sessionStorage');
    } catch (error) {
      console.warn('[Co-op] Could not clear connection info:', error);
    }
  }

  /**
   * Get saved connection info from sessionStorage
   */
  async function getSavedConnectionInfo() {
    console.log('[Co-op] Attempting to retrieve saved connection info...');
    
    try {
      const roomId = sessionStorage.getItem('coopRoomId');
      const serverUrl = sessionStorage.getItem('coopServerUrl');
      const connected = sessionStorage.getItem('coopConnected');
      const userId = sessionStorage.getItem('coopUserId');
      const nickname = sessionStorage.getItem('coopNickname');
      
      console.log('[Co-op] SessionStorage result:', { roomId, serverUrl, connected, userId, nickname });
      
      if (connected === 'true' && roomId) {
        // Restore user ID if available
        if (userId) {
          coopState.userId = userId;
        }
        
        // Restore nickname if available
        if (nickname) {
          coopState.nickname = nickname;
        }
        
        console.log('[Co-op] ✅ Found saved connection info in sessionStorage');
        return {
          roomId,
          serverUrl: serverUrl || DEFAULT_SERVER_URL,
          userId,
          nickname,
        };
      } else {
        console.log('[Co-op] No valid connection info in sessionStorage');
      }
    } catch (error) {
      console.error('[Co-op] Error reading sessionStorage:', error);
    }
    
    console.log('[Co-op] No saved connection info found');
    return null;
  }

  /**
   * Connect to a room
   * @param {string} roomId - Room ID to join
   * @param {string} serverUrl - Optional server URL
   * @param {string} userName - User name/nickname (optional)
   * @returns {Promise<void>}
   */
  async function connectToRoom(roomId, serverUrl = null, userName = null) {
    if (!coopState.client) {
      if (!initWebSocketClient(serverUrl || DEFAULT_SERVER_URL)) {
        throw new Error('Failed to initialize WebSocket client');
      }
    }

    const url = serverUrl || coopState.serverUrl;
    coopState.roomId = roomId;

    try {
      // Always ensure we have a userId before connecting
      let userId = await getOrCreateUserId();
      
      // Double-check that userId is valid
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        console.error('[Co-op] Invalid userId from getOrCreateUserId:', userId);
        // Try one more time
        userId = await getOrCreateUserId();
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
          throw new Error('Failed to get or create valid userId');
        }
      }
      
      // Ensure userId is set in coopState
      if (coopState.userId !== userId) {
        coopState.userId = userId;
        console.log('[Co-op] Updated coopState.userId to:', userId);
      }
      
      console.log(`[Co-op] Connecting to room "${roomId}" on ${url}...`, { 
        userId, 
        userIdType: typeof userId,
        userIdLength: userId ? userId.length : 0,
        coopStateUserId: coopState.userId 
      });
      
      // Final validation before connecting
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        throw new Error(`Invalid userId before connect: ${userId} (type: ${typeof userId})`);
      }
      
      // Set nickname if provided
      if (userName && userName.trim()) {
        coopState.nickname = userName.trim();
        // Save nickname to sessionStorage
        try {
          sessionStorage.setItem('coopNickname', coopState.nickname);
        } catch (e) {
          // Ignore storage errors
        }
      }
      
      await coopState.client.connect(url, roomId, userId);
      console.log('[Co-op] Successfully connected to room');
      
      // Send nickname to server if we have one (don't wait for prompt)
      if (coopState.nickname && coopState.client && coopState.isConnected) {
        coopState.client.sendUserReady(true, coopState.nickname);
      }
      
      // Note: Connection info will be saved in the 'connected' event handler
      // where we have full connection details (connectionId, role, etc.)
    } catch (error) {
      console.error('[Co-op] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from room
   */
  async function disconnect() {
    if (coopState.client && coopState.isConnected) {
      coopState.client.disconnect();
      coopState.isConnected = false;
      coopState.roomId = null;
      coopState.connectionId = null;
      coopState.gameState = null;
      console.log('[Co-op] Disconnected');
      
      // Clear saved connection info
      await clearConnectionInfo();
      
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

  /**
   * Attempt to reconnect using saved connection info
   */
  async function attemptReconnection() {
    // Prevent concurrent reconnection attempts
    if (coopState.isReconnecting) {
      console.log('[Co-op] Already reconnecting via reconnect-needed handler, skipping attemptReconnection');
      return false;
    }
    
    try {
      const saved = await getSavedConnectionInfo();
      if (saved && !coopState.isConnected) {
        console.log('[Co-op] Found saved connection info, attempting to reconnect...');
        console.log('[Co-op] Room:', saved.roomId, 'Server:', saved.serverUrl);
        
        // Mark as reconnecting to prevent conflicts
        coopState.isReconnecting = true;
        
        try {
          // Reconnect quickly to minimize the gap
          await connectToRoom(saved.roomId, saved.serverUrl);
          console.log('[Co-op] ✅ Successfully reconnected!');
          
          // Reset reconnection flag
          coopState.isReconnecting = false;
          coopState.reconnectAttempts = 0;
          
          // Note: Server will assign new connectionId, but we keep the same room
          // The server should recognize us as the same user if we reconnect fast enough
          return true;
        } catch (error) {
          console.warn('[Co-op] Reconnection failed:', error);
          coopState.isReconnecting = false;
          // Don't clear immediately - might be temporary network issue
          return false;
        }
      } else if (coopState.isConnected) {
        console.log('[Co-op] Already connected, skipping reconnection');
      } else {
        console.log('[Co-op] No saved connection info found');
      }
    } catch (error) {
      console.error('[Co-op] Error during reconnection attempt:', error);
      coopState.isReconnecting = false;
    }
    return false;
  }

  // Expose API on namespace
  /**
   * Connect to a room (public API wrapper)
   * @param {string} roomId - Room ID to connect to
   * @param {string} serverUrl - WebSocket server URL
   * @param {string} userName - User name/nickname (optional)
   */
  async function connect(roomId, serverUrl = null, userName = null) {
    return connectToRoom(roomId, serverUrl, userName);
  }

  ns.coop = {
    init: initWebSocketClient,
    connect: connect,
    disconnect: disconnect,
    getStatus: getStatus,
    testConnection: testConnection,
    attemptReconnection: attemptReconnection,
    saveConnectionInfo: saveConnectionInfo,
    getState: () => ({ ...coopState }), // Read-only state access
  };

  /**
   * Initialize and attempt reconnection
   * This function is called on every page load, including age-check pages
   */
  async function initializeAndReconnect() {
    if (typeof window === 'undefined') return;
    
    // Check if we're on a Steam page (including age-check pages)
    const isSteamPage = /store\.steampowered\.com/.test(location.host);
    if (!isSteamPage) {
      console.log('[Co-op] Not on Steam page, skipping initialization');
      return;
    }
    
    // Ensure userId is loaded/created early, before any connections
    await getOrCreateUserId();
    console.log('[Co-op] userId initialized:', coopState.userId);
    
    if (window.wsClient) {
      initWebSocketClient();
      console.log('[Co-op] Auto-initialized WebSocket client');
      
      // Attempt to reconnect if we have saved connection info
      // Reconnect as quickly as possible to minimize disconnection time
      // But wait a bit to avoid conflicts with reconnect-needed handler
      setTimeout(async () => {
        // Only attempt reconnection if not already reconnecting via reconnect-needed handler
        if (!coopState.isReconnecting) {
          const reconnected = await attemptReconnection();
          if (reconnected) {
            console.log('[Co-op] Reconnection completed, status:', getStatus());
          }
        } else {
          console.log('[Co-op] Reconnection already in progress via reconnect-needed handler, skipping attemptReconnection');
        }
      }, 100); // Small delay to let reconnect-needed handler take precedence if needed
    } else {
      // Wait for websocketClient to load
      window.addEventListener('load', async () => {
        // Ensure userId is set before attempting connection
        await getOrCreateUserId();
        
        if (window.wsClient) {
          initWebSocketClient();
          console.log('[Co-op] Auto-initialized WebSocket client (after load)');
          
          // Attempt to reconnect if we have saved connection info
          setTimeout(async () => {
            // Only attempt reconnection if not already reconnecting via reconnect-needed handler
            if (!coopState.isReconnecting) {
              const reconnected = await attemptReconnection();
              if (reconnected) {
                console.log('[Co-op] Reconnection completed, status:', getStatus());
              }
            } else {
              console.log('[Co-op] Reconnection already in progress via reconnect-needed handler, skipping attemptReconnection');
            }
          }, 100); // Small delay to let reconnect-needed handler take precedence if needed
        }
      });
    }
  }

  // Auto-initialize on page load (works for both regular and age-check pages)
  if (typeof window !== 'undefined') {
    // Try immediate initialization
    initializeAndReconnect();
    
    // Also try on DOMContentLoaded (for age-check pages that might load differently)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeAndReconnect);
    }
    
    // Also try on window load as fallback
    window.addEventListener('load', () => {
      setTimeout(initializeAndReconnect, 100);
    });
  }

  /**
   * Test sessionStorage access
   */
  async function testStorageAccess() {
    console.log('[Co-op] Testing sessionStorage access...');
    
    try {
      // Test write
      const testKey = 'coopTest';
      const testValue = 'test-value-' + Date.now();
      sessionStorage.setItem(testKey, testValue);
      console.log('[Co-op] ✅ sessionStorage write test: SUCCESS');
      
      // Test read
      const result = sessionStorage.getItem(testKey);
      if (result === testValue) {
        console.log('[Co-op] ✅ sessionStorage read test: SUCCESS', result);
      } else {
        console.error('[Co-op] ❌ sessionStorage read test: FAILED - value mismatch');
        return false;
      }
      
      // Clean up
      sessionStorage.removeItem(testKey);
      
      return true;
    } catch (error) {
      console.error('[Co-op] ❌ sessionStorage test failed:', error);
      return false;
    }
  }

  // Expose test function globally for console testing
  // Use setTimeout to ensure window is ready (for content scripts)
  if (typeof window !== 'undefined') {
    // Expose on window directly
    window.testCoopConnection = testConnection;
    window.testCoopStorage = testStorageAccess;
    
    // Also expose via ReviewGuesser namespace (more reliable)
    ns.testCoopConnection = testConnection;
    ns.testCoopStorage = testStorageAccess;
    
    // Use setTimeout to ensure it's available after script execution
    setTimeout(async () => {
      if (!window.testCoopConnection) {
        window.testCoopConnection = testConnection;
      }
      if (!window.testCoopStorage) {
        window.testCoopStorage = testStorageAccess;
      }
      
      // Test storage access on initialization
      await testStorageAccess();
      
      console.log('[Co-op] ✅ Test functions available:');
      console.log('  - testCoopConnection(serverUrl, roomId)');
      console.log('  - testCoopStorage() - test sessionStorage access');
      console.log('  - ReviewGuesser.coop.testConnection(serverUrl, roomId)');
      console.log('  Example: testCoopConnection("ws://localhost:8080", "test-room")');
    }, 100);
  }
})(window);

