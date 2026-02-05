# HQM

A TUI/Web dashboard for monitoring multiple Claude Code and Codex sessions in real-time on Linux.

## Features

- **TUI Dashboard**: Terminal-based interface using Ink/React
- **Mobile Web UI**: Monitor sessions from your phone via QR code
- **Real-time Updates**: Watches session activity via Claude Code hooks and Codex local logs
- **Session Management**: View status, current tool, and messages for each session
- **Project Management**: Organize sessions into projects

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

Codex sessions are detected automatically from local Codex logs (no setup required).

## Usage

### TUI Dashboard

```bash
hqm
```

#### Keybindings

| Key | Action |
|-----|--------|
| `↑/↓` | Select session/project |
| `j/k` | Reorder session/project |
| `Enter/f` | Focus session |
| `1-9` | Quick select session |
| `d` | Delete session/project |
| `p` | Toggle project management mode |
| `a` | Assign selected session to a project |
| `q/Esc` | Quit |

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
| `hqm clear` | Clear all sessions (default) |
| `hqm clear sessions` | Clear all sessions |
| `hqm clear projects` | Clear all projects |
| `hqm clear all` | Clear both sessions and projects |
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
- Codex CLI (optional)

## Codex Support

HQM reads Codex session logs from your local Codex state directory (`CODEX_HOME`, defaults to `~/.codex`).
Because Codex does not expose hook events, session end detection relies on inactivity timeout
(`hqm config timeout`) if you want sessions to auto-expire.

Set `HQM_DISABLE_CODEX=1` to disable Codex log ingestion.
To avoid scanning old Codex logs on startup, set `HQM_CODEX_RECENT_MINUTES` (or set a non-zero
`hqm config timeout`, which is used as the default active window when the env var is not set).

## Credits

This project is based on [claude-code-monitor](https://github.com/onikan27/claude-code-monitor) by [@onikan27](https://github.com/onikan27).

## License

MIT
