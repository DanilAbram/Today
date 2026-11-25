# Today — daily focus website (short design)

## Intent
A calm, fast, single-page website that answers "what matters today?". Inspired by the traits of
great apps (Things 3 calm, Duolingo habit loop, Linear speed) — an original design, not a copy.
Approved by the user in chat on 2026-11-11 ("lets do it", then "website, first one").

## Goals
- Plan today on one screen: add, complete, delete tasks.
- Small daily habits with progress (e.g. water 3/4).
- Built-in 25-minute focus timer.
- Streak: consecutive days with at least one completed task.
- Unfinished tasks from a previous day are offered to carry over.
- Light + dark mode, works on phone and desktop, keyboard friendly.

## Non-goals
- Accounts, sync, sharing, notifications, ads.

## Anti-goals
- Feeling cluttered or slow; nagging the user.

## Constraints
- Opens straight from a file / any static host. No build step, no dependencies.
- Data lives in the browser (localStorage), wrapped so the page still works if storage is blocked.

## Approaches
1. **Plain HTML/CSS/JS, single folder (picked).** Zero setup, instant load, easy to host anywhere.
2. React + Vite. More structure, but needs Node and a build step — overkill for one screen.
3. Hosted backend with accounts. Enables sync, but violates "no friction" and adds cost.

## Decided
- Files: `index.html`, `styles.css`, `app.js` in the project root.
- Warm off-white / soft dark palette, one accent color, large readable type.
- Check-off animation; small celebration when every task is done.

## Left to the builder
- Exact palette, fonts (system stack), animation details, default habits.
