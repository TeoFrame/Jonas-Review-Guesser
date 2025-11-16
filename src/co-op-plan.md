# WebSocket Co-op Implementation Plan

## Summary

This plan outlines the implementation of multiplayer co-op functionality for the Jonas Review Guesser Chrome extension using native WebSockets. The extension will support real-time collaborative gameplay where users can share game sessions, compete on a leaderboard, and track each other's progress.

**Key Features:**
- Join functionality via room codes (first user becomes host)
- Role-based UI (Host controls navigation, Clients follow along)
- Real-time leaderboard tracking correct guesses
- User reply counter showing participation
- Simple WebSocket server (deployable to Railway, Render, etc.)

**Technical Approach:**
Native WebSocket server using Node.js and the `ws` library. Simple, lightweight, and easy to deploy to any Node.js hosting platform.

---

## Phase 1: WebSocket Server Setup
- [x] Create WebSocket server with Node.js
- [x] Implement room-based multiplayer logic
- [x] Set up host/client role management
- [x] Configure message protocol
- [x] Create WebSocket client module
- [x] Create co-op manager for connection handling
- [x] Add client-side connection testing
- [ ] Deploy server (Railway/Render/etc.)

## Phase 2: Basic Connection Functionality
- [x] Add UI controls (Join, Reset, Disconnect buttons)
- [x] Implement room joining (first user becomes host automatically)
- [x] Implement join room functionality with room code input
- [x] Add connection state management
- [x] Handle connection errors and reconnection

## Phase 3: Host/Client Role Management
- [x] Detect and assign host role (first user in room)
- [x] Implement client role assignment
- [x] For clients: hide Next buttons
- [x] For clients: show status display and Disconnect button
- [x] For host: enable Next buttons to navigate games
- [x] Sync game navigation from host to all clients
- [x] Automatic host migration when host disconnects

## Phase 4: User Reply Counter
- [ ] Track user ready/reply states
- [ ] Display "X/Y users replied" counter
- [ ] Update counter in real-time
- [ ] Reset reply counter on new game
- [ ] Show individual user reply status

## Phase 5: Leaderboard Implementation
- [ ] Create leaderboard data structure
- [ ] Track correct guesses per user
- [ ] Display real-time leaderboard UI
- [ ] Sort users by score
- [ ] Update leaderboard on each guess
- [ ] Persist leaderboard during session
- [ ] Reset leaderboard functionality

## Phase 6: Testing and Polish
- [ ] Test host/client functionality
- [ ] Test with multiple simultaneous users
- [ ] Handle edge cases (host disconnect, network issues)
- [ ] Add user feedback messages
- [ ] Update README with co-op instructions
- [ ] Final testing and bug fixes
