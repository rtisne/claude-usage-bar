# Claude Usage Bar

A lightweight macOS menu bar app that shows your Anthropic API usage at a glance.

## Install

### Homebrew (recommended)

```sh
brew install --cask <user>/tap/claude-usage-bar
```

### Manual download

1. Download `ClaudeUsageBar.zip` from the [latest release](https://github.com/USER/claude-usage-bar/releases/latest)
2. Extract and drag `ClaudeUsageBar.app` to `/Applications`
3. On first launch: right-click the app → **Open** (required for ad-hoc signed apps)

### Build from source

Requires Xcode 15+ / Swift 5.9+ and macOS 14+.

```sh
make app            # build .app bundle
make install        # copy to /Applications
```

## Usage

On first launch the app opens a browser window for Anthropic OAuth sign-in. After authorizing, it lives in the menu bar and displays your current billing-period usage. Click the icon to see a breakdown.

## Development

```sh
make build          # release build only
make app            # build + create .app bundle
make zip            # build + bundle + zip for distribution
make clean          # remove build artifacts
```
