'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-usage-bar');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const TIME_RANGES = {
  '1h': { interval: 3600 * 1000, targetPoints: 120 },
  '6h': { interval: 6 * 3600 * 1000, targetPoints: 180 },
  '1d': { interval: 24 * 3600 * 1000, targetPoints: 200 },
  '7d': { interval: 7 * 24 * 3600 * 1000, targetPoints: 200 },
  '30d': { interval: 30 * 24 * 3600 * 1000, targetPoints: 200 },
};

class HistoryService {
  constructor() {
    this.dataPoints = [];
    this.isDirty = false;
    this.flushTimer = null;
  }

  loadHistory() {
    try {
      if (!fs.existsSync(HISTORY_FILE)) return;
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      this.dataPoints = this._pruned(parsed.dataPoints || []);
    } catch {
      // Corrupt file — rename to .bak and start fresh
      try {
        const backup = HISTORY_FILE.replace('.json', '.bak.json');
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        if (fs.existsSync(HISTORY_FILE)) fs.renameSync(HISTORY_FILE, backup);
      } catch {
        // ignore
      }
      this.dataPoints = [];
    }
  }

  recordDataPoint(pct5h, pct7d) {
    this.dataPoints.push({
      timestamp: new Date().toISOString(),
      pct5h,
      pct7d,
    });
    this.isDirty = true;
    this._startFlushTimerIfNeeded();
  }

  flushToDisk() {
    if (!this.isDirty) return;
    this.dataPoints = this._pruned(this.dataPoints);

    try {
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
      const data = JSON.stringify({ dataPoints: this.dataPoints }, null, 2);
      fs.writeFileSync(HISTORY_FILE, data, { encoding: 'utf-8' });
    } catch {
      // ignore write errors
    }

    this.isDirty = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  downsampledPoints(rangeKey) {
    const range = TIME_RANGES[rangeKey];
    if (!range) return this.dataPoints;

    const allPoints = this.dataPoints;
    if (allPoints.length <= range.targetPoints) return allPoints;

    const now = Date.now();
    const rangeStart = now - range.interval;
    const bucketCount = range.targetPoints;
    const bucketDuration = range.interval / bucketCount;

    const buckets = Array.from({ length: bucketCount }, () => []);

    for (const point of allPoints) {
      const ts = new Date(point.timestamp).getTime();
      const offset = ts - rangeStart;
      let index = Math.floor(offset / bucketDuration);
      if (index < 0) index = 0;
      if (index >= bucketCount) index = bucketCount - 1;
      buckets[index].push(point);
    }

    return buckets
      .filter((b) => b.length > 0)
      .map((bucket) => {
        const avgPct5h = bucket.reduce((s, p) => s + p.pct5h, 0) / bucket.length;
        const avgPct7d = bucket.reduce((s, p) => s + p.pct7d, 0) / bucket.length;
        const avgTs =
          bucket.reduce((s, p) => s + new Date(p.timestamp).getTime(), 0) /
          bucket.length;
        return {
          timestamp: new Date(avgTs).toISOString(),
          pct5h: avgPct5h,
          pct7d: avgPct7d,
        };
      });
  }

  _pruned(points) {
    const cutoff = Date.now() - RETENTION_MS;
    return points.filter((p) => new Date(p.timestamp).getTime() >= cutoff);
  }

  _startFlushTimerIfNeeded() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushToDisk(), FLUSH_INTERVAL_MS);
  }

  destroy() {
    this.flushToDisk();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

module.exports = { HistoryService, TIME_RANGES };
