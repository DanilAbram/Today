/* Today — pure state logic. No DOM. Works in the browser (TodayLogic) and Node (module.exports). */
(function (root) {
  'use strict';

  const MAX_TEXT = 200;
  const MAX_HABITS = 8;
  const MAX_HABIT_NAME = 24;
  const MAX_HABIT_GOAL = 20;
  const HABIT_CATALOG = [
    { id: 'water', name: 'Water', goal: 8, icon: 'i-water' },
    { id: 'read', name: 'Read', goal: 1, icon: 'i-read' },
    { id: 'move', name: 'Move', goal: 1, icon: 'i-move' },
    { id: 'meditate', name: 'Meditate', goal: 1, icon: 'i-meditate' },
    { id: 'sleep', name: 'Sleep early', goal: 1, icon: 'i-sleep' },
    { id: 'wake', name: 'Wake early', goal: 1, icon: 'i-wake' },
    { id: 'journal', name: 'Journal', goal: 1, icon: 'i-journal' },
    { id: 'language', name: 'Language', goal: 1, icon: 'i-language' },
    { id: 'music', name: 'Music', goal: 1, icon: 'i-music' },
    { id: 'call', name: 'Call family', goal: 1, icon: 'i-call' },
    { id: 'tidy', name: 'Tidy up', goal: 1, icon: 'i-tidy' },
    { id: 'gratitude', name: 'Gratitude', goal: 3, icon: 'i-gratitude' },
  ];
  const DEFAULT_HABITS = HABIT_CATALOG.slice(0, 3);

  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function shiftKey(key, days) {
    const d = parseKey(key);
    d.setDate(d.getDate() + days);
    return dayKey(d);
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createState() {
    return { version: 1, days: {}, habits: DEFAULT_HABITS.map((h) => ({ ...h })) };
  }

  function isValid(s) {
    return (
      s && typeof s === 'object' && !Array.isArray(s) &&
      s.version === 1 &&
      s.days && typeof s.days === 'object' && !Array.isArray(s.days) &&
      Array.isArray(s.habits)
    );
  }

  function loadState(raw) {
    if (raw == null) return createState();
    try {
      const s = JSON.parse(raw);
      return isValid(s) ? s : createState();
    } catch (e) {
      return createState();
    }
  }

  function getDay(state, key) {
    return state.days[key] || { tasks: [], habits: {} };
  }

  function withDay(state, key, day) {
    return { ...state, days: { ...state.days, [key]: day } };
  }

  function addTask(state, key, text) {
    const clean = String(text || '').trim().slice(0, MAX_TEXT);
    if (!clean) return state;
    const day = getDay(state, key);
    return withDay(state, key, { ...day, tasks: [...day.tasks, { id: newId(), text: clean, done: false }] });
  }

  function toggleTask(state, key, id) {
    const day = getDay(state, key);
    return withDay(state, key, {
      ...day,
      tasks: day.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    });
  }

  function deleteTask(state, key, id) {
    const day = getDay(state, key);
    return withDay(state, key, { ...day, tasks: day.tasks.filter((t) => t.id !== id) });
  }

  function bumpHabit(state, key, habitId) {
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) return state;
    const day = getDay(state, key);
    const next = (day.habits[habitId] || 0) + 1;
    if (next > habit.goal) return state;
    return withDay(state, key, { ...day, habits: { ...day.habits, [habitId]: next } });
  }

  function carryOverSource(state, key) {
    const earlier = Object.keys(state.days).filter((k) => k < key).sort();
    const latest = earlier[earlier.length - 1];
    if (!latest) return null;
    const open = state.days[latest].tasks.filter((t) => !t.done);
    return open.length ? { from: latest, tasks: open } : null;
  }

  function carryOver(state, fromKey, toKey) {
    const from = getDay(state, fromKey);
    const to = getDay(state, toKey);
    const open = from.tasks.filter((t) => !t.done);
    const s = withDay(state, fromKey, { ...from, tasks: from.tasks.filter((t) => t.done) });
    return withDay(s, toKey, { ...to, tasks: [...to.tasks, ...open.map((t) => ({ ...t, id: newId() }))] });
  }

  function hasDone(state, key) {
    return getDay(state, key).tasks.some((t) => t.done);
  }

  function streak(state, key) {
    let cursor = hasDone(state, key) ? key : shiftKey(key, -1);
    let count = 0;
    while (hasDone(state, cursor)) {
      count++;
      cursor = shiftKey(cursor, -1);
    }
    return count;
  }

  function editTask(state, key, id, text) {
    const clean = String(text || '').trim().slice(0, MAX_TEXT);
    if (!clean) return state;
    const day = getDay(state, key);
    return withDay(state, key, {
      ...day,
      tasks: day.tasks.map((t) => (t.id === id ? { ...t, text: clean } : t)),
    });
  }

  function unbumpHabit(state, key, habitId) {
    const day = getDay(state, key);
    const next = Math.max(0, (day.habits[habitId] || 0) - 1);
    return withDay(state, key, { ...day, habits: { ...day.habits, [habitId]: next } });
  }

  function addFocus(state, key) {
    const day = getDay(state, key);
    return withDay(state, key, { ...day, focus: (day.focus || 0) + 1 });
  }

  function dayStats(state, key) {
    const tasks = getDay(state, key).tasks;
    return { done: tasks.filter((t) => t.done).length, total: tasks.length };
  }

  function bestStreak(state) {
    const keys = Object.keys(state.days).filter((k) => hasDone(state, k)).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      run = prev && shiftKey(prev, 1) === k ? run + 1 : 1;
      if (run > best) best = run;
      prev = k;
    }
    return best;
  }

  function monthGrid(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const daysIn = new Date(year, monthIndex + 1, 0).getDate();
    const cells = Math.ceil((lead + daysIn) / 7) * 7;
    const out = [];
    for (let i = 0; i < cells; i++) {
      const d = new Date(year, monthIndex, 1 - lead + i);
      out.push({ key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === monthIndex });
    }
    return out;
  }

  function addHabit(state, habit) {
    if (!habit || state.habits.some((h) => h.id === habit.id) || state.habits.length >= MAX_HABITS) return state;
    const { id, name, goal, icon } = habit;
    return { ...state, habits: [...state.habits, { id, name, goal, icon }] };
  }

  function removeHabit(state, id) {
    return { ...state, habits: state.habits.filter((h) => h.id !== id) };
  }

  function makeCustomHabit(name, goal) {
    const clean = String(name || '').trim().slice(0, MAX_HABIT_NAME);
    if (!clean) return null;
    const n = Math.round(Number(goal));
    const g = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_HABIT_GOAL) : 1;
    return { id: 'c-' + newId(), name: clean, goal: g, icon: 'i-custom' };
  }

  function habitInfo(state, id) {
    return state.habits.find((h) => h.id === id) || HABIT_CATALOG.find((h) => h.id === id) || null;
  }

  /* ---------- Schedules (which weekdays) and skip days ---------- */
  function setHabitDays(state, id, days) {
    const clean = [...new Set((days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (!clean.length) return state;
    return {
      ...state,
      habits: state.habits.map((h) => {
        if (h.id !== id) return h;
        const next = { ...h };
        if (clean.length === 7) delete next.days; else next.days = clean;
        return next;
      }),
    };
  }

  function isScheduled(state, key, id) {
    const h = habitInfo(state, id);
    return !h || !Array.isArray(h.days) || h.days.includes(parseKey(key).getDay());
  }

  function isSkipped(state, key, id) {
    const skips = getDay(state, key).skips;
    return !!(skips && skips[id]);
  }

  function toggleSkip(state, key, id) {
    const day = getDay(state, key);
    const skips = { ...(day.skips || {}) };
    if (skips[id]) delete skips[id]; else skips[id] = true;
    return withDay(state, key, { ...day, skips });
  }

  /* ---------- Habit history (per-habit streaks, week, strength, perfect days) ---------- */
  function habitDone(state, key, id) {
    const info = habitInfo(state, id);
    return !!info && (getDay(state, key).habits[id] || 0) >= info.goal;
  }

  function isExcused(state, key, id) {
    return !isScheduled(state, key, id) || isSkipped(state, key, id);
  }

  // 'done' | 'rest' (not a scheduled day) | 'skip' | 'missed'
  function habitStatus(state, key, id) {
    if (habitDone(state, key, id)) return 'done';
    if (!isScheduled(state, key, id)) return 'rest';
    if (isSkipped(state, key, id)) return 'skip';
    return 'missed';
  }

  function earliestKey(state) {
    let min = null;
    for (const k of Object.keys(state.days)) if (min === null || k < min) min = k;
    return min;
  }

  function habitStreak(state, key, id) {
    const first = earliestKey(state);
    if (!first) return 0;
    let n = habitDone(state, key, id) ? 1 : 0;
    let cursor = shiftKey(key, -1);
    while (cursor >= first) {
      const st = habitStatus(state, cursor, id);
      if (st === 'done') n++;
      else if (st === 'missed') break;
      cursor = shiftKey(cursor, -1);
    }
    return n;
  }

  function habitBestStreak(state, id) {
    const keys = Object.keys(state.days).sort();
    if (!keys.length) return 0;
    const last = keys[keys.length - 1];
    let best = 0, run = 0;
    for (let k = keys[0]; k <= last; k = shiftKey(k, 1)) {
      const st = habitStatus(state, k, id);
      if (st === 'done') { run++; if (run > best) best = run; }
      else if (st === 'missed') run = 0;
    }
    return best;
  }

  function habitWeek(state, key, id) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const k = shiftKey(key, -i);
      const status = habitStatus(state, k, id);
      out.push({ key: k, done: status === 'done', status });
    }
    return out;
  }

  function habitsDue(state, key) {
    return state.habits.filter((h) => !isExcused(state, key, h.id));
  }

  // Strength in the style of Loop Habit Tracker: exponential smoothing with a ~13-day half-life,
  // so one missed day costs little but frequent misses pull the score down. Today only counts once done.
  const STRENGTH_WINDOW = 120;
  const STRENGTH_KEEP = Math.pow(0.5, 1 / 13);
  function habitStrength(state, key, id) {
    let s = 0;
    for (let i = STRENGTH_WINDOW - 1; i >= 0; i--) {
      const k = shiftKey(key, -i);
      const done = habitDone(state, k, id);
      if (i === 0 && !done) break;
      if (!done && isExcused(state, k, id)) continue; // rest and skip days don't count against you
      s = s * STRENGTH_KEEP + (done ? 1 - STRENGTH_KEEP : 0);
    }
    return Math.round(s * 100);
  }

  function perfectDay(state, key) {
    const due = habitsDue(state, key);
    return due.length > 0 && due.every((h) => habitDone(state, key, h.id));
  }

  /* ---------- Tasks: reorder ---------- */
  function moveTask(state, key, id, toIndex) {
    const day = getDay(state, key);
    const from = day.tasks.findIndex((t) => t.id === id);
    if (from < 0) return state;
    const tasks = [...day.tasks];
    const [t] = tasks.splice(from, 1);
    tasks.splice(Math.max(0, Math.min(toIndex, tasks.length)), 0, t);
    return withDay(state, key, { ...day, tasks });
  }

  /* ---------- Weekly review ---------- */
  function weekSummary(state, key) {
    let tasksDone = 0, focus = 0, perfectDays = 0, activeDays = 0;
    const habitDays = {};
    for (let i = 0; i < 7; i++) {
      const k = shiftKey(key, -i);
      const day = getDay(state, k);
      const done = day.tasks.filter((t) => t.done).length;
      tasksDone += done;
      if (done) activeDays++;
      focus += day.focus || 0;
      if (perfectDay(state, k)) perfectDays++;
      for (const h of state.habits) if (habitDone(state, k, h.id)) habitDays[h.id] = (habitDays[h.id] || 0) + 1;
    }
    let topHabit = null;
    for (const h of state.habits) {
      const n = habitDays[h.id] || 0;
      if (n && (!topHabit || n > topHabit.days)) topHabit = { id: h.id, days: n };
    }
    return { tasksDone, focus, perfectDays, activeDays, topHabit };
  }

  /* ---------- Backup ---------- */
  function exportData(state) {
    return JSON.stringify({ app: 'today', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
  }

  function importData(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return null; }
    const candidate = obj && obj.app === 'today' && obj.state ? obj.state : obj;
    if (!isValid(candidate)) return null;
    const daysOk = Object.values(candidate.days).every((d) => d && Array.isArray(d.tasks) && d.habits && typeof d.habits === 'object');
    const habitsOk = candidate.habits.every((h) => h && typeof h.id === 'string' && typeof h.name === 'string' && h.goal >= 1);
    return daysOk && habitsOk ? candidate : null;
  }

  /* ---------- Focus timer persistence ---------- */
  function restoreTimer(saved, now, defaultTotal) {
    const okTotal = saved && Number.isFinite(saved.total) && saved.total >= 60 && saved.total <= 180 * 60;
    const total = okTotal ? saved.total : defaultTotal;
    const okRemaining = okTotal && Number.isFinite(saved.remaining) && saved.remaining > 0 && saved.remaining <= total;
    const remaining = okRemaining ? saved.remaining : total;
    if (okTotal && saved.running && Number.isFinite(saved.endAt)) {
      if (saved.endAt <= now) return { total, remaining: total, running: false, endAt: 0, finished: true };
      return { total, remaining, running: true, endAt: saved.endAt, finished: false };
    }
    return { total, remaining, running: false, endAt: 0, finished: false };
  }

  const MIN_FOCUS = 1, MAX_FOCUS = 180;
  function parseMinutes(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Math.round(Number(s));
    return n >= MIN_FOCUS && n <= MAX_FOCUS ? n : null;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  const api = {
    dayKey, createState, loadState, addTask, toggleTask, deleteTask,
    bumpHabit, carryOverSource, carryOver, streak, formatTime, getDay, MAX_TEXT,
    editTask, unbumpHabit, addFocus, dayStats, bestStreak, monthGrid,
    parseMinutes, MIN_FOCUS, MAX_FOCUS,
    HABIT_CATALOG, MAX_HABITS, MAX_HABIT_NAME, MAX_HABIT_GOAL, addHabit, removeHabit, makeCustomHabit, habitInfo,
    habitDone, habitStreak, habitBestStreak, habitWeek, habitStrength, perfectDay,
    setHabitDays, isScheduled, isSkipped, toggleSkip, habitStatus, habitsDue,
    moveTask, weekSummary, exportData, importData, restoreTimer, shiftKey,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodayLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
