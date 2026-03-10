'use strict';

const crypto = require('crypto');

// Electron's net module is only available in the main process.
let net;
try {
  net = require('electron').net;
} catch {
  net = null;
}

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_ENDPOINT = 'https://claude.ai/oauth/authorize';
const DEFAULT_USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const DEFAULT_USERINFO_ENDPOINT = 'https://api.anthropic.com/api/oauth/userinfo';
const DEFAULT_TOKEN_ENDPOINT = 'https://platform.claude.com/v1/oauth/token';
const DEFAULT_REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback';
const DEFAULT_OAUTH_SCOPES = ['user:profile', 'user:inference'];

const DEFAULT_POLLING_MINUTES = 30;
const POLLING_OPTIONS = [5, 15, 30, 60];
const MAX_BACKOFF_INTERVAL = 60 * 60; // 1 hour in seconds

function generateCodeVerifier() {
  const bytes = crypto.randomBytes(32);
  return bytes.toString('base64url');
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

function backoffInterval(retryAfter, currentInterval) {
  return Math.min(
    Math.max(retryAfter || currentInterval, currentInterval * 2),
    MAX_BACKOFF_INTERVAL
  );
}

function buildAuthorizeURL(codeChallenge, state) {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', DEFAULT_REDIRECT_URI);
  url.searchParams.set('scope', DEFAULT_OAUTH_SCOPES.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Perform an HTTP request using Electron's net module.
 * Returns { data: Buffer, statusCode: number, headers: object }
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: options.method || 'GET',
    });

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        request.setHeader(key, value);
      }
    }

    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve({
          data,
          statusCode: response.statusCode,
          headers: response.headers,
        });
      });
      response.on('error', reject);
    });

    request.on('error', reject);

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

class UsageService {
  constructor({ credentialsStore, settingsStore, onUpdate }) {
    this.credentialsStore = credentialsStore;
    this.settingsStore = settingsStore;
    this.onUpdate = onUpdate || (() => {});

    this.usage = null;
    this.lastError = null;
    this.lastUpdated = null;
    this.isAuthenticated = false;
    this.isAwaitingCode = false;
    this.accountEmail = null;

    this.codeVerifier = null;
    this.oauthState = null;
    this.timer = null;
    this.currentInterval = null;

    this._init();
  }

  _init() {
    const stored = this.settingsStore.get('pollingMinutes');
    const minutes = POLLING_OPTIONS.includes(stored) ? stored : DEFAULT_POLLING_MINUTES;
    this.pollingMinutes = minutes;
    this.currentInterval = minutes * 60;
    this.isAuthenticated = this.credentialsStore.load() !== null;
  }

  get pct5h() {
    return (this.usage?.fiveHour?.utilization ?? 0) / 100.0;
  }

  get pct7d() {
    return (this.usage?.sevenDay?.utilization ?? 0) / 100.0;
  }

  get pctExtra() {
    return (this.usage?.extraUsage?.utilization ?? 0) / 100.0;
  }

  get reset5h() {
    return parseResetDate(this.usage?.fiveHour?.resetsAt);
  }

  get reset7d() {
    return parseResetDate(this.usage?.sevenDay?.resetsAt);
  }

  updatePollingInterval(minutes) {
    this.pollingMinutes = minutes;
    this.settingsStore.set('pollingMinutes', minutes);
    this.currentInterval = minutes * 60;
    if (this.isAuthenticated) {
      this._scheduleTimer();
      this.fetchUsage();
    }
  }

  startPolling() {
    if (!this.isAuthenticated) return;
    this.fetchUsage();
    this._fetchProfile();
    this._scheduleTimer();
  }

  _scheduleTimer() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      if (this.isAuthenticated) {
        this.fetchUsage();
      }
    }, this.currentInterval * 1000);
  }

  // OAuth PKCE flow
  startOAuthFlow() {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateCodeVerifier();

    this.codeVerifier = verifier;
    this.oauthState = state;

    const url = buildAuthorizeURL(challenge, state);
    this.isAwaitingCode = true;
    this.onUpdate();
    return url;
  }

  async submitOAuthCode(rawCode) {
    const parts = rawCode.trim().split('#');
    const code = parts[0];

    if (parts.length > 1) {
      const returnedState = parts.slice(1).join('#');
      if (returnedState !== this.oauthState) {
        this.lastError = 'OAuth state mismatch — try again';
        this.isAwaitingCode = false;
        this.codeVerifier = null;
        this.oauthState = null;
        this.onUpdate();
        return;
      }
    }

    if (!this.codeVerifier) {
      this.lastError = 'No pending OAuth flow';
      this.isAwaitingCode = false;
      this.onUpdate();
      return;
    }

    const body = JSON.stringify({
      grant_type: 'authorization_code',
      code,
      state: this.oauthState || '',
      client_id: CLIENT_ID,
      redirect_uri: DEFAULT_REDIRECT_URI,
      code_verifier: this.codeVerifier,
    });

    try {
      const { data, statusCode } = await httpRequest(DEFAULT_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (statusCode !== 200) {
        this.lastError = `Token exchange failed: HTTP ${statusCode} ${data.toString()}`;
        this.onUpdate();
        return;
      }

      const json = JSON.parse(data.toString());
      const credentials = this._credentialsFromJSON(json);
      if (!credentials) {
        this.lastError = 'Could not parse token response';
        this.onUpdate();
        return;
      }

      this.credentialsStore.save(credentials);
      this.isAuthenticated = true;
      this.isAwaitingCode = false;
      this.lastError = null;
      this.codeVerifier = null;
      this.oauthState = null;

      await this._fetchProfile();
      this.startPolling();
      this.onUpdate();
    } catch (err) {
      this.lastError = `Token exchange error: ${err.message}`;
      this.onUpdate();
    }
  }

  signOut() {
    this.credentialsStore.delete();
    this.isAuthenticated = false;
    this.usage = null;
    this.lastUpdated = null;
    this.accountEmail = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastError = null;
    this.onUpdate();
  }

  async fetchUsage() {
    const credentials = this.credentialsStore.load();
    if (!credentials) {
      this.lastError = 'Not signed in';
      this.isAuthenticated = false;
      this.onUpdate();
      return;
    }

    try {
      const result = await this._sendAuthorizedRequest(DEFAULT_USAGE_ENDPOINT);
      if (!result) return;

      const { data, statusCode, headers } = result;

      if (statusCode === 429) {
        const retryAfter = parseFloat(headers['retry-after']) || this.currentInterval;
        this.currentInterval = backoffInterval(retryAfter, this.currentInterval);
        this.lastError = `Rate limited — backing off to ${Math.round(this.currentInterval)}s`;
        this._scheduleTimer();
        this.onUpdate();
        return;
      }

      if (statusCode !== 200) {
        this.lastError = `HTTP ${statusCode}`;
        this.onUpdate();
        return;
      }

      const decoded = JSON.parse(data.toString());
      this.usage = reconcileUsage(decoded, this.usage);
      this.lastError = null;
      this.lastUpdated = new Date();

      const baseInterval = this.pollingMinutes * 60;
      if (this.currentInterval !== baseInterval) {
        this.currentInterval = baseInterval;
        this._scheduleTimer();
      }

      this.onUpdate();
    } catch (err) {
      this.lastError = err.message;
      this.onUpdate();
    }
  }

  async _fetchProfile() {
    // Try loading from local Claude Code config
    const localEmail = loadLocalProfile();
    if (localEmail) {
      this.accountEmail = localEmail;
      this.onUpdate();
      return;
    }

    try {
      const result = await this._sendAuthorizedRequest(
        DEFAULT_USERINFO_ENDPOINT,
        false
      );
      if (!result) return;

      const { data, statusCode } = result;
      if (statusCode !== 200) return;

      const json = JSON.parse(data.toString());
      if (json.email) {
        this.accountEmail = json.email;
      } else if (json.name) {
        this.accountEmail = json.name;
      }
      this.onUpdate();
    } catch {
      // Profile fetch is best-effort
    }
  }

  async _sendAuthorizedRequest(url, expireOnAuthFailure = true) {
    let credentials = this.credentialsStore.load();
    if (!credentials) {
      this.lastError = 'Not signed in';
      this.isAuthenticated = false;
      this.onUpdate();
      return null;
    }

    if (needsRefresh(credentials)) {
      await this._refreshCredentials(true);
    }

    credentials = this.credentialsStore.load() || credentials;
    let result = await this._performAuthorizedRequest(credentials.accessToken, url);

    if (result.statusCode !== 401) {
      return result;
    }

    const refreshed = await this._refreshCredentials(true);
    if (!refreshed) {
      if (expireOnAuthFailure) this._expireSession();
      return null;
    }

    credentials = this.credentialsStore.load();
    if (!credentials) {
      if (expireOnAuthFailure) this._expireSession();
      return null;
    }

    result = await this._performAuthorizedRequest(credentials.accessToken, url);
    if (result.statusCode === 401) {
      if (expireOnAuthFailure) this._expireSession();
      return null;
    }

    return result;
  }

  async _performAuthorizedRequest(token, url) {
    return httpRequest(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });
  }

  async _refreshCredentials(force) {
    const current = this.credentialsStore.load();
    if (!current?.refreshToken) return false;
    if (!force && !needsRefresh(current)) return true;

    const bodyObj = {
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: CLIENT_ID,
    };
    if (current.scopes?.length > 0) {
      bodyObj.scope = current.scopes.join(' ');
    }

    try {
      const { data, statusCode } = await httpRequest(DEFAULT_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });

      if (statusCode !== 200) return false;

      const json = JSON.parse(data.toString());
      const updated = this._credentialsFromJSON(json, current);
      if (!updated) return false;

      this.credentialsStore.save(updated);
      this.isAuthenticated = true;
      return true;
    } catch {
      return false;
    }
  }

  _credentialsFromJSON(json, fallback = null) {
    if (!json.access_token) return null;

    const scopeStr = json.scope;
    const scopes = scopeStr
      ? scopeStr.split(/\s+/)
      : fallback?.scopes || DEFAULT_OAUTH_SCOPES;

    let expiresAt = null;
    if (json.expires_in != null) {
      expiresAt = new Date(Date.now() + Number(json.expires_in) * 1000).toISOString();
    } else if (fallback?.expiresAt) {
      expiresAt = fallback.expiresAt;
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || fallback?.refreshToken || null,
      expiresAt,
      scopes,
    };
  }

  _expireSession() {
    this.credentialsStore.delete();
    this.isAuthenticated = false;
    this.usage = null;
    this.lastUpdated = null;
    this.accountEmail = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastError = 'Session expired — please sign in again';
    this.onUpdate();
  }

  getState() {
    return {
      usage: this.usage,
      lastError: this.lastError,
      lastUpdated: this.lastUpdated?.toISOString() || null,
      isAuthenticated: this.isAuthenticated,
      isAwaitingCode: this.isAwaitingCode,
      accountEmail: this.accountEmail,
      pollingMinutes: this.pollingMinutes,
      pct5h: this.pct5h,
      pct7d: this.pct7d,
      pctExtra: this.pctExtra,
    };
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// Utility functions

function parseResetDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function needsRefresh(credentials, leewayMs = 60000) {
  if (!credentials.refreshToken) return false;
  if (!credentials.expiresAt) return false;
  return new Date(credentials.expiresAt) <= new Date(Date.now() + leewayMs);
}

function loadLocalProfile() {
  try {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(os.homedir(), '.claude.json');
    const data = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(data);
    const account = json.oauthAccount;
    if (!account) return null;
    if (account.emailAddress) return account.emailAddress;
    if (account.displayName) return account.displayName;
    return null;
  } catch {
    return null;
  }
}

function reconcileUsage(current, previous) {
  return {
    fiveHour: reconcileBucket(current.five_hour, previous?.fiveHour, 5 * 60 * 60),
    sevenDay: reconcileBucket(current.seven_day, previous?.sevenDay, 7 * 24 * 60 * 60),
    sevenDayOpus: reconcileBucket(current.seven_day_opus, previous?.sevenDayOpus, 7 * 24 * 60 * 60),
    sevenDaySonnet: reconcileBucket(current.seven_day_sonnet, previous?.sevenDaySonnet, 7 * 24 * 60 * 60),
    extraUsage: current.extra_usage || null,
  };
}

function reconcileBucket(current, previous, resetIntervalSec) {
  if (!current) return null;

  const bucket = {
    utilization: current.utilization ?? null,
    resetsAt: current.resets_at ?? null,
  };

  // If no reset date, try to infer from previous
  if (!parseResetDate(bucket.resetsAt) && previous?.resetsAt) {
    const prevDate = parseResetDate(previous.resetsAt);
    if (prevDate) {
      const now = new Date();
      if (prevDate <= now && resetIntervalSec > 0) {
        const elapsed = (now - prevDate) / 1000;
        const steps = Math.floor(elapsed / resetIntervalSec) + 1;
        const nextReset = new Date(prevDate.getTime() + steps * resetIntervalSec * 1000);
        bucket.resetsAt = nextReset.toISOString();
      } else {
        bucket.resetsAt = previous.resetsAt;
      }
    }
  }

  return bucket;
}

module.exports = {
  UsageService,
  POLLING_OPTIONS,
  DEFAULT_POLLING_MINUTES,
  backoffInterval,
  generateCodeVerifier,
  generateCodeChallenge,
  parseResetDate,
  needsRefresh,
  reconcileUsage,
  reconcileBucket,
  loadLocalProfile,
};
