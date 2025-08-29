// Centralized API and WebSocket base URLs
// Note: Do NOT include a trailing slash

// Development vs Production URL detection
const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';

export const API_BASE_URL = isDevelopment 
  ? 'http://103.90.227.18'  // Use production API for now
  : 'http://103.90.227.18';

export const WS_BASE_URL = API_BASE_URL;


