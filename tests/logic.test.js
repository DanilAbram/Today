const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const withDay = (state, key, tasks) => ({
  ...state,
  days: { ...state.days, [key]: { tasks, habits: {} } },
});
const T = (id, text, done) => ({ id, text, done });

test('dayKey formats local date', () => {
  assert.equal(L.dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(L.dayKey(new Date(2026, 10, 11, 23, 59)), '2026-11-11');
});

test('loadState falls back on bad data', () => {
  for (const raw of ['{bad', null, '[]', '42', '{"version":2}']) {
    assert.deepEqual(L.loadState(raw), L.createState());
  }
});

test('loadState round-trips a valid state', () => {
  const s = L.addTask(L.createState(), '2026-11-11', 'hi');
  assert.deepEqual(L.loadState(JSON.stringify(s)), s);
});

test('addTask trims, ignores empty, caps length', () => {
  const s0 = L.createState();
  const s1 = L.addTask(s0, '2026-11-11', '  hi  ');
  assert.equal(s1.days['2026-11-11'].tasks.length, 1);
  assert.equal(s1.days['2026-11-11'].tasks[0].text, 'hi');
  assert.equal(s1.days['2026-11-11'].tasks[0].done, false);
  assert.equal(L.addTask(s0, '2026-11-11', '   '), s0);
  const long = L.addTask(s0, '2026-11-11', 'x'.repeat(250));
  assert.equal(long.days['2026-11-11'].tasks[0].text.length, 200);
  assert.deepEqual(s0, L.createState(), 'input not mutated');
});

test('toggleTask and deleteTask', () => {
  const s1 = L.addTask(L.createState(), 'd', 'a');
  const id = s1.days.d.tasks[0].id;
  const s2 = L.toggleTask(s1, 'd', id);
  assert.equal(s2.days.d.tasks[0].done, true);
  assert.equal(s1.days.d.tasks[0].done, false, 'input not mutated');
  assert.equal(L.toggleTask(s2, 'd', id).days.d.tasks[0].done, false);
  assert.equal(L.deleteTask(s2, 'd', id).days.d.tasks.length, 0);
});

test('bumpHabit counts up and stops at the goal', () => {
  let s = L.createState();
  for (let i = 0; i < 8; i++) s = L.bumpHabit(s, 'd', 'water');
  assert.equal(s.days.d.habits.water, 8);
  assert.equal(L.bumpHabit(s, 'd', 'water'), s);
});

test('carryOverSource finds latest earlier day with open tasks', () => {
  let s = L.createState();
  s = withDay(s, '2026-11-09', [T('a', 'old', false)]);
  s = withDay(s, '2026-11-10', [T('b', 'open', false), T('c', 'done', true)]);
  assert.deepEqual(L.carryOverSource(s, '2026-11-11'), {
    from: '2026-11-10',
    tasks: [T('b', 'open', false)],
  });
  assert.equal(L.carryOverSource(L.createState(), '2026-11-11'), null);
  // later day with nothing open -> null
  const s2 = withDay(L.createState(), '2026-11-10', [T('c', 'done', true)]);
  assert.equal(L.carryOverSource(s2, '2026-11-11'), null);
  // future days ignored
  const s3 = withDay(L.createState(), '2026-11-12', [T('z', 'f', false)]);
  assert.equal(L.carryOverSource(s3, '2026-11-11'), null);
});

test('carryOver moves open tasks', () => {
  let s = withDay(L.createState(), '2026-11-10', [T('b', 'open', false), T('c', 'done', true)]);
  s = L.carryOver(s, '2026-11-10', '2026-11-11');
  assert.deepEqual(s.days['2026-11-10'].tasks, [T('c', 'done', true)]);
  assert.equal(s.days['2026-11-11'].tasks.length, 1);
  assert.equal(s.days['2026-11-11'].tasks[0].text, 'open');
  assert.notEqual(s.days['2026-11-11'].tasks[0].id, 'b');
});

test('streak counts consecutive days with a done task', () => {
  let s = L.createState();
  s = withDay(s, '2026-11-09', [T('a', 'x', true)]);
  s = withDay(s, '2026-11-10', [T('b', 'x', true)]);
  assert.equal(L.streak(s, '2026-11-11'), 2);
  const s2 = withDay(s, '2026-11-11', [T('c', 'x', true)]);
  assert.equal(L.streak(s2, '2026-11-11'), 3);
  let gap = withDay(L.createState(), '2026-11-09', [T('a', 'x', true)]);
  gap = withDay(gap, '2026-11-11', [T('c', 'x', true)]);
  assert.equal(L.streak(gap, '2026-11-11'), 1);
  assert.equal(L.streak(L.createState(), '2026-11-11'), 0);
  // across month boundary
  let m = withDay(L.createState(), '2026-10-31', [T('a', 'x', true)]);
  m = withDay(m, '2026-11-01', [T('b', 'x', true)]);
  assert.equal(L.streak(m, '2026-11-01'), 2);
});

test('dayStats counts done and total', () => {
  const s = withDay(L.createState(), 'd', [T('a', 'x', true), T('b', 'y', false)]);
  assert.deepEqual(L.dayStats(s, 'd'), { done: 1, total: 2 });
  assert.deepEqual(L.dayStats(s, 'none'), { done: 0, total: 0 });
});

test('bestStreak finds the longest run', () => {
  assert.equal(L.bestStreak(L.createState()), 0);
  let s = L.createState();
  for (const k of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-05', '2026-11-06']) {
    s = withDay(s, k, [T(k, 'x', true)]);
  }
  s = withDay(s, '2026-11-02', [T('n', 'x', false)]); // open only, does not count
  assert.equal(L.bestStreak(s), 3);
});

test('monthGrid is Monday-first and padded to whole weeks', () => {
  const nov = L.monthGrid(2026, 10); // Nov 2026 starts on a Sunday
  assert.equal(nov.length % 7, 0);
  assert.deepEqual(nov[0], { key: '2026-10-26', day: 26, inMonth: false });
  assert.deepEqual(nov[6], { key: '2026-11-01', day: 1, inMonth: true });
  assert.equal(nov.filter((c) => c.inMonth).length, 30);
  const feb = L.monthGrid(2028, 1); // leap year
  assert.equal(feb.filter((c) => c.inMonth).length, 29);
  assert.equal(feb.length % 7, 0);
});

test('editTask changes text, ignores blank', () => {
  const s1 = L.addTask(L.createState(), 'd', 'old');
  const id = s1.days.d.tasks[0].id;
  assert.equal(L.editTask(s1, 'd', id, '  new  ').days.d.tasks[0].text, 'new');
  assert.equal(L.editTask(s1, 'd', id, '   '), s1);
  assert.equal(L.editTask(s1, 'd', id, 'y'.repeat(300)).days.d.tasks[0].text.length, 200);
});

test('unbumpHabit never goes below zero', () => {
  let s = L.bumpHabit(L.createState(), 'd', 'water');
  s = L.unbumpHabit(s, 'd', 'water');
  assert.equal(s.days.d.habits.water, 0);
  s = L.unbumpHabit(s, 'd', 'water');
  assert.equal(s.days.d.habits.water, 0);
});

test('addFocus counts sessions; old saves read as 0', () => {
  const s0 = L.createState();
  assert.equal(L.getDay(s0, 'd').focus || 0, 0);
  const s = L.addFocus(L.addFocus(s0, 'd'), 'd');
  assert.equal(s.days.d.focus, 2);
});

test('parseMinutes accepts 1-180 whole minutes', () => {
  assert.equal(L.parseMinutes('25'), 25);
  assert.equal(L.parseMinutes(' 7 '), 7);
  assert.equal(L.parseMinutes('12.6'), 13);
  assert.equal(L.parseMinutes('1'), 1);
  assert.equal(L.parseMinutes('180'), 180);
  for (const bad of ['0', '-5', '181', '', 'abc', null, undefined, '1e9']) {
    assert.equal(L.parseMinutes(bad), null, String(bad));
  }
});

test('formatTime handles an hour or more', () => {
  assert.equal(L.formatTime(3600), '60:00');
  assert.equal(L.formatTime(180 * 60), '180:00');
});

test('habit catalog has 12 popular habits incl. the defaults', () => {
  assert.equal(L.HABIT_CATALOG.length, 12);
  const ids = L.HABIT_CATALOG.map((h) => h.id);
  assert.equal(new Set(ids).size, 12);
  for (const id of ['water', 'read', 'move']) assert.ok(ids.includes(id));
  for (const h of L.HABIT_CATALOG) assert.ok(h.name && h.goal >= 1 && h.icon.startsWith('i-'));
});

test('addHabit adds once, respects the limit', () => {
  const med = L.HABIT_CATALOG.find((h) => h.id === 'meditate');
  const s0 = L.createState();
  const s1 = L.addHabit(s0, med);
  assert.equal(s1.habits.length, 4);
  assert.equal(s1.habits[3].id, 'meditate');
  assert.equal(L.addHabit(s1, med), s1, 'no duplicates');
  assert.equal(s0.habits.length, 3, 'input not mutated');
  let full = s0;
  for (const h of L.HABIT_CATALOG) full = L.addHabit(full, h);
  assert.equal(full.habits.length, L.MAX_HABITS);
});

test('removeHabit removes but keeps history', () => {
  let s = L.bumpHabit(L.createState(), 'd', 'water');
  s = L.removeHabit(s, 'water');
  assert.ok(!s.habits.some((h) => h.id === 'water'));
  assert.equal(s.days.d.habits.water, 1);
});

test('makeCustomHabit validates name and goal', () => {
  const h = L.makeCustomHabit('  Stretch  ', '3');
  assert.equal(h.name, 'Stretch');
  assert.equal(h.goal, 3);
  assert.equal(h.icon, 'i-custom');
  assert.ok(h.id.startsWith('c-'));
  assert.equal(L.makeCustomHabit('   ', '1'), null);
  assert.equal(L.makeCustomHabit('x'.repeat(40), '').name.length, 24);
  assert.equal(L.makeCustomHabit('A', '').goal, 1);
  assert.equal(L.makeCustomHabit('A', '99').goal, 20);
  assert.equal(L.makeCustomHabit('A', '0').goal, 1);
});

test('habitInfo finds active, catalog, or nothing', () => {
  const s = L.removeHabit(L.createState(), 'water');
  assert.equal(L.habitInfo(s, 'read').name, 'Read');
  assert.equal(L.habitInfo(s, 'water').name, 'Water');
  assert.equal(L.habitInfo(s, 'nope'), null);
});

// helpers for habit history: set a habit count on a given day
const setHabit = (s, key, id, n) => {
  const day = L.getDay(s, key);
  return { ...s, days: { ...s.days, [key]: { ...day, habits: { ...day.habits, [id]: n } } } };
};
const daysBack = (key, n) => { const [y, m, d] = key.split('-').map(Number); return L.dayKey(new Date(y, m - 1, d - n)); };

test('habitDone uses the habit goal', () => {
  let s = setHabit(L.createState(), 'd', 'water', 7);
  assert.equal(L.habitDone(s, 'd', 'water'), false);
  s = setHabit(s, 'd', 'water', 8);
  assert.equal(L.habitDone(s, 'd', 'water'), true);
  assert.equal(L.habitDone(s, 'd', 'read'), false);
});

test('habitStreak counts back from today, or yesterday if today is not done yet', () => {
  const today = '2026-11-11';
  let s = L.createState();
  for (const n of [1, 2, 3]) s = setHabit(s, daysBack(today, n), 'read', 1);
  s = setHabit(s, daysBack(today, 5), 'read', 1);
  assert.equal(L.habitStreak(s, today, 'read'), 3);
  s = setHabit(s, today, 'read', 1);
  assert.equal(L.habitStreak(s, today, 'read'), 4);
  assert.equal(L.habitStreak(s, today, 'move'), 0);
});

test('habitBestStreak finds the longest run, across months', () => {
  let s = L.createState();
  for (const k of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03']) s = setHabit(s, k, 'read', 1);
  s = setHabit(s, '2026-11-02', 'read', 0);
  assert.equal(L.habitBestStreak(s, 'read'), 3);
  assert.equal(L.habitBestStreak(s, 'move'), 0);
});

test('habitWeek returns the last 7 days, oldest first', () => {
  const today = '2026-11-11';
  let s = setHabit(L.createState(), today, 'read', 1);
  s = setHabit(s, daysBack(today, 6), 'read', 1);
  const w = L.habitWeek(s, today, 'read');
  assert.equal(w.length, 7);
  assert.equal(w[0].key, daysBack(today, 6));
  assert.equal(w[6].key, today);
  assert.deepEqual(w.map((d) => d.done), [true, false, false, false, false, false, true]);
});

test('habitStrength rises with practice, forgives a single miss, stays 0..100', () => {
  const today = '2026-11-11';
  assert.equal(L.habitStrength(L.createState(), today, 'read'), 0);
  let daily = L.createState();
  for (let n = 0; n < 60; n++) daily = setHabit(daily, daysBack(today, n), 'read', 1);
  const strong = L.habitStrength(daily, today, 'read');
  assert.ok(strong >= 90 && strong <= 100, String(strong));
  const missedOne = setHabit(daily, daysBack(today, 1), 'read', 0);
  assert.ok(L.habitStrength(missedOne, today, 'read') >= strong - 6);
  let sometimes = L.createState();
  for (let n = 0; n < 60; n += 3) sometimes = setHabit(sometimes, daysBack(today, n), 'read', 1);
  assert.ok(L.habitStrength(sometimes, today, 'read') < 50);
  // today not done yet does not lower the score
  const notYet = setHabit(daily, today, 'read', 0);
  assert.ok(L.habitStrength(notYet, today, 'read') >= strong - 6);
});

test('perfectDay needs every current habit done', () => {
  let s = L.createState();
  assert.equal(L.perfectDay(s, 'd'), false);
  s = setHabit(setHabit(s, 'd', 'water', 8), 'd', 'read', 1);
  assert.equal(L.perfectDay(s, 'd'), false);
  s = setHabit(s, 'd', 'move', 1);
  assert.equal(L.perfectDay(s, 'd'), true);
  assert.equal(L.perfectDay({ ...s, habits: [] }, 'd'), false);
});

/* ---------- v6: schedules, skips, reorder, weekly, backup, timer ---------- */
const withHabitDays = (s, id, days) => L.setHabitDays(s, id, days);
// 2026-11-09 is a Monday (getDay 1), 2026-11-11 Wednesday (3), 2026-11-10 Tuesday (2)

test('setHabitDays stores sorted weekdays, ignores empty, clears when every day', () => {
  let s = withHabitDays(L.createState(), 'move', [5, 1, 3, 3]);
  assert.deepEqual(s.habits.find((h) => h.id === 'move').days, [1, 3, 5]);
  assert.equal(L.setHabitDays(s, 'move', []), s);
  s = withHabitDays(s, 'move', [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(s.habits.find((h) => h.id === 'move').days, undefined);
});

test('isScheduled and toggleSkip make a day excused', () => {
  let s = withHabitDays(L.createState(), 'move', [1, 3, 5]); // Mon Wed Fri
  assert.equal(L.isScheduled(s, '2026-11-10', 'move'), false); // Tue
  assert.equal(L.isScheduled(s, '2026-11-11', 'move'), true); // Wed
  assert.equal(L.habitStatus(s, '2026-11-10', 'move'), 'rest');
  s = L.toggleSkip(s, '2026-11-11', 'read');
  assert.equal(L.isSkipped(s, '2026-11-11', 'read'), true);
  assert.equal(L.habitStatus(s, '2026-11-11', 'read'), 'skip');
  s = L.toggleSkip(s, '2026-11-11', 'read');
  assert.equal(L.isSkipped(s, '2026-11-11', 'read'), false);
});

test('rest and skip days do not break streaks or count toward them', () => {
  let s = withHabitDays(L.createState(), 'move', [1, 3, 5]);
  s = setHabit(s, '2026-11-06', 'move', 1); // Fri
  s = setHabit(s, '2026-11-09', 'move', 1); // Mon
  s = setHabit(s, '2026-11-11', 'move', 1); // Wed
  assert.equal(L.habitStreak(s, '2026-11-11', 'move'), 3);
  assert.equal(L.habitBestStreak(s, 'move'), 3);
  let r = setHabit(L.createState(), '2026-11-09', 'read', 1);
  r = L.toggleSkip(r, '2026-11-10', 'read');
  assert.equal(L.habitStreak(r, '2026-11-11', 'read'), 1, 'today not done yet, skip bridges to Monday');
  // skipping all days never loops forever
  let only = L.toggleSkip(L.createState(), '2026-11-11', 'read');
  assert.equal(L.habitStreak(only, '2026-11-11', 'read'), 0);
});

test('perfectDay only needs habits that are due', () => {
  let s = withHabitDays(L.createState(), 'move', [1]); // Monday only
  s = setHabit(setHabit(s, '2026-11-11', 'water', 8), '2026-11-11', 'read', 1);
  assert.equal(L.perfectDay(s, '2026-11-11'), true);
  s = L.toggleSkip(s, '2026-11-12', 'water');
  s = setHabit(s, '2026-11-12', 'read', 1);
  assert.equal(L.perfectDay(s, '2026-11-12'), true);
  assert.deepEqual(L.habitsDue(s, '2026-11-12').map((h) => h.id), ['read']);
});

test('habitWeek reports status per day', () => {
  let s = withHabitDays(L.createState(), 'move', [1, 3, 5]);
  s = setHabit(s, '2026-11-09', 'move', 1);
  const w = L.habitWeek(s, '2026-11-11', 'move'); // Thu 11-05 .. Wed 11-11
  assert.deepEqual(w.map((d) => d.status), ['rest', 'missed', 'rest', 'rest', 'done', 'rest', 'missed']);
  assert.equal(w[4].done, true);
  assert.equal(w[6].done, false);
});

test('habitStrength ignores rest days', () => {
  const today = '2026-11-11';
  let weekdays = withHabitDays(L.createState(), 'move', [1, 2, 3, 4, 5]);
  for (let n = 0; n < 60; n++) {
    const k = daysBack(today, n);
    if (L.isScheduled(weekdays, k, 'move')) weekdays = setHabit(weekdays, k, 'move', 1);
  }
  assert.ok(L.habitStrength(weekdays, today, 'move') >= 90);
});

test('moveTask reorders within a day', () => {
  let s = L.createState();
  for (const t of ['a', 'b', 'c']) s = L.addTask(s, 'd', t);
  const ids = s.days.d.tasks.map((t) => t.id);
  s = L.moveTask(s, 'd', ids[2], 0);
  assert.deepEqual(s.days.d.tasks.map((t) => t.text), ['c', 'a', 'b']);
  s = L.moveTask(s, 'd', ids[2], 99);
  assert.deepEqual(s.days.d.tasks.map((t) => t.text), ['a', 'b', 'c']);
  assert.equal(L.moveTask(s, 'd', 'nope', 0), s);
});

test('weekSummary totals the last 7 days', () => {
  let w = L.createState();
  w = { ...w, days: {
    '2026-11-11': { tasks: [T('a', 'x', true), T('b', 'y', false)], habits: { water: 8, read: 1, move: 1 }, focus: 2 },
    '2026-11-08': { tasks: [T('c', 'x', true)], habits: { read: 1 }, focus: 1 },
    '2026-11-01': { tasks: [T('d', 'x', true)], habits: {}, focus: 5 }, // outside the week
  } };
  const sum = L.weekSummary(w, '2026-11-11');
  assert.equal(sum.tasksDone, 2);
  assert.equal(sum.focus, 3);
  assert.equal(sum.perfectDays, 1);
  assert.equal(sum.activeDays, 2);
  assert.deepEqual(sum.topHabit, { id: 'read', days: 2 });
});

test('backup export/import round-trips and rejects junk', () => {
  const s = L.addTask(L.createState(), '2026-11-11', 'keep me');
  const text = L.exportData(s);
  assert.deepEqual(L.importData(text), s);
  assert.deepEqual(L.importData(JSON.stringify(s)), s, 'bare state also accepted');
  for (const bad of ['', 'nope', '{}', '[]', JSON.stringify({ app: 'today', state: { version: 9 } })]) {
    assert.equal(L.importData(bad), null, bad);
  }
});

test('restoreTimer resumes, pauses, or finishes a saved timer', () => {
  const now = 1_000_000;
  assert.deepEqual(L.restoreTimer(null, now, 1500), { total: 1500, remaining: 1500, running: false, endAt: 0, finished: false });
  const running = L.restoreTimer({ total: 600, remaining: 600, running: true, endAt: now + 120_000 }, now, 1500);
  assert.equal(running.running, true);
  assert.equal(running.endAt, now + 120_000);
  const done = L.restoreTimer({ total: 600, remaining: 600, running: true, endAt: now - 1 }, now, 1500);
  assert.deepEqual(done, { total: 600, remaining: 600, running: false, endAt: 0, finished: true });
  const paused = L.restoreTimer({ total: 600, remaining: 200, running: false, endAt: 0 }, now, 1500);
  assert.equal(paused.remaining, 200);
  const junk = L.restoreTimer({ total: 'x', remaining: -5 }, now, 1500);
  assert.equal(junk.total, 1500);
  assert.equal(junk.remaining, 1500);
});

test('formatTime', () => {
  assert.equal(L.formatTime(1500), '25:00');
  assert.equal(L.formatTime(65), '01:05');
  assert.equal(L.formatTime(0), '00:00');
  assert.equal(L.formatTime(-3), '00:00');
});
