'use strict';

// Electron is only available when running inside the Electron main process.
let Notification;
try {
  Notification = require('electron').Notification;
} catch {
  Notification = null;
}

/**
 * Pure logic: returns which threshold alerts should fire given a state transition.
 */
function crossedThresholds({
  threshold5h,
  threshold7d,
  thresholdExtra,
  previous5h,
  previous7d,
  previousExtra,
  current5h,
  current7d,
  currentExtra,
}) {
  const alerts = [];

  if (threshold5h > 0) {
    if (current5h >= threshold5h && previous5h < threshold5h) {
      alerts.push({ window: '5-hour', pct: Math.round(current5h) });
    }
  }

  if (threshold7d > 0) {
    if (current7d >= threshold7d && previous7d < threshold7d) {
      alerts.push({ window: '7-day', pct: Math.round(current7d) });
    }
  }

  if (thresholdExtra > 0) {
    if (currentExtra >= thresholdExtra && previousExtra < thresholdExtra) {
      alerts.push({ window: 'Extra usage', pct: Math.round(currentExtra) });
    }
  }

  return alerts;
}

class NotificationService {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
    this.threshold5h = this._load('notificationThreshold5h');
    this.threshold7d = this._load('notificationThreshold7d');
    this.thresholdExtra = this._load('notificationThresholdExtra');
    this.previousPct5h = null;
    this.previousPct7d = null;
    this.previousPctExtra = null;
  }

  setThreshold5h(value) {
    this.threshold5h = this._clamp(value);
    this.settingsStore.set('notificationThreshold5h', this.threshold5h);
    this.previousPct5h = null;
  }

  setThreshold7d(value) {
    this.threshold7d = this._clamp(value);
    this.settingsStore.set('notificationThreshold7d', this.threshold7d);
    this.previousPct7d = null;
  }

  setThresholdExtra(value) {
    this.thresholdExtra = this._clamp(value);
    this.settingsStore.set('notificationThresholdExtra', this.thresholdExtra);
    this.previousPctExtra = null;
  }

  checkAndNotify(pct5h, pct7d, pctExtra) {
    const current5h = pct5h * 100;
    const current7d = pct7d * 100;
    const currentExtra = pctExtra * 100;

    const prev5h = this.previousPct5h ?? 0;
    const prev7d = this.previousPct7d ?? 0;
    const prevExtra = this.previousPctExtra ?? 0;

    this.previousPct5h = current5h;
    this.previousPct7d = current7d;
    this.previousPctExtra = currentExtra;

    const alerts = crossedThresholds({
      threshold5h: this.threshold5h,
      threshold7d: this.threshold7d,
      thresholdExtra: this.thresholdExtra,
      previous5h: prev5h,
      previous7d: prev7d,
      previousExtra: prevExtra,
      current5h: current5h,
      current7d: current7d,
      currentExtra: currentExtra,
    });

    for (const alert of alerts) {
      this._sendNotification(alert.window, alert.pct);
    }
  }

  _sendNotification(windowName, pct) {
    if (!Notification || !Notification.isSupported()) {
      console.log(
        `[Notification] ${windowName} usage has reached ${pct}% (notifications not supported)`
      );
      return;
    }

    const notification = new Notification({
      title: 'Claude Usage',
      body: `${windowName} usage has reached ${pct}%`,
    });
    notification.show();
  }

  getState() {
    return {
      threshold5h: this.threshold5h,
      threshold7d: this.threshold7d,
      thresholdExtra: this.thresholdExtra,
    };
  }

  _clamp(value) {
    return Math.max(0, Math.min(100, value));
  }

  _load(key) {
    const value = this.settingsStore.get(key);
    if (value == null) return 0;
    return Math.max(0, Math.min(100, value));
  }
}

module.exports = { NotificationService, crossedThresholds };
