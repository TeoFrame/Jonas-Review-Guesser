import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import https from 'https';
import fs from 'fs';

/**
 * @typedef {Object} User
 * @property {string} id - Current connection ID (may change on reconnect)
 * @property {string} userId - Persistent user ID (for reconnection)
 * @property {string} name - User display name
 * @property {number} score - Number of correct guesses
 * @property {number} failedGuesses - Number of failed guesses
 * @property {number} totalGuesses - Total number of guesses made
 * @property {string} color - Unique color assigned to this user (hex format)
 * @property {boolean} isOnline - Whether user is currently connected
 * @property {boolean} hasReplied - Whether user has replied to current game
 * @property {number|null} replyOption - Which option the user replied with (null if not replied)
 * @property {string|null} nextGameVote - Which Next Game option the user voted for: 'raw', 'smart', or null
 */

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} userId - User ID
 * @property {number} correctAnswers - Number of correct guesses
 * @property {number} failedAnswers - Number of failed guesses
 */

/**
 * @typedef {Object} CurrentGameStat
 * @property {string} userId - User ID
 * @property {number} answerValue - The answer value the user selected
 */

/**
 * @typedef {Object} GameState
 * @property {string} currentGameId - Current game/app ID
 * @property {Record<string, User>} users - Map of userId to users (persistent across disconnections)
 * @property {Record<string, string>} connectionToUserId - Map of connectionId to userId (for quick lookup)
 * @property {LeaderboardEntry[]} leaderboard - Array of leaderboard entries
 * @property {string} roomStatus - Room status: 'in_progress' or 'completed'
 * @property {CurrentGameStat[]} currentGameStats - Array of current game stats (user answers)
 * @property {number|null} correctAnswer - The correct answer for the current game (null if not set)
 * @property {Record<string, number>} nextGameVotes - Map of vote option ('raw' or 'smart') to count
 * @property {Record<string, string>} nextGameIds - Map of vote option to gameId (for when option is selected)
 * @property {string|null} selectedNextGame - Which Next Game option was selected (null if not yet selected)
 */

// Store game state per room
const rooms = new Map();

// Track deletion timeouts for rooms (to prevent immediate deletion during navigation)
const roomDeletionTimeouts = new Map();

// Predefined color palette for users (distinct colors)
const USER_COLORS = [
  '#66C0F4', // Light blue
  '#1E90FF', // Dodger blue
  '#32CD32', // Lime green
  '#FFD700', // Gold
  '#FF6347', // Tomato
  '#9370DB', // Medium purple
  '#00CED1', // Dark turquoise
  '#FF69B4', // Hot pink
  '#FFA500', // Orange
  '#20B2AA', // Light sea green
  '#BA55D3', // Medium orchid
  '#00FA9A', // Medium spring green
  '#FF1493', // Deep pink
  '#00BFFF', // Deep sky blue
  '#FF8C00', // Dark orange
];

// Track which colors are assigned per room
const roomColorAssignments = new Map();

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
      leaderboard: [], // Array of LeaderboardEntry
      roomStatus: 'in_progress', // 'in_progress' or 'completed'
      currentGameStats: [], // Array of CurrentGameStat
      correctAnswer: null, // The correct answer for current game
      nextGameVotes: { raw: 0, smart: 0 },
      nextGameIds: { raw: null, smart: null },
      selectedNextGame: null,
    });
    // Initialize color assignments for this room
    roomColorAssignments.set(roomId, new Set());
  }
  return rooms.get(roomId);
}

/**
 * Assign a unique color to a user in a room
 * @param {string} roomId - Room ID
 * @param {string} userId - User ID
 * @returns {string} Hex color code
 */
function assignUserColor(roomId, userId) {
  const assignedColors = roomColorAssignments.get(roomId) || new Set();
  const state = getRoomState(roomId);
  
  // Check if user already has a color
  if (state.users[userId] && state.users[userId].color) {
    return state.users[userId].color;
  }
  
  // Find an available color
  for (const color of USER_COLORS) {
    if (!assignedColors.has(color)) {
      assignedColors.add(color);
      roomColorAssignments.set(roomId, assignedColors);
      return color;
    }
  }
  
  // If all colors are used, generate a random one
  const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  assignedColors.add(randomColor);
  roomColorAssignments.set(roomId, assignedColors);
  return randomColor;
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

const PORT = process.env.PORT || 443;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

// SSL is required - check if certificates are provided
if (!SSL_KEY_PATH || !SSL_CERT_PATH) {
  console.error('ERROR: SSL certificates are required!');
  console.error('Please set SSL_KEY_PATH and SSL_CERT_PATH environment variables.');
  console.error('Example:');
  console.error('  export SSL_KEY_PATH=/path/to/private.key');
  console.error('  export SSL_CERT_PATH=/path/to/certificate.crt');
  process.exit(1);
}

let server;
let wss;

try {
  // Read SSL certificates
  const key = fs.readFileSync(SSL_KEY_PATH, 'utf8');
  const cert = fs.readFileSync(SSL_CERT_PATH, 'utf8');
  
  // Create HTTPS server
  server = https.createServer({ key, cert });
  wss = new WebSocketServer({ server });
  
  server.listen(PORT, () => {
    console.log(`WebSocket server running on wss://0.0.0.0:${PORT} (SSL required)`);
  });
} catch (error) {
  console.error('ERROR: Failed to load SSL certificates:', error.message);
  console.error('Please ensure SSL_KEY_PATH and SSL_CERT_PATH point to valid certificate files.');
  process.exit(1);
}

wss.on('connection', (ws, req) => {
  // Extract room ID and user info from URL query parameters
  const url = new URL(req.url, `https://${req.headers.host}`);
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
  
  // Cancel any pending deletion timeout for this room (user reconnected)
  if (roomDeletionTimeouts.has(roomId)) {
    clearTimeout(roomDeletionTimeouts.get(roomId));
    roomDeletionTimeouts.delete(roomId);
    console.log(`[Server] Cancelled deletion timeout for room ${roomId} (user reconnected)`);
  }
  
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
        // Remove old connection from currentGameStats
        if (state.users[oldUserId].replyOption !== null) {
          state.currentGameStats = state.currentGameStats.filter(stat => stat.userId !== oldUserId);
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
    // Reset reply/vote status when reconnecting (they need to reply again for current game)
    user.hasReplied = false;
    user.replyOption = null;
    // Remove from currentGameStats if they were in it (they disconnected, so their reply doesn't count)
    state.currentGameStats = state.currentGameStats.filter(stat => stat.userId !== persistentUserId);
    // Keep score and other persistent data
  } else {
    // New user: create user object
    /** @type {User} */
    user = {
      id: connectionId,
      userId: persistentUserId,
      name: `User ${persistentUserId.slice(-6)}`, // Simple name from user ID
      score: 0,
      failedGuesses: 0,
      totalGuesses: 0,
      color: assignUserColor(roomId, persistentUserId),
      isOnline: true,
      hasReplied: false,
      replyOption: null,
      nextGameVote: null,
    };
    state.users[persistentUserId] = user;
    console.log(`New user created: ${persistentUserId} (userId was ${userId ? 'provided' : 'null'}) with color ${user.color}`);
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
      leaderboard: [...state.leaderboard],
      roomStatus: state.roomStatus,
      currentGameStats: [...state.currentGameStats],
      correctAnswer: state.correctAnswer,
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
      leaderboard: [...state.leaderboard],
      roomStatus: state.roomStatus,
      currentGameStats: [...state.currentGameStats],
      correctAnswer: state.correctAnswer,
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
        case "wrong-guess":
          handleWrongGuess(data, ws, state, clients);
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
    
    // Remove user from currentGameStats if they had replied (only count online users)
    if (user && user.isOnline) {
      // Remove from currentGameStats
      state.currentGameStats = state.currentGameStats.filter(stat => stat.userId !== userId);
      
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
        leaderboard: [...state.leaderboard],
        roomStatus: state.roomStatus,
        currentGameStats: [...state.currentGameStats],
        correctAnswer: state.correctAnswer,
        nextGameVotes: { ...state.nextGameVotes },
        nextGameIds: { ...state.nextGameIds },
        selectedNextGame: state.selectedNextGame,
      },
    });

    // Schedule room deletion with timeout (to allow reconnection during navigation)
    if (clients.size === 0) {
      // Clear any existing deletion timeout for this room
      if (roomDeletionTimeouts.has(roomId)) {
        clearTimeout(roomDeletionTimeouts.get(roomId));
        roomDeletionTimeouts.delete(roomId);
      }
      
      // Check if there are any users in the room (even if offline)
      const hasUsers = Object.keys(state.users).length > 0;
      
      if (hasUsers) {
        // Room has users (even if offline), schedule deletion after timeout
        // This allows users to reconnect during page navigation
        const timeoutId = setTimeout(() => {
          // Check again if room is still empty
          const currentState = rooms.get(roomId);
          if (currentState && currentState.clients && currentState.clients.size === 0) {
            // Check if any users reconnected (are online)
            const hasOnlineUsers = Object.values(currentState.users).some(u => u.isOnline);
            if (!hasOnlineUsers) {
              // No online users, safe to delete
              rooms.delete(roomId);
              roomColorAssignments.delete(roomId);
              roomDeletionTimeouts.delete(roomId);
              console.log(`Room ${roomId} deleted after timeout (no reconnections)`);
            } else {
              // Users reconnected, keep the room
              console.log(`Room ${roomId} kept (users reconnected)`);
              roomDeletionTimeouts.delete(roomId);
            }
          } else {
            // Room has clients now, keep it
            console.log(`Room ${roomId} kept (has clients)`);
            roomDeletionTimeouts.delete(roomId);
          }
        }, 30000); // 30 second timeout
        
        roomDeletionTimeouts.set(roomId, timeoutId);
        console.log(`Room ${roomId} scheduled for deletion in 30s (all users disconnected)`);
      } else {
        // Room has no users at all, delete immediately
        rooms.delete(roomId);
        roomColorAssignments.delete(roomId);
        if (roomDeletionTimeouts.has(roomId)) {
          clearTimeout(roomDeletionTimeouts.get(roomId));
          roomDeletionTimeouts.delete(roomId);
        }
        console.log(`Room ${roomId} deleted immediately (no users)`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`Error for connection ${connectionId}:`, error);
  });
});

/**
 * Update leaderboard entry for a user
 */
function updateLeaderboardEntry(state, userId, isCorrect) {
  let entry = state.leaderboard.find(e => e.userId === userId);
  if (!entry) {
    entry = { userId, correctAnswers: 0, failedAnswers: 0 };
    state.leaderboard.push(entry);
  }
  if (isCorrect) {
    entry.correctAnswers += 1;
  } else {
    entry.failedAnswers += 1;
  }
}

/**
 * Handle a guess from a user
 */
function handleGuess(data, ws, state, clients) {
  const userId = state.connectionToUserId[ws.connectionId];
  if (!userId) return;
  const user = state.users[userId];
  if (!user || !user.isOnline) return;

  // Check if this is a new game (gameId changed)
  const isNewGame = data.gameId && state.currentGameId !== data.gameId;
  
  // If room is completed and it's NOT a new game, don't allow new guesses
  if (state.roomStatus === 'completed' && !isNewGame) {
    console.log(`[Server] Room is completed, ignoring guess from ${userId}`);
    return;
  }
  
  // If this is a new game, reset everything FIRST before processing the guess
  if (isNewGame) {
    console.log(`[Server] New game detected: ${state.currentGameId} -> ${data.gameId}, resetting game state`);
    state.currentGameId = data.gameId;
    state.currentGameStats = []; // Clear all stats
    state.roomStatus = 'in_progress'; // Ensure it's in_progress
    state.correctAnswer = null; // Will be set below if provided
    // Reset all users' reply status for new game
    Object.values(state.users).forEach(u => {
      u.hasReplied = false;
      u.replyOption = null;
    });
  }
  
  // Store correct answer if provided
  if (data.correctAnswer !== null && data.correctAnswer !== undefined) {
    if (state.correctAnswer === null || isNewGame) {
      state.correctAnswer = data.correctAnswer;
    }
  }

  const guessValue = data.guess;
  
  // Remove old entry from currentGameStats if user changed their answer
  state.currentGameStats = state.currentGameStats.filter(stat => stat.userId !== userId);
  
  // Add new entry to currentGameStats FIRST
  state.currentGameStats.push({
    userId: userId,
    answerValue: guessValue,
  });
  
  // Update user's reply status
  user.replyOption = guessValue;
  user.hasReplied = true;

  // NOW check if all online users have replied (after adding current user's entry)
  const allUsers = Object.values(state.users);
  const onlineUsers = allUsers.filter(u => u.isOnline);
  
  // Verify that currentGameStats contains entries for all online users
  const statsUserIds = new Set(state.currentGameStats.map(stat => stat.userId));
  const onlineUserIds = new Set(onlineUsers.map(u => u.userId));
  
  // A user has actually replied if they are in currentGameStats
  // (hasReplied flag might be stale from previous game)
  const usersWhoActuallyReplied = onlineUsers.filter(u => statsUserIds.has(u.userId));
  
  // Check if all online users have actually replied (are in currentGameStats)
  const allStatsAreOnline = state.currentGameStats.length > 0 &&
    state.currentGameStats.every(stat => onlineUserIds.has(stat.userId));
  
  // All users have replied if: all online users are in stats, all stats are for online users, and counts match
  // IMPORTANT: Only rely on currentGameStats, not hasReplied flags (which may be stale)
  const allReplied = onlineUsers.length > 0 &&
    onlineUsers.length === state.currentGameStats.length && // Counts must match exactly
    usersWhoActuallyReplied.length === onlineUsers.length && // All online users must be in stats
    allStatsAreOnline; // All stats must be for online users
  
  // Log detailed information for debugging
  const hasRepliedUsers = onlineUsers.filter(u => u.hasReplied);
  const hasRepliedUserIds = hasRepliedUsers.map(u => u.userId);
  const allOnlineUsersInStats = usersWhoActuallyReplied.length === onlineUsers.length;
  console.log(`[Server] Guess from ${userId}: onlineUsers=${onlineUsers.length}, hasReplied=${hasRepliedUsers.length}, currentGameStats=${state.currentGameStats.length}, allReplied=${allReplied}`);
  if (!allReplied) {
    console.log(`[Server] Details: onlineUserIds=${Array.from(onlineUserIds)}, statsUserIds=${Array.from(statsUserIds)}`);
    console.log(`[Server] HasReplied userIds: ${hasRepliedUserIds.join(',')}`);
    console.log(`[Server] Breakdown: allOnlineUsersInStats=${allOnlineUsersInStats}, allStatsAreOnline=${allStatsAreOnline}, lengthMatch=${state.currentGameStats.length === onlineUsers.length}`);
    
    // Check each online user's status
    onlineUsers.forEach(u => {
      const inStats = statsUserIds.has(u.userId);
      console.log(`[Server] User ${u.userId}: hasReplied=${u.hasReplied}, inStats=${inStats}, isOnline=${u.isOnline}`);
    });
  }

  // If all users replied, mark room as completed and update leaderboard
  if (allReplied && state.roomStatus === 'in_progress' && state.correctAnswer !== null) {
    console.log(`[Server] All users replied, marking room as completed`);
    state.roomStatus = 'completed';
    
    // Update leaderboard for all users based on their answers
    state.currentGameStats.forEach(stat => {
      const isCorrect = stat.answerValue === state.correctAnswer;
      updateLeaderboardEntry(state, stat.userId, isCorrect);
    });
  }

  // Broadcast updated game state
  broadcast(clients, {
    type: "reply-counts-update",
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      leaderboard: [...state.leaderboard],
      roomStatus: state.roomStatus,
      currentGameStats: [...state.currentGameStats],
      correctAnswer: state.correctAnswer,
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
      selectedNextGame: state.selectedNextGame,
    },
  });
}

/**
 * Handle correct guess - DEPRECATED: Now handled in handleGuess
 * Kept for backward compatibility but does nothing
 */
function handleCorrectGuess(data, ws, state, clients) {
  // No longer needed - leaderboard is updated in handleGuess when room is completed
  console.log(`[Server] handleCorrectGuess called but is deprecated - leaderboard updated in handleGuess`);
}

/**
 * Handle wrong guess - DEPRECATED: Now handled in handleGuess
 * Kept for backward compatibility but does nothing
 */
function handleWrongGuess(data, ws, state, clients) {
  // No longer needed - leaderboard is updated in handleGuess when room is completed
  console.log(`[Server] handleWrongGuess called but is deprecated - leaderboard updated in handleGuess`);
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
        leaderboard: [...state.leaderboard],
        roomStatus: state.roomStatus,
        currentGameStats: [...state.currentGameStats],
        correctAnswer: state.correctAnswer,
        nextGameVotes: { ...state.nextGameVotes },
        nextGameIds: { ...state.nextGameIds },
        selectedNextGame: state.selectedNextGame,
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
    
    // Reset room status and game state immediately when vote completes
    state.currentGameStats = [];
    state.roomStatus = 'in_progress';
    state.correctAnswer = null;
    Object.values(state.users).forEach(u => {
      u.nextGameVote = null;
      u.hasReplied = false;
      u.replyOption = null;
    });
    
    // Update current game ID
    state.currentGameId = selectedGameId;
    
    // Wait 1 second before activating
    setTimeout(() => {
      // Broadcast activation
      broadcast(clients, {
        type: "next-game-selected",
        option: selectedOption,
        gameId: selectedGameId,
        gameState: {
          currentGameId: selectedGameId,
          users: state.users,
          leaderboard: [...state.leaderboard],
          roomStatus: 'in_progress',
          currentGameStats: [],
          correctAnswer: null,
          nextGameVotes: { raw: 0, smart: 0 },
          nextGameIds: { raw: null, smart: null },
          selectedNextGame: null,
        },
      });
      
      // Reset votes for next round
      state.nextGameVotes = { raw: 0, smart: 0 };
      state.nextGameIds = { raw: null, smart: null };
      state.selectedNextGame = null;
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

  // Don't set hasReplied from client - it should only be set when they actually send a guess
  // If client sends hasReplied=false, that's fine (they're indicating they haven't replied yet)
  // But we don't want to default to true, as that would cause stale flags
  if (data.hasReplied === false) {
    user.hasReplied = false;
    user.replyOption = null;
    // Remove from currentGameStats if they were in it
    state.currentGameStats = state.currentGameStats.filter(stat => stat.userId !== userId);
  }
  // If hasReplied is true or undefined, we don't change it - let handleGuess set it properly
  
  // Update nickname if provided
  if (data.nickname && typeof data.nickname === 'string' && data.nickname.trim()) {
    const newNickname = data.nickname.trim();
    if (newNickname !== user.name) {
      user.name = newNickname;
      console.log(`[Server] User ${userId} updated nickname to: ${newNickname}`);
    }
  }

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
      leaderboard: [...state.leaderboard],
      roomStatus: state.roomStatus,
      currentGameStats: [...state.currentGameStats],
      correctAnswer: state.correctAnswer,
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
  // Reset leaderboard array
  state.leaderboard = [];
  
  // Reset user scores (for backward compatibility)
  Object.values(state.users).forEach(user => {
    user.score = 0;
    user.failedGuesses = 0;
    user.totalGuesses = 0;
    user.hasReplied = false;
  });

  // Broadcast reset
  broadcast(clients, {
    type: "leaderboard-reset",
    gameState: {
      currentGameId: state.currentGameId,
      users: state.users,
      leaderboard: [...state.leaderboard],
      roomStatus: state.roomStatus,
      currentGameStats: [...state.currentGameStats],
      correctAnswer: state.correctAnswer,
      nextGameVotes: { ...state.nextGameVotes },
      nextGameIds: { ...state.nextGameIds },
      selectedNextGame: state.selectedNextGame,
    },
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

