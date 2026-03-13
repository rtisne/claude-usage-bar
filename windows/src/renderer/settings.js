'use strict';

let currentState = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentState = await window.api.getState();
  render();
  bindEvents();
  window.api.onStateUpdate((state) => {
    currentState = state;
    render();
  });
});

function bindEvents() {
  // Startup toggle
  document.getElementById('settings-startup').addEventListener('change', (e) => {
    window.api.setStartupEnabled(e.target.checked);
  });

  // Polling interval
  document.getElementById('settings-polling').addEventListener('change', (e) => {
    window.api.updatePolling(parseInt(e.target.value, 10));
  });

  // Compact mode toggle
  document.getElementById('settings-compact-mode').addEventListener('change', (e) => {
    window.api.setCompactMode(e.target.checked);
  });

  // Threshold sliders
  bindSlider('settings-threshold-5h', (v) => window.api.setThreshold5h(v));
  bindSlider('settings-threshold-7d', (v) => window.api.setThreshold7d(v));
  bindSlider('settings-threshold-extra', (v) => window.api.setThresholdExtra(v));

  // Sign out
  document.getElementById('signout-btn').addEventListener('click', () => {
    window.api.signOut();
  });
}

function bindSlider(id, onChange) {
  const slider = document.getElementById(id);
  const label = document.getElementById(id + '-label');
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value, 10);
    label.textContent = val > 0 ? `${val}%` : 'Off';
    onChange(val);
  });
}

function render() {
  if (!currentState) return;

  // Startup
  window.api.getStartupEnabled().then((enabled) => {
    document.getElementById('settings-startup').checked = enabled;
  });

  // Polling
  document.getElementById('settings-polling').value = String(currentState.pollingMinutes);

  // Compact mode
  window.api.getCompactMode().then((enabled) => {
    document.getElementById('settings-compact-mode').checked = enabled;
  });

  // Thresholds
  if (currentState.notifications) {
    setSliderValue('settings-threshold-5h', currentState.notifications.threshold5h);
    setSliderValue('settings-threshold-7d', currentState.notifications.threshold7d);
    setSliderValue('settings-threshold-extra', currentState.notifications.thresholdExtra);
  }

  // Account
  const accountSection = document.getElementById('account-section');
  if (currentState.isAuthenticated) {
    accountSection.style.display = '';
    document.getElementById('account-email').textContent = currentState.accountEmail || '';
  } else {
    accountSection.style.display = 'none';
  }
}

function setSliderValue(id, value) {
  const slider = document.getElementById(id);
  const label = document.getElementById(id + '-label');
  slider.value = value;
  label.textContent = value > 0 ? `${value}%` : 'Off';
}
