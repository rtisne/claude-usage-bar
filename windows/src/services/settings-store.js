'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_FILE = path.join(
  os.homedir(),
  '.config',
  'claude-usage-bar',
  'settings.json'
);

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath || SETTINGS_FILE;
    this.data = {};
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  get(key) {
    return this.data[key] ?? null;
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch {
      // ignore
    }
  }
}

module.exports = { SettingsStore };
