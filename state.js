/**
 * State management for Docker Containers plugin
 */

const state = {
  // UI state
  selectedTab: 'containers', // 'containers', 'backups'
  selectedIndex: 0,
  scrollOffset: 0,
  hoveredButton: null, // Hovered action or tab id
  hoveredResize: null,
  columnDrag: null,
  minimized: false,
  tableWidths: {
    containers: { name: 24, image: 30 },
    backups: { name: 60, type: 12 },
  },

  // Data
  containers: [],
  backups: [],

  // Loading state
  isLoading: false,
  progress: null,
  message: '',
  messageType: '', // 'success', 'error', 'info'

  // Settings
  selectedContainer: null,
  selectedBackup: null,
};

let messageTimer = null;

function setMessage(msg, type = 'info') {
  if (messageTimer) clearTimeout(messageTimer);
  state.message = msg;
  state.messageType = type;
  messageTimer = setTimeout(() => {
    state.message = '';
    state.messageType = '';
    if (typeof state.onMessageChanged === 'function') {
      state.onMessageChanged();
    }
  }, 3000);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    setMessage,
  };
}
