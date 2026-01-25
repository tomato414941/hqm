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
| `hqm` | Start TUI dashboard (runs setup if first time) |
| `hqm watch` / `hqm w` | Start TUI dashboard |
| `hqm serve [-p port]` | Start mobile web server only |
| `hqm list` / `hqm ls` | List all sessions |
| `hqm clear` | Clear all sessions |
| `hqm setup` | Register hooks with Claude Code |
| `hqm config timeout [min]` | Get/set session timeout (0=disabled) |
| `hqm config summary` | Manage AI summary (see below) |

### AI Summary

Generate automatic summaries when sessions end using Claude API.

```bash
hqm config summary setup     # Configure API key
hqm config summary enable    # Enable summaries
hqm config summary disable   # Disable summaries
hqm config summary           # Show current config
```

Requires an Anthropic API key. Uses `claude-haiku-4-20250514` by default.

## Requirements

- Linux
- Node.js >= 18
- Claude Code CLI

## Credits

This project is based on [claude-code-monitor](https://github.com/onikan27/claude-code-monitor) by [@onikan27](https://github.com/onikan27).

## License

MIT
