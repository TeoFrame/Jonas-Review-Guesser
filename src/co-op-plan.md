# WebSocket Co-op Implementation Plan

## Summary

This plan outlines the implementation of multiplayer co-op functionality for the Jonas Review Guesser Chrome extension using native WebSockets. The extension will support real-time collaborative gameplay where users can share game sessions, compete on a leaderboard, and track each other's progress.

**Key Features:**
- Automatic session hosting when user clicks "Share"
- Join functionality via room codes
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
- [ ] Add UI controls (Share, Join, Reset, Disconnect buttons)
- [ ] Implement room creation for host
- [ ] Generate shareable room codes
- [ ] Implement join room functionality for clients
- [ ] Add connection state management
- [ ] Handle connection errors and reconnection

## Phase 3: Host/Client Role Management
- [ ] Detect and assign host role (first user in room)
- [ ] Implement client role assignment
- [ ] For clients: hide Next buttons
- [ ] For clients: show only Stats and Disconnect buttons
- [ ] For host: enable Next buttons to navigate games
- [ ] Sync game navigation from host to all clients

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
