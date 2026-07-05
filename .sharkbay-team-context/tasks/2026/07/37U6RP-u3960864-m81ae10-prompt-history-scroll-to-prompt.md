---
kind: sharkbay_task
taskId: 37U6RP-u3960864-m81ae10
taskTag: 37U6RP
mode: task
title: Scroll agent terminal to the recalled prompt on Up/Down history nav
status: completed
actor: SharkUI
githubUserId: 3960864
machine: 81ae10
agent: Kiro Claude Opus 4.8
sessionId: 1e7b2213-41e9-42b5-bed8-af2ac5c4f76c
branch: main
createdAt: 2026-07-05T09:21:48Z
updatedAt: 2026-07-05T12:10:05Z
completedAt: 2026-07-05T12:10:05Z
---

## Summary
When the user presses Up/Down in the prompt input bar to recall a previously
submitted prompt, also scroll the terminal to the position where that prompt was
submitted (behavior A: keep text recall, add terminal jump).

## Files
- src/renderer/App.tsx
- src/renderer/prompt-search.ts
- tests/prompt-search.test.ts
- tsconfig.node.json

## Work
- Confirmed current behavior via CodeGraph: `PromptInputBar` Up/Down runs
  `navigateHistory`, which only recalls history text into the textarea; it does
  not scroll the terminal. `recordPrompt` stores only text (no buffer position),
  and there is no xterm marker/`scrollToLine` wiring today.
- Verified xterm 6 API availability in typings: `registerMarker(offset): IMarker`
  (`.line` is -1 when disposed) and `scrollToLine(line)`.
- Plan (behavior A):
  1. At submit, register an xterm marker at the current cursor line and store it
     alongside the recalled history entry (index-aligned, in-memory only, keyed
     per historyKey; markers paired with their owning terminal instance).
  2. On Up/Down history nav, after recalling text, scroll the active terminal to
     that entry's marker line; going Down back to the live draft scrolls to bottom.
  3. Cancel the P3B7K2 follow-bottom pin window when jumping to an older prompt so
     incoming output does not immediately yank the view back to bottom.
- First attempt (marker-based, REPLACED): registered `terminal.registerMarker(0)`
  at submit and stored it per history entry, then `scrollToLine(marker.line)` on
  recall. User tested in a live packaged app (Kiro agent tab) and saw NO jump.
- Root cause of the failed attempt: the marker anchors to the CURSOR line at
  submit time — i.e., the agent's input widget near the BOTTOM of the screen —
  not to where the prompt text is actually rendered in the conversation. Scrolling
  there stays near the bottom, so it looks like nothing happens. (Earlier
  alternate-buffer theory was wrong: user confirmed the agent tab HAS scrollback,
  i.e. normal buffer.)
- Pivot (per user): borrow how Cmd+F search locates matches. The `SearchAddon`
  (`SearchOverlay`, task FND8K2) uses `findNext`/`findPrevious`, whose internal
  `_selectResult` selects the match and, if off-screen, scrolls with
  `scrollLines(row - viewportY - rows/2)` to CENTER the actual matched text.
- Implemented (search-based) in `src/renderer/App.tsx`:
  - Reverted the marker machinery (removed IMarker import, `markersByKey`,
    marker registration in `submit`, and `scrollToHistoryEntry`).
  - `recordHistory(text)` back to text-only.
  - Added prop `onRecallHistory?: (text: string | null, direction) => void` to
    `PromptInputBar`; `navigateHistory` calls it with the recalled text on Up/Down
    (`null` when returning to the live draft).
  - Parent implements `onRecallHistory` on the active tab's `searchAddon`:
    clears the P3B7K2 follow-bottom pin, then `findPrevious`/`findNext` on the
    prompt's first non-empty line (so it locates + center-scrolls to where the
    prompt was rendered). Draft return does `clearSelection()` + `scrollToBottom()`.
  - Works for persisted/older prompts too, since it searches actual buffer text
    (no in-memory marker needed) — strict improvement over the first attempt.
- Robust matching refinement (user reported full-text search fails when prompts
  are long): matching the whole prompt is unreliable because some agents
  hard-wrap long prompts into multiple lines with a per-line gutter/leading
  spaces, and the wrap width changes with the window. Fix: extract
  `promptSearchKeys(text, cols)` into `src/renderer/prompt-search.ts` — it takes a
  short leading chunk of the prompt's first non-empty line (so any gutter/leading
  spaces sit before the key and a substring match still hits), sized to fit one
  row at the current `terminal.cols` (primary = clamp(cols-12, 16..80)), and
  returns progressively shorter fallback keys (clamped so they never exceed the
  primary) that `onRecallHistory` tries in order until one matches.

## Verification
- `npm run typecheck` — passes (renderer + node projects; added
  `src/renderer/prompt-search.ts` to tsconfig.node.json include, matching the
  existing `workflow.ts` pattern, so the test can typecheck it).
- `npm run build` — passes (tsc + vite production build).
- `npm test` — 57 files / 316 tests passed, including 8 new
  `tests/prompt-search.test.ts` cases (short/long prompts, width clamping, narrow
  terminals, dedupe, non-finite cols).
- No dangling refs to removed symbols (markersByKey / scrollToHistoryEntry /
  getActiveTerminal / onHistoryJump / registerMarker / IMarker → 0 matches).
- Live behavior to be confirmed by the user after a fresh `npm run pack` + relaunch
  (a running packaged .app does NOT pick up source edits).

## Notes
- Related prior work: H8K2V6 (terminal input history), EK9656 / S4L9H2
  (per-session prompt history split), P3B7K2 (keep-terminal-bottom-on-submit,
  `followBottomUntil`/`pinTerminalToBottom`), T4B9QX (scroll-to-bottom button),
  FND8K2 (Cmd+F search / `SearchAddon`, the mechanism this borrows).
- Why search beats the marker approach: search scrolls to the ACTUAL rendered
  prompt text wherever it landed in scrollback and centers it; a submit-time
  marker only points at the input widget near the bottom. Search also covers
  persisted history, not just in-session prompts.
- Limitations: matches the prompt's first non-empty line as a literal (default
  search opts: case-insensitive, non-regex). Multi-line prompts match on the first
  line; if the agent reformats the echoed text so it no longer matches, no jump
  occurs (text is still recalled). Uses selection highlight only (no persistent
  decorations) to keep lifecycle simple.
- Testing gotcha (confirmed this session): edits require `npm run pack` AFTER the
  change and an app relaunch — packaged Electron apps have no HMR.
- No commit produced: the user did not request one, so no `commits` are recorded.
  Marked completed at the user's request; live in-app behavior still to be
  confirmed after a fresh pack + relaunch.
- Keep `.sharkbay/team-context/` read-only.
