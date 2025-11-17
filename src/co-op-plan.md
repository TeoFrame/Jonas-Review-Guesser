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
- [x] Deploy server (Railway/Render/etc.)

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
- [x] Track user ready/reply states
- [x] Display "X/Y users replied" counter
- [x] Update counter in real-time
- [x] Reset reply counter on new game
- [x] Show individual user reply status

## Phase 5: Leaderboard Implementation
- [x] Create leaderboard data structure
- [x] Track correct guesses per user
- [x] Display real-time leaderboard UI
- [x] Sort users by score
- [x] Update leaderboard on each guess
- [x] Persist leaderboard during session
- [x] Reset leaderboard functionality

## Phase 6: Testing and Polish
- [x] Test host/client functionality
- [x] Test with multiple simultaneous users
- [x] Handle edge cases (host disconnect, network issues)
- [x] Add user feedback messages
- [x] Update README with co-op instructions
- [x] Final testing and bug fixes
