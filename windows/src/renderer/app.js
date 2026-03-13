'use strict';

let currentState = null;
let chartRange = '1d';
let setupComplete = false;

// ── Initialization ──

document.addEventListener('DOMContentLoaded', async () => {
  currentState = await window.api.getState();
  setupComplete = currentState.isAuthenticated; // Skip setup if already authenticated
  render();
  bindEvents();
  window.api.onStateUpdate((state) => {
    currentState = state;
    render();
  });
});

// ── Event Binding ──

function bindEvents() {
  // Setup view
  document.getElementById('setup-done-btn').addEventListener('click', () => {
    setupComplete = true;
    render();
  });
  document.getElementById('setup-quit-btn').addEventListener('click', () => window.api.quitApp());

  document.getElementById('setup-startup').addEventListener('change', (e) => {
    window.api.setStartupEnabled(e.target.checked);
  });

  bindThresholdSlider('setup-threshold-5h', (v) => window.api.setThreshold5h(v));
  bindThresholdSlider('setup-threshold-7d', (v) => window.api.setThreshold7d(v));
  bindThresholdSlider('setup-threshold-extra', (v) => window.api.setThresholdExtra(v));

  // Sign in view
  document.getElementById('signin-btn').addEventListener('click', () => window.api.startOAuth());
  document.getElementById('signin-quit-btn').addEventListener('click', () => window.api.quitApp());
  document.getElementById('signin-settings-btn').addEventListener('click', () => window.api.openSettings());

  // Code entry
  const codeInput = document.getElementById('code-input');
  const submitBtn = document.getElementById('submit-code-btn');
  codeInput.addEventListener('input', () => {
    submitBtn.disabled = !codeInput.value.trim();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && codeInput.value.trim()) {
      window.api.submitCode(codeInput.value.trim());
    }
  });
  submitBtn.addEventListener('click', () => {
    if (codeInput.value.trim()) {
      window.api.submitCode(codeInput.value.trim());
    }
  });
  document.getElementById('cancel-code-btn').addEventListener('click', () => {
    // Reset code entry state
    codeInput.value = '';
    submitBtn.disabled = true;
  });
  document.getElementById('paste-btn').addEventListener('click', async () => {
    const text = await window.api.pasteFromClipboard();
    if (text) {
      codeInput.value = text.trim();
      submitBtn.disabled = !codeInput.value;
    }
  });

  // Usage view
  document.getElementById('refresh-btn').addEventListener('click', () => window.api.refreshUsage());
  document.getElementById('usage-quit-btn').addEventListener('click', () => window.api.quitApp());
  document.getElementById('usage-settings-btn').addEventListener('click', () => window.api.openSettings());

  // Chart range picker
  document.querySelectorAll('#chart-range-picker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      chartRange = btn.dataset.range;
      document.querySelectorAll('#chart-range-picker .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderChart();
    });
  });

  // Chart hover
  const canvas = document.getElementById('usage-chart');
  canvas.addEventListener('mousemove', handleChartHover);
  canvas.addEventListener('mouseleave', () => {
    document.getElementById('chart-tooltip').classList.add('hidden');
  });
}

function bindThresholdSlider(id, onChange) {
  const slider = document.getElementById(id);
  const label = document.getElementById(id + '-label');
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value, 10);
    label.textContent = val > 0 ? `${val}%` : 'Off';
    onChange(val);
  });
}

// ── Rendering ──

function render() {
  if (!currentState) return;

  const setupView = document.getElementById('setup-view');
  const signinView = document.getElementById('signin-view');
  const usageView = document.getElementById('usage-view');

  setupView.classList.add('hidden');
  signinView.classList.add('hidden');
  usageView.classList.add('hidden');

  if (!setupComplete && !currentState.isAuthenticated) {
    setupView.classList.remove('hidden');
    renderSetup();
  } else if (!currentState.isAuthenticated) {
    signinView.classList.remove('hidden');
    renderSignIn();
  } else {
    usageView.classList.remove('hidden');
    renderUsage();
  }
}

function renderSetup() {
  // Load startup setting
  window.api.getStartupEnabled().then((enabled) => {
    document.getElementById('setup-startup').checked = enabled;
  });

  // Setup polling buttons
  const pollingContainer = document.getElementById('setup-polling');
  if (pollingContainer.children.length === 0) {
    const options = currentState.pollingOptions || [5, 15, 30, 60];
    for (const mins of options) {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (mins === currentState.pollingMinutes ? ' active' : '');
      if (mins <= 15) btn.classList.add('discouraged');
      btn.textContent = mins >= 60 ? `${mins / 60}h` : `${mins}m`;
      btn.addEventListener('click', () => {
        pollingContainer.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        window.api.updatePolling(mins);
        const warning = document.getElementById('setup-polling-warning');
        if (mins <= 15) {
          warning.classList.remove('hidden');
        } else {
          warning.classList.add('hidden');
        }
      });
      pollingContainer.appendChild(btn);
    }
  }

  // Set threshold sliders from state
  if (currentState.notifications) {
    setSliderValue('setup-threshold-5h', currentState.notifications.threshold5h);
    setSliderValue('setup-threshold-7d', currentState.notifications.threshold7d);
    setSliderValue('setup-threshold-extra', currentState.notifications.thresholdExtra);
  }
}

function setSliderValue(id, value) {
  const slider = document.getElementById(id);
  const label = document.getElementById(id + '-label');
  slider.value = value;
  label.textContent = value > 0 ? `${value}%` : 'Off';
}

function renderSignIn() {
  const codeEntry = document.getElementById('code-entry');
  const signinPrompt = document.getElementById('signin-prompt');
  const errorEl = document.getElementById('signin-error');

  if (currentState.isAwaitingCode) {
    codeEntry.classList.remove('hidden');
    signinPrompt.classList.add('hidden');
  } else {
    codeEntry.classList.add('hidden');
    signinPrompt.classList.remove('hidden');
  }

  if (currentState.lastError) {
    errorEl.textContent = currentState.lastError;
    errorEl.classList.remove('hidden');
  } else {
    errorEl.classList.add('hidden');
  }
}

function renderUsage() {
  const usage = currentState.usage;
  const compact = currentState.compactMode || false;

  // 5-hour bucket
  renderBucket('5h', usage?.fiveHour);
  renderBucket('7d', usage?.sevenDay);

  // Per-model section
  const perModelSection = document.getElementById('per-model-section');
  if (!compact && usage?.sevenDayOpus?.utilization != null) {
    perModelSection.classList.remove('hidden');
    renderBucket('opus', usage.sevenDayOpus);
    if (usage?.sevenDaySonnet) {
      renderBucket('sonnet', usage.sevenDaySonnet);
      document.getElementById('bucket-sonnet').classList.remove('hidden');
    } else {
      document.getElementById('bucket-sonnet').classList.add('hidden');
    }
  } else {
    perModelSection.classList.add('hidden');
  }

  // Extra usage
  const extraSection = document.getElementById('extra-usage-section');
  if (!compact && usage?.extraUsage?.is_enabled) {
    extraSection.classList.remove('hidden');
    const pct = usage.extraUsage.utilization;
    document.getElementById('extra-pct').textContent =
      pct != null ? `${Math.round(pct)}%` : '—';
    const fillWidth = pct != null ? Math.min(100, Math.max(0, pct)) : 0;
    document.getElementById('fill-extra').style.width = `${fillWidth}%`;

    if (usage.extraUsage.used_credits != null && usage.extraUsage.monthly_limit != null) {
      const used = usage.extraUsage.used_credits / 100;
      const limit = usage.extraUsage.monthly_limit / 100;
      document.getElementById('extra-credits').textContent =
        `${formatUSD(used)} / ${formatUSD(limit)}`;
    } else {
      document.getElementById('extra-credits').textContent = '';
    }
  } else {
    extraSection.classList.add('hidden');
  }

  // Chart section
  const chartSection = document.getElementById('chart-section');
  const chartDivider = chartSection.previousElementSibling;
  if (compact) {
    chartSection.classList.add('hidden');
    if (chartDivider && chartDivider.tagName === 'HR') chartDivider.classList.add('hidden');
  } else {
    chartSection.classList.remove('hidden');
    if (chartDivider && chartDivider.tagName === 'HR') chartDivider.classList.remove('hidden');
  }

  // Error
  const errorEl = document.getElementById('usage-error');
  if (!compact && currentState.lastError) {
    errorEl.textContent = currentState.lastError;
    errorEl.classList.remove('hidden');
  } else {
    errorEl.classList.add('hidden');
  }

  // Footer
  const lastUpdated = document.getElementById('last-updated');
  const footerRows = document.querySelectorAll('#usage-view .footer-row');
  if (compact) {
    footerRows.forEach((row) => row.classList.add('hidden'));
    // Hide the last <hr> before footer
    const hrs = document.querySelectorAll('#usage-view > hr');
    if (hrs.length > 0) hrs[hrs.length - 1].classList.add('hidden');
  } else {
    footerRows.forEach((row) => row.classList.remove('hidden'));
    const hrs = document.querySelectorAll('#usage-view > hr');
    if (hrs.length > 0) hrs[hrs.length - 1].classList.remove('hidden');

    // Last updated
    if (currentState.lastUpdated) {
      lastUpdated.textContent =
        `Updated ${relativeTime(new Date(currentState.lastUpdated))}`;
    } else {
      lastUpdated.textContent = '';
    }
  }

  // Chart (only render when not compact)
  if (!compact) {
    renderChart();
  }
}

function renderBucket(key, bucket) {
  const pctEl = document.getElementById(`pct-${key}`);
  const fillEl = document.getElementById(`fill-${key}`);
  const resetEl = document.getElementById(`reset-${key}`);

  if (!bucket || bucket.utilization == null) {
    pctEl.textContent = '—';
    fillEl.style.width = '0%';
    fillEl.style.backgroundColor = 'transparent';
    if (resetEl) resetEl.textContent = '';
    return;
  }

  const pct = bucket.utilization;
  pctEl.textContent = `${Math.round(pct)}%`;
  const fillWidth = Math.min(100, Math.max(0, pct));
  fillEl.style.width = `${fillWidth}%`;
  fillEl.style.backgroundColor = colorForPct(pct / 100);

  if (resetEl && bucket.resetsAt) {
    const resetDate = new Date(bucket.resetsAt);
    if (!isNaN(resetDate.getTime())) {
      resetEl.textContent = `Resets ${relativeTime(resetDate)}`;
    } else {
      resetEl.textContent = '';
    }
  } else if (resetEl) {
    resetEl.textContent = '';
  }
}

// ── Chart Rendering ──

let chartData = [];

async function renderChart() {
  const points = currentState?.history || [];
  const canvas = document.getElementById('usage-chart');
  const emptyMsg = document.getElementById('chart-empty');
  const ctx = canvas.getContext('2d');

  // Filter points for the selected range
  const now = Date.now();
  const rangeMs = {
    '1h': 3600000,
    '6h': 6 * 3600000,
    '1d': 86400000,
    '7d': 7 * 86400000,
    '30d': 30 * 86400000,
  };
  const range = rangeMs[chartRange] || 86400000;
  const rangeStart = now - range;

  chartData = points
    .filter((p) => new Date(p.timestamp).getTime() >= rangeStart)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (chartData.length === 0) {
    emptyMsg.classList.remove('hidden');
    canvas.classList.add('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  canvas.classList.remove('hidden');

  const padding = { top: 10, right: 10, bottom: 20, left: 35 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Draw grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (const pct of [0, 25, 50, 75, 100]) {
    const y = padding.top + plotH - (pct / 100) * plotH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, padding.left - 4, y + 3);
  }

  // X-axis labels
  const xLabelCount = 3;
  ctx.fillStyle = '#666';
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= xLabelCount; i++) {
    const t = rangeStart + (range * i) / xLabelCount;
    const x = padding.left + (plotW * i) / xLabelCount;
    ctx.fillText(formatXLabel(new Date(t), chartRange), x, height - 4);
  }

  // Map data to pixel coordinates
  function toX(timestamp) {
    const t = new Date(timestamp).getTime();
    return padding.left + ((t - rangeStart) / range) * plotW;
  }
  function toY(pct) {
    return padding.top + plotH - pct * plotH;
  }

  // Draw lines
  drawLine(ctx, chartData, (p) => toX(p.timestamp), (p) => toY(p.pct5h), '#42a5f5');
  drawLine(ctx, chartData, (p) => toX(p.timestamp), (p) => toY(p.pct7d), '#ff9800');

  // Legend
  const legendY = padding.top;
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';

  ctx.fillStyle = '#42a5f5';
  ctx.fillRect(width - padding.right - 60, legendY, 8, 8);
  ctx.fillText('5h', width - padding.right - 49, legendY + 8);

  ctx.fillStyle = '#ff9800';
  ctx.fillRect(width - padding.right - 30, legendY, 8, 8);
  ctx.fillText('7d', width - padding.right - 19, legendY + 8);
}

function drawLine(ctx, data, getX, getY, color) {
  if (data.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  // Use catmull-rom interpolation
  const points = data.map((p) => ({ x: getX(p), y: getY(p) }));

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-Rom to cubic Bezier conversion
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
}

function handleChartHover(e) {
  if (chartData.length === 0) return;

  const canvas = document.getElementById('usage-chart');
  const tooltip = document.getElementById('chart-tooltip');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const x = (e.clientX - rect.left) * scaleX;

  const padding = { left: 35, right: 10 };
  const plotW = canvas.width - padding.left - padding.right;

  const now = Date.now();
  const rangeMs = {
    '1h': 3600000,
    '6h': 6 * 3600000,
    '1d': 86400000,
    '7d': 7 * 86400000,
    '30d': 30 * 86400000,
  };
  const range = rangeMs[chartRange] || 86400000;
  const rangeStart = now - range;

  const t = rangeStart + ((x - padding.left) / plotW) * range;

  // Find closest data point
  let closest = null;
  let closestDist = Infinity;
  for (const p of chartData) {
    const dist = Math.abs(new Date(p.timestamp).getTime() - t);
    if (dist < closestDist) {
      closestDist = dist;
      closest = p;
    }
  }

  if (!closest) {
    tooltip.classList.add('hidden');
    return;
  }

  const dateStr = formatTooltipDate(new Date(closest.timestamp), chartRange);
  const pct5h = Math.round(closest.pct5h * 100);
  const pct7d = Math.round(closest.pct7d * 100);

  tooltip.innerHTML = `
    <div class="tooltip-date">${dateStr}</div>
    <div class="tooltip-values">
      <span class="tooltip-5h">● ${pct5h}%</span>
      <span class="tooltip-7d">● ${pct7d}%</span>
    </div>
  `;
  tooltip.classList.remove('hidden');
}

// ── Utility Functions ──

function colorForPct(pct) {
  if (pct < 0.6) return '#4caf50';
  if (pct < 0.8) return '#ffc107';
  return '#f44336';
}

function formatUSD(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function relativeTime(date) {
  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absDiff < 60000) {
    const secs = Math.round(diff / 1000);
    return rtf.format(secs, 'second');
  }
  if (absDiff < 3600000) {
    const mins = Math.round(diff / 60000);
    return rtf.format(mins, 'minute');
  }
  if (absDiff < 86400000) {
    const hours = Math.round(diff / 3600000);
    return rtf.format(hours, 'hour');
  }
  const days = Math.round(diff / 86400000);
  return rtf.format(days, 'day');
}

function formatXLabel(date, range) {
  switch (range) {
    case '1h':
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case '6h':
    case '1d':
      return date.toLocaleTimeString([], { hour: '2-digit' });
    case '7d':
      return date.toLocaleDateString([], { weekday: 'short' });
    case '30d':
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleTimeString([], { hour: '2-digit' });
  }
}

function formatTooltipDate(date, range) {
  switch (range) {
    case '1h':
    case '6h':
    case '1d':
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case '7d':
      return date.toLocaleDateString([], { weekday: 'short' }) +
        ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    case '30d':
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' + date.toLocaleTimeString([], { hour: '2-digit' });
    default:
      return date.toLocaleTimeString();
  }
}
