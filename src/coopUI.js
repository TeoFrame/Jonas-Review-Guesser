/**
 * Co-op UI - Phase 2: UI controls and connection functionality
 * Adds Join and Disconnect buttons to the Steam page
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  // Default server URL (can be configured)
  const DEFAULT_SERVER_URL = 'ws://localhost:8080';
  
  // UI state
  let uiState = {
    container: null,
    buttonsContainer: null,
    statusElement: null,
    isInstalled: false,
    serverUrl: DEFAULT_SERVER_URL,
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
    `;

    // Status display
    const statusDiv = document.createElement('div');
    statusDiv.className = 'ext-coop-status';
    statusDiv.style.cssText = `
      margin-bottom: 8px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
    `;
    statusDiv.textContent = 'Not connected';
    uiState.statusElement = statusDiv;

    // Buttons container
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'ext-coop-buttons';
    buttonsDiv.style.cssText = `
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    `;
    uiState.buttonsContainer = buttonsDiv;

    container.appendChild(statusDiv);
    container.appendChild(buttonsDiv);

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
      uiState.statusElement.textContent = 'Not connected';
      uiState.statusElement.style.color = 'rgba(255, 255, 255, 0.7)';
    }
  }


  /**
   * Handle Join button click (join existing room)
   */
  async function handleJoin() {
    if (!ns.coop) {
      console.error('[Co-op UI] Co-op manager not available');
      showMessage('Error: Co-op manager not loaded', 'error');
      return;
    }

    // Prompt for room code
    const roomCode = prompt('Enter room code to join:');
    if (!roomCode) return;

    const trimmedCode = roomCode.trim().toUpperCase();
    if (!trimmedCode) {
      showMessage('Invalid room code', 'error');
      return;
    }

    try {
      const serverUrl = await getServerUrl();
      await ns.coop.connect(trimmedCode, serverUrl);
      updateStatus(ns.coop.getStatus());
    } catch (error) {
      console.error('[Co-op UI] Failed to join room:', error);
      showMessage(`Failed to join: ${error.message}`, 'error');
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

    // Create buttons
    const joinBtn = createButton('Join', 'ext-coop-join', handleJoin);
    const disconnectBtn = createButton('Disconnect', 'ext-coop-disconnect', handleDisconnect);

    // Initially show only Join button (not connected)
    joinBtn.style.display = 'inline-block';
    disconnectBtn.style.display = 'none';

    // Add buttons to container
    uiState.buttonsContainer.appendChild(joinBtn);
    uiState.buttonsContainer.appendChild(disconnectBtn);

    // Insert UI container after Next Game buttons
    container.appendChild(uiContainer);

    // Set up connection status listener
    setupStatusListener(joinBtn, disconnectBtn);

    uiState.isInstalled = true;
    console.log('[Co-op UI] UI installed');
    return true;
  }

  /**
   * Set up listener for connection status changes
   */
  function setupStatusListener(joinBtn, disconnectBtn) {
    if (!ns.coop) return;

    const updateButtons = () => {
      const status = ns.coop.getStatus();
      updateStatus(status);

      const isConnected = status.isConnected;
      
      // Show/hide buttons based on connection status
      if (isConnected) {
        // Connected: show Disconnect
        joinBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
      } else {
        // Not connected: show Join only
        joinBtn.style.display = 'inline-block';
        disconnectBtn.style.display = 'none';
      }
    };

    // Update immediately
    updateButtons();

    // Listen for status change events
    window.addEventListener('coop-status-change', (event) => {
      updateButtons();
    });
    
    // Also listen for game state updates to update online count
    window.addEventListener('coop-reply-counts-update', (event) => {
      updateButtons();
    });
    window.addEventListener('coop-next-game-vote-update', (event) => {
      updateButtons();
    });
    window.addEventListener('coop-next-game-selected', (event) => {
      updateButtons();
    });

    // Fallback: also poll periodically (in case events don't fire)
    setInterval(updateButtons, 2000);
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

