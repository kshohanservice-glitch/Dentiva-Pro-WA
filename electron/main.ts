import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { resolveDataPaths } from './paths';
import { createLogger } from './logger';
import { Core } from './core';
import { SessionManager } from './services/session';
import { registerIpc } from './ipc';
import { sweep } from './services/notifications';
import { runScheduledBackupIfDue } from './services/backup';

let core: Core;
let sess: SessionManager;
let mainWindow: BrowserWindow | null = null;
let lockTimer: NodeJS.Timeout | null = null;
let backupTimer: NodeJS.Timeout | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(onReady);
}

async function onReady(): Promise<void> {
  const paths = resolveDataPaths(app.getPath('userData'));
  const logger = createLogger(paths.logs);
  core = new Core(paths, logger);
  sess = new SessionManager(core);
  sess.onLock = () => {
    mainWindow?.webContents.send('session:locked');
  };
  registerIpc(core, sess, () => {
    mainWindow?.webContents.send('notification:created');
  });

  ipcMain.on('dentiva:activity', () => {
    sess.touch();
  });

  createWindow();

  // startup maintenance (non-blocking, logged)
  setImmediate(async () => {
    try {
      sweep(core);
      await runScheduledBackupIfDue(core);
    } catch (e) {
      core.log.error('startup maintenance failed', { err: String(e) });
    }
  });

  // auto-lock poll (30s)
  lockTimer = setInterval(() => {
    if (sess.checkAutoLock()) {
      mainWindow?.webContents.send('session:locked');
    }
  }, 30000);

  // scheduled backup poll (hourly)
  backupTimer = setInterval(async () => {
    try {
      await runScheduledBackupIfDue(core);
    } catch (e) {
      core.log.error('scheduled backup tick failed', { err: String(e) });
    }
  }, 3600000);

  // crash guard
  process.on('uncaughtException', (err) => {
    core?.log.error('uncaughtException', { err: String(err?.stack ?? err) });
    dialog.showErrorBox(
      'Dentiva Pro — unexpected error',
      'An unexpected error occurred. It has been recorded in the application log. Your data is safe.\n\nYou can safely close this window and restart Dentiva Pro.',
    );
  });
  process.on('unhandledRejection', (reason) => {
    core?.log.error('unhandledRejection', { err: String(reason) });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

function createWindow(): void {
  const iconPath = path.join(__dirname, '..', 'resources', 'icon', 'icon.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 700,
    show: false,
    title: 'Dentiva Pro',
    icon,
    backgroundColor: '#f4f6f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('before-quit', () => {
  try {
    if (lockTimer) clearInterval(lockTimer);
    if (backupTimer) clearInterval(backupTimer);
    core?.close();
  } catch {
    /* shutting down */
  }
});

// minimal menu: standard edit/navigation + open attachment safe
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const menu = Menu.buildFromTemplate([
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
  {
    role: 'help',
    submenu: [{ label: 'About Dentiva Pro', type: 'normal', enabled: false }],
  },
]);
Menu.setApplicationMenu(menu);
