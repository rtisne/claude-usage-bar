'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  startOAuth: () => ipcRenderer.invoke('start-oauth'),
  submitCode: (code) => ipcRenderer.invoke('submit-code', code),
  signOut: () => ipcRenderer.invoke('sign-out'),
  refreshUsage: () => ipcRenderer.invoke('refresh-usage'),
  updatePolling: (minutes) => ipcRenderer.invoke('update-polling', minutes),
  setThreshold5h: (value) => ipcRenderer.invoke('set-threshold-5h', value),
  setThreshold7d: (value) => ipcRenderer.invoke('set-threshold-7d', value),
  setThresholdExtra: (value) => ipcRenderer.invoke('set-threshold-extra', value),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getHistory: (rangeKey) => ipcRenderer.invoke('get-history', rangeKey),
  getStartupEnabled: () => ipcRenderer.invoke('get-startup-enabled'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('set-startup-enabled', enabled),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  pasteFromClipboard: () => ipcRenderer.invoke('paste-from-clipboard'),
  onStateUpdate: (callback) => {
    ipcRenderer.on('state-update', (_event, data) => callback(data));
  },
});
