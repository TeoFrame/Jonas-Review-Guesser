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
            state.client.sendGuess(picked, appId);
            console.log('[Co-op] Sent guess:', picked);
          }
        }
        
        // Highlight user's selection
        btns.forEach((btn) => {
          const val = parseInt(btn.dataset.value, 10);
          if (val === picked) {
            btn.classList.add("user-selected");
          }
          btn.disabled = true;
          btn.setAttribute("aria-disabled", "true");
          btn.style.pointerEvents = "none";
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
      if (event.detail && event.detail.replyCounts) {
        updateReplyCounts(event.detail.replyCounts);
      } else {
        console.warn('[Co-op] Event received but no replyCounts in detail:', event.detail);
      }
    };
    console.log('[Co-op] Setting up reply counts listener for wrap:', wrap);
    window.addEventListener('coop-reply-counts-update', replyCountsListener);
    console.log('[Co-op] Listener added, total listeners:', window.getEventListeners ? 'N/A' : 'check manually');
    
    // Also listen for game state updates to check if all users replied
    if (correctAnswer !== undefined && showResultsFn) {
      const checkAllReplied = () => {
        if (wrap.dataset.resultsShown === '1') return;
        
        if (!ns.coop || !ns.coop.getState) return;
        
        const state = ns.coop.getState();
        if (!state.gameState || !state.gameState.users) return;
        
        const allUsers = Object.values(state.gameState.users);
        const onlineUsers = allUsers.filter(u => u.isOnline);
        const allReplied = onlineUsers.length > 0 && onlineUsers.every(u => u.hasReplied);
        
        if (allReplied) {
          wrap.dataset.resultsShown = '1';
          
          // Find current user by userId
          const currentUserId = state.userId || (state.connectionId && Object.keys(state.gameState.users).find(uid => {
            const user = state.gameState.users[uid];
            return user && user.id === state.connectionId;
          }));
          
          if (currentUserId && state.gameState.users[currentUserId]) {
            const userPick = state.gameState.users[currentUserId].replyOption;
            if (userPick !== null) {
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
        checkAllReplied();
      };
      window.addEventListener('coop-reply-counts-update', checkAllRepliedListener);
      
      // Also check periodically in case event is missed
      const checkInterval = setInterval(() => {
        checkAllReplied();
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
        setTimeout(checkAllReplied, 100);
      });
    }
  }

  /**
   * Global listener for reply count updates (set up once, works for all games)
   */
  function setupGlobalReplyCountListener() {
    if (window.__coopReplyCountListenerSetUp) return;
    window.__coopReplyCountListenerSetUp = true;
    
    window.addEventListener('coop-reply-counts-update', (event) => {
      if (event.detail && event.detail.replyCounts) {
        // Find all guess buttons on the page and update them
        const allButtons = document.querySelectorAll('.ext-guess-btn');
        
        allButtons.forEach(btn => {
          const value = parseInt(btn.dataset.value, 10);
          const count = event.detail.replyCounts[value] !== undefined 
            ? event.detail.replyCounts[value] 
            : (event.detail.replyCounts[String(value)] || 0);
          
          const countSpan = btn.querySelector('.ext-reply-count');
          if (countSpan) {
            if (count > 0) {
              countSpan.textContent = `(${count} user${count !== 1 ? 's' : ''})`;
              countSpan.style.display = '';
            } else {
              countSpan.textContent = '';
              countSpan.style.display = 'none';
            }
          }
        });
        
        // Also check if all users replied and show results
        if (event.detail.gameState && event.detail.gameState.users) {
          checkAllUsersRepliedGlobally(event.detail.gameState);
        }
      }
    });
  }
  
  /**
   * Check if all users replied and show results globally
   */
  function checkAllUsersRepliedGlobally(gameState) {
    if (!ns.coop || !ns.coop.getState) return;
    
    const state = ns.coop.getState();
    if (!state.userId && !state.connectionId) return;
    
    const allUsers = Object.values(gameState.users);
    const onlineUsers = allUsers.filter(u => u.isOnline);
    const allReplied = onlineUsers.length > 0 && onlineUsers.every(u => u.hasReplied);
    
    if (allReplied) {
      // Find current user
      const currentUserId = state.userId || (state.connectionId && Object.keys(gameState.users).find(uid => {
        const user = gameState.users[uid];
        return user && user.id === state.connectionId;
      }));
      
      if (currentUserId && gameState.users[currentUserId]) {
        const userPick = gameState.users[currentUserId].replyOption;
        if (userPick !== null) {
          // Find the wrap element and correct answer
          const wraps = document.querySelectorAll('.ext-steam-guess[data-truecount]');
          wraps.forEach(wrap => {
            if (wrap.dataset.resultsShown === '1') return; // Already shown
            
            const correct = parseInt(wrap.dataset.truecount, 10);
            const buttons = wrap.querySelectorAll('.ext-guess-btn');
            
            if (buttons.length > 0) {
              wrap.dataset.resultsShown = '1';
              console.log('[Co-op] All users replied, showing results globally. User pick:', userPick, 'Correct:', correct);
              
              buttons.forEach(btn => {
                const val = parseInt(btn.dataset.value, 10);
                if (val === correct) {
                  btn.classList.add("correct");
                }
                if (val === userPick && val !== correct) {
                  btn.classList.add("wrong");
                }
                btn.classList.remove("user-selected");
              });
            }
          });
        }
      }
    }
  }
  
  // Set up periodic check for all users replied (fallback)
  if (typeof window !== 'undefined' && !window.__coopAllRepliedChecker) {
    window.__coopAllRepliedChecker = setInterval(() => {
      if (!ns.coop || !ns.coop.getState) return;
      
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
