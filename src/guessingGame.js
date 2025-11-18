(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  const isSteamAppPage = ns.isSteamAppPage;
  const getCurrentSteamAppId = ns.getCurrentSteamAppId;
  const getSteamReviewsContainer = ns.getSteamReviewsContainer;
  const hideAllSteamReviewCounts = ns.hideAllSteamReviewCounts;
  const waitForAnyReviewCount = ns.waitForAnyReviewCount;
  const formatNum = ns.formatNum;

  function buildGuessSet(trueCount, gameId = null) {
    const MIN_ANSWERS = 6;
    const CAP = 200_000_000_000;

    // Normalise the true answer and cap it
    const TC = Math.max(
      0,
      Math.min(CAP, Math.trunc(Number(trueCount) || 0))
    );

    const answers = new Set();
    answers.add(TC);

    // Use seeded random if gameId is provided and seededRandom is available
    let rng = Math.random;
    let randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    if (gameId && ns.seededRandom) {
      const seededRng = ns.seededRandom.create(gameId);
      rng = seededRng;
      randInt = (min, max) => ns.seededRandom.randInt(seededRng, min, max);
    }

    // Random minimum step between answers when going upwards (40–60)
    const MIN_STEP_INCREASE = randInt(40, 60);

    // Random limit for how many *downward* options we may generate: 2–5
    const maxDownGuesses = randInt(4, 5);

    //
    // 1) DOWNWARDS PHASE (divide by 5 with noise) — ONLY if TC >= MIN_STEP_INCREASE.
    //    Also limited to maxDownGuesses.
    //
    if (TC >= MIN_STEP_INCREASE) {
      let current = TC;
      let downCount = 0;

      while (answers.size < MIN_ANSWERS && downCount < maxDownGuesses) {
        if (current === 0) break;

        let divided = Math.floor(current / 5);

        // No progress? bail out to avoid infinite loops
        if (divided === current) break;

        // Small random wobble: [-3, 3]
        const noise = randInt(-3, 3);
        let next = divided + noise;

        // Clamp so it's still lower than the previous value and >= 0
        if (next < 0) next = 0;
        if (next >= current) next = current - 1;

        const beforeSize = answers.size;
        answers.add(next);
        if (answers.size > beforeSize) {
          downCount++;
        }

        current = next;

        // Stop downwards once we've reached below 50 (original rule)
        if (current < 50) break;
      }
    }

    //
    // 2) UPWARDS PHASE: multiply by 5 with noise and enforce a random min distance (40–60).
    //    This fills remaining slots with higher values.
    //
    let current = TC;

    while (answers.size < MIN_ANSWERS) {
      // Base "multiply by 5"
      let base = current * 5;

      // Small random wobble: [-2, 3]  (add up to 3, remove up to 2)
      const noise = randInt(-2, 3);
      let candidate = base + noise;

      if (candidate < 0) candidate = 0;

      // Enforce a minimum increase of MIN_STEP_INCREASE over the previous value
      if (candidate < current + MIN_STEP_INCREASE) {
        candidate = current + MIN_STEP_INCREASE;
      }

      // Cap very large values
      if (candidate > CAP) candidate = CAP;

      // Avoid duplicates by nudging up a bit if needed
      let tries = 0;
      while (answers.has(candidate) && candidate < CAP && tries < 10) {
        candidate++;
        tries++;
      }

      if (answers.has(candidate)) {
        // No more unique space reasonably nearby; stop the upward phase.
        break;
      }

      answers.add(candidate);
      current = candidate;
    }

    //
    // 3) Fallback: if we *still* have fewer than 6 answers,
    //    just fill upwards by +1 from the current max.
    //
    if (answers.size < MIN_ANSWERS) {
      let maxVal = Math.max(...answers);
      while (answers.size < MIN_ANSWERS && maxVal < CAP) {
        maxVal++;
        if (!answers.has(maxVal)) {
          answers.add(maxVal);
        }
      }
    }

    //
    // 4) LOWEST-OPTION TWEAK:
    //    If the lowest option is NOT the correct answer, then with 50% chance
    //    replace it with 0 or 1 (chosen randomly), while keeping all answers distinct.
    //
    if (answers.size > 0) {
      const values = Array.from(answers);
      let minVal = values[0];
      for (let i = 1; i < values.length; i++) {
        if (values[i] < minVal) minVal = values[i];
      }

      if (minVal !== TC && rng() < 0.5 && minVal < 20) {
        const candidates = rng() < 0.5 ? [0, 1] : [1, 0];

        for (const val of candidates) {
          // If replacing with the same value, no point; skip
          if (val === minVal) {
            // already that value, but it's still 0 or 1, so that's okay
            break;
          }
          // Avoid creating duplicates: allow if it's not already in the set
          if (!answers.has(val)) {
            answers.delete(minVal);
            answers.add(val);
            break;
          }
        }
      }
    }

    //
    // 5) Convert to array and shuffle so the correct answer isn't in a fixed spot.
    //
    const picks = Array.from(answers);

    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }

    return picks;
  }





  function ensureLoadingWidget(container, appId) {
    let wrap = container.querySelector(
      `.ext-steam-guess[data-ext-appid="${appId}"]`
    );
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "ext-steam-guess";
      wrap.dataset.extAppid = appId;
      const msg = document.createElement("div");
      msg.className = "ext-wait";
      msg.textContent = "Waiting for review count to load…";
      wrap.appendChild(msg);
      container.prepend(wrap);
    } else {
      const hasButtons = wrap.querySelector("button");
      if (!hasButtons) {
        let msg = wrap.querySelector(".ext-wait");
        if (!msg) {
          msg = document.createElement("div");
          msg.className = "ext-wait";
          wrap.appendChild(msg);
        }
        msg.textContent = "Waiting for review count to load…";
      }
    }
    container.classList.add("ext-mask-reviews");
    return wrap;
  }

  async function injectSteamGuessingGame() {
    if (!isSteamAppPage()) return;

    const appId = getCurrentSteamAppId() || "unknown";

    const existingWrap = document.querySelector(
      `.ext-steam-guess[data-ext-appid="${appId}"]`
    );
    if (existingWrap && existingWrap.dataset.state === "ready") {
      hideAllSteamReviewCounts();
      return;
    }

    document
      .querySelectorAll(".ext-steam-guess[data-ext-appid]")
      .forEach((el) => {
        if (el.getAttribute("data-ext-appid") !== appId) el.remove();
      });

    const container = getSteamReviewsContainer();
    if (!container) {
      return;
    }

    hideAllSteamReviewCounts();

    const wrap = ensureLoadingWidget(container, appId);
    if (!wrap) return;

    if (wrap.dataset.state === "ready") {
      hideAllSteamReviewCounts();
      return;
    }

    let trueCount = wrap.dataset.truecount
      ? parseInt(wrap.dataset.truecount, 10)
      : null;
    if (!Number.isFinite(trueCount)) {
      const got = await waitForAnyReviewCount(5000);
      if (!got) {
        if (!wrap.querySelector(".ext-error")) {
          wrap.innerHTML =
            '<div class="ext-error">Failed to load review count</div>';
        }
        return;
      }
      trueCount = got.count;
      wrap.dataset.truecount = String(trueCount);
    }

    if (wrap.dataset.state !== "ready") {
      // Reset results shown flag for new game
      wrap.dataset.resultsShown = '0';
      
      // Use seeded random based on appId for co-op consistency
      const guesses = buildGuessSet(trueCount, appId);
      wrap.dataset.guesses = JSON.stringify(guesses);
      wrap.innerHTML = "";

      const btns = [];
      guesses.forEach((val) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.value = String(val);
        b.className = "ext-guess-btn";
        b.textContent = formatNum(val);
        
        // Add count display element
        const countSpan = document.createElement("span");
        countSpan.className = "ext-reply-count";
        countSpan.style.cssText = "margin-left: 8px; font-size: 11px; opacity: 0.7;";
        countSpan.textContent = "";
        b.appendChild(countSpan);
        
        btns.push(b);
        wrap.appendChild(b);
      });

      const note = document.createElement("div");
      note.className = "ext-subtle";
      note.textContent =
        "Guess the All Reviews count (all languages).";
      wrap.appendChild(note);

      const correct = trueCount;
      let userPickedValue = null; // Store user's pick
      
      // Define showResults function that only shows results when all users have replied (in co-op mode)
      const showResults = (buttons, correctAnswer, userPick) => {
        // Validate that all online users have replied before showing status colors
        if (!allOnlineUsersReplied()) {
          console.log('[Co-op] showResults called but not all users replied yet, skipping');
          return;
        }
        
        // Show results (either non-co-op mode or all users have replied in co-op mode)
        buttons.forEach((btn) => {
          const val = parseInt(btn.dataset.value, 10);
          if (val === correctAnswer) {
            btn.classList.add("correct");
          }
          if (val === userPick && val !== correctAnswer) {
            btn.classList.add("wrong");
          }
          btn.classList.remove("user-selected");
        });
      };
      
      const mark = (picked) => {
        if (wrap.dataset.locked === "1") return;
        wrap.dataset.locked = "1";
        userPickedValue = picked;
        
        // Update user's hasReplied status optimistically (for UI state)
        // Note: Reply counts will be updated by server broadcast
        if (ns.coop && ns.coop.getState) {
          const state = ns.coop.getState();
          if (state.client && state.isConnected && state.gameState && state.gameState.users) {
            // Find current user by userId or connectionId
            const currentUserId = state.userId || (state.connectionId && Object.keys(state.gameState.users).find(uid => state.gameState.users[uid].id === state.connectionId));
            if (currentUserId && state.gameState.users[currentUserId]) {
              state.gameState.users[currentUserId].hasReplied = true;
              state.gameState.users[currentUserId].replyOption = picked;
            }
          }
        }
        
        // Send guess to server if in co-op mode
        if (ns.coop && ns.coop.getState) {
          const state = ns.coop.getState();
          if (state.client && state.isConnected) {
            // Send correct answer along with guess
            state.client.sendGuess(picked, appId, correct);
            console.log('[Co-op] Sent guess:', picked, 'correct answer:', correct);
          }
        }
        
        // Highlight user's selection ONLY (no correct/wrong status yet)
        btns.forEach((btn) => {
          const val = parseInt(btn.dataset.value, 10);
          if (val === picked) {
            btn.classList.add("user-selected");
            // Set border color to user's color
            if (ns.coop && ns.coop.getState) {
              const state = ns.coop.getState();
              const currentUserId = state.userId;
              if (currentUserId && state.gameState && state.gameState.users && state.gameState.users[currentUserId]) {
                const userColor = state.gameState.users[currentUserId].color;
                if (userColor) {
                  btn.style.borderColor = userColor;
                  btn.style.boxShadow = `0 0 8px ${userColor}80`; // Add transparency to color
                }
              }
            }
          }
          
          // Only disable buttons if connected to co-op
          if (ns.coop && ns.coop.getStatus && ns.coop.getStatus().isConnected) {
            btn.disabled = true;
            btn.setAttribute("aria-disabled", "true");
            btn.style.pointerEvents = "none";
          }
        });
        
        // In co-op mode, results will be shown when all users reply (handled by setupReplyCountUpdates)
        // For non-co-op mode, show results immediately
        if (!ns.coop || !ns.coop.getState) {
          showResults(btns, correct, userPickedValue);
        }
        // Note: The listener in setupReplyCountUpdates will check and show results when all users reply
      };
      
      btns.forEach((b) =>
        b.addEventListener(
          "click",
          () => mark(parseInt(b.dataset.value, 10)),
          { once: true }
        )
      );

      wrap.dataset.state = "ready";
      
      // Set up reply count updates for co-op mode
      setupReplyCountUpdates(wrap, btns, correct, showResults);
    } else {
      // Update reply counts if buttons already exist
      const existingBtns = wrap.querySelectorAll('.ext-guess-btn');
      if (existingBtns.length > 0) {
        // Get correct answer from dataset
        const correctAnswer = parseInt(wrap.dataset.truecount, 10) || 0;
        const showResultsFn = (buttons, correct, userPick) => {
          // Validate that all online users have replied before showing status colors
          if (!allOnlineUsersReplied()) {
            console.log('[Co-op] showResultsFn called but not all users replied yet, skipping');
            return;
          }
          
          // Show results (all users have replied)
          buttons.forEach((btn) => {
            const val = parseInt(btn.dataset.value, 10);
            if (val === correct) btn.classList.add("correct");
            if (val === userPick && val !== correct) {
              btn.classList.add("wrong");
            }
            btn.classList.remove("user-selected");
          });
        };
        setupReplyCountUpdates(wrap, Array.from(existingBtns), correctAnswer, showResultsFn);
      }
    }
  }

  /**
   * Check if all online users have replied (for co-op mode)
   * @param {Object} gameState - Optional gameState to check (if not provided, uses current state)
   * @returns {boolean} True if all online users have replied, false otherwise
   */
  function allOnlineUsersReplied(gameState = null) {
    if (!ns.coop || !ns.coop.getState) {
      // Non-co-op mode: always return true (no validation needed)
      return true;
    }
    
    // Use provided gameState or get from current state
    let users = null;
    if (gameState && gameState.users) {
      users = gameState.users;
    } else {
      const state = ns.coop.getState();
      if (!state || !state.gameState || !state.gameState.users) {
        return false;
      }
      users = state.gameState.users;
    }
    
    const allUsers = Object.values(users);
    const onlineUsers = allUsers.filter(u => u.isOnline);
    
    // If no online users, return false
    if (onlineUsers.length === 0) {
      return false;
    }
    
    // Check if all online users have replied
    return onlineUsers.every(u => u.hasReplied);
  }

  /**
   * Set up listeners for reply count updates
   */
  function setupReplyCountUpdates(wrap, btns, correctAnswer, showResultsFn) {
    const updateReplyCounts = (replyCounts) => {
      if (!replyCounts) {
        console.log('[Co-op] updateReplyCounts called with no replyCounts');
        return;
      }
      
      console.log('[Co-op] updateReplyCounts called with:', replyCounts, 'buttons array length:', btns.length);
      
      // Query buttons from DOM to ensure we have the latest buttons
      const allButtons = wrap.querySelectorAll('.ext-guess-btn');
      console.log('[Co-op] Found', allButtons.length, 'buttons in DOM');
      
      // Reply counts from server already include all online users' selections
      // Just display them directly
      console.log('[Co-op] Reply counts keys:', Object.keys(replyCounts), 'types:', Object.keys(replyCounts).map(k => typeof k));
      
      // Use buttons from DOM (more reliable than stored array)
      allButtons.forEach(btn => {
        const value = parseInt(btn.dataset.value, 10);
        // Try both number and string keys (server might send strings)
        const count = replyCounts[value] !== undefined ? replyCounts[value] : (replyCounts[String(value)] || 0);
        
        console.log('[Co-op] Button value:', value, 'count from replyCounts:', replyCounts[value], 'or string:', replyCounts[String(value)], 'final count:', count);
        
        const countSpan = btn.querySelector('.ext-reply-count');
        
        if (countSpan) {
          if (count > 0) {
            countSpan.textContent = `(${count} user${count !== 1 ? 's' : ''})`;
            countSpan.style.display = '';
            console.log('[Co-op] ✅ Updated count for value', value, 'to', count);
          } else {
            countSpan.textContent = '';
            countSpan.style.display = 'none';
          }
        } else {
          console.warn('[Co-op] ❌ No count span found for button with value', value, 'button:', btn);
        }
      });
    };
    
    // Listen for reply count updates
    const replyCountsListener = (event) => {
      console.log('[Co-op] ✅ Reply counts update event received in guessingGame.js:', event.detail);
      if (event.detail && event.detail.gameState) {
        const gameState = event.detail.gameState;
        
        // If room is in progress, reset UI state
        if (gameState.roomStatus === 'in_progress') {
          wrap.dataset.resultsShown = '0';
          const buttons = wrap.querySelectorAll('.ext-guess-btn');
          buttons.forEach(btn => {
            btn.classList.remove("correct", "wrong");
          });
        }
        
        // Calculate reply counts from currentGameStats
        // Filter out initialization guesses (sentinel value -1)
        const replyCounts = {};
        if (gameState.currentGameStats && Array.isArray(gameState.currentGameStats)) {
          gameState.currentGameStats.forEach(stat => {
            const value = stat.answerValue;
            // Skip initialization guesses (sentinel value -1)
            if (value !== -1 && value !== null && value !== undefined) {
              replyCounts[value] = (replyCounts[value] || 0) + 1;
            }
          });
        }
        
        // Always update reply counts first (before showing results)
        updateReplyCounts(replyCounts);
        
        // Highlight user's selection with their color (before showing results)
        if (ns.coop && ns.coop.getState) {
          const state = ns.coop.getState();
          const currentUserId = state.userId;
          if (currentUserId && gameState.users && gameState.users[currentUserId]) {
            const userPick = gameState.users[currentUserId].replyOption;
            const userColor = gameState.users[currentUserId].color;
            if (userPick !== null && userPick !== undefined && userColor) {
              const buttons = wrap.querySelectorAll('.ext-guess-btn');
              buttons.forEach(btn => {
                const val = parseInt(btn.dataset.value, 10);
                if (val === userPick) {
                  btn.classList.add("user-selected");
                  btn.style.borderColor = userColor;
                  btn.style.boxShadow = `0 0 8px ${userColor}80`; // Add transparency to color
                }
              });
            }
          }
        }
        
        // Show correct/wrong status ONLY if room is completed
        if (gameState.roomStatus === 'completed' && gameState.correctAnswer !== null) {
          if (wrap.dataset.resultsShown === '1') return; // Already shown
          
          const correct = gameState.correctAnswer;
          const buttons = wrap.querySelectorAll('.ext-guess-btn');
          buttons.forEach(btn => {
            const val = parseInt(btn.dataset.value, 10);
            
            // Ensure reply count is visible and updated before showing results
            const countSpan = btn.querySelector('.ext-reply-count');
            if (countSpan) {
              // Recalculate count for this button value from currentGameStats
              const count = replyCounts[val] || 0;
              if (count > 0) {
                countSpan.textContent = `(${count} user${count !== 1 ? 's' : ''})`;
                countSpan.style.display = '';
              } else if (countSpan.textContent) {
                // Keep existing count visible if it exists
                countSpan.style.display = '';
              }
            }
            
            if (val === correct) {
              btn.classList.add("correct");
            }
            // Mark wrong answers (user's selection that was wrong)
            if (ns.coop && ns.coop.getState) {
              const state = ns.coop.getState();
              const currentUserId = state.userId;
              if (currentUserId && gameState.users[currentUserId]) {
                const userPick = gameState.users[currentUserId].replyOption;
                if (val === userPick && val !== correct) {
                  btn.classList.add("wrong");
                }
              }
            }
            btn.classList.remove("user-selected");
          });
          wrap.dataset.resultsShown = '1';
        }
      } else {
        console.warn('[Co-op] Event received but no gameState in detail:', event.detail);
      }
    };
    console.log('[Co-op] Setting up reply counts listener for wrap:', wrap);
    window.addEventListener('coop-reply-counts-update', replyCountsListener);
    console.log('[Co-op] Listener added, total listeners:', window.getEventListeners ? 'N/A' : 'check manually');
    
    // Define checkAllReplied function in outer scope so it's accessible everywhere
    let checkAllReplied = null;
    
    // Also listen for game state updates to check if all users replied
    // NOTE: This listener is kept for backward compatibility but results should be shown
    // via the global checkAllUsersRepliedGlobally function instead
    if (correctAnswer !== undefined && showResultsFn) {
      checkAllReplied = () => {
        if (wrap.dataset.resultsShown === '1') return;
        
        if (!ns.coop || !ns.coop.getState) return;
        
        const state = ns.coop.getState();
        if (!state.gameState || !state.gameState.users) return;
        
        // IMPORTANT: Only show results if room status is completed
        // Don't show results if room is still in_progress
        if (state.gameState.roomStatus !== 'completed') {
          return;
        }
        
        // Also check that correctAnswer is set
        if (state.gameState.correctAnswer === null || state.gameState.correctAnswer === undefined) {
          return;
        }
        
        const allUsers = Object.values(state.gameState.users);
        const onlineUsers = allUsers.filter(u => u.isOnline);
        const allReplied = onlineUsers.length > 0 && onlineUsers.every(u => u.hasReplied);
        
        // Only show results if ALL users have replied AND room is completed
        if (allReplied && onlineUsers.length > 0) {
          wrap.dataset.resultsShown = '1';
          
          // Find current user by userId
          const currentUserId = state.userId || (state.connectionId && Object.keys(state.gameState.users).find(uid => {
            const user = state.gameState.users[uid];
            return user && user.id === state.connectionId;
          }));
          
          if (currentUserId && state.gameState.users[currentUserId]) {
            const userPick = state.gameState.users[currentUserId].replyOption;
            if (userPick !== null && userPick !== undefined) {
              console.log('[Co-op] All users replied, showing results for user:', currentUserId, 'pick:', userPick);
              showResultsFn(btns, correctAnswer, userPick);
            }
          } else {
            console.warn('[Co-op] Could not find current user to show results');
          }
        }
      };
      
      // Check on reply count updates
      const checkAllRepliedListener = () => {
        if (checkAllReplied) {
          checkAllReplied();
        }
      };
      window.addEventListener('coop-reply-counts-update', checkAllRepliedListener);
      
      // Also check periodically in case event is missed
      const checkInterval = setInterval(() => {
        if (checkAllReplied) {
          checkAllReplied();
        }
        if (wrap.dataset.resultsShown === '1') {
          clearInterval(checkInterval);
        }
      }, 500);
    }
    
    // Also check gameState from coopManager (fallback if events don't work)
    if (ns.coop && ns.coop.getState) {
      const checkGameState = () => {
        const state = ns.coop.getState();
        if (state.gameState && state.gameState.replyCounts) {
          console.log('[Co-op] Updating reply counts from gameState (periodic check):', state.gameState.replyCounts);
          updateReplyCounts(state.gameState.replyCounts);
        }
        // Also check if all users replied when gameState updates
        if (checkAllReplied) {
          checkAllReplied();
        }
      };
      
      // Check immediately
      checkGameState();
      
      // Check periodically (this should catch updates even if events don't fire)
      const interval = setInterval(() => {
        if (!wrap.parentNode) {
          clearInterval(interval);
          return;
        }
        checkGameState();
      }, 500); // Check more frequently
    }
    
    // Also listen for user-joined events to check if all replied
    if (checkAllReplied) {
      window.addEventListener('coop-status-change', () => {
        setTimeout(() => {
          if (checkAllReplied) {
            checkAllReplied();
          }
        }, 100);
      });
    }
  }

  /**
   * Global listener for reply count updates (set up once, works for all games)
   */
  function setupGlobalReplyCountListener() {
    if (window.__coopReplyCountListenerSetUp) return;
    window.__coopReplyCountListenerSetUp = true;
    
  // Track last gameId to detect new games
  let lastGameId = null;
  
  // Listen for next-game-selected to reset UI state
  window.addEventListener('coop-next-game-selected', (event) => {
    if (event.detail && event.detail.gameState) {
      const gameState = event.detail.gameState;
      console.log('[Co-op] Next game selected, resetting UI state. New gameId:', gameState.currentGameId);
      lastGameId = gameState.currentGameId;
      
      // Reset UI state for new game
      const wraps = document.querySelectorAll('.ext-steam-guess[data-truecount]');
      wraps.forEach(wrap => {
        wrap.dataset.resultsShown = '0'; // Reset results shown flag
        const buttons = wrap.querySelectorAll('.ext-guess-btn');
        buttons.forEach(btn => {
          btn.classList.remove("correct", "wrong", "user-selected");
          // Reset border styles
          btn.style.borderColor = '';
          btn.style.boxShadow = '';
        });
      });
    }
  });
  
  window.addEventListener('coop-reply-counts-update', (event) => {
    console.log('[Co-op] Global reply-counts-update event received:', event.detail);
    if (event.detail && event.detail.gameState) {
      const gameState = event.detail.gameState;
      console.log('[Co-op] GameState in global listener:', {
        currentGameId: gameState.currentGameId,
        roomStatus: gameState.roomStatus,
        currentGameStats: gameState.currentGameStats,
        correctAnswer: gameState.correctAnswer
      });
      
      // Check if this is a new game (gameId changed)
      const isNewGame = lastGameId !== null && gameState.currentGameId !== lastGameId;
      if (isNewGame || lastGameId === null) {
        lastGameId = gameState.currentGameId;
        console.log('[Co-op] New game detected, resetting UI state');
        
        // Reset UI state for new game
        const wraps = document.querySelectorAll('.ext-steam-guess[data-truecount]');
        wraps.forEach(wrap => {
          wrap.dataset.resultsShown = '0'; // Reset results shown flag
          const buttons = wrap.querySelectorAll('.ext-guess-btn');
          buttons.forEach(btn => {
            btn.classList.remove("correct", "wrong", "user-selected");
            // Reset border styles
            btn.style.borderColor = '';
            btn.style.boxShadow = '';
          });
        });
      }
      
      // IMPORTANT: If room status is in_progress, ensure we don't show results
      // Clear any correct/wrong highlighting that might be left over
      if (gameState.roomStatus === 'in_progress') {
        const wraps = document.querySelectorAll('.ext-steam-guess[data-truecount]');
        wraps.forEach(wrap => {
          wrap.dataset.resultsShown = '0'; // Reset results shown flag
          const buttons = wrap.querySelectorAll('.ext-guess-btn');
          buttons.forEach(btn => {
            btn.classList.remove("correct", "wrong");
            // Keep user-selected class if user has made a selection, but remove correct/wrong
          });
        });
      }
        
        // Calculate reply counts from currentGameStats
        // Filter out initialization guesses (sentinel value -1)
        const replyCounts = {};
        if (gameState.currentGameStats && Array.isArray(gameState.currentGameStats)) {
          console.log('[Co-op] Processing currentGameStats:', gameState.currentGameStats);
          gameState.currentGameStats.forEach(stat => {
            const value = stat.answerValue;
            // Skip initialization guesses (sentinel value -1)
            if (value !== -1 && value !== null && value !== undefined) {
              replyCounts[value] = (replyCounts[value] || 0) + 1;
            }
          });
          console.log('[Co-op] Calculated replyCounts:', replyCounts);
        } else {
          console.log('[Co-op] No currentGameStats or not an array:', gameState.currentGameStats);
        }
        
        // Find all guess buttons on the page and update them with reply counts
        const allButtons = document.querySelectorAll('.ext-guess-btn');
        console.log('[Co-op] Found', allButtons.length, 'buttons to update');
        
        allButtons.forEach(btn => {
          const value = parseInt(btn.dataset.value, 10);
          const count = replyCounts[value] || 0;
          
          const countSpan = btn.querySelector('.ext-reply-count');
          if (countSpan) {
            if (count > 0) {
              countSpan.textContent = `(${count} user${count !== 1 ? 's' : ''})`;
              countSpan.style.display = '';
              console.log('[Co-op] Updated count for button value', value, 'to', count);
            } else {
              // Don't hide the count span if it already has content (might be from previous state)
              // Only hide if it's truly empty
              if (!countSpan.textContent || countSpan.textContent.trim() === '') {
                countSpan.style.display = 'none';
              } else {
                // Keep existing count visible
                countSpan.style.display = '';
              }
            }
          } else {
            console.warn('[Co-op] No count span found for button with value', value);
          }
        });
        
        // Highlight user's selection with their color (before showing results)
        if (ns.coop && ns.coop.getState) {
          const state = ns.coop.getState();
          const currentUserId = state.userId;
          if (currentUserId && gameState.users && gameState.users[currentUserId]) {
            const userPick = gameState.users[currentUserId].replyOption;
            const userColor = gameState.users[currentUserId].color;
            if (userPick !== null && userPick !== undefined && userColor) {
              allButtons.forEach(btn => {
                const val = parseInt(btn.dataset.value, 10);
                if (val === userPick) {
                  btn.classList.add("user-selected");
                  btn.style.borderColor = userColor;
                  btn.style.boxShadow = `0 0 8px ${userColor}80`; // Add transparency to color
                }
              });
            }
          }
        }
        
        // Show correct/wrong status ONLY if room is completed
        if (gameState.roomStatus === 'completed' && gameState.correctAnswer !== null) {
          console.log('[Co-op] Room is completed, showing results. Correct answer:', gameState.correctAnswer);
          const wraps = document.querySelectorAll('.ext-steam-guess[data-truecount]');
          wraps.forEach(wrap => {
            if (wrap.dataset.resultsShown === '1') {
              console.log('[Co-op] Results already shown for this wrap');
              return;
            }
            
            const correct = gameState.correctAnswer;
            const buttons = wrap.querySelectorAll('.ext-guess-btn');
            console.log('[Co-op] Found', buttons.length, 'buttons to mark');
            buttons.forEach(btn => {
              const val = parseInt(btn.dataset.value, 10);
              
              // Ensure reply count is visible and updated before showing results
              const countSpan = btn.querySelector('.ext-reply-count');
              if (countSpan) {
                // Recalculate count for this button value from replyCounts (already calculated above)
                const count = replyCounts[val] || 0;
                if (count > 0) {
                  // Update with current count
                  countSpan.textContent = `(${count} user${count !== 1 ? 's' : ''})`;
                  countSpan.style.display = '';
                  console.log('[Co-op] Set count for button value', val, 'to', count, 'before showing results');
                } else {
                  // If count is 0 but span has content, keep it visible (might be from previous update)
                  if (countSpan.textContent && countSpan.textContent.trim() !== '') {
                    countSpan.style.display = '';
                    console.log('[Co-op] Keeping existing count visible for button value', val, ':', countSpan.textContent);
                  }
                }
              }
              
              if (val === correct) {
                btn.classList.add("correct");
                console.log('[Co-op] Added "correct" class to button with value', val);
              }
              // Mark wrong answers (user's selection that was wrong)
              if (ns.coop && ns.coop.getState) {
                const state = ns.coop.getState();
                const currentUserId = state.userId;
                if (currentUserId && gameState.users[currentUserId]) {
                  const userPick = gameState.users[currentUserId].replyOption;
                  if (val === userPick && val !== correct) {
                    btn.classList.add("wrong");
                    console.log('[Co-op] Added "wrong" class to button with value', val);
                  }
                }
              }
              btn.classList.remove("user-selected");
            });
            wrap.dataset.resultsShown = '1';
            console.log('[Co-op] Marked results as shown');
          });
        } else {
          console.log('[Co-op] Not showing results - roomStatus:', gameState.roomStatus, 'correctAnswer:', gameState.correctAnswer);
        }
      } else {
        console.warn('[Co-op] Event received but no gameState in detail:', event.detail);
      }
    });
  }
  
  /**
   * Check if all users replied and show results globally
   * DEPRECATED: Now handled by roomStatus === 'completed' in reply-counts-update listener
   */
  function checkAllUsersRepliedGlobally(gameState) {
    // This function is now deprecated - results are shown based on roomStatus
    // Keeping for backward compatibility but it should not be called
    return;
  }
  
  // Set up periodic check for all users replied (fallback)
  // Only check if results haven't been shown yet
  if (typeof window !== 'undefined' && !window.__coopAllRepliedChecker) {
    window.__coopAllRepliedChecker = setInterval(() => {
      if (!ns.coop || !ns.coop.getState) return;
      
      // Check if results are already shown - if so, skip
      const wraps = document.querySelectorAll('.ext-steam-guess[data-truecount]');
      const allResultsShown = wraps.length > 0 && Array.from(wraps).every(wrap => wrap.dataset.resultsShown === '1');
      if (allResultsShown) {
        return; // Results already shown, no need to check
      }
      
      const state = ns.coop.getState();
      if (state.gameState && state.gameState.users) {
        checkAllUsersRepliedGlobally(state.gameState);
      }
    }, 500);
  }

  ns.injectSteamGuessingGame = injectSteamGuessingGame;
  ns.setupGlobalReplyCountListener = setupGlobalReplyCountListener;
  
  // Set up global listener immediately
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupGlobalReplyCountListener);
    } else {
      setupGlobalReplyCountListener();
    }
  }
})(window);
