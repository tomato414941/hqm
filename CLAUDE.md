# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HQM is a TUI dashboard for monitoring multiple Claude Code and Codex sessions in real-time on Linux.

Based on: https://github.com/onikan27/claude-code-monitor It uses Claude Code hooks to track session activity and displays status in a terminal interface.

## Commands

```bash
npm run build          # Compile TypeScript
npm run dev            # Run TUI in watch mode (tsx)
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run lint           # Check with Biome
npm run lint:fix       # Auto-fix lint issues
npm run typecheck      # Type check without emitting
```

Run a single test file:
```bash
npx vitest run tests/file-store.test.ts
```

## Architecture

### Hook Flow
Claude Code triggers hooks → `hqm hook <event>` CLI receives JSON via stdin → `handler.ts` validates and parses → `file-store.ts` updates `~/.hqm/sessions.json`

Supported hook events: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SessionEnd`

### Codex Flow
Dashboard `N` key → `createNewSession('codex')` opens tmux window → `registerCodexSession()` in `file-store.ts` creates session entry → `codex/registry.ts` maps session IDs to transcript paths under `~/.codex/sessions/`

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
  - `file-store.ts` - Session persistence with debounced writes
  - `display-order.ts` - Display order management (session/project ordering)
  - `project-store.ts` - Project CRUD operations
- `src/components/` - Ink/React TUI components
- `src/setup/` - Configures hooks in `~/.claude/settings.json`
- `src/server/` - HTTP/WebSocket server for mobile Web UI
- `public/` - Static files for mobile Web UI

### Session Data
Sessions are keyed by `{session_id}@{tty}` and stored in `~/.hqm/sessions.json` with: status, cwd, last_prompt, current_tool, notification_type, lastMessage, timestamps, projectId.

Projects are stored in `~/.hqm/projects.json` with: id, name, createdAt.

Display order is stored in `~/.hqm/display-order.json` with: sessions (ordered keys), projects (ordered IDs).

Config is stored in `~/.hqm/config.json`.

## Conventions

- ESM only (`.js` extensions in imports required)
- Biome for linting/formatting (single quotes, 2-space indent, 100 char lines)
- Tests in `tests/` directory using Vitest
- React components use `.tsx`, utilities use `.ts`

## Design Notes

### Session clear and project association
- `clearSessions` removes all session items from displayOrder
- New sessions are always added to "ungrouped" after clear
- `assignedCwds` auto-assignment was removed (caused mis-grouping with broad paths like `/home/dev`). New sessions always go to ungrouped; users assign manually. TTY inheritance is preserved.

### Hook events (important — repeated confusion has occurred)
- `Stop` = Claude **completed a response** (fires every turn). NOT `/exit`.
- `SessionEnd` = session terminated (`/exit`, `/clear`, logout). HQM registers this hook.
  - `reason: 'clear'` → session preserved (continues with same ID)
  - `reason: 'prompt_input_exit'` / `'logout'` / others → session removed from store
- HQM's `status: 'stopped'` = "Claude finished responding, waiting for user input"
- Reference: https://code.claude.com/docs/en/hooks

### Removed features
- **AI Summary** (removed): Used `Stop` event to trigger summary generation, causing it to fire every turn. Had `@anthropic-ai/sdk` dependency. If re-implemented, design for "quickly understand ongoing session" purpose, not session-end summaries.

### CWD fallback matching
- `findBestPaneMatch` (CWD-score-based tmux pane matching) is **Codex-only**. Claude Code always provides TTY via hooks, so CWD fallback is unnecessary. Codex sessions ingested from JONL logs may lack TTY.

### Improvement backlog (priority order)
1. Error notification UI (#11): Surface transcript/tmux errors to user.
2. Session auto-archive (#14): Archive instead of delete. Long-term stability.
3. Status filtering (#8): Toggle running/waiting/stopped visibility. Low effort.
4. Command detection bypass fix (#18): Move from regex to parser-based validation.
