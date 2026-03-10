# Claude Usage Bar — Windows

A Windows system tray application that displays your Claude API usage at a glance. This is the Windows port of the [macOS menu bar app](../macos/).

## What it does

A system tray app that shows your Claude API usage:

- **System tray icon** with colored bars showing 5-hour and 7-day utilization
- **Popup window** — click the tray icon to see:
  - 5-hour and 7-day usage with progress bars & reset timers
  - Per-model breakdown (Opus / Sonnet) when available
  - Extra usage tracking with USD display
  - Usage history chart (1h / 6h / 1d / 7d / 30d)
  - Hover over the chart to see exact values
- **Windows notifications** when usage crosses configurable thresholds
- **Configurable polling** (5m / 15m / 30m / 1h)
- **OAuth sign-in** via browser — no API keys needed
- **Launch at login** support

## Install

### Download

Download the installer from the [latest release](https://github.com/Blimp-Labs/claude-usage-bar/releases/latest).

### Build from source

Requires [Node.js](https://nodejs.org/) 18+ and npm.

```powershell
cd windows
npm install
npm start          # Run in development mode
npm run dist       # Build Windows installer (.exe)
```

## Usage

1. Launch the app — a system tray icon appears (bottom-right of taskbar)
2. Click the icon → **Sign in with Claude** → authorize in your browser
3. Paste the code back into the app
4. The icon updates automatically (default: every 30 minutes)

Right-click the tray icon for quick actions (Open, Settings, Refresh, Quit).

## Data storage

All data is stored locally in `~/.config/claude-usage-bar/`:

| File | Purpose |
|------|---------|
| `credentials.json` | OAuth credentials (access token, refresh token) |
| `history.json` | Usage history for the chart (30-day retention) |
| `settings.json` | App settings (polling interval, notification thresholds) |

No data is sent anywhere other than the Anthropic API.

## Development

```powershell
cd windows
npm install        # Install dependencies
npm start          # Launch in dev mode
npm test           # Run unit tests
npm run dist       # Build Windows installer
```

### Project structure

```
windows/
├── src/
│   ├── main.js                  # Electron main process (tray, windows, IPC)
│   ├── preload.js               # Context bridge (main ↔ renderer)
│   ├── renderer/
│   │   ├── index.html           # Main popup window
│   │   ├── settings.html        # Settings window
│   │   ├── styles.css           # Shared styles
│   │   ├── app.js               # Popup renderer logic & chart
│   │   └── settings.js          # Settings renderer logic
│   └── services/
│       ├── usage-service.js     # OAuth, polling, API calls
│       ├── credentials-store.js # Credential storage
│       ├── history-service.js   # Usage history persistence
│       ├── notification-service.js # Windows notifications
│       ├── settings-store.js    # Settings persistence
│       └── tray-icon.js         # Dynamic tray icon rendering
├── assets/
│   ├── icon.png                 # App icon
│   └── claude-logo.png          # Claude logo
└── package.json
```

## Technology

- **[Electron](https://www.electronjs.org/)** — Cross-platform desktop framework
- **Native Windows notifications** via Electron's Notification API
- **Canvas API** for dynamic tray icon rendering
- **No additional runtime dependencies** — just Electron

## License

[BSD 2-Clause](../LICENSE)
