import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

/**
 * @typedef {Object} User
 * @property {string} id - Current connection ID (may change on reconnect)
 * @property {string} userId - Persistent user ID (for reconnection)
 * @property {string} name - User display name
 * @property {number} score - Number of correct guesses
 * @property {boolean} isOnline - Whether user is currently connected
 * @property {boolean} hasReplied - Whether user has replied to current game
 * @property {number|null} replyOption - Which option the user replied with (null if not replied)
 * @property {string|null} nextGameVote - Which Next Game option the user voted for: 'raw', 'smart', or null
 */

/**
 * @typedef {Object} GameState
 * @property {string} currentGameId - Current game/app ID
 * @property {Record<string, User>} users - Map of userId to users (persistent across disconnections)
 * @property {Record<string, string>} connectionToUserId - Map of connectionId to userId (for quick lookup)
 * @property {Record<number, number>} replyCounts - Map of option value to count of users who replied with it
 * @property {Record<string, number>} nextGameVotes - Map of vote option ('raw' or 'smart') to count
 * @property {Record<string, string>} nextGameIds - Map of vote option to gameId (for when option is selected)
 * @property {string|null} selectedNextGame - Which Next Game option was selected (null if not yet selected)
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
      users: {}, // Map of userId -> User
      connectionToUserId: {}, // Map of connectionId -> userId
      replyCounts: {},
      nextGameVotes: { raw: 0, smart: 0 },
      nextGameIds: { raw: null, smart: null },
      selectedNextGame: null,
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
  // Extract room ID and user info from URL query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room') || 'default';
  let userId = url.searchParams.get('userId');
  
  // Normalize userId: if it's an empty string, treat as null
  if (userId === '' || userId === null || userId === undefined) {
    userId = null;
  }
  
  // Generate connection ID
  const connectionId = randomUUID();
  ws.connectionId = connectionId;
  ws.roomId = roomId;
  ws.userId = userId;
  
  // Log connection with userId status
  if (!userId) {
    console.warn(`[Server] Connection ${connectionId} to room ${roomId} has no userId in URL. Full URL: ${req.url}`);
  }

  console.log(`New connection: ${connectionId} to room: ${roomId}`, { userId });

  // Get room state
  const state = getRoomState(roomId);
  const clients = state.clients || new Set();
  state.clients = clients;
  
  // Handle duplicate connections from the same userId (multiple tabs)
  // Disconnect any existing connections with the same userId
  if (userId) {
    const existingConnections = Array.from(clients).filter(c => c.userId === userId && c !== ws);
    for (const oldWs of existingConnections) {
      console.log(`Disconnecting duplicate connection for userId ${userId}: ${oldWs.connectionId}`);
      // Mark old connection as offline
      const oldUserId = state.connectionToUserId[oldWs.connectionId];
      if (oldUserId && state.users[oldUserId]) {
        state.users[oldUserId].isOnline = false;
        state.users[oldUserId].id = null;
        // Remove old connection's reply/vote counts
        if (state.users[oldUserId].replyOption !== null) {
          state.replyCounts[state.users[oldUserId].replyOption] = Math.max(0, (state.replyCounts[state.users[oldUserId].replyOption] || 1) - 1);
          if (state.replyCounts[state.users[oldUserId].replyOption] <= 0) {
            delete state.replyCounts[state.users[oldUserId].replyOption];
          }
        }
        if (state.users[oldUserId].nextGameVote) {
          state.nextGameVotes[state.users[oldUserId].nextGameVote] = Math.max(0, (state.nextGameVotes[state.users[oldUserId].nextGameVote] || 1) - 1);
          if (state.nextGameVotes[state.users[oldUserId].nextGameVote] <= 0) {
            delete state.nextGameVotes[state.users[oldUserId].nextGameVote];
          }
        }
      }
      delete state.connectionToUserId[oldWs.connectionId];
      clients.delete(oldWs);
      oldWs.close(1000, 'Duplicate connection from same user');
    }
  }
  
  clients.add(ws);
  
  // Use userId as persistent identifier, or generate one from connectionId
  const persistentUserId = userId || `user_${connectionId}`;
  
  // Check if user already exists (reconnection)
  let user = state.users[persistentUserId];
  
  if (user) {
    // Reconnection: restore user data and mark as online
    console.log(`User reconnected: ${persistentUserId}`);
    user.id = connectionId;
    user.isOnline = true;
    // Reset reply/vote status for new game round (if needed)
    // Keep score and other persistent data
  } else {
    // New user: create user object
    /** @type {User} */
    user = {
      id: connectionId,
      userId: persistentUserId,
      name: `User ${persistentUserId.slice(-6)}`, // Simple name from user ID
      score: 0,
      isOnline: true,
      hasReplied: false,
      replyOption: null,
      nextGameVote: null,
    };
    state.users[persistentUserId] = user;
  }
  
  // Map connectionId to userId for quick lookup
  state.connectionToUserId[connectionId] = persistentUserId;

  // Send connection confirmation with current state
  ws.send(JSON.stringify({
    type: "connected",
    connectionId: connectionId,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      replyCounts: { ...state.replyCounts },
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
      selectedNextGame: state.selectedNextGame,
    },
  }));

  // Notify other users about the new connection
  broadcast(clients, {
    type: "user-joined",
    user: user,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      replyCounts: { ...state.replyCounts },
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
      selectedNextGame: state.selectedNextGame,
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
        case "next-game-vote":
          handleNextGameVote(data, ws, state, clients);
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
    
    const userId = state.connectionToUserId[connectionId];
    const user = userId ? state.users[userId] : null;
    
    // Remove user's reply and vote counts if they had any (only count online users)
    if (user && user.isOnline) {
      if (user.replyOption !== null) {
        state.replyCounts[user.replyOption] = Math.max(0, (state.replyCounts[user.replyOption] || 1) - 1);
        if (state.replyCounts[user.replyOption] <= 0) {
          delete state.replyCounts[user.replyOption];
        }
      }
      if (user.nextGameVote) {
        state.nextGameVotes[user.nextGameVote] = Math.max(0, (state.nextGameVotes[user.nextGameVote] || 1) - 1);
        if (state.nextGameVotes[user.nextGameVote] <= 0) {
          delete state.nextGameVotes[user.nextGameVote];
        }
      }
    }
    
    // Mark user as offline instead of deleting
    if (user) {
      user.isOnline = false;
      user.id = null;
      // Reset reply/vote status for next game
      user.hasReplied = false;
      user.replyOption = null;
      user.nextGameVote = null;
    }
    
    // Remove connection mapping
    delete state.connectionToUserId[connectionId];
    clients.delete(ws);
    
    // Notify other users about the disconnection
    broadcast(clients, {
      type: "user-disconnected",
      connectionId: connectionId,
      userId: userId,
      gameState: {
        currentGameId: state.currentGameId,
        users: state.users,
        replyCounts: { ...state.replyCounts },
        nextGameVotes: { ...state.nextGameVotes },
        nextGameIds: { ...state.nextGameIds },
        selectedNextGame: state.selectedNextGame,
      },
    });

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
  const userId = state.connectionToUserId[ws.connectionId];
  if (!userId) return;
  const user = state.users[userId];
  if (!user || !user.isOnline) return;

  // Track reply option
  const guessValue = data.guess;
  if (user.replyOption !== null) {
    // User changed their reply - decrement old option count
    state.replyCounts[user.replyOption] = (state.replyCounts[user.replyOption] || 1) - 1;
    if (state.replyCounts[user.replyOption] <= 0) {
      delete state.replyCounts[user.replyOption];
    }
  }
  
  user.replyOption = guessValue;
  user.hasReplied = true;
  
  // Increment count for this option
  state.replyCounts[guessValue] = (state.replyCounts[guessValue] || 0) + 1;

  // Broadcast the guess and updated reply counts to all users
  broadcast(clients, {
    type: "guess",
    userId: ws.connectionId,
    userName: user.name,
    guess: data.guess,
    gameId: data.gameId,
    replyCounts: { ...state.replyCounts },
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      replyCounts: { ...state.replyCounts },
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
    },
  }, ws);
  
  // Also send reply-counts-update to all users for UI updates
  broadcast(clients, {
    type: "reply-counts-update",
    replyCounts: { ...state.replyCounts },
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      replyCounts: { ...state.replyCounts },
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
    },
  });
}

/**
 * Handle correct guess - update score
 */
function handleCorrectGuess(data, ws, state, clients) {
  const userId = state.connectionToUserId[ws.connectionId];
  if (!userId) return;
  const user = state.users[userId];
  if (!user || !user.isOnline) return;

  user.score += 1;
  user.hasReplied = true;

  // Broadcast updated leaderboard
  broadcast(clients, {
    type: "score-update",
    userId: userId,
    connectionId: ws.connectionId,
    userName: user.name,
    newScore: user.score,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
    },
  });
}

/**
 * Handle next game vote
 */
function handleNextGameVote(data, ws, state, clients) {
  const userId = state.connectionToUserId[ws.connectionId];
  if (!userId) return;
  const user = state.users[userId];
  if (!user || !user.isOnline) return;
  
  const voteOption = data.option; // 'raw' or 'smart'
  if (!['raw', 'smart'].includes(voteOption)) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Invalid vote option. Must be 'raw' or 'smart'",
    }));
    return;
  }
  
  // If user already voted, remove their old vote
  if (user.nextGameVote) {
    state.nextGameVotes[user.nextGameVote] = Math.max(0, state.nextGameVotes[user.nextGameVote] - 1);
  }
  
  // Add new vote
  user.nextGameVote = voteOption;
  state.nextGameVotes[voteOption] = (state.nextGameVotes[voteOption] || 0) + 1;
  
  // Store gameId for this vote option (use the most recent one)
  if (data.gameId) {
    state.nextGameIds[voteOption] = data.gameId;
  }
  
  // Check if all online users have voted
  const allUsers = Object.values(state.users);
  const onlineUsers = allUsers.filter(u => u.isOnline);
  const allVoted = onlineUsers.length > 0 && onlineUsers.every(u => u.nextGameVote !== null);
  
    // Broadcast vote update to all clients including the sender
    // (so the sender sees their own vote reflected in the counter)
    const voteUpdateMessage = {
      type: "next-game-vote-update",
      userId: userId,
      connectionId: ws.connectionId,
      userName: user.name,
      vote: voteOption,
      nextGameVotes: { ...state.nextGameVotes },
      allVoted: allVoted,
      gameState: {
        currentGameId: state.currentGameId,
        users: state.users,
        replyCounts: { ...state.replyCounts },
        nextGameVotes: { ...state.nextGameVotes },
        nextGameIds: { ...state.nextGameIds },
      },
    };
    
    // Broadcast to all clients (including sender) so everyone sees the updated vote count
    broadcast(clients, voteUpdateMessage);
  
  // If all users voted, select the option with most votes and activate after 1s
  if (allVoted && !state.selectedNextGame) {
    const rawVotes = state.nextGameVotes.raw || 0;
    const smartVotes = state.nextGameVotes.smart || 0;
    const selectedOption = rawVotes >= smartVotes ? 'raw' : 'smart';
    
    state.selectedNextGame = selectedOption;
    
    // Get the gameId for the selected option
    const selectedGameId = state.nextGameIds[selectedOption] || state.currentGameId;
    
    // Wait 1 second before activating
    setTimeout(() => {
      // Broadcast activation
      broadcast(clients, {
        type: "next-game-selected",
        option: selectedOption,
        gameId: selectedGameId,
        gameState: {
          currentGameId: state.currentGameId,
          users: state.users,
          replyCounts: { ...state.replyCounts },
          nextGameVotes: { ...state.nextGameVotes },
          nextGameIds: { ...state.nextGameIds },
          selectedNextGame: selectedOption,
        },
      });
      
      // Reset votes and reply counts for next game
      state.nextGameVotes = { raw: 0, smart: 0 };
      state.nextGameIds = { raw: null, smart: null };
      state.replyCounts = {};
      state.selectedNextGame = null;
      Object.values(state.users).forEach(u => {
        u.nextGameVote = null;
        u.hasReplied = false;
        u.replyOption = null;
      });
      
      // Update current game ID
      state.currentGameId = selectedGameId;
    }, 1000);
  }
}

/**
 * Handle user ready/reply status
 */
function handleUserReady(data, ws, state, clients) {
  const userId = state.connectionToUserId[ws.connectionId];
  if (!userId) return;
  const user = state.users[userId];
  if (!user || !user.isOnline) return;

  user.hasReplied = data.hasReplied !== undefined ? data.hasReplied : true;

  // Broadcast updated reply status
  broadcast(clients, {
    type: "reply-status-update",
    userId: userId,
    connectionId: ws.connectionId,
    userName: user.name,
    hasReplied: user.hasReplied,
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      replyCounts: { ...state.replyCounts },
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
      selectedNextGame: state.selectedNextGame,
    },
  });
}

/**
 * Handle leaderboard reset (anyone can reset)
 */
function handleResetLeaderboard(ws, state, clients) {
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

