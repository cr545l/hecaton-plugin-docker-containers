/**
 * Context menu handling
 */

async function showContainerContextMenu(container) {
  const items = [
    { id: 'backup-postgres', label: '💾 Backup PostgreSQL' },
    { id: 'backup-redis', label: '💾 Backup Redis' },
    { id: 'inspect', label: '🔍 Inspect' },
    { id: 'logs', label: '📋 View Logs' },
  ];

  try {
    const result = await hecaton.menu.show({ items });
    return result;
  } catch (e) {
    return null;
  }
}

async function showBackupContextMenu(backup) {
  const items = [
    { id: 'restore', label: '🔄 Restore' },
    { id: 'delete', label: '🗑️ Delete' },
    { id: 'copy-path', label: '📋 Copy Path' },
    { id: 'open-folder', label: '📂 Open Folder' },
  ];

  try {
    const result = await hecaton.menu.show({ items });
    return result;
  } catch (e) {
    return null;
  }
}

async function handleContainerMenuAction(action, container) {
  switch (action) {
    case 'backup-postgres':
      return { type: 'backup', dbType: 'PostgreSQL', container };
    case 'backup-redis':
      return { type: 'backup', dbType: 'Redis', container };
    case 'inspect':
      return { type: 'inspect', container };
    case 'logs':
      return { type: 'logs', container };
    default:
      return null;
  }
}

async function handleBackupMenuAction(action, backup) {
  switch (action) {
    case 'restore':
      return { type: 'restore', backup };
    case 'delete':
      return { type: 'delete', backup };
    case 'copy-path':
      try {
        await hecaton.clipboard.write({ data: backup.path });
        return { type: 'message', text: 'Path copied to clipboard' };
      } catch (e) {
        return { type: 'message', text: 'Failed to copy' };
      }
    case 'open-folder':
      try {
        const dir = backup.path.substring(0, backup.path.lastIndexOf('/'));
        await hecaton.fs.reveal({ path: dir });
        return null;
      } catch (e) {
        return null;
      }
    default:
      return null;
  }
}

module.exports = {
  showContainerContextMenu,
  showBackupContextMenu,
  handleContainerMenuAction,
  handleBackupMenuAction,
};
