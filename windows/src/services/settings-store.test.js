'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { SettingsStore } = require('./settings-store');

describe('SettingsStore', () => {
  let tmpDir;
  let filePath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cub-settings-'));
    filePath = path.join(tmpDir, 'settings.json');
    store = new SettingsStore(filePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for unknown keys', () => {
    assert.equal(store.get('nonexistent'), null);
  });

  it('stores and retrieves values', () => {
    store.set('pollingMinutes', 30);
    assert.equal(store.get('pollingMinutes'), 30);
  });

  it('persists values to disk', () => {
    store.set('test', 'hello');
    const store2 = new SettingsStore(filePath);
    assert.equal(store2.get('test'), 'hello');
  });
});
