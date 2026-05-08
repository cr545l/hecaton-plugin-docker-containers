/**
 * Input handling - Keyboard & Mouse support
 */

const ESC = '\x1b';
const CSI = ESC + '[';

// Parse mouse event from SGR format
function parseMouseEvent(data) {
  // SGR format: ESC[<button>;<x>;<y>M
  const match = data.match(/\x1b\[<(\d+);(\d+);(\d+)([mM])/);
  if (!match) return null;

  const button = parseInt(match[1], 10);
  const x = parseInt(match[2], 10) - 1; // Convert to 0-based
  const y = parseInt(match[3], 10) - 1;
  const release = match[4] === 'M';

  return {
    button: button & 3, // 0=left, 1=middle, 2=right
    x,
    y,
    release,
    isPress: !release,
  };
}

// Detect clickable region
function detectClickRegion(x, y, state, termCols, termRows) {
  // Header region (tabs and controls)
  if (y === 0) {
    if (x < 25) return { type: 'tab', tab: 'containers' };
    if (x > termCols - 25) return { type: 'tab', tab: 'backups' };
  }

  // Content region
  const contentStart = 2;
  const contentEnd = termRows - 2;
  if (y >= contentStart && y < contentEnd) {
    const lineIdx = y - contentStart;
    if (state.selectedTab === 'containers') {
      if (lineIdx < state.containers.length) {
        return { type: 'select', index: lineIdx, double: false };
      }
    } else {
      if (lineIdx < state.backups.length) {
        return { type: 'select', index: lineIdx, double: false };
      }
    }
  }

  // Footer region (help text / buttons)
  if (y === termRows - 1) {
    const text = state.selectedTab === 'containers'
      ? '[s] Snapshot  [r] Restore  [↑↓] Select  [TAB] Backups  [q] Quit'
      : '[d] Delete  [↑↓] Select  [TAB] Containers  [q] Quit';

    if (x < 20) return { type: 'action', action: 's' };
    if (x > 20 && x < 40) return { type: 'action', action: 'r' };
  }

  return { type: 'none' };
}

// Track double-click
let lastClickTime = 0;
let lastClickPos = { x: 0, y: 0 };

function isDoubleClick(x, y) {
  const now = Date.now();
  const isDoubleClickTime = (now - lastClickTime) < 300;
  const isDoubleClickPos = Math.abs(x - lastClickPos.x) < 3 && Math.abs(y - lastClickPos.y) < 3;

  lastClickTime = now;
  lastClickPos = { x, y };

  return isDoubleClickTime && isDoubleClickPos;
}

module.exports = {
  parseMouseEvent,
  detectClickRegion,
  isDoubleClick,
};
