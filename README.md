# HQM

A TUI/Web dashboard for monitoring multiple Claude Code and Codex sessions in real-time on Linux.

## Features

- **TUI Dashboard**: Terminal-based interface using Ink/React
- **Mobile Web UI**: Monitor sessions from your phone via QR code
- **Real-time Updates**: Watches session activity via Claude Code hooks
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

Codex sessions can be launched directly from the dashboard with `N` key (no separate setup required).

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
| `n` | Launch new Claude Code session |
| `N` | Launch new Codex session |
| `q/Esc` | Quit |

### Mobile Web UI

```bash
hqm serve
```

Scan the QR code with your phone to access the web interface.

#### Manual Verification (Markdown Fail-Safe)

When validating the fallback path for missing `purify.min.js`, use this checklist:

1. Temporarily rename `public/lib/purify.min.js` so it is not served.
2. Start the web UI with `hqm serve` and open the session modal containing assistant markdown.
3. Confirm markdown is rendered as escaped text (and line breaks only), not as executable HTML.
4. Restore `public/lib/purify.min.js` after verification.

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

## Requirements

- Linux
- Node.js >= 18
- Claude Code CLI
- Codex CLI (optional)

## Codex Support

Codex sessions can be launched directly from the HQM dashboard by pressing `N`.
HQM creates a new tmux window running `codex`, registers the session, and tracks its transcript
from the local Codex state directory (`CODEX_HOME`, defaults to `~/.codex`).

Set `HQM_DISABLE_CODEX=1` to disable Codex support.

## Credits

This project is based on [claude-code-monitor](https://github.com/onikan27/claude-code-monitor) by [@onikan27](https://github.com/onikan27).

## License

MIT
