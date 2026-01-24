# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HQM is a TUI dashboard for monitoring multiple Claude Code sessions in real-time on Linux.

Based on: https://github.com/onikan27/claude-code-monitor It uses Claude Code hooks to track session activity and displays status in a terminal interface.

## Commands

```bash
npm run build          # Compile TypeScript
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run lint           # Check with Biome
npm run lint:fix       # Auto-fix lint issues
npm run typecheck      # Type check without emitting
npm run dev            # Run TUI in watch mode (tsx)
```

Run a single test file:
```bash
npx vitest run tests/file-store.test.ts
```

## Architecture

### Hook Flow
Claude Code triggers hooks → `hqm hook <event>` CLI receives JSON via stdin → `handler.ts` validates and parses → `file-store.ts` updates `~/.hqm/sessions.json`

Supported hook events: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`

### TUI Flow
`Dashboard.tsx` renders with Ink → `useSessions.ts` watches `sessions.json` with chokidar → `SessionCard.tsx` displays each session

### Web UI Flow
`src/server/index.ts` starts HTTP + WebSocket server → chokidar watches `sessions.json` → broadcasts to connected clients → `public/index.html` renders mobile UI

Key files:
- `src/server/index.ts` - HTTP/WebSocket server, session broadcasting
- `public/index.html` - Mobile-optimized SPA (vanilla JS)

The web UI displays `session.lastMessage || session.last_prompt` for each session.

### Key Directories
- `src/bin/` - CLI entry point (commander)
- `src/hook/` - Hook event handler (receives from Claude Code)
- `src/store/` - Session persistence with debounced writes
- `src/components/` - Ink/React TUI components
- `src/setup/` - Configures hooks in `~/.claude/settings.json`
- `src/server/` - HTTP/WebSocket server for mobile Web UI
- `public/` - Static files for mobile Web UI

### Session Data
Sessions are keyed by `{session_id}@{tty}` and stored with: status, cwd, last_prompt, current_tool, notification_type, timestamps.

## Conventions

- ESM only (`.js` extensions in imports required)
- Biome for linting/formatting (single quotes, 2-space indent, 100 char lines)
- Tests in `tests/` directory using Vitest
- React components use `.tsx`, utilities use `.ts`
