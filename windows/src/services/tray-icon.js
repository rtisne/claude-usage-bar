'use strict';

const { nativeImage } = require('electron');

const ICON_WIDTH = 64;
const ICON_HEIGHT = 64;
const BAR_WIDTH = 40;
const BAR_HEIGHT = 8;
const BAR_X = 12;
const BAR_GAP = 6;
const CORNER_RADIUS = 3;
const LABEL_FONT = '9px sans-serif';

/**
 * Create a Canvas-based tray icon for Windows.
 * Uses the 'canvas' npm package if available, otherwise falls back
 * to generating a simple PNG via raw pixel buffer.
 */
function renderTrayIcon(pct5h, pct7d) {
  // Use pixel buffer approach (no native canvas dependency required)
  return renderPixelIcon(pct5h, pct7d);
}

function renderUnauthenticatedIcon() {
  return renderPixelIcon(-1, -1);
}

/**
 * Render a 16x16 tray icon using raw pixel manipulation.
 * Windows tray icons are typically 16x16 or 32x32.
 */
function renderPixelIcon(pct5h, pct7d) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }

  function fillRect(x0, y0, w, h, r, g, b, a) {
    for (let y = y0; y < y0 + h && y < size; y++) {
      for (let x = x0; x < x0 + w && x < size; x++) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }

  // Background bars (subtle)
  const barW = 12;
  const barH = 4;
  const topBarY = 3;
  const bottomBarY = 9;
  const barX = 2;

  // Draw background bars
  fillRect(barX, topBarY, barW, barH, 180, 180, 180, 120);
  fillRect(barX, bottomBarY, barW, barH, 180, 180, 180, 120);

  if (pct5h >= 0 && pct7d >= 0) {
    // Fill bars based on usage percentage
    const fill5h = Math.max(1, Math.round(barW * Math.min(1, Math.max(0, pct5h))));
    const fill7d = Math.max(1, Math.round(barW * Math.min(1, Math.max(0, pct7d))));

    const color5h = colorForPct(pct5h);
    const color7d = colorForPct(pct7d);

    fillRect(barX, topBarY, fill5h, barH, color5h[0], color5h[1], color5h[2], 255);
    fillRect(barX, bottomBarY, fill7d, barH, color7d[0], color7d[1], color7d[2], 255);
  } else {
    // Unauthenticated — draw dashed pattern
    for (let x = barX; x < barX + barW; x += 3) {
      fillRect(x, topBarY, 1, barH, 160, 160, 160, 180);
      fillRect(x, bottomBarY, 1, barH, 160, 160, 160, 180);
    }
  }

  const image = nativeImage.createFromBuffer(buf, {
    width: size,
    height: size,
  });
  return image;
}

function colorForPct(pct) {
  if (pct < 0.60) return [76, 175, 80]; // green
  if (pct < 0.80) return [255, 193, 7]; // yellow/amber
  return [244, 67, 54]; // red
}

module.exports = { renderTrayIcon, renderUnauthenticatedIcon, colorForPct };
