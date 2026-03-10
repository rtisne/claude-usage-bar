'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { CredentialsStore } = require('./credentials-store');

describe('CredentialsStore', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cub-creds-'));
    store = new CredentialsStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no credentials exist', () => {
    assert.equal(store.load(), null);
  });

  it('saves and loads credentials', () => {
    const creds = {
      accessToken: 'test-token',
      refreshToken: 'refresh-token',
      expiresAt: '2025-12-31T00:00:00.000Z',
      scopes: ['user:profile'],
    };
    store.save(creds);
    const loaded = store.load();
    assert.deepEqual(loaded, creds);
  });

  it('deletes credentials', () => {
    store.save({ accessToken: 'test', refreshToken: null, expiresAt: null, scopes: [] });
    store.delete();
    assert.equal(store.load(), null);
  });

  it('loads legacy token file', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'token'), 'legacy-token\n');
    const loaded = store.load();
    assert.equal(loaded.accessToken, 'legacy-token');
    assert.equal(loaded.refreshToken, null);
  });

  it('removes legacy token after saving new credentials', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'token'), 'old-token');
    store.save({ accessToken: 'new-token', refreshToken: null, expiresAt: null, scopes: [] });
    assert.ok(!fs.existsSync(path.join(tmpDir, 'token')));
    const loaded = store.load();
    assert.equal(loaded.accessToken, 'new-token');
  });
});
