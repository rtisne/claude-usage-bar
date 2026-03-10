'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  backoffInterval,
  generateCodeVerifier,
  generateCodeChallenge,
  parseResetDate,
  needsRefresh,
  reconcileUsage,
  reconcileBucket,
} = require('./usage-service');

describe('backoffInterval', () => {
  it('doubles the current interval when no retryAfter', () => {
    assert.equal(backoffInterval(null, 300), 600);
  });

  it('uses retryAfter when it exceeds doubled interval', () => {
    assert.equal(backoffInterval(1200, 300), 1200);
  });

  it('caps at max backoff (1 hour)', () => {
    assert.equal(backoffInterval(null, 7200), 3600);
  });
});

describe('PKCE helpers', () => {
  it('generates a code verifier of expected length', () => {
    const verifier = generateCodeVerifier();
    assert.ok(verifier.length > 0);
    // Base64url of 32 bytes should be 43 chars
    assert.equal(verifier.length, 43);
  });

  it('generates a code challenge from verifier', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    assert.ok(challenge.length > 0);
    assert.notEqual(challenge, verifier);
  });
});

describe('parseResetDate', () => {
  it('parses ISO 8601 date strings', () => {
    const date = parseResetDate('2025-01-15T10:30:00Z');
    assert.ok(date instanceof Date);
    assert.equal(date.toISOString(), '2025-01-15T10:30:00.000Z');
  });

  it('returns null for null/undefined', () => {
    assert.equal(parseResetDate(null), null);
    assert.equal(parseResetDate(undefined), null);
  });

  it('returns null for empty string', () => {
    assert.equal(parseResetDate(''), null);
  });

  it('returns null for invalid dates', () => {
    assert.equal(parseResetDate('not-a-date'), null);
  });
});

describe('needsRefresh', () => {
  it('returns false when no refresh token', () => {
    assert.equal(
      needsRefresh({ refreshToken: null, expiresAt: new Date().toISOString() }),
      false
    );
  });

  it('returns false when no expiry date', () => {
    assert.equal(
      needsRefresh({ refreshToken: 'token', expiresAt: null }),
      false
    );
  });

  it('returns true when token is expired', () => {
    const past = new Date(Date.now() - 10000).toISOString();
    assert.equal(
      needsRefresh({ refreshToken: 'token', expiresAt: past }),
      true
    );
  });

  it('returns true when token expires within leeway', () => {
    const soon = new Date(Date.now() + 30000).toISOString(); // 30s from now, 60s leeway
    assert.equal(
      needsRefresh({ refreshToken: 'token', expiresAt: soon }),
      true
    );
  });

  it('returns false when token is still valid', () => {
    const future = new Date(Date.now() + 120000).toISOString(); // 2 min
    assert.equal(
      needsRefresh({ refreshToken: 'token', expiresAt: future }),
      false
    );
  });
});

describe('reconcileBucket', () => {
  it('returns null for null input', () => {
    assert.equal(reconcileBucket(null, null, 3600), null);
  });

  it('passes through bucket with resets_at', () => {
    const bucket = { utilization: 50, resets_at: '2025-01-15T10:00:00Z' };
    const result = reconcileBucket(bucket, null, 3600);
    assert.equal(result.utilization, 50);
    assert.equal(result.resetsAt, '2025-01-15T10:00:00Z');
  });

  it('infers reset time from previous when missing', () => {
    const previous = { resetsAt: new Date(Date.now() - 3600 * 1000).toISOString() };
    const current = { utilization: 30 };
    const result = reconcileBucket(current, previous, 3600);
    assert.ok(result.resetsAt);
    assert.ok(new Date(result.resetsAt) > new Date());
  });
});

describe('reconcileUsage', () => {
  it('handles a minimal API response', () => {
    const apiResponse = {
      five_hour: { utilization: 25 },
      seven_day: { utilization: 45 },
    };
    const result = reconcileUsage(apiResponse, null);
    assert.equal(result.fiveHour.utilization, 25);
    assert.equal(result.sevenDay.utilization, 45);
    assert.equal(result.sevenDayOpus, null);
    assert.equal(result.sevenDaySonnet, null);
    assert.equal(result.extraUsage, null);
  });

  it('includes per-model and extra usage', () => {
    const apiResponse = {
      five_hour: { utilization: 25 },
      seven_day: { utilization: 45 },
      seven_day_opus: { utilization: 60 },
      seven_day_sonnet: { utilization: 30 },
      extra_usage: { is_enabled: true, utilization: 50, used_credits: 5000, monthly_limit: 10000 },
    };
    const result = reconcileUsage(apiResponse, null);
    assert.equal(result.sevenDayOpus.utilization, 60);
    assert.equal(result.sevenDaySonnet.utilization, 30);
    assert.ok(result.extraUsage.is_enabled);
  });
});
