# HQM

A TUI/Web dashboard for monitoring multiple Claude Code sessions in real-time on Linux.

## Features

- **TUI Dashboard**: Terminal-based interface using Ink/React
- **Mobile Web UI**: Monitor sessions from your phone via QR code
- **Real-time Updates**: Watches session activity via Claude Code hooks
- **Session Management**: View status, current tool, and messages for each session

## Installation

```bash
npm install -g hqm
```

## Setup

Register HQM hooks with Claude Code:

```bash
hqm setup
```

This adds hooks to `~/.claude/settings.json`.

## Usage

### TUI Dashboard

```bash
hqm
```

### Mobile Web UI

```bash
hqm serve
```

Scan the QR code with your phone to access the web interface.

### Available Commands

| Command | Description |
|---------|-------------|
| `hqm` | Start TUI dashboard |
| `hqm serve` | Start mobile web server |
| `hqm setup` | Register hooks with Claude Code |
| `hqm hook <event>` | Handle hook events (internal) |

## Requirements

- Linux
- Node.js >= 18
- Claude Code CLI

## Credits

This project is based on [claude-code-monitor](https://github.com/onikan27/claude-code-monitor) by [@onikan27](https://github.com/onikan27).

## License

MIT
