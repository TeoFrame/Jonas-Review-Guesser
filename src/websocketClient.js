/**
 * WebSocket client for co-op multiplayer functionality
 * Handles connection, room management, and real-time communication
 */

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.connectionId = null;
    this.roomId = null;
    this.isHost = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.serverUrl = null; // Will be set via connect()
  }

  /**
   * Connect to WebSocket server
   * @param {string} serverUrl - WebSocket server URL (e.g., 'ws://localhost:8080' or 'wss://your-server.com')
   * @param {string} roomId - Room ID to join
   * @returns {Promise<void>}
   */
  async connect(serverUrl, roomId) {
    return new Promise((resolve, reject) => {
      try {
        this.serverUrl = serverUrl;
        this.roomId = roomId;
        const url = `${serverUrl}?room=${encodeURIComponent(roomId)}`;
        
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('open');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.isConnected = false;
          this.emit('close');
          
          // Attempt to reconnect if not intentionally closed
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
            setTimeout(() => {
              this.connect(serverUrl, roomId).catch(console.error);
            }, delay);
          } else {
            this.emit('reconnect-failed');
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.connectionId = null;
      this.roomId = null;
      this.isHost = false;
    }
  }

  /**
   * Send message to server
   * @param {Object} data - Message data
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, message not sent:', data);
    }
  }

  /**
   * Handle incoming messages from server
   * @param {Object} data - Message data
   */
  handleMessage(data) {
    switch (data.type) {
      case 'connected':
        this.connectionId = data.connectionId;
        this.isHost = data.isHost;
        this.emit('connected', data);
        break;
      case 'user-joined':
        this.emit('user-joined', data);
        break;
      case 'user-disconnected':
        this.emit('user-disconnected', data);
        break;
      case 'guess':
        this.emit('guess', data);
        break;
      case 'score-update':
        this.emit('score-update', data);
        break;
      case 'game-changed':
        this.emit('game-changed', data);
        break;
      case 'reply-status-update':
        this.emit('reply-status-update', data);
        break;
      case 'leaderboard-reset':
        this.emit('leaderboard-reset', data);
        break;
      case 'error':
        this.emit('error', data);
        break;
      default:
        this.emit('message', data);
    }
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Convenience methods for sending specific message types

  /**
   * Send a guess
   * @param {number} guess - The guess value
   * @param {string} gameId - Current game ID
   */
  sendGuess(guess, gameId) {
    this.send({
      type: 'guess',
      guess: guess,
      gameId: gameId,
    });
  }

  /**
   * Send correct guess notification
   */
  sendCorrectGuess() {
    this.send({
      type: 'correct-guess',
    });
  }

  /**
   * Navigate to next game (host only)
   * @param {string} gameId - New game ID
   */
  sendNextGame(gameId) {
    this.send({
      type: 'next-game',
      gameId: gameId,
    });
  }

  /**
   * Update user ready/reply status
   * @param {boolean} hasReplied - Whether user has replied
   */
  sendUserReady(hasReplied = true) {
    this.send({
      type: 'user-ready',
      hasReplied: hasReplied,
    });
  }

  /**
   * Reset leaderboard (host only)
   */
  sendResetLeaderboard() {
    this.send({
      type: 'reset-leaderboard',
    });
  }
}

// Export singleton instance
const wsClient = new WebSocketClient();

// Helper function to generate room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Make available globally for Chrome extension
if (typeof window !== 'undefined') {
  window.WebSocketClient = WebSocketClient;
  window.wsClient = wsClient;
  window.generateRoomCode = generateRoomCode;
}

// Export both the class and instance (for Node.js if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSocketClient, wsClient, generateRoomCode };
}

