import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

/**
 * @typedef {Object} User
 * @property {string} id - Connection ID
 * @property {string} role - "host" or "client"
 * @property {string} name - User display name
 * @property {number} score - Number of correct guesses
 * @property {boolean} hasReplied - Whether user has replied to current game
 */

/**
 * @typedef {Object} GameState
 * @property {string} currentGameId - Current game/app ID
 * @property {Record<string, User>} users - Map of connection IDs to users
 * @property {string} hostId - Connection ID of the host
 */

// Store game state per room
const rooms = new Map();

/**
 * Get or create game state for a room
 * @param {string} roomId
 * @returns {GameState}
 */
function getRoomState(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      currentGameId: "",
      users: {},
      hostId: "",
    });
  }
  return rooms.get(roomId);
}

/**
 * Broadcast message to all clients in a room except sender
 * @param {Set} clients - Set of WebSocket connections
 * @param {Object} message - Message to broadcast
 * @param {WebSocket} exclude - Connection to exclude
 */
function broadcast(clients, message, exclude = null) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === 1) { // 1 = OPEN
      client.send(data);
    }
  });
}

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  // Extract room ID from URL query parameter
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room') || 'default';
  
  // Generate connection ID
  const connectionId = randomUUID();
  ws.connectionId = connectionId;
  ws.roomId = roomId;

  console.log(`New connection: ${connectionId} to room: ${roomId}`);

  // Get room state
  const state = getRoomState(roomId);
  const clients = state.clients || new Set();
  state.clients = clients;
  clients.add(ws);

  // Determine if this is the first user (host) or a client
  const isFirstUser = Object.keys(state.users).length === 0;
  const role = isFirstUser ? "host" : "client";
  
  if (isFirstUser) {
    state.hostId = connectionId;
  }

  // Create user object
  /** @type {User} */
  const user = {
    id: connectionId,
    role: role,
    name: `User ${connectionId.slice(0, 6)}`, // Simple name from connection ID
    score: 0,
    hasReplied: false,
  };

  state.users[connectionId] = user;

  // Send connection confirmation with role and current state
  ws.send(JSON.stringify({
    type: "connected",
    connectionId: connectionId,
    role: role,
    isHost: role === "host",
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      hostId: state.hostId,
    },
  }));

  // Notify other users about the new connection
  broadcast(clients, {
    type: "user-joined",
    user: user,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      hostId: state.hostId,
    },
  }, ws);

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Message from ${connectionId}:`, data.type);

      switch (data.type) {
        case "guess":
          handleGuess(data, ws, state, clients);
          break;
        case "correct-guess":
          handleCorrectGuess(data, ws, state, clients);
          break;
        case "next-game":
          handleNextGame(data, ws, state, clients);
          break;
        case "user-ready":
          handleUserReady(data, ws, state, clients);
          break;
        case "reset-leaderboard":
          handleResetLeaderboard(ws, state, clients);
          break;
        default:
          // Broadcast unknown message types
          broadcast(clients, {
            ...data,
            senderId: connectionId,
          }, ws);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
      ws.send(JSON.stringify({
        type: "error",
        message: "Invalid message format",
      }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`Connection closed: ${connectionId}`);
    
    const user = state.users[connectionId];
    let newHostId = null;
    
    if (user) {
      // If host disconnected, assign new host (first remaining user)
      if (user.role === "host") {
        const remainingUsers = Object.values(state.users).filter(u => u.id !== connectionId);
        if (remainingUsers.length > 0) {
          newHostId = remainingUsers[0].id;
          state.hostId = newHostId;
          remainingUsers[0].role = "host";
          console.log(`Host migrated to: ${newHostId}`);
        } else {
          state.hostId = "";
        }
      }

      delete state.users[connectionId];
    }

    clients.delete(ws);

    // Notify other users about the disconnection
    broadcast(clients, {
      type: "user-disconnected",
      connectionId: connectionId,
      gameState: {
        currentGameId: state.currentGameId,
        users: state.users,
        hostId: state.hostId,
      },
    });

    // If host was migrated, notify the new host specifically
    if (newHostId) {
      // Find the WebSocket connection for the new host
      const newHostClient = Array.from(clients).find(c => {
        // connectionId is stored on the WebSocket object
        return c.connectionId === newHostId;
      });
      
      if (newHostClient && newHostClient.readyState === 1) { // 1 = OPEN
        newHostClient.send(JSON.stringify({
          type: "host-migrated",
          connectionId: newHostId,
          role: "host",
          isHost: true,
          gameState: {
            currentGameId: state.currentGameId,
            users: state.users,
            hostId: state.hostId,
          },
        }));
        console.log(`Notified new host: ${newHostId}`);
      } else {
        console.warn(`Could not notify new host ${newHostId} - client not found or not open`);
      }
    }

    // Clean up empty rooms
    if (clients.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    }
  });

  ws.on('error', (error) => {
    console.error(`Error for connection ${connectionId}:`, error);
  });
});

/**
 * Handle a guess from a user
 */
function handleGuess(data, ws, state, clients) {
  const user = state.users[ws.connectionId];
  if (!user) return;

  // Broadcast the guess to all users
  broadcast(clients, {
    type: "guess",
    userId: ws.connectionId,
    userName: user.name,
    guess: data.guess,
    gameId: data.gameId,
  });
}

/**
 * Handle correct guess - update score
 */
function handleCorrectGuess(data, ws, state, clients) {
  const user = state.users[ws.connectionId];
  if (!user) return;

  user.score += 1;
  user.hasReplied = true;

  // Broadcast updated leaderboard
  broadcast(clients, {
    type: "score-update",
    userId: ws.connectionId,
    userName: user.name,
    newScore: user.score,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      hostId: state.hostId,
    },
  });
}

/**
 * Handle next game navigation (host only)
 */
function handleNextGame(data, ws, state, clients) {
  // Only host can navigate
  if (ws.connectionId !== state.hostId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Only the host can navigate to the next game",
    }));
    return;
  }

  state.currentGameId = data.gameId || "";
  
  // Reset reply status for all users
  Object.values(state.users).forEach(user => {
    user.hasReplied = false;
  });

  // Broadcast game change to all clients
  broadcast(clients, {
    type: "game-changed",
    gameId: state.currentGameId,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      hostId: state.hostId,
    },
  });
}

/**
 * Handle user ready/reply status
 */
function handleUserReady(data, ws, state, clients) {
  const user = state.users[ws.connectionId];
  if (!user) return;

  user.hasReplied = data.hasReplied !== undefined ? data.hasReplied : true;

  // Broadcast updated reply status
  broadcast(clients, {
    type: "reply-status-update",
    userId: ws.connectionId,
    userName: user.name,
    hasReplied: user.hasReplied,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      hostId: state.hostId,
    },
  });
}

/**
 * Handle leaderboard reset (host only)
 */
function handleResetLeaderboard(ws, state, clients) {
  // Only host can reset
  if (ws.connectionId !== state.hostId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Only the host can reset the leaderboard",
    }));
    return;
  }

  // Reset all scores
  Object.values(state.users).forEach(user => {
    user.score = 0;
    user.hasReplied = false;
  });

  // Broadcast reset
  broadcast(clients, {
    type: "leaderboard-reset",
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      hostId: state.hostId,
    },
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

