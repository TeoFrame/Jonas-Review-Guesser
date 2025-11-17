/**
 * Co-op UI - Phase 2: UI controls and connection functionality
 * Adds Join and Disconnect buttons to the Steam page
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  // Get default server URL from config
  const DEFAULT_SERVER_URL = (ns.config && ns.config.DEFAULT_SERVER_URL) || 'ws://localhost:8080';
  
  // UI state
  let uiState = {
    container: null,
    buttonsContainer: null,
    statusElement: null,
    leaderboardElement: null,
    statsDropdown: null,
    statsLabel: null,
    statsContent: null,
    nextButtonsContainer: null,
    isInstalled: false,
    serverUrl: DEFAULT_SERVER_URL,
    lastLeaderboardHTML: null, // Store last completed leaderboard HTML
  };

  /**
   * Generate a random room code
   * @returns {string} 6-character uppercase room code
   */
  function generateRoomCode() {
    if (window.generateRoomCode) {
      return window.generateRoomCode();
    }
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Get server URL from storage or use default
   */
  async function getServerUrl() {
    // Try to get from Chrome storage (for future config)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get(['coopServerUrl']);
        if (result.coopServerUrl) {
          return result.coopServerUrl;
        }
      } catch (error) {
        console.warn('[Co-op UI] Could not read server URL from storage:', error);
      }
    }
    return DEFAULT_SERVER_URL;
  }

  /**
   * Create the co-op UI container
   * @returns {HTMLElement}
   */
  function createUIContainer() {
    const container = document.createElement('div');
    container.className = 'ext-coop-container';
    container.style.cssText = `
      margin: 12px 0;
      padding: 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    `;

    // Connection form container (shown when not connected)
    const formDiv = document.createElement('div');
    formDiv.className = 'ext-coop-form';
    formDiv.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    `;
    uiState.formContainer = formDiv;

    // Room name input
    const roomInput = document.createElement('input');
    roomInput.type = 'text';
    roomInput.placeholder = 'Room name';
    roomInput.className = 'ext-coop-input';
    roomInput.style.cssText = `
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      width: 120px;
      box-sizing: border-box;
    `;
    roomInput.value = generateRoomCode(); // Default to random room code
    uiState.roomInput = roomInput;

    // User name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Your name';
    nameInput.className = 'ext-coop-input';
    nameInput.style.cssText = roomInput.style.cssText;
    nameInput.style.width = '120px';
    uiState.nameInput = nameInput;

    // Connect button
    const connectBtn = createButton('Connect', 'ext-coop-connect', () => handleConnect(roomInput, nameInput));
    uiState.connectBtn = connectBtn;

    // Add Enter key submit handlers
    const handleFormSubmit = (e) => {
      e.preventDefault();
      if (roomInput.value.trim() && nameInput.value.trim()) {
        handleConnect(roomInput, nameInput);
      }
    };
    
    roomInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (roomInput.value.trim() && nameInput.value.trim()) {
          handleConnect(roomInput, nameInput);
        } else if (roomInput.value.trim()) {
          nameInput.focus();
        }
      }
    });
    
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleFormSubmit(e);
      }
    });
    
    formDiv.appendChild(roomInput);
    formDiv.appendChild(nameInput);
    formDiv.appendChild(connectBtn);
    uiState.buttonsContainer = formDiv; // Keep for compatibility

    // Disconnect button (hidden initially, shown when connected)
    const disconnectBtn = createButton('Disconnect', 'ext-coop-disconnect', handleDisconnect);
    disconnectBtn.style.display = 'none';
    uiState.disconnectBtn = disconnectBtn;

    // Status display (shown when connected)
    const statusDiv = document.createElement('div');
    statusDiv.className = 'ext-coop-status';
    statusDiv.style.cssText = `
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: none;
      white-space: nowrap;
    `;
    statusDiv.textContent = '';
    uiState.statusElement = statusDiv;

    // Stats dropdown (shown when connected)
    const statsDropdown = document.createElement('div');
    statsDropdown.className = 'ext-coop-stats';
    statsDropdown.style.cssText = `
      position: relative;
      display: none;
    `;
    
    const statsLabel = document.createElement('button');
    statsLabel.type = 'button';
    statsLabel.className = 'ext-coop-stats-label';
    statsLabel.style.cssText = `
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.06s ease;
      white-space: nowrap;
    `;
    statsLabel.textContent = 'Stats';
    
    // Add hover effects
    statsLabel.addEventListener('mouseenter', () => {
      statsLabel.style.background = 'rgba(255, 255, 255, 0.15)';
      statsLabel.style.transform = 'translateY(-1px)';
    });
    statsLabel.addEventListener('mouseleave', () => {
      statsLabel.style.background = 'rgba(255, 255, 255, 0.08)';
      statsLabel.style.transform = 'translateY(0)';
    });
    
    uiState.statsLabel = statsLabel;
    
    const statsContent = document.createElement('div');
    statsContent.className = 'ext-coop-stats-content';
    statsContent.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      padding: 12px;
      background: rgba(26, 26, 26, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      z-index: 1000;
      min-width: 250px;
      max-width: 400px;
      display: none;
    `;
    uiState.statsContent = statsContent;
    uiState.leaderboardElement = statsContent; // Use stats content for leaderboard
    
    statsLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = statsContent.style.display === 'block';
      statsContent.style.display = isExpanded ? 'none' : 'block';
      // Save state to sessionStorage
      try {
        sessionStorage.setItem('coopStatsExpanded', isExpanded ? 'false' : 'true');
      } catch (e) {
        // Ignore storage errors
      }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!statsDropdown.contains(e.target)) {
        statsContent.style.display = 'none';
        try {
          sessionStorage.setItem('coopStatsExpanded', 'false');
        } catch (e) {
          // Ignore storage errors
        }
      }
    });
    
    statsDropdown.appendChild(statsLabel);
    statsDropdown.appendChild(statsContent);
    uiState.statsDropdown = statsDropdown;

    // Container for Next buttons (will be populated when Next buttons are created)
    const nextButtonsContainer = document.createElement('div');
    nextButtonsContainer.className = 'ext-coop-next-buttons';
    nextButtonsContainer.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
    `;
    uiState.nextButtonsContainer = nextButtonsContainer;

    // Append elements in order: form | status | disconnect | stats | next buttons
    container.appendChild(formDiv);
    container.appendChild(statusDiv);
    container.appendChild(disconnectBtn);
    container.appendChild(statsDropdown);
    container.appendChild(nextButtonsContainer);

    return container;
  }

  /**
   * Create a button with Steam-like styling
   * @param {string} text - Button text
   * @param {string} className - Additional CSS class
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement}
   */
  function createButton(text, className = '', onClick = null) {
    const button = document.createElement('button');
    button.className = `ext-coop-btn ${className}`;
    button.textContent = text;
    button.style.cssText = `
      padding: 8px 16px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.06s ease;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255, 255, 255, 0.15)';
      button.style.transform = 'translateY(-1px)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(255, 255, 255, 0.08)';
      button.style.transform = 'translateY(0)';
    });

    if (onClick) {
      button.addEventListener('click', onClick);
    }

    return button;
  }

  /**
   * Update connection status display
   * @param {Object} status - Connection status object
   */
  function updateStatus(status) {
    if (!uiState.statusElement) return;

    const { isConnected, roomId } = status;
    
    // Get online user count from gameState
    let onlineCount = 0;
    if (isConnected && ns.coop && ns.coop.getState) {
      const state = ns.coop.getState();
      if (state.gameState && state.gameState.users) {
        const allUsers = Object.values(state.gameState.users);
        onlineCount = allUsers.filter(u => u.isOnline).length;
      }
    }

    if (isConnected && roomId) {
      const onlineText = onlineCount > 0 ? ` - ${onlineCount} online` : '';
      uiState.statusElement.textContent = `🟢 Connected - Room: ${roomId}${onlineText}`;
      uiState.statusElement.style.color = '#4caf50';
    } else {
      // Don't show "Not connected" - just leave it empty
      uiState.statusElement.textContent = '';
    }
  }


  /**
   * Handle Connect button click
   */
  async function handleConnect(roomInput, nameInput) {
    if (!ns.coop) {
      console.error('[Co-op UI] Co-op manager not available');
      showMessage('Error: Co-op manager not loaded', 'error');
      return;
    }

    const roomCode = roomInput.value.trim().toUpperCase();
    const userName = nameInput.value.trim();

    if (!roomCode) {
      showMessage('Please enter a room name', 'error');
      roomInput.focus();
      return;
    }

    if (!userName) {
      showMessage('Please enter your name', 'error');
      nameInput.focus();
      return;
    }

    try {
      const serverUrl = await getServerUrl();
      await ns.coop.connect(roomCode, serverUrl, userName);
      updateStatus(ns.coop.getStatus());
    } catch (error) {
      console.error('[Co-op UI] Failed to connect:', error);
      showMessage(`Failed to connect: ${error.message}`, 'error');
    }
  }

  /**
   * Handle Disconnect button click
   */
  function handleDisconnect() {
    if (!ns.coop) return;

    ns.coop.disconnect();
    // Disconnected - no toast message
    updateStatus(ns.coop.getStatus());
  }


  /**
   * Show temporary message to user
   * @param {string} message - Message text
   * @param {string} type - Message type: 'info', 'success', 'error'
   */
  function showMessage(message, type = 'info') {
    console.log(`[Co-op UI] ${message}`);
    
    // Create temporary message element
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ext-coop-message';
    msgDiv.textContent = message;
    msgDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
      color: white;
      font: 600 13px/1.2 system-ui, sans-serif;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(msgDiv);

    // Remove after 3 seconds
    setTimeout(() => {
      msgDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (msgDiv.parentNode) {
          msgDiv.parentNode.removeChild(msgDiv);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Create and install co-op UI buttons
   */
  function installCoopUI() {
    // Find the container where Next Game buttons are placed
    const container = document.querySelector(
      ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    
    if (!container) {
      // Container not found, try again later
      return false;
    }

    // Avoid duplicates
    if (container.querySelector(".ext-coop-container")) {
      return true; // Already installed
    }

    // Create UI container
    const uiContainer = createUIContainer();
    uiState.container = uiContainer;

    // Find Next Game buttons to insert before them (so they appear in the same row)
    const nextGameButtons = container.querySelectorAll('.ext-next-game');
    if (nextGameButtons.length > 0) {
      // Insert before first Next button
      nextGameButtons[0].parentNode.insertBefore(uiContainer, nextGameButtons[0]);
    } else {
      // No Next buttons yet, just append
      container.appendChild(uiContainer);
    }

    // Set up connection status listener
    setupStatusListener();

    uiState.isInstalled = true;
    console.log('[Co-op UI] UI installed');
    return true;
  }

  /**
   * Get current user's stats and placement
   */
  function getCurrentUserStats(state) {
    if (!state.gameState || !state.gameState.users || !state.gameState.leaderboard || !state.userId) {
      return null;
    }
    
    const user = state.gameState.users[state.userId];
    if (!user) return null;
    
    const entry = state.gameState.leaderboard.find(e => e.userId === state.userId);
    if (!entry) return null;
    
    const allEntries = state.gameState.leaderboard
      .map(e => {
        const u = state.gameState.users[e.userId];
        if (!u) return null;
        const total = e.correctAnswers + e.failedAnswers;
        const percentage = total > 0 ? Math.round((e.correctAnswers / total) * 100) : 0;
        return { ...e, ...u, total, percentage };
      })
      .filter(item => item !== null)
      .sort((a, b) => {
        if (b.percentage !== a.percentage) {
          return b.percentage - a.percentage;
        }
        return b.total - a.total;
      });
    
    const placement = allEntries.findIndex(e => e.userId === state.userId) + 1;
    const total = entry.correctAnswers + entry.failedAnswers;
    const percentage = total > 0 ? Math.round((entry.correctAnswers / total) * 100) : 0;
    
    return {
      placement,
      totalPlayers: allEntries.length,
      correctAnswers: entry.correctAnswers,
      failedAnswers: entry.failedAnswers,
      total,
      percentage,
      name: user.name || 'User',
      color: user.color || '#66C0F4'
    };
  }

  /**
   * Update leaderboard display
   */
  function updateLeaderboard() {
    if (!uiState.leaderboardElement || !ns.coop) return;
    
    const state = ns.coop.getState();
    if (!state || !state.gameState) {
      uiState.leaderboardElement.style.display = 'none';
      if (uiState.statsLabel) {
        uiState.statsLabel.textContent = 'Stats';
      }
      return;
    }
    
    // Ensure leaderboard array exists
    if (!state.gameState.leaderboard) {
      state.gameState.leaderboard = [];
    }
    
    if (!state.gameState.users) {
      state.gameState.users = {};
    }

    const allUsers = Object.values(state.gameState.users);
    const onlineUsers = allUsers.filter(u => u.isOnline);
    
    // Show leaderboard in any room status, but only update content when completed
    // If room is not completed, show the last completed leaderboard state
    const shouldUpdateContent = state.gameState.roomStatus === 'completed';
    
    // Map leaderboard entries to user info (do this early so we can use it for label)
    const leaderboardWithUsers = state.gameState.leaderboard
      .map(entry => {
        const user = state.gameState.users[entry.userId];
        if (!user) return null;
        const total = entry.correctAnswers + entry.failedAnswers;
        const percentage = total > 0 
          ? Math.round((entry.correctAnswers / total) * 100) 
          : 0;
        return {
          ...entry,
          ...user,
          total,
          percentage,
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => {
        // Sort by percentage descending, then by total descending
        if (b.percentage !== a.percentage) {
          return b.percentage - a.percentage;
        }
        return b.total - a.total;
      });
    
    // Update stats label with top-1 user
    if (leaderboardWithUsers.length > 0 && uiState.statsLabel) {
      const topUser = leaderboardWithUsers[0];
      const userColor = topUser.color || '#66C0F4';
      // Create HTML with colored indicator
      uiState.statsLabel.innerHTML = `
        <span style="
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${userColor};
          margin-right: 6px;
          vertical-align: middle;
        "></span>
        <span>${topUser.name || 'User'}: ${topUser.correctAnswers || 0} / ${topUser.failedAnswers || 0} (${topUser.percentage}%)</span>
      `;
    } else if (uiState.statsLabel) {
      uiState.statsLabel.textContent = 'Stats';
      uiState.statsLabel.innerHTML = 'Stats'; // Reset HTML as well
    }
    
    // If no leaderboard data yet, show empty state
    if (state.gameState.leaderboard.length === 0) {
      uiState.leaderboardElement.innerHTML = '<div style="font-size: 12px; color: rgba(255, 255, 255, 0.6); padding: 8px;">No stats yet</div>';
      // Restore collapse state from sessionStorage
      try {
        const isExpanded = sessionStorage.getItem('coopStatsExpanded') === 'true';
        uiState.leaderboardElement.style.display = isExpanded ? 'block' : 'none';
      } catch (e) {
        uiState.leaderboardElement.style.display = 'none';
      }
      return;
    }
    
    // If room is not completed and we have a stored leaderboard, show it without updating
    if (!shouldUpdateContent && uiState.lastLeaderboardHTML) {
      uiState.leaderboardElement.innerHTML = uiState.lastLeaderboardHTML;
      // Restore collapse state from sessionStorage
      try {
        const isExpanded = sessionStorage.getItem('coopStatsExpanded') === 'true';
        uiState.leaderboardElement.style.display = isExpanded ? 'block' : 'none';
      } catch (e) {
        uiState.leaderboardElement.style.display = 'none';
      }
      return;
    }
    
    // If only 1 user online, show just numbers
    if (onlineUsers.length <= 1) {
      let html = '';
      if (onlineUsers.length === 1) {
        const user = onlineUsers[0];
        const entry = state.gameState.leaderboard.find(e => e.userId === user.userId);
        if (entry) {
          const total = entry.correctAnswers + entry.failedAnswers;
          const percentage = total > 0 
            ? Math.round((entry.correctAnswers / total) * 100) 
            : 0;
          html = `
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7);">
              Correct: ${entry.correctAnswers || 0} | Failed: ${entry.failedAnswers || 0} | Total: ${total} | ${percentage}%
            </div>
          `;
        } else {
          // User not in leaderboard yet, but show if there's any data
          if (state.gameState.leaderboard.length > 0) {
            // Show first entry as placeholder
            const firstEntry = state.gameState.leaderboard[0];
            const total = firstEntry.correctAnswers + firstEntry.failedAnswers;
            const percentage = total > 0 
              ? Math.round((firstEntry.correctAnswers / total) * 100) 
              : 0;
            html = `
              <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7);">
                Correct: ${firstEntry.correctAnswers || 0} | Failed: ${firstEntry.failedAnswers || 0} | Total: ${total} | ${percentage}%
              </div>
            `;
          }
        }
      } else {
        // No users online, but show leaderboard if there's data
        if (state.gameState.leaderboard.length > 0) {
          const firstEntry = state.gameState.leaderboard[0];
          const total = firstEntry.correctAnswers + firstEntry.failedAnswers;
          const percentage = total > 0 
            ? Math.round((firstEntry.correctAnswers / total) * 100) 
            : 0;
          html = `
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7);">
              Correct: ${firstEntry.correctAnswers || 0} | Failed: ${firstEntry.failedAnswers || 0} | Total: ${total} | ${percentage}%
            </div>
          `;
        }
      }
      
      if (html) {
        uiState.leaderboardElement.innerHTML = html;
        // Restore collapse state from sessionStorage
        try {
          const isExpanded = sessionStorage.getItem('coopStatsExpanded') === 'true';
          uiState.leaderboardElement.style.display = isExpanded ? 'block' : 'none';
        } catch (e) {
          uiState.leaderboardElement.style.display = 'none';
        }
        // Store the HTML when room is completed
        if (shouldUpdateContent) {
          uiState.lastLeaderboardHTML = html;
        }
      } else {
        uiState.leaderboardElement.style.display = 'none';
      }
      return;
    }


    // Build leaderboard HTML
    let html = '<div style="font-size: 11px; color: rgba(255, 255, 255, 0.6); margin-bottom: 6px; font-weight: 600;">Leaderboard</div>';
    
    leaderboardWithUsers.forEach((entry) => {
      html += `
        <div style="
          display: flex;
          align-items: center;
          padding: 6px 8px;
          margin-bottom: 4px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          border-left: 3px solid ${entry.color || '#66C0F4'};
          font-size: 12px;
        ">
          <div style="
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${entry.color || '#66C0F4'};
            margin-right: 8px;
            flex-shrink: 0;
          "></div>
          <div style="flex: 1; min-width: 0; color: rgba(255, 255, 255, 0.9);">
            ${entry.name || 'User'}: ${entry.correctAnswers || 0} / ${entry.failedAnswers || 0} (${entry.percentage}%)
          </div>
        </div>
      `;
    });

    uiState.leaderboardElement.innerHTML = html;
    
    // Restore collapse state from sessionStorage
    try {
      const isExpanded = sessionStorage.getItem('coopStatsExpanded') === 'true';
      uiState.leaderboardElement.style.display = isExpanded ? 'block' : 'none';
    } catch (e) {
      uiState.leaderboardElement.style.display = 'none';
    }
    
    // Store the HTML when room is completed so we can show it later
    if (shouldUpdateContent) {
      uiState.lastLeaderboardHTML = html;
    }
  }

  /**
   * Set up listener for connection status changes
   */
  function setupStatusListener() {
    if (!ns.coop) return;

    const updateUI = () => {
      const status = ns.coop.getStatus();
      updateStatus(status);
      updateLeaderboard();

      const isConnected = status.isConnected;
      
      // Show/hide form elements based on connection status
      if (isConnected) {
        // Connected: hide form, show disconnect button, status, and stats
        if (uiState.formContainer) uiState.formContainer.style.display = 'none';
        if (uiState.disconnectBtn) uiState.disconnectBtn.style.display = 'inline-block';
        if (uiState.statusElement) uiState.statusElement.style.display = 'block';
        if (uiState.statsDropdown) uiState.statsDropdown.style.display = 'block';
        // Move Next buttons into container
        moveNextButtonsToContainer();
      } else {
        // Not connected: show form, hide disconnect button, status, and stats
        if (uiState.formContainer) uiState.formContainer.style.display = 'flex';
        if (uiState.disconnectBtn) uiState.disconnectBtn.style.display = 'none';
        if (uiState.statusElement) uiState.statusElement.style.display = 'none';
        if (uiState.statsDropdown) uiState.statsDropdown.style.display = 'none';
        // Reset stats collapse state
        if (uiState.statsContent) uiState.statsContent.style.display = 'none';
      }
      
      // Hide/show Next buttons and option buttons based on connection status
      updateButtonVisibility(isConnected);
    };

    // Update immediately
    updateUI();

    // Listen for status change events
    window.addEventListener('coop-status-change', (event) => {
      updateUI();
    });
    
    // Also listen for game state updates to update online count and show leaderboard (but only update content when completed)
    window.addEventListener('coop-reply-counts-update', (event) => {
      updateUI();
      updateLeaderboard(); // Show leaderboard (will only update content if room is completed)
    });
    window.addEventListener('coop-next-game-vote-update', (event) => {
      updateUI();
      updateLeaderboard();
    });
    window.addEventListener('coop-next-game-selected', (event) => {
      updateUI();
      updateLeaderboard();
    });

    // Listen for score updates
    window.addEventListener('coop-score-update', () => {
      updateLeaderboard();
    });
    
    // Listen for leaderboard reset
    window.addEventListener('coop-leaderboard-reset', () => {
      updateLeaderboard();
    });
    
    // Also listen directly to client events if available
    if (ns.coop && ns.coop.getState) {
      const state = ns.coop.getState();
      if (state.client) {
        state.client.on('score-update', () => {
          updateLeaderboard();
        });
        state.client.on('leaderboard-reset', () => {
          updateLeaderboard();
        });
      }
    }

    // Fallback: also poll periodically (in case events don't fire)
    setInterval(() => {
      updateUI();
      updateLeaderboard();
    }, 2000);
  }

  /**
   * Move Next buttons into the main container
   */
  function moveNextButtonsToContainer() {
    if (!uiState.nextButtonsContainer) return;
    
    const nextGameButtons = document.querySelectorAll('.ext-next-game');
    nextGameButtons.forEach(btn => {
      // Only move if not already in our container
      if (btn.parentNode !== uiState.nextButtonsContainer) {
        uiState.nextButtonsContainer.appendChild(btn);
        btn.style.display = '';
      }
    });
  }

  /**
   * Update visibility of Next buttons and option buttons based on connection status
   */
  function updateButtonVisibility(isConnected) {
    // Hide/show Next Game buttons
    const nextGameButtons = document.querySelectorAll('.ext-next-game');
    nextGameButtons.forEach(btn => {
      btn.style.display = isConnected ? '' : 'none';
    });
    
    // Hide/show guess option buttons
    const guessButtons = document.querySelectorAll('.ext-guess-btn');
    guessButtons.forEach(btn => {
      if (!isConnected) {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
      } else {
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
      }
    });
  }

  // Expose API
  ns.coopUI = {
    install: installCoopUI,
    updateStatus: updateStatus,
    showMessage: showMessage,
  };

  // Auto-install when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(installCoopUI, 500);
    });
  } else {
    setTimeout(installCoopUI, 500);
  }

  // Also try to install when main.js runs
  // This will be called by the main run() function
})(window);

