# Today Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A calm, fast, single-page "Today" website: tasks, habits, focus timer, streak, carry-over.

**Architecture:** Pure state logic in `logic.js` (no DOM; immutable functions on a plain JSON state), unit-tested with Node's built-in test runner. `app.js` renders the DOM from state and persists it to localStorage. Classic `<script>` tags (not ES modules) so `index.html` works when opened straight from disk.

**Tech Stack:** HTML, CSS, vanilla JS. Tests: `node --test` (Node 26). No dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-today-website-design.md`

## Global Constraints
- No build step, no npm dependencies; opens from `file://`.
- Data in localStorage key `today.v1`; every read/write wrapped in try/catch.
- No accounts, sync, notifications, ads.
- Light + dark mode (`prefers-color-scheme` + manual toggle), usable at 360px width with no horizontal scroll.

## Review Focus
1. Corrupt or missing saved data → app starts fresh instead of crashing (test `loadState` with `"{bad"`, `null`, `"[]"`).
2. Empty / whitespace-only task text → ignored; very long text → trimmed to 200 chars.
3. Crossing midnight or opening after several days away → day key changes; carry-over offers tasks from the most recent earlier day only.
4. Streak when today has no completed task yet → counts from yesterday (not reset to 0 until a full day is missed).
5. localStorage blocked (private mode) → page still works for the session.

---

### Task 1: State logic (`logic.js`)

**Files:**
- Create: `logic.js`
- Test: `tests/logic.test.js`

**Interfaces — Produces** (exposed as `globalThis.TodayLogic` and `module.exports`):
- `dayKey(date: Date) -> "YYYY-MM-DD"` (local time)
- `createState() -> { version: 1, days: { [key]: { tasks: Task[], habits: { [habitId]: number } } }, habits: Habit[] }`
  - `Task = { id: string, text: string, done: boolean }`, `Habit = { id, emoji, name, goal }`; defaults: water 💧 goal 8, read 📖 goal 1, move 🏃 goal 1
- `loadState(raw: string|null) -> State` (invalid → `createState()`)
- `addTask(state, key, text) -> State`
- `toggleTask(state, key, id) -> State`, `deleteTask(state, key, id) -> State`
- `bumpHabit(state, key, habitId) -> State` (count+1; past goal wraps to 0)
- `carryOverSource(state, key) -> { from: string, tasks: Task[] } | null` (unfinished tasks of the latest day key < `key`; null if none)
- `carryOver(state, fromKey, toKey) -> State` (copies unfinished tasks with new ids, removes them from `fromKey`)
- `streak(state, key) -> number`
- `formatTime(seconds: number) -> "MM:SS"`

- [ ] **Step 1: Write failing tests** in `tests/logic.test.js` using `node:test` + `node:assert/strict`:
  - `dayKey(new Date(2026, 0, 5))` → `"2026-01-05"`
  - `loadState("{bad")`, `loadState(null)`, `loadState("[]")` each deepEqual `createState()`
  - `addTask(s,"2026-11-11","  hi  ")` → one task text `"hi"`, done false; `addTask` with `"   "` → no task; 250-char text → length 200
  - toggle flips `done`; delete removes; input state is not mutated
  - `bumpHabit` water ×8 → 8, ×9 → 0
  - `carryOverSource`: days 11-09 (1 open) and 11-10 (1 open, 1 done), key 11-11 → `{from:"2026-11-10", tasks:[open one]}`; with no prior days → null
  - `carryOver` moves the open task into 11-11 and out of 11-10
  - `streak`: done tasks on 11-09, 11-10, none yet 11-11 → 2; plus one done on 11-11 → 3; gap at 11-10 → today-only count
  - `formatTime(1500)` → `"25:00"`, `formatTime(65)` → `"01:05"`
- [ ] **Step 2:** Run `node --test tests/` → FAIL (module not found).
- [ ] **Step 3:** Implement `logic.js` with the signatures above. IDs: `Date.now().toString(36) + Math.random().toString(36).slice(2,6)`.
- [ ] **Step 4:** Run `node --test tests/` → all pass.
- [ ] **Step 5:** `git init` (if needed), commit `feat: add Today state logic`.

### Task 2: Page, styles, and UI wiring

**Files:**
- Create: `index.html`, `styles.css`, `app.js`

**Interfaces — Consumes:** everything in `TodayLogic` from Task 1.

- [ ] **Step 1:** `index.html`: `<title>Today</title>`, header (date, streak 🔥 N, theme toggle), greeting by time of day ("Good morning/afternoon/evening."), carry-over banner (hidden unless `carryOverSource` non-null: "N unfinished from <weekday>. [Bring them] [Dismiss]"), task list, add form (input + Enter), habits row, focus timer (25:00, Start/Pause/Reset), "all done" celebration message. Loads `logic.js` then `app.js` with classic `<script defer>`.
- [ ] **Step 2:** `styles.css`: tokens on `:root` (warm off-white bg, ink text, one accent), dark tokens via `prefers-color-scheme` and `[data-theme="dark"]`; system font stack; max-width ~560px centered column, 16px side gutter; check-off animation (circle fills, text fades + strikes); `prefers-reduced-motion` disables animations.
- [ ] **Step 3:** `app.js`: `save()`/`load()` wrapped in try/catch on key `today.v1`; `render()` rebuilds from state; re-check day key every minute and on `visibilitychange`; keyboard: `n` focuses add input, `Esc` blurs; timer uses end-timestamp (not tick counting) so it stays accurate when the tab is in background; on finish show "Focus session done ✓" and update `document.title`.
- [ ] **Step 4:** Verify in browser: open `index.html`, add 3 tasks, complete one (animation plays), reload (persists), bump habits, start/pause timer, toggle dark mode, resize to 375px (no horizontal scroll), no console errors.
- [ ] **Step 5:** Commit `feat: add Today page and UI`.
