/**
 * Configuration file for the extension
 * Centralized configuration for easy updates
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  // WebSocket server configuration
  ns.config = {
    // Default WebSocket server URL
    // For local development: 'ws://localhost:8080'
    // For production: 'wss://your-server.com'
    DEFAULT_SERVER_URL: 'wss://31.43.142.49:443',
  };
})(window);

