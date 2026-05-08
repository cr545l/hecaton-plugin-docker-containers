/**
 * Docker Manager - wraps Docker CLI commands using only Hecaton host APIs.
 */

class DockerManager {
  constructor() {
    this.backupDirName = '.docker-backups';
  }

  async exec(args, timeoutMs = 60000) {
    try {
      return await hecaton.process.exec({
        program: 'docker',
        args: typeof args === 'string' ? args.split(/\s+/) : args,
        timeout_ms: timeoutMs,
      });
    } catch {
      return null;
    }
  }

  async listContainers() {
    const result = await this.exec([
      'ps',
      '-a',
      '--format',
      '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}',
    ]);
    if (!result || !result.ok || !result.stdout) return [];

    return result.stdout.trim().split('\n')
      .filter(line => line.trim())
      .map((line, idx) => {
        const parts = line.split('\t');
        return {
          id: idx,
          containerId: parts[0] || '',
          name: parts[1] || '',
          image: parts[2] || '',
          status: parts[3] || '',
          ports: parts[4] || '-',
        };
      });
  }

  async startContainer(containerName, onProgress) {
    try {
      this._progress(onProgress, 'Starting container');
      const result = await this.exec(['start', containerName], 60000);
      if (!result || !result.ok) {
        return { success: false, error: this._formatExecError('Failed to start container', result) };
      }

      const status = await this.getContainerStatus(containerName);
      return { success: true, status };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async stopContainer(containerName, onProgress) {
    try {
      this._progress(onProgress, 'Stopping container');
      const result = await this.exec(['stop', containerName], 60000);
      if (!result || !result.ok) {
        return { success: false, error: this._formatExecError('Failed to stop container', result) };
      }

      const status = await this.getContainerStatus(containerName);
      return { success: true, status };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async backupContainerVolumes(containerName, onProgress) {
    const timestamp = this._getTimestamp();
    const backupName = `volume_${containerName}_${timestamp}.tar`;
    let shouldRestart = false;

    try {
      this._progress(onProgress, 'Preparing backup directory');
      await this._ensureBackupDir();
      const backupPath = await this._getBackupPath(backupName);
      const backupDir = await this._getBackupDirPath();
      this._progress(onProgress, 'Inspecting mounted volumes');
      const mounts = await this._getSnapshotMounts(containerName);
      if (!mounts.length) {
        return { success: false, error: 'No Docker volumes or bind mounts found to snapshot' };
      }
      this._progress(onProgress, `Found ${mounts.length} mount(s)`);

      const wasRunning = await this.getContainerStatus(containerName) === 'running';
      if (wasRunning) {
        this._progress(onProgress, 'Stopping container for a consistent snapshot');
        const stopResult = await this.exec(['stop', containerName], 60000);
        if (!stopResult || !stopResult.ok) {
          return { success: false, error: 'Failed to stop container for consistent snapshot' };
        }
        shouldRestart = true;
      }

      const tarArgs = [
        '--volumes-from',
        `${containerName}:ro`,
        '-v',
        `${backupDir}:/backup`,
        'alpine:3.20',
        'tar',
        '-cpf',
        `/backup/${backupName}`,
      ];
      for (const mount of mounts) {
        tarArgs.push('-C', '/', this._relativeMountPath(mount.destination));
      }

      const snapshotResult = await this._runLongContainer(tarArgs, 'Writing snapshot tar', onProgress);

      if (shouldRestart) {
        this._progress(onProgress, 'Starting container');
        await this.exec(['start', containerName], 60000);
        shouldRestart = false;
      }

      if (!snapshotResult || !snapshotResult.ok) {
        return { success: false, error: this._formatExecError('Volume snapshot failed', snapshotResult) };
      }

      this._progress(onProgress, 'Verifying snapshot file');
      const validResult = await this._validateVolumeSnapshotFile(backupPath);
      if (!validResult.success) return validResult;

      return { success: true, file: backupPath, size: validResult.size };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      if (shouldRestart) {
        await this.exec(['start', containerName], 60000);
      }
    }
  }

  async restoreContainerVolumes(containerName, backupFile, onProgress) {
    let shouldRestart = false;

    try {
      this._progress(onProgress, 'Checking snapshot file');
      const validResult = await this._validateVolumeSnapshotFile(backupFile);
      if (!validResult.success) return validResult;

      const pathParts = this._splitPath(backupFile);
      if (!pathParts) return { success: false, error: 'Invalid backup file path' };

      this._progress(onProgress, 'Inspecting mounted volumes');
      const mounts = await this._getSnapshotMounts(containerName);
      if (!mounts.length) {
        return { success: false, error: 'No Docker volumes or bind mounts found to restore' };
      }

      const wasRunning = await this.getContainerStatus(containerName) === 'running';
      if (wasRunning) {
        this._progress(onProgress, 'Stopping container for restore');
        const stopResult = await this.exec(['stop', containerName], 60000);
        if (!stopResult || !stopResult.ok) {
          return { success: false, error: 'Failed to stop container for restore' };
        }
        shouldRestart = true;
      }

      const clearCommands = mounts.map(mount =>
        `if [ -d ${this._shQuote(mount.destination)} ]; then find ${this._shQuote(mount.destination)} -mindepth 1 -maxdepth 1 -exec rm -rf {} \\; ; fi`
      );
      const script = [
        'set -e',
        ...clearCommands,
        'tar -xpf "/backup/$0" -C /',
      ].join('\n');

      const restoreResult = await this._runLongContainer([
        '--volumes-from',
        containerName,
        '-v',
        `${pathParts.dir}:/backup:ro`,
        'alpine:3.20',
        'sh',
        '-c',
        script,
        pathParts.name,
      ], 'Restoring snapshot tar', onProgress);

      if (shouldRestart) {
        this._progress(onProgress, 'Starting container');
        await this.exec(['start', containerName], 60000);
        shouldRestart = false;
      }

      if (!restoreResult || !restoreResult.ok) {
        return { success: false, error: this._formatExecError('Volume restore failed', restoreResult) };
      }

      return { success: true, message: `Restored from ${backupFile}` };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      if (shouldRestart) {
        await this.exec(['start', containerName], 60000);
      }
    }
  }

  async listBackups() {
    try {
      const backupDir = await this._getBackupDirPath();
      const result = await hecaton.fs.read_dir({ path: backupDir });
      if (!result || !result.ok || !result.entries) return [];

      const backups = [];
      for (const file of result.entries) {
        if (!file.name.endsWith('.tar')) continue;

        const path = this._joinPath(backupDir, file.name);
        const valid = await this._validateVolumeSnapshotFile(path, false);
        if (!valid.success) continue;

        const containerName = this._parseSnapshotContainerName(file.name);
        const sizeBytes = file.size_bytes || file.size || 0;
        const mtimeMs = file.mtime_ms || file.mtime || 0;
        backups.push({
          id: backups.length,
          name: file.name,
          type: 'Volume',
          size: `${(sizeBytes / 1024).toFixed(2)}KB`,
          timestamp: mtimeMs ? new Date(mtimeMs).toLocaleString() : '',
          path,
          containerName,
        });
      }

      return backups.sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  async deleteBackup(filePath) {
    try {
      const result = await hecaton.fs.delete({ path: filePath });
      if (!result || !result.ok) {
        return { success: false, error: 'Failed to delete file' };
      }
      return { success: true, message: `Deleted ${filePath}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getContainerStatus(containerName) {
    try {
      const result = await this.exec(['inspect', containerName, '--format={{.State.Status}}'], 10000);
      if (result && result.ok) return result.stdout.trim();
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  _getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${mins}${secs}`;
  }

  async _getBackupDirPath() {
    const homeResult = await hecaton.env.get_home();
    const home = homeResult?.path || '/root';
    return this._joinPath(home, this.backupDirName);
  }

  async _ensureBackupDir() {
    const dirPath = await this._getBackupDirPath();
    const exists = await hecaton.fs.exists({ path: dirPath }).catch(() => null);
    if (exists && exists.ok && exists.exists) return;

    const result = await hecaton.fs.mkdir({ path: dirPath, recursive: true });
    if (result && result.ok === false) {
      throw new Error(result.error || `Failed to create ${dirPath}`);
    }
  }

  async _getBackupPath(fileName) {
    const dirPath = await this._getBackupDirPath();
    return this._joinPath(dirPath, fileName);
  }

  async _getSnapshotMounts(containerName) {
    const result = await hecaton.process.exec({
      program: 'docker',
      args: ['inspect', containerName, '--format={{json .Mounts}}'],
      timeout_ms: 10000,
    }).catch(() => null);
    if (!result || !result.ok || !result.stdout) return [];

    let mounts;
    try {
      mounts = JSON.parse(result.stdout.trim());
    } catch {
      return [];
    }

    return mounts
      .filter(mount => (mount.Type === 'volume' || mount.Type === 'bind') && this._isSafeMountDestination(mount.Destination))
      .map(mount => ({
        type: mount.Type,
        name: mount.Name || '',
        source: mount.Source || '',
        destination: mount.Destination,
      }));
  }

  async _validateVolumeSnapshotFile(filePath, checkTar = false) {
    const stat = await hecaton.fs.stat({ path: filePath }).catch(() => null);
    if (!stat || !stat.ok || !stat.exists) {
      return { success: false, error: 'Volume snapshot file not found' };
    }

    const size = stat.size_bytes || stat.size || 0;
    if (size <= 0) {
      return {
        success: false,
        error: 'Invalid volume snapshot: file is empty. This file was not restored.',
      };
    }

    if (!checkTar) return { success: true, size };

    const pathParts = this._splitPath(filePath);
    if (!pathParts) return { success: false, error: 'Invalid snapshot file path' };

    const result = await hecaton.process.exec({
      program: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        `${pathParts.dir}:/backup:ro`,
        'alpine:3.20',
        'sh',
        '-c',
        'tar -tf "/backup/$0" >/dev/null',
        pathParts.name,
      ],
      timeout_ms: 60000,
    }).catch(() => null);
    if (!result || !result.ok) {
      return { success: false, error: this._formatExecError('Invalid volume snapshot tar', result) };
    }

    return { success: true, size };
  }

  async _runLongContainer(runArgs, label, onProgress) {
    const name = `hecaton-task-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    this._progress(onProgress, `${label}: starting`);

    const startResult = await hecaton.process.exec({
      program: 'docker',
      args: ['run', '-d', '--name', name, ...runArgs],
      timeout_ms: 60000,
    }).catch(() => null);
    if (!startResult || !startResult.ok) {
      return startResult || { ok: false, error: 'Failed to start helper container' };
    }

    try {
      const startedAt = Date.now();
      while (true) {
        await this._sleep(1000);
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        this._progress(onProgress, `${label}: running ${elapsed}s`);

        const inspect = await this.exec([
          'inspect',
          name,
          '--format={{.State.Running}}\t{{.State.ExitCode}}',
        ], 10000);
        if (!inspect || !inspect.ok || !inspect.stdout) {
          return { ok: false, error: 'Failed to inspect helper container' };
        }

        const parts = inspect.stdout.trim().split('\t');
        if (parts[0] === 'true') continue;

        const exitCode = Number(parts[1]);
        if (exitCode === 0) return { ok: true, exit_code: 0 };

        const logs = await this.exec(['logs', '--tail', '50', name], 10000);
        return {
          ok: false,
          exit_code: exitCode,
          stderr: logs ? String(logs.stderr || logs.stdout || '').trim() : '',
        };
      }
    } finally {
      await this.exec(['rm', '-f', name], 10000);
    }
  }

  _formatExecError(prefix, result) {
    const detail = result && String(result.stderr || result.stdout || result.error || '').trim();
    return detail ? `${prefix}: ${detail}` : prefix;
  }

  _progress(onProgress, detail) {
    if (typeof onProgress === 'function') onProgress(detail);
  }

  _isSafeMountDestination(destination) {
    const value = String(destination || '');
    return value.startsWith('/') && value !== '/' && !value.includes('\0');
  }

  _relativeMountPath(destination) {
    return String(destination || '').replace(/^\/+/, '');
  }

  _parseSnapshotContainerName(fileName) {
    const match = String(fileName || '').match(/^volume_(.+)_\d{8}_\d{6}\.tar$/);
    return match ? match[1] : '';
  }

  _shQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _joinPath(dirPath, fileName) {
    const sep = dirPath.includes('\\') ? '\\' : '/';
    return dirPath.endsWith('/') || dirPath.endsWith('\\')
      ? `${dirPath}${fileName}`
      : `${dirPath}${sep}${fileName}`;
  }

  _splitPath(filePath) {
    const normalized = String(filePath || '');
    const slash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (slash <= 0 || slash === normalized.length - 1) return null;
    return {
      dir: normalized.slice(0, slash),
      name: normalized.slice(slash + 1),
    };
  }
}

module.exports = DockerManager;
