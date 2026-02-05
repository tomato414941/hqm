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

Supported hook events: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`

### Codex Flow
Codex writes JSONL logs under `~/.codex/sessions` → `codex/ingest.ts` tails log updates → `file-store.ts` updates `~/.hqm/sessions.json`
Startup ingestion can be limited with `HQM_CODEX_RECENT_MINUTES` (or non-zero `hqm config timeout`).

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
Sessions are keyed by `{session_id}@{tty}` and stored in `~/.hqm/sessions.json` with: status, cwd, last_prompt, current_tool, notification_type, lastMessage, summary, timestamps, projectId.

Projects are stored in `~/.hqm/projects.json` with: id, name, createdAt.

Display order is stored in `~/.hqm/display-order.json` with: sessions (ordered keys), projects (ordered IDs).

Config is stored in `~/.hqm/config.json`.

## Conventions

- ESM only (`.js` extensions in imports required)
- Biome for linting/formatting (single quotes, 2-space indent, 100 char lines)
- Tests in `tests/` directory using Vitest
- React components use `.tsx`, utilities use `.ts`

## Known Issues / Future Improvements

### Path truncation in SessionCard
- **Location**: SessionCard.tsx:51
- **Issue**: `dir` variable has no length limit, long paths can break layout
- **Solution**: Apply `truncateText(abbreviateHomePath(session.cwd), 40)`

### Project list j/k reorder logic improvement
- **Current**: `handleReorderProject()` explicitly updates index (Dashboard.tsx:362-375)
- **Issue**: Cursor moves first, then project moves ~0.5s later (timing mismatch)
- **Improvement**: Unify with session list approach
  - Keep `selectedProjectId` (key) and recalculate index
  - Session list keeps `selectedSessionKey` and recalculates `selectedIndex` via useMemo

### Session clear loses project association
- **Current**: `clearSessions` removes all session items from displayOrder
- **Issue**: New sessions are added to "ungrouped" since previous association is lost
- **Root cause**: No persistent session→project mapping exists
- **Solution**: Store cwd→project mapping in Project (`assignedCwds` field)
