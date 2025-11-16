/**
 * Co-op Next Game Integration
 * Handles role-based Next Game button visibility and game navigation syncing
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  /**
   * Update Next Game button visibility and vote counts
   */
  function updateNextGameButtons() {
    const nextGameButtons = document.querySelectorAll('.ext-next-game');
    const status = ns.coop ? ns.coop.getStatus() : null;
    const gameState = status && ns.coop.getState() ? ns.coop.getState().gameState : null;
    
    nextGameButtons.forEach(btn => {
      // Always show buttons
      btn.style.display = '';
      
      // Update vote counts and enable/disable state
      if (status && status.isConnected && gameState) {
        // Determine if this is Raw or Smart button
        // Check original text or current text (before vote count was added)
        const currentText = btn.textContent;
        const isRaw = currentText.includes('Raw') || btn.classList.contains('ext-next-raw');
        const voteOption = isRaw ? 'raw' : 'smart';
        const voteCount = gameState.nextGameVotes ? (gameState.nextGameVotes[voteOption] || 0) : 0;
        
        // Store base text in data attribute if not already stored
        if (!btn.dataset.baseText) {
          // Extract base text (remove vote count if present)
          let baseText = currentText;
          if (currentText.includes('(') && currentText.includes('vote')) {
            baseText = currentText.split('(')[0].trim();
          }
          // If still not found, use default
          if (!baseText || baseText === currentText) {
            baseText = isRaw ? 'Next (Raw)' : 'Next (Balanced)';
          }
          btn.dataset.baseText = baseText;
          if (isRaw) btn.classList.add('ext-next-raw');
        }
        
        const baseText = btn.dataset.baseText;
        
        // Update button text to show vote count
        if (voteCount > 0) {
          btn.textContent = `${baseText} (${voteCount} vote${voteCount !== 1 ? 's' : ''})`;
        } else {
          btn.textContent = baseText;
        }
        
        // Enable buttons only if user has replied
        const userHasReplied = gameState.users && gameState.users[status.connectionId] 
          ? gameState.users[status.connectionId].hasReplied 
          : false;
        
        btn.disabled = !userHasReplied;
        if (!userHasReplied) {
          btn.title = 'Reply to the current game first';
        } else {
          btn.title = '';
        }
      } else {
        // Not connected - enable buttons normally
        btn.disabled = false;
        btn.title = '';
        // Reset text to base text if stored, otherwise use default
        if (btn.dataset.baseText) {
          btn.textContent = btn.dataset.baseText;
        } else {
          const isRaw = btn.textContent.includes('Raw') || btn.classList.contains('ext-next-raw');
          btn.textContent = isRaw ? 'Next (Raw)' : 'Next (Balanced)';
        }
      }
    });
  }

  /**
   * Hook into Next Game button clicks to send next-game message
   */
  function hookNextGameButtons() {
    const nextGameButtons = document.querySelectorAll('.ext-next-game');
    
    nextGameButtons.forEach(btn => {
      // Remove existing listeners and add new one
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', async (e) => {
        if (!ns.coop) {
          // Not in co-op mode, proceed normally
          return;
        }

        const status = ns.coop.getStatus();
        if (!status.isConnected) {
          // Not connected, proceed normally (single-player mode)
          return;
        }

        // Connected: intercept and send vote instead of navigating
        e.preventDefault();
        e.stopPropagation();

        // Get the vote option from button class or text
        const voteOption = (newBtn.classList.contains('ext-next-raw') || newBtn.textContent.includes('Raw')) ? 'raw' : 'smart';
        
        // Send vote to server
        const state = ns.coop.getState();
        if (state.client && state.isConnected) {
          console.log('[Co-op Next Game] Voting for:', voteOption);
          
          // Get the app ID for this option (for when it's selected)
          let appId = null;
          try {
            if (voteOption === 'smart' && ns.getSmartRandomAppId) {
              appId = await ns.getSmartRandomAppId();
            } else if (voteOption === 'raw' && ns.getPureRandomAppId) {
              appId = await ns.getPureRandomAppId();
            } else if (ns.getReleasedAppIds) {
              const appIds = await ns.getReleasedAppIds();
              if (appIds && appIds.length > 0) {
                appId = appIds[Math.floor(Math.random() * appIds.length)];
              }
            }
          } catch (error) {
            console.warn('[Co-op Next Game] Could not get app ID:', error);
          }
          
          // Send vote
          state.client.sendNextGameVote(voteOption, appId ? String(appId) : null);
        } else {
          console.warn('[Co-op Next Game] Not connected, cannot vote');
        }
      }, { passive: false });
    });
  }

  /**
   * Handle next-game-selected event to navigate all users
   */
  function setupGameNavigation() {
    // Listen for next-game-selected events (when voting completes)
    if (ns.coop && ns.coop.getState) {
      const state = ns.coop.getState();
      if (state.client) {
        state.client.on('next-game-selected', (data) => {
          if (data.gameId) {
            console.log('[Co-op] Selected option activated, navigating to game:', data.gameId);
            
            // Save connection info before navigation
            const status = ns.coop.getStatus();
            if (status.roomId && ns.coop.saveConnectionInfo) {
              ns.coop.saveConnectionInfo(status.roomId, status.serverUrl);
            }
            
            // Navigate after a brief delay to ensure message is processed
            setTimeout(() => {
              window.location.assign(`https://store.steampowered.com/app/${data.gameId}/`);
            }, 100);
          }
        });
      }
    }
  }

  /**
   * Initialize co-op Next Game integration
   */
  function init() {
    // Update button visibility when connection status changes
    window.addEventListener('coop-status-change', () => {
      updateNextGameButtons();
      hookNextGameButtons();
    });
    
    // Update when reply counts change
    window.addEventListener('coop-reply-counts-update', () => {
      updateNextGameButtons();
    });
    
    // Update when vote counts change
    window.addEventListener('coop-next-game-vote-update', () => {
      updateNextGameButtons();
    });

    // Initial update
    setTimeout(() => {
      updateNextGameButtons();
      hookNextGameButtons();
    }, 500);

    // Re-hook buttons periodically (in case they're recreated)
    setInterval(() => {
      hookNextGameButtons();
      updateNextGameButtons();
    }, 2000);

    // Set up game navigation listener
    if (ns.coop) {
      setupGameNavigation();
    } else {
      // Wait for coop to be available
      const checkCoop = setInterval(() => {
        if (ns.coop) {
          setupGameNavigation();
          clearInterval(checkCoop);
        }
      }, 500);
    }
  }

  // Expose API
  ns.coopNextGame = {
    updateButtons: updateNextGameButtons,
    hookButtons: hookNextGameButtons,
    init: init,
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

