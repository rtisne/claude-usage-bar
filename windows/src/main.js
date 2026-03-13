'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  nativeImage,
} = require('electron');
const path = require('path');

const { UsageService, POLLING_OPTIONS } = require('./services/usage-service');
const { CredentialsStore } = require('./services/credentials-store');
const { HistoryService } = require('./services/history-service');
const { NotificationService } = require('./services/notification-service');
const { SettingsStore } = require('./services/settings-store');
const { renderTrayIcon, renderUnauthenticatedIcon } = require('./services/tray-icon');

let tray = null;
let popoverWindow = null;
let settingsWindow = null;
let usageService = null;
let historyService = null;
let notificationService = null;
let settingsStore = null;

function createPopoverWindow() {
  if (popoverWindow && !popoverWindow.isDestroyed()) {
    popoverWindow.show();
    popoverWindow.focus();
    return;
  }

  popoverWindow = new BrowserWindow({
    width: 360,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popoverWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  popoverWindow.on('blur', () => {
    if (popoverWindow && !popoverWindow.isDestroyed()) {
      popoverWindow.hide();
    }
  });

  popoverWindow.on('closed', () => {
    popoverWindow = null;
  });
}

function showPopover() {
  createPopoverWindow();

  if (!tray) return;

  const trayBounds = tray.getBounds();
  const windowBounds = popoverWindow.getBounds();

  // Position window above the tray icon (Windows taskbar is usually at bottom)
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y - windowBounds.height);

  popoverWindow.setPosition(x, Math.max(0, y));
  popoverWindow.show();
  popoverWindow.focus();
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 480,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Claude Usage Bar — Settings',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.removeMenu();

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
}

function updateTrayIcon() {
  if (!tray) return;

  if (!usageService.isAuthenticated) {
    tray.setImage(renderUnauthenticatedIcon());
    tray.setToolTip('Claude Usage Bar — Not signed in');
    return;
  }

  const icon = renderTrayIcon(usageService.pct5h, usageService.pct7d);
  tray.setImage(icon);

  const pct5hStr = Math.round(usageService.pct5h * 100);
  const pct7dStr = Math.round(usageService.pct7d * 100);
  tray.setToolTip(`Claude Usage — 5h: ${pct5hStr}% | 7d: ${pct7dStr}%`);
}

function sendStateToPopover() {
  if (popoverWindow && !popoverWindow.isDestroyed()) {
    popoverWindow.webContents.send('state-update', {
      ...usageService.getState(),
      history: historyService.dataPoints,
      notifications: notificationService.getState(),
      compactMode: settingsStore.get('compactMode') || false,
    });
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('state-update', {
      ...usageService.getState(),
      notifications: notificationService.getState(),
      compactMode: settingsStore.get('compactMode') || false,
    });
  }
}

function setupIPC() {
  ipcMain.handle('get-state', () => ({
    ...usageService.getState(),
    history: historyService.dataPoints,
    notifications: notificationService.getState(),
    pollingOptions: POLLING_OPTIONS,
    compactMode: settingsStore.get('compactMode') || false,
  }));

  ipcMain.handle('start-oauth', () => {
    const url = usageService.startOAuthFlow();
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('submit-code', async (_event, code) => {
    await usageService.submitOAuthCode(code);
    return usageService.getState();
  });

  ipcMain.handle('sign-out', () => {
    usageService.signOut();
    updateTrayIcon();
    return true;
  });

  ipcMain.handle('refresh-usage', async () => {
    await usageService.fetchUsage();
    return usageService.getState();
  });

  ipcMain.handle('update-polling', (_event, minutes) => {
    usageService.updatePollingInterval(minutes);
    return true;
  });

  ipcMain.handle('set-threshold-5h', (_event, value) => {
    notificationService.setThreshold5h(value);
    sendStateToPopover();
    return true;
  });

  ipcMain.handle('set-threshold-7d', (_event, value) => {
    notificationService.setThreshold7d(value);
    sendStateToPopover();
    return true;
  });

  ipcMain.handle('set-threshold-extra', (_event, value) => {
    notificationService.setThresholdExtra(value);
    sendStateToPopover();
    return true;
  });

  ipcMain.handle('open-settings', () => {
    createSettingsWindow();
    return true;
  });

  ipcMain.handle('get-history', (_event, rangeKey) => {
    return historyService.downsampledPoints(rangeKey);
  });

  ipcMain.handle('get-startup-enabled', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-startup-enabled', (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return true;
  });

  ipcMain.handle('get-compact-mode', () => {
    return settingsStore.get('compactMode') || false;
  });

  ipcMain.handle('set-compact-mode', (_event, enabled) => {
    settingsStore.set('compactMode', enabled);
    sendStateToPopover();
    return true;
  });

  ipcMain.handle('quit-app', () => {
    app.quit();
    return true;
  });

  ipcMain.handle('paste-from-clipboard', () => {
    const { clipboard } = require('electron');
    return clipboard.readText();
  });
}

function initialize() {
  settingsStore = new SettingsStore();
  const credentialsStore = new CredentialsStore();
  historyService = new HistoryService();
  notificationService = new NotificationService(settingsStore);

  historyService.loadHistory();

  usageService = new UsageService({
    credentialsStore,
    settingsStore,
    onUpdate: () => {
      updateTrayIcon();
      sendStateToPopover();

      // Record history data point
      if (usageService.usage) {
        historyService.recordDataPoint(usageService.pct5h, usageService.pct7d);
        notificationService.checkAndNotify(
          usageService.pct5h,
          usageService.pct7d,
          usageService.pctExtra
        );
      }
    },
  });

  // Create system tray
  const icon = usageService.isAuthenticated
    ? renderTrayIcon(usageService.pct5h, usageService.pct7d)
    : renderUnauthenticatedIcon();

  tray = new Tray(icon);
  tray.setToolTip('Claude Usage Bar');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: showPopover },
    { label: 'Settings…', click: createSettingsWindow },
    { type: 'separator' },
    {
      label: 'Refresh',
      click: () => usageService.fetchUsage(),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', showPopover);

  setupIPC();

  // Start polling if authenticated
  usageService.startPolling();
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showPopover();
  });

  app.whenReady().then(initialize);
}

app.on('window-all-closed', (e) => {
  // Don't quit when windows are closed — keep running in tray
  e.preventDefault?.();
});

app.on('before-quit', () => {
  if (historyService) {
    historyService.destroy();
  }
  if (usageService) {
    usageService.destroy();
  }
});
