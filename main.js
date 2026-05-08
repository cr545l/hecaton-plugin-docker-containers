#!/usr/bin/env node

/**
 * Docker Containers Manager - Hecaton Plugin
 */

const {
  render: renderUI,
  getActionAt,
  getColumnResizeAt,
  getLayout,
  getTableLayout,
  clampColumnWidth,
  isContainerRunning,
} = require('./render.js');
const { state, setMessage } = require('./state.js');
const DockerManager = require('./docker.js');

const docker = new DockerManager();
let termCols = 120;
let termRows = 30;
let currentMouseShape = 'default';

function setMouseShape(shape) {
  if (shape === currentMouseShape) return;
  currentMouseShape = shape;
  hecaton.window.set_cursor({ cursor: shape }).catch(() => {});
}

function cleanupTerminal() {
  if (state.progressTimer) clearInterval(state.progressTimer);
  setMouseShape('default');
  process.stdout.write('\x1b[?1000l\x1b[?1003l\x1b[?1006l\x1b[?25h\x1b[0m');
}

// ============================================================
// Render
// ============================================================

function rerender() {
  const output = renderUI(state, termCols, termRows);
  process.stdout.write(output);
}

state.onMessageChanged = rerender;

function startProgress(label) {
  if (state.progressTimer) clearInterval(state.progressTimer);
  state.isLoading = true;
  state.progress = {
    label,
    detail: '',
    startedAt: Date.now(),
    frame: 0,
  };
  state.progressTimer = setInterval(() => {
    if (!state.progress) return;
    state.progress.frame += 1;
    rerender();
  }, 250);
  rerender();
}

function updateProgress(detail) {
  if (!state.progress) return;
  state.progress.detail = detail;
  rerender();
}

function stopProgress() {
  if (state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
  state.isLoading = false;
  state.progress = null;
}

// ============================================================
// Data Loading
// ============================================================

async function refreshContainers() {
  state.containers = await docker.listContainers();
  if (state.selectedIndex >= state.containers.length) {
    state.selectedIndex = Math.max(0, state.containers.length - 1);
  }
  rerender();
}

async function refreshBackups() {
  state.backups = await docker.listBackups();
  if (state.selectedIndex >= state.backups.length) {
    state.selectedIndex = Math.max(0, state.backups.length - 1);
  }
  rerender();
}

// ============================================================
// Actions
// ============================================================

async function snapshotContainer(containerIndex = state.selectedIndex) {
  if (state.isLoading) return;
  if (containerIndex < 0 || containerIndex >= state.containers.length) return;

  const container = state.containers[containerIndex];
  startProgress(`Snapshot ${container.name}`);

  const result = await docker.backupContainerVolumes(container.name, updateProgress);

  stopProgress();
  if (result.success) {
    const fileName = result.file.split(/[\/\\]/).pop();
    setMessage(`Snapshot saved: ${fileName}`, 'success');
    await refreshBackups();
  } else {
    setMessage(`Failed: ${result.error}`, 'error');
    rerender();
  }
}

async function startContainer(containerIndex = state.selectedIndex) {
  if (state.isLoading) return;
  if (state.selectedTab !== 'containers' || containerIndex < 0 || containerIndex >= state.containers.length) return;

  const container = state.containers[containerIndex];
  if (isContainerRunning(container)) {
    setMessage(`${container.name} is already running`, 'info');
    rerender();
    return;
  }

  startProgress(`Start ${container.name}`);
  const result = await docker.startContainer(container.name, updateProgress);

  stopProgress();
  if (result.success) {
    setMessage(`Started ${container.name}`, 'success');
    await refreshContainers();
  } else {
    setMessage(`Start failed: ${result.error}`, 'error');
    rerender();
  }
}

async function stopContainer(containerIndex = state.selectedIndex) {
  if (state.isLoading) return;
  if (state.selectedTab !== 'containers' || containerIndex < 0 || containerIndex >= state.containers.length) return;

  const container = state.containers[containerIndex];
  if (!isContainerRunning(container)) {
    setMessage(`${container.name} is already stopped`, 'info');
    rerender();
    return;
  }

  startProgress(`Stop ${container.name}`);
  const result = await docker.stopContainer(container.name, updateProgress);

  stopProgress();
  if (result.success) {
    setMessage(`Stopped ${container.name}`, 'success');
    await refreshContainers();
  } else {
    setMessage(`Stop failed: ${result.error}`, 'error');
    rerender();
  }
}

async function restoreBackup() {
  if (state.isLoading) return;
  if (state.selectedTab !== 'backups' || state.selectedIndex >= state.backups.length) return;

  const backup = state.backups[state.selectedIndex];
  const match = backup.containerName
    ? state.containers.find(c => c.name === backup.containerName)
    : state.containers.find(c => backup.name.includes(c.name) || c.name.includes(backup.name.split('_')[1]));

  if (!match) {
    setMessage('No matching container found', 'error');
    rerender();
    return;
  }

  startProgress(`Restore ${match.name}`);

  const result = await docker.restoreContainerVolumes(match.name, backup.path, updateProgress);

  stopProgress();
  if (result.success) {
    setMessage(`Restored from ${backup.name}`, 'success');
  } else {
    setMessage(`Restore failed: ${result.error}`, 'error');
  }
  rerender();
}

async function deleteBackup() {
  if (state.isLoading) return;
  if (state.selectedTab !== 'backups' || state.selectedIndex >= state.backups.length) return;

  const backup = state.backups[state.selectedIndex];
  startProgress(`Delete ${backup.name}`);

  const result = await docker.deleteBackup(backup.path);

  stopProgress();
  if (result.success) {
    setMessage(`Deleted ${backup.name}`, 'success');
    await refreshBackups();
  } else {
    setMessage(`Delete failed: ${result.error}`, 'error');
    rerender();
  }
}

// ============================================================
// Input Handling
// ============================================================

function handleInput(data) {
  const str = data.toString();

  if (handleMouseInput(str)) {
    return;
  }

  // Keyboard
  if (str === 'q' || str === '\x1b') {
    cleanupTerminal();
    hecaton.window.close();
    process.exit(0);
    return;
  }

  if (str === '\x1b[A') {
    // Up
    const items = state.selectedTab === 'containers' ? state.containers : state.backups;
    if (items.length > 0) {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      rerender();
    }
  } else if (str === '\x1b[B') {
    // Down
    const items = state.selectedTab === 'containers' ? state.containers : state.backups;
    if (items.length > 0) {
      state.selectedIndex = Math.min(items.length - 1, state.selectedIndex + 1);
      rerender();
    }
  } else if (str === '\t') {
    // Tab
    state.selectedTab = state.selectedTab === 'containers' ? 'backups' : 'containers';
    state.selectedIndex = 0;
    state.hoveredResize = null;
    state.columnDrag = null;
    if (state.selectedTab === 'backups') {
      refreshBackups();
    } else {
      refreshContainers();
    }
  } else if (str === 's' && state.selectedTab === 'containers') {
    snapshotContainer();
  } else if (str === 'u' && state.selectedTab === 'containers') {
    startContainer();
  } else if (str === 'x' && state.selectedTab === 'containers') {
    stopContainer();
  } else if (str === 'r' && state.selectedTab === 'backups') {
    restoreBackup();
  } else if (str === 'd' && state.selectedTab === 'backups') {
    deleteBackup();
  }
}

function handleMouseInput(str) {
  const mouseRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let match;
  let hadMouse = false;

  while ((match = mouseRegex.exec(str)) !== null) {
    hadMouse = true;
    const button = parseInt(match[1], 10);
    const x = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    const pressed = match[4] === 'M';
    const released = match[4] === 'm';
    const btn = button & 3;
    const motion = (button & 32) !== 0;
    const wheel = (button & 64) !== 0;

    if (state.columnDrag) {
      if (!wheel && (motion || pressed)) {
        updateColumnDrag(x);
      }
      if (released) {
        finishColumnDrag(x, y);
      }
      continue;
    }

    updateHover(x, y);

    if (!motion && !wheel && pressed && btn === 0) {
      const resize = getColumnResizeAt(x, y, state, termCols);
      if (resize) {
        startColumnDrag(resize, x);
        continue;
      }
      handleLeftClick(x, y);
    }
  }

  return hadMouse;
}

function updateHover(x, y) {
  const resize = getColumnResizeAt(x, y, state, termCols);
  const action = resize ? null : getActionAt(x, y, state, termRows);
  const hoveredId = action ? action.id : null;
  const resizeId = resize ? `${resize.tab}:${resize.columnId}` : null;
  const currentResizeId = state.hoveredResize
    ? `${state.hoveredResize.tab}:${state.hoveredResize.columnId}`
    : null;

  if (state.hoveredButton !== hoveredId || currentResizeId !== resizeId) {
    state.hoveredButton = hoveredId;
    state.hoveredResize = resize;
    setMouseShape(resize ? 'ew-resize' : hoveredId ? 'pointer' : 'default');
    rerender();
    return;
  }

  setMouseShape(resize ? 'ew-resize' : hoveredId ? 'pointer' : 'default');
}

function setTableColumnWidth(tab, columnId, width) {
  if (!state.tableWidths) state.tableWidths = {};
  if (!state.tableWidths[tab]) state.tableWidths[tab] = {};
  state.tableWidths[tab][columnId] = width;
}

function startColumnDrag(resize, x) {
  const table = getTableLayout(state, resize.tab, termCols);
  const column = table.columns.find(item => item.id === resize.columnId);
  if (!column) return;

  state.columnDrag = {
    tab: resize.tab,
    columnId: resize.columnId,
    title: resize.title,
    startX: x,
    startWidth: column.width,
  };
  state.hoveredButton = null;
  state.hoveredResize = resize;
  setMouseShape('ew-resize');
  rerender();
}

function updateColumnDrag(x) {
  const drag = state.columnDrag;
  if (!drag) return;

  const nextWidth = clampColumnWidth(
    state,
    drag.tab,
    drag.columnId,
    drag.startWidth + (x - drag.startX),
    termCols
  );
  const currentWidth = state.tableWidths
    && state.tableWidths[drag.tab]
    && state.tableWidths[drag.tab][drag.columnId];

  if (currentWidth !== nextWidth) {
    setTableColumnWidth(drag.tab, drag.columnId, nextWidth);
    rerender();
  }
}

function finishColumnDrag(x, y) {
  if (!state.columnDrag) return;
  state.columnDrag = null;
  updateHover(x, y);
}

function handleLeftClick(x, y) {
  const action = getActionAt(x, y, state, termRows);
  if (action) {
    handleAction(action.id);
    return;
  }

  // Content area: rows 5 onwards (after header, separator, etc)
  // Row layout: 1=tabs, 2=sep, 3=header, 4=sep, 5+=content
  const layout = getLayout(termRows);

  // Content row click
  if (y >= layout.contentStartRow && y <= layout.contentEndRow) {
    const lineIdx = y - layout.contentStartRow;
    const items = state.selectedTab === 'containers' ? state.containers : state.backups;
    if (lineIdx < items.length) {
      state.selectedIndex = lineIdx;
      rerender();
    }
  }
}

function handleAction(id) {
  switch (id) {
    case 'tab-containers':
      state.selectedTab = 'containers';
      state.selectedIndex = 0;
      state.hoveredResize = null;
      state.columnDrag = null;
      refreshContainers();
      break;
    case 'tab-backups':
      state.selectedTab = 'backups';
      state.selectedIndex = 0;
      state.hoveredResize = null;
      state.columnDrag = null;
      refreshBackups();
      break;
    case 'snapshot':
      snapshotContainer();
      break;
    case 'start-container':
      startContainer();
      break;
    case 'stop-container':
      stopContainer();
      break;
    case 'refresh-containers':
      refreshContainers();
      break;
    case 'restore':
      restoreBackup();
      break;
    case 'delete':
      deleteBackup();
      break;
    case 'refresh-backups':
      refreshBackups();
      break;
  }
}

function getMenuZone(row) {
  const layout = getLayout(termRows);
  if (row >= layout.contentStartRow && row <= layout.contentEndRow) {
    return { type: state.selectedTab, index: row - layout.contentStartRow };
  }
  return null;
}

function getMenuItems(zone) {
  if (!zone) return [];

  if (zone.type === 'containers') {
    if (zone.index >= state.containers.length) return [];
    const container = state.containers[zone.index];
    const running = isContainerRunning(container);
    return [
      { id: `start-${zone.index}`, label: 'Start', icon: 'play', enabled: !running },
      { id: `stop-${zone.index}`, label: 'Stop', icon: 'debug-stop', enabled: running },
      { id: `snapshot-${zone.index}`, label: 'Snapshot Volumes', icon: 'archive' },
    ];
  } else if (zone.type === 'backups') {
    if (zone.index >= state.backups.length) return [];
    return [
      { id: `restore-${zone.index}`, label: 'Restore', icon: 'history' },
      { id: `delete-${zone.index}`, label: 'Delete', icon: 'trash', enabled: true },
      { id: `copy-${zone.index}`, label: 'Copy Path', icon: 'copy' },
    ];
  }

  return [];
}

function selectMenuTarget(zone) {
  if (!zone) return false;
  const items = zone.type === 'containers' ? state.containers : state.backups;
  if (zone.index < 0 || zone.index >= items.length) return false;

  state.selectedTab = zone.type;
  state.selectedIndex = zone.index;
  state.hoveredResize = null;
  state.columnDrag = null;
  return true;
}

function handleMenuAction(id) {
  if (!id) return;

  if (id.startsWith('start-')) {
    const idx = parseInt(id.split('-')[1], 10);
    state.selectedIndex = idx;
    startContainer(idx);
  } else if (id.startsWith('stop-')) {
    const idx = parseInt(id.split('-')[1], 10);
    state.selectedIndex = idx;
    stopContainer(idx);
  } else if (id.startsWith('snapshot-')) {
    const idx = parseInt(id.split('-')[1], 10);
    state.selectedIndex = idx;
    snapshotContainer(idx);
  } else if (id.startsWith('restore-')) {
    const idx = parseInt(id.split('-')[1], 10);
    state.selectedIndex = idx;
    restoreBackup();
  } else if (id.startsWith('delete-')) {
    const idx = parseInt(id.split('-')[1], 10);
    state.selectedIndex = idx;
    deleteBackup();
  } else if (id.startsWith('copy-')) {
    const idx = parseInt(id.split('-')[1], 10);
    if (idx < state.backups.length) {
      hecaton.clipboard.write({ text: state.backups[idx].path });
      setMessage('Path copied', 'success');
      rerender();
    }
  }
}

// ============================================================
// Initialization
// ============================================================

async function initialize() {
  if (hecaton.initialState) {
    termCols = hecaton.initialState.cols || 120;
    termRows = hecaton.initialState.rows || 30;
  }

  // Enable SGR mouse with all-motion tracking for hover states.
  process.stdout.write('\x1b[?1000h\x1b[?1003h\x1b[?1006h');

  // Setup stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', handleInput);

  // Setup events
  hecaton.on('window_resized', (params) => {
    termCols = params.cols || termCols;
    termRows = params.rows || termRows;
    rerender();
  });

  hecaton.on('menu_requested', (params) => {
    const zone = getMenuZone(params.row);
    const items = zone ? getMenuItems(zone) : [];
    if (items.length) {
      if (selectMenuTarget(zone)) rerender();
      hecaton.menu.show({ items });
    }
  });

  hecaton.on('menu_activated', (params) => {
    handleMenuAction(params.id);
  });

  process.on('SIGTERM', () => { cleanupTerminal(); process.exit(0); });
  process.on('SIGINT', () => { cleanupTerminal(); process.exit(0); });
  process.stdin.on('end', () => { cleanupTerminal(); process.exit(0); });

  // Initial load
  await refreshContainers();
}

// ============================================================
// Main
// ============================================================

(async () => {
  try {
    await initialize();
  } catch (err) {
    process.stdout.write(`Error: ${err.message}\r\n`);
    process.exit(1);
  }
})();
