'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  crossedThresholds,
} = require('./notification-service');

describe('crossedThresholds', () => {
  it('returns empty when thresholds are off (0)', () => {
    const alerts = crossedThresholds({
      threshold5h: 0,
      threshold7d: 0,
      thresholdExtra: 0,
      previous5h: 0,
      previous7d: 0,
      previousExtra: 0,
      current5h: 90,
      current7d: 90,
      currentExtra: 90,
    });
    assert.deepEqual(alerts, []);
  });

  it('fires 5h alert when threshold is crossed upward', () => {
    const alerts = crossedThresholds({
      threshold5h: 80,
      threshold7d: 0,
      thresholdExtra: 0,
      previous5h: 75,
      previous7d: 50,
      previousExtra: 0,
      current5h: 85,
      current7d: 50,
      currentExtra: 0,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].window, '5-hour');
    assert.equal(alerts[0].pct, 85);
  });

  it('fires 7d alert when threshold is crossed upward', () => {
    const alerts = crossedThresholds({
      threshold5h: 0,
      threshold7d: 90,
      thresholdExtra: 0,
      previous5h: 50,
      previous7d: 85,
      previousExtra: 0,
      current5h: 50,
      current7d: 92,
      currentExtra: 0,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].window, '7-day');
    assert.equal(alerts[0].pct, 92);
  });

  it('fires extra alert when threshold is crossed upward', () => {
    const alerts = crossedThresholds({
      threshold5h: 0,
      threshold7d: 0,
      thresholdExtra: 75,
      previous5h: 0,
      previous7d: 0,
      previousExtra: 70,
      current5h: 0,
      current7d: 0,
      currentExtra: 80,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].window, 'Extra usage');
    assert.equal(alerts[0].pct, 80);
  });

  it('does not fire when current is below threshold', () => {
    const alerts = crossedThresholds({
      threshold5h: 80,
      threshold7d: 80,
      thresholdExtra: 80,
      previous5h: 50,
      previous7d: 50,
      previousExtra: 50,
      current5h: 70,
      current7d: 70,
      currentExtra: 70,
    });
    assert.deepEqual(alerts, []);
  });

  it('does not fire when already above threshold (no crossing)', () => {
    const alerts = crossedThresholds({
      threshold5h: 80,
      threshold7d: 0,
      thresholdExtra: 0,
      previous5h: 85,
      previous7d: 0,
      previousExtra: 0,
      current5h: 90,
      current7d: 0,
      currentExtra: 0,
    });
    assert.deepEqual(alerts, []);
  });

  it('fires multiple alerts simultaneously', () => {
    const alerts = crossedThresholds({
      threshold5h: 80,
      threshold7d: 90,
      thresholdExtra: 75,
      previous5h: 70,
      previous7d: 85,
      previousExtra: 70,
      current5h: 85,
      current7d: 95,
      currentExtra: 80,
    });
    assert.equal(alerts.length, 3);
  });

  it('fires when current exactly equals threshold', () => {
    const alerts = crossedThresholds({
      threshold5h: 80,
      threshold7d: 0,
      thresholdExtra: 0,
      previous5h: 79,
      previous7d: 0,
      previousExtra: 0,
      current5h: 80,
      current7d: 0,
      currentExtra: 0,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].pct, 80);
  });
});
