/**
 * Rendering for Docker Containers plugin
 */

const ESC = '\x1b';
const CSI = ESC + '[';

const ansi = {
  reset: CSI + '0m',
  bold: CSI + '1m',
  dim: CSI + '2m',
  hideCursor: CSI + '?25l',
  showCursor: CSI + '?25h',
  fg: (r, g, b) => `${CSI}38;2;${r};${g};${b}m`,
  bg: (r, g, b) => `${CSI}48;2;${r};${g};${b}m`,
  moveTo: (row, col) => `${CSI}${row};${col}H`,
};

const colors = {
  dim: ansi.dim,
  border: ansi.dim,
  title: ansi.fg(80, 170, 255),
  value: CSI + '39m',
  cyan: CSI + '36m',
  green: CSI + '32m',
  red: CSI + '31m',
  yellow: CSI + '33m',
  selectedBg: CSI + '44m',
  hoverBg: ansi.bg(50, 50, 50),
};

const box = {
  h: '\u2500',
  v: '\u2502',
  top: '\u252c',
  cross: '\u253c',
  bottom: '\u2534',
};

const TABLE_MARKER_WIDTH = 2;
const TABLE_SEPARATOR = ` ${box.v} `;

const TABLE_SPECS = {
  containers: [
    { id: 'name', title: 'NAME', min: 12, defaultWidth: 24, max: 80, resizable: true },
    { id: 'image', title: 'IMAGE', min: 12, defaultWidth: 30, max: 80, resizable: true },
    { id: 'status', title: 'STATUS', min: 10, fill: true },
  ],
  backups: [
    { id: 'name', title: 'FILENAME', min: 20, defaultWidth: 60, max: 140, resizable: true },
    { id: 'type', title: 'TYPE', min: 8, defaultWidth: 12, max: 24, resizable: true },
    { id: 'size', title: 'SIZE', min: 8, fill: true },
  ],
};

function isContainerRunning(container) {
  return /^up\b/i.test(String(container && container.status || ''));
}

function containerStatusDot(container, suffix = '') {
  const status = String(container && container.status || '');
  if (/^up\b/i.test(status)) return colors.green + '\u25cf' + ansi.reset + suffix + ' ';
  if (/^(exited|created|dead)\b/i.test(status)) return colors.border + '\u25cf' + ansi.reset + suffix + ' ';
  return colors.yellow + '\u25cf' + ansi.reset + suffix + ' ';
}

function selectedContainer(state) {
  if (state.selectedTab !== 'containers') return null;
  return state.containers && state.containers[state.selectedIndex] || null;
}

function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function visibleLength(str) {
  return stripAnsi(str).length;
}

function padRight(str, width) {
  const value = String(str || '');
  return value + ' '.repeat(Math.max(0, width - value.length));
}

function padStyled(str, width) {
  const value = String(str || '');
  return value + ' '.repeat(Math.max(0, width - visibleLength(value)));
}

function truncate(str, maxLen) {
  if (!str || maxLen <= 0) return '';
  const value = String(str);
  return value.length > maxLen ? value.slice(0, Math.max(0, maxLen - 1)) + '.' : value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTableSpecs(tab) {
  return TABLE_SPECS[tab] || TABLE_SPECS.containers;
}

function getRequestedColumnWidth(state, tab, spec) {
  if (spec.fill) return spec.min;
  const stored = state.tableWidths && state.tableWidths[tab] && state.tableWidths[tab][spec.id];
  const value = Number.isFinite(stored) ? stored : spec.defaultWidth;
  return clamp(Math.round(value), spec.min, spec.max || value);
}

function getTableLayout(state, tab, termCols) {
  const specs = getTableSpecs(tab);
  const separatorTotal = TABLE_SEPARATOR.length * Math.max(0, specs.length - 1);
  const available = Math.max(1, termCols - TABLE_MARKER_WIDTH - separatorTotal);
  const columns = specs.map(spec => ({
    ...spec,
    width: getRequestedColumnWidth(state, tab, spec),
  }));

  let total = columns.reduce((sum, column) => sum + column.width, 0);
  if (total > available) {
    let over = total - available;
    const shrinkable = columns.filter(column => column.resizable);
    while (over > 0) {
      let changed = false;
      for (const column of shrinkable) {
        const room = column.width - column.min;
        if (room <= 0) continue;
        const step = Math.min(room, over);
        column.width -= step;
        over -= step;
        changed = true;
        if (over <= 0) break;
      }
      if (!changed) break;
    }
    total = columns.reduce((sum, column) => sum + column.width, 0);
  }

  if (total < available) {
    const fillColumn = columns.find(column => column.fill) || columns[columns.length - 1];
    fillColumn.width += available - total;
  } else if (total > available) {
    let over = total - available;
    for (const column of columns.slice().reverse()) {
      const room = Math.max(0, column.width - 1);
      if (room <= 0) continue;
      const step = Math.min(room, over);
      column.width -= step;
      over -= step;
      if (over <= 0) break;
    }
  }

  let col = TABLE_MARKER_WIDTH + 1;
  columns.forEach((column, idx) => {
    column.start = col;
    column.end = col + column.width - 1;
    if (idx < columns.length - 1) {
      column.separatorStart = column.end + 1;
      column.resizerCol = column.end + 2;
      column.separatorEnd = column.end + TABLE_SEPARATOR.length;
      col = column.separatorEnd + 1;
    }
  });

  return { tab, columns };
}

function clampColumnWidth(state, tab, columnId, width, termCols) {
  const specs = getTableSpecs(tab);
  const target = specs.find(spec => spec.id === columnId);
  if (!target || !target.resizable) return width;

  const separatorTotal = TABLE_SEPARATOR.length * Math.max(0, specs.length - 1);
  const available = Math.max(1, termCols - TABLE_MARKER_WIDTH - separatorTotal);
  const otherWidth = specs
    .filter(spec => spec.id !== columnId)
    .reduce((sum, spec) => sum + getRequestedColumnWidth(state, tab, spec), 0);
  const maxBySpace = Math.max(target.min, available - otherWidth);
  const max = Math.min(target.max || maxBySpace, maxBySpace);
  return clamp(Math.round(width), target.min, max);
}

function formatCell(value, width, align = 'left') {
  const text = truncate(value, width);
  const padding = ' '.repeat(Math.max(0, width - visibleLength(text)));
  return align === 'right' ? padding + text : text + padding;
}

function buildTableLine(table, values, marker) {
  let line = formatCell(marker || '', TABLE_MARKER_WIDTH);
  table.columns.forEach((column, idx) => {
    const align = column.id === 'size' ? 'right' : 'left';
    line += formatCell(values[idx], column.width, align);
    if (idx < table.columns.length - 1) line += TABLE_SEPARATOR;
  });
  return line;
}

function buildStyledTableLine(table, cells, marker) {
  let line = formatCell(marker || '', TABLE_MARKER_WIDTH);
  table.columns.forEach((column, idx) => {
    const cell = cells[idx] || {};
    const align = column.id === 'size' ? 'right' : 'left';
    line += formatCell(cell.text || '', column.width, align);
    if (cell.prefix) {
      const prefix = String(cell.prefix);
      const cellStart = line.length - column.width;
      line = line.slice(0, cellStart) + prefix + line.slice(cellStart + visibleLength(prefix));
    }
    if (idx < table.columns.length - 1) line += TABLE_SEPARATOR;
  });
  return line;
}

function buildTableBorder(table, junction) {
  let line = box.h.repeat(TABLE_MARKER_WIDTH);
  table.columns.forEach((column, idx) => {
    line += box.h.repeat(column.width);
    if (idx < table.columns.length - 1) line += box.h + junction + box.h;
  });
  return line;
}

function getLayout(termRows) {
  const hintRow = Math.max(1, termRows);
  const buttonRow = Math.max(1, hintRow - 1);
  const bottomSeparatorRow = Math.max(1, buttonRow - 1);
  const contentStartRow = 5;
  const contentEndRow = Math.max(contentStartRow - 1, bottomSeparatorRow - 1);

  return {
    contentStartRow,
    contentEndRow,
    buttonRow,
    hintRow,
    bottomSeparatorRow,
  };
}

function getTabZones() {
  const tabs = [
    { id: 'tab-containers', tab: 'containers', label: ' Containers ' },
    { id: 'tab-backups', tab: 'backups', label: ' Backups ' },
  ];
  let col = 1;
  return tabs.map((tab, idx) => {
    const zone = {
      ...tab,
      colStart: col,
      colEnd: col + tab.label.length - 1,
    };
    col = zone.colEnd + (idx === 0 ? 3 : 1);
    return zone;
  });
}

function getActionButtons(selectedTab) {
  if (selectedTab === 'containers') {
    return [
      { id: 'start-container', label: '[Start]', hint: 'Start the selected container', requiresStopped: true },
      { id: 'stop-container', label: '[Stop]', hint: 'Stop the selected container', requiresRunning: true },
      { id: 'snapshot', label: '[Snapshot]', hint: 'Snapshot all Docker volumes mounted by the selected container' },
      { id: 'refresh-containers', label: '[Refresh]', hint: 'Refresh container list' },
    ];
  }

  return [
    { id: 'restore', label: '[Restore]', hint: 'Restore selected backup to a matching container' },
    { id: 'delete', label: '[Delete]', hint: 'Delete selected backup file' },
    { id: 'refresh-backups', label: '[Refresh]', hint: 'Refresh backup list' },
  ];
}

function isActionEnabled(action, state) {
  if (!action || state.isLoading) return false;
  if (action.requiresRunning || action.requiresStopped) {
    const container = selectedContainer(state);
    if (!container) return false;
    const running = isContainerRunning(container);
    if (action.requiresRunning) return running;
    if (action.requiresStopped) return !running;
  }
  return true;
}

function getButtonZones(selectedTab) {
  const buttons = getActionButtons(selectedTab);
  let col = 1;
  return buttons.map((button, idx) => {
    const zone = {
      ...button,
      colStart: col,
      colEnd: col + button.label.length - 1,
    };
    col = zone.colEnd + (idx === buttons.length - 1 ? 1 : 3);
    return zone;
  });
}

function getActionAt(x, y, state, termRows) {
  if (y === 1) {
    return getTabZones().find(zone => x >= zone.colStart && x <= zone.colEnd) || null;
  }

  const layout = getLayout(termRows);
  if (y === layout.buttonRow) {
    const zone = getButtonZones(state.selectedTab).find(item => x >= item.colStart && x <= item.colEnd) || null;
    return isActionEnabled(zone, state) ? zone : null;
  }

  return null;
}

function getColumnResizeAt(x, y, state, termCols) {
  if (y !== 3 && y !== 4) return null;
  const table = getTableLayout(state, state.selectedTab, termCols);
  const column = table.columns.find(item =>
    item.resizable && item.resizerCol && Math.abs(x - item.resizerCol) <= 1
  );
  if (!column) return null;
  return {
    tab: table.tab,
    columnId: column.id,
    title: column.title,
    width: column.width,
    col: column.resizerCol,
  };
}

function styleClickable(label, isHovered, isSelected = false, isEnabled = true) {
  if (!isEnabled) {
    return colors.border + label + ansi.reset;
  }
  if (isHovered) {
    return colors.hoverBg + colors.value + ansi.bold + label + ansi.reset;
  }
  if (isSelected) {
    return colors.title + ansi.bold + label + ansi.reset;
  }
  return colors.dim + label + ansi.reset;
}

function renderLine(buf, row, termCols, content) {
  buf.push(ansi.moveTo(row, 1) + padStyled(content, termCols));
}

function buildHintText(state) {
  if (state.isLoading) {
    const frames = ['-', '\\', '|', '/'];
    const progress = state.progress || {};
    const elapsed = progress.startedAt ? Math.floor((Date.now() - progress.startedAt) / 1000) : 0;
    const frame = frames[(progress.frame || 0) % frames.length];
    const label = progress.label || 'Working';
    const detail = progress.detail ? ` - ${progress.detail}` : '';
    return colors.yellow + `${frame} ${label}${detail} (${elapsed}s)` + ansi.reset;
  }

  if (state.message) {
    let color = colors.cyan;
    if (state.messageType === 'success') color = colors.green;
    if (state.messageType === 'error') color = colors.red;
    return color + state.message + ansi.reset;
  }

  const hoveredAction = getActionButtons(state.selectedTab).find(btn => btn.id === state.hoveredButton);
  if (hoveredAction) {
    return colors.yellow + hoveredAction.hint + ansi.reset;
  }

  if (state.columnDrag) {
    return colors.yellow + `Drag to resize ${state.columnDrag.title} column` + ansi.reset;
  }
  if (state.hoveredResize) {
    return colors.yellow + `Drag ${state.hoveredResize.title} column edge to resize` + ansi.reset;
  }

  if (state.hoveredButton === 'tab-containers') {
    return colors.yellow + 'Show running containers' + ansi.reset;
  }
  if (state.hoveredButton === 'tab-backups') {
    return colors.yellow + 'Show saved backups' + ansi.reset;
  }

  if (state.selectedTab === 'containers') {
    return colors.dim + '[u] start  [x] stop  [s] snapshot  [Tab] backups  [q] quit' + ansi.reset;
  }

  return colors.dim + '[r] restore  [d] delete  [Tab] containers  [drag header edge] resize  [q] quit' + ansi.reset;
}

function renderTabs(buf, state, termCols) {
  let line = '';
  for (const zone of getTabZones()) {
    const hovered = state.hoveredButton === zone.id;
    const selected = state.selectedTab === zone.tab;
    line += styleClickable(zone.label, hovered, selected);
    if (zone.id === 'tab-containers') line += '  ';
  }
  renderLine(buf, 1, termCols, line);
}

function renderContent(buf, state, termCols, layout) {
  const itemRows = Math.max(0, layout.contentEndRow - layout.contentStartRow + 1);
  const items = state.selectedTab === 'containers' ? state.containers : state.backups;
  const table = getTableLayout(state, state.selectedTab, termCols);

  if (state.selectedTab === 'containers') {
    renderLine(buf, 3, termCols, colors.dim + buildTableLine(table, ['NAME', 'IMAGE', 'STATUS'], '  ') + ansi.reset);
  } else {
    renderLine(buf, 3, termCols, colors.dim + buildTableLine(table, ['FILENAME', 'TYPE', 'SIZE'], '  ') + ansi.reset);
  }
  renderLine(buf, 4, termCols, colors.border + buildTableBorder(table, box.cross) + ansi.reset);

  if (items.length === 0) {
    const emptyMessage = state.selectedTab === 'containers' ? 'No containers running' : 'No backups available';
    for (let idx = 0; idx < itemRows; idx++) {
      const row = layout.contentStartRow + idx;
      const values = idx === 0 ? [emptyMessage, '', ''] : ['', '', ''];
      renderLine(buf, row, termCols, colors.dim + buildTableLine(table, values, '  ') + ansi.reset);
    }
    return;
  }

  const visibleItems = items.slice(0, itemRows);
  visibleItems.forEach((item, idx) => {
    const row = layout.contentStartRow + idx;
    const isSelected = idx === state.selectedIndex;
    let values;

    if (state.selectedTab === 'containers') {
      const nameText = `  ${item.name}`;
      line = buildStyledTableLine(table, [
        { text: nameText, prefix: containerStatusDot(item, isSelected ? colors.selectedBg + ansi.bold : '') },
        { text: item.image },
        { text: item.status },
      ], isSelected ? '> ' : '  ');
    } else {
      values = [item.name, item.type, item.size || ''];
      line = buildTableLine(table, values, isSelected ? '> ' : '  ');
    }

    if (visibleLength(line) > termCols) {
      line = truncate(stripAnsi(line), termCols);
    }
    if (isSelected) {
      renderLine(buf, row, termCols, colors.selectedBg + ansi.bold + padRight(line, termCols) + ansi.reset);
    } else {
      renderLine(buf, row, termCols, line);
    }
  });

  for (let idx = visibleItems.length; idx < itemRows; idx++) {
    const row = layout.contentStartRow + idx;
    renderLine(buf, row, termCols, colors.border + buildTableLine(table, ['', '', ''], '  ') + ansi.reset);
  }
}

function renderButtons(buf, state, termCols, layout) {
  let line = '';
  const buttons = getActionButtons(state.selectedTab);
  buttons.forEach((button, idx) => {
    if (idx > 0) line += '  ';
    const enabled = isActionEnabled(button, state);
    line += styleClickable(button.label, state.hoveredButton === button.id && enabled, false, enabled);
  });
  renderLine(buf, layout.buttonRow, termCols, line);
}

function render(state, termCols, termRows) {
  const buf = [];
  const layout = getLayout(termRows);
  const table = getTableLayout(state, state.selectedTab, termCols);

  buf.push(ansi.hideCursor + CSI + '2J' + CSI + 'H');
  renderTabs(buf, state, termCols);
  renderLine(buf, 2, termCols, colors.border + buildTableBorder(table, box.top) + ansi.reset);
  renderContent(buf, state, termCols, layout);
  renderLine(buf, layout.bottomSeparatorRow, termCols, colors.border + buildTableBorder(table, box.bottom) + ansi.reset);
  renderButtons(buf, state, termCols, layout);
  renderLine(buf, layout.hintRow, termCols, buildHintText(state));
  buf.push(ansi.showCursor);

  return buf.join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    render,
    getActionAt,
    getColumnResizeAt,
    getLayout,
    getTableLayout,
    clampColumnWidth,
    isContainerRunning,
    getButtonZones,
    getTabZones,
  };
}
