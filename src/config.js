/**
 * Configuration file for the extension
 * Centralized configuration for easy updates
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  // WebSocket server configuration
  ns.config = {
    // Default WebSocket server URL
    // Production server: steam-review-guesser.onrender.com
    DEFAULT_SERVER_URL: 'wss://steam-review-guesser.onrender.com',
  };
})(window);

