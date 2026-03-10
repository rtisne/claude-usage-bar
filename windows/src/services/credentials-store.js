'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-usage-bar');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
const LEGACY_TOKEN_FILE = path.join(CONFIG_DIR, 'token');
const DEFAULT_SCOPES = ['user:profile', 'user:inference'];

class CredentialsStore {
  constructor(dir) {
    this.dir = dir || CONFIG_DIR;
    this.credentialsFile = path.join(this.dir, 'credentials.json');
    this.legacyTokenFile = path.join(this.dir, 'token');
  }

  save(credentials) {
    this._ensureDir();
    const data = JSON.stringify(credentials, null, 2);
    fs.writeFileSync(this.credentialsFile, data, { mode: 0o600 });
    // Remove legacy token file if it exists
    try {
      fs.unlinkSync(this.legacyTokenFile);
    } catch {
      // ignore
    }
  }

  load() {
    // Try new format first
    try {
      const data = fs.readFileSync(this.credentialsFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      // Fall through to legacy
    }

    // Try legacy token file
    try {
      const token = fs.readFileSync(this.legacyTokenFile, 'utf-8').trim();
      if (token) {
        return {
          accessToken: token,
          refreshToken: null,
          expiresAt: null,
          scopes: DEFAULT_SCOPES,
        };
      }
    } catch {
      // No credentials
    }

    return null;
  }

  delete() {
    try {
      fs.unlinkSync(this.credentialsFile);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(this.legacyTokenFile);
    } catch {
      // ignore
    }
  }

  _ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }
}

module.exports = { CredentialsStore, CONFIG_DIR };
