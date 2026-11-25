/* Today — DOM wiring. Depends on i18n.js (TodayI18n) and logic.js (TodayLogic). */
(function () {
  'use strict';
  const L = window.TodayLogic;
  const I = window.TodayI18n;
  const t = I.t, pl = I.pl;

  const KEY = 'today.v1';
  const DISMISS_KEY = 'today.carryDismissed';
  const FOCUS_KEY = 'today.focusMinutes';
  const TIMER_KEY = 'today.timer';
  const PREFS_KEY = 'today.prefs';
  const WELCOME_KEY = 'today.welcomed';
  const REMINDED_KEY = 'today.remindedOn';
  const SIZES = ['set.size0', 'set.size1', 'set.size2'];

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: keep in memory */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const readJSON = (k) => { try { return JSON.parse(store.get(k) || 'null'); } catch (e) { return null; } };

  let state = L.loadState(store.get(KEY));
  let today = L.dayKey(new Date());
  let carryDismissed = store.get(DISMISS_KEY);
  let justToggled = null;
  let view = 'today'; // which task list: 'today' | 'tomorrow'

  /* ---------- Preferences ---------- */
  const prefs = Object.assign({ size: 0, contrast: false, motion: false, sound: true, lang: '', remind: '' }, readJSON(PREFS_KEY) || {});
  if (!prefs.lang) prefs.lang = I.detect(navigator.languages && navigator.languages.length ? [...navigator.languages] : navigator.language);
  I.setLang(prefs.lang);

  function savePrefs() { store.set(PREFS_KEY, JSON.stringify(prefs)); }
  function applyPrefs() {
    if (prefs.size) root.dataset.size = prefs.size; else delete root.dataset.size;
    if (prefs.contrast) root.dataset.contrast = 'high'; else delete root.dataset.contrast;
    if (prefs.motion) root.dataset.motion = 'reduce'; else delete root.dataset.motion;
    root.lang = I.getLang();
  }
  const calmMotion = () => prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Helpers ---------- */
  function commit(next) {
    state = next;
    store.set(KEY, JSON.stringify(state));
    render();
  }
  function icon(id) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const loc = () => I.locale();
  const upFirst = (s) => s.charAt(0).toLocaleUpperCase(loc()) + s.slice(1);
  const asDate = (key) => new Date(key + 'T12:00');
  const longDate = (key) => upFirst(asDate(key).toLocaleDateString(loc(), { weekday: 'long', month: 'long', day: 'numeric' }));
  const isCatalog = (id) => L.HABIT_CATALOG.some((c) => c.id === id);
  const habitName = (h) => (isCatalog(h.id) ? t('habit.' + h.id) : h.name);
  const iconFor = (h) => h.icon || (L.HABIT_CATALOG.find((c) => c.id === h.id) || {}).icon || 'i-custom';
  const tomorrow = () => L.shiftKey(today, 1);
  const viewKey = () => (view === 'today' ? today : tomorrow());
  // Weekdays Monday-first; JS weekday numbers (0 = Sunday).
  const WEEK = [1, 2, 3, 4, 5, 6, 0];
  const weekdayName = (d, style) => upFirst(new Date(2024, 0, 7 + d).toLocaleDateString(loc(), { weekday: style }));
  function say(text) { const s = $('sr-status'); s.textContent = ''; requestAnimationFrame(() => { s.textContent = text; }); }

  function minutesLabel(min) {
    if (min < 60) return t('len.min', { m: min });
    const h = Math.floor(min / 60), m = min % 60;
    if (m) return t('len.hm', { h, m });
    return h === 1 ? t('len.hour') : t('len.hours', { h });
  }

  /* Static text in the page: data-i18n (text), -ph (placeholder), -aria (aria-label), -title. */
  function applyStatic() {
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
    for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));
    for (const n of document.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
    for (const c of document.querySelectorAll('#focus-chips .chip')) c.textContent = minutesLabel(Number(c.dataset.min));
    $('cal-week').textContent = '';
    for (const d of WEEK) $('cal-week').appendChild(el('span', null, weekdayName(d, 'narrow')));
    // Language menus list every language in its own name.
    for (const sel of [$('set-lang'), $('welcome-lang')]) {
      if (!sel.options.length) {
        for (const [code, name] of Object.entries(I.LANGS)) {
          const o = el('option', null, name);
          o.value = code;
          o.lang = code;
          sel.appendChild(o);
        }
      }
      sel.value = I.getLang();
    }
  }

  /* ---------- Press feedback: ripple from the touch point ---------- */
  const PRESSABLE = '.btn, .icon-btn, .chip, .pick, .habit-main, .habit-tool, .streak, .tab, .day, .round-btn, .switch, .add-icon, .day-chip';
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest(PRESSABLE);
    if (!b || b.disabled || calmMotion()) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const rp = el('span', 'ripple');
    rp.style.width = rp.style.height = size + 'px';
    rp.style.left = e.clientX - r.left - size / 2 + 'px';
    rp.style.top = e.clientY - r.top - size / 2 + 'px';
    b.classList.add('has-ripple');
    b.appendChild(rp);
    rp.addEventListener('animationend', () => rp.remove());
    setTimeout(() => rp.remove(), 900);
  }, { passive: true });

  /* ---------- Toast with undo ---------- */
  let toastTimer = 0, toastUndo = null;
  function showToast(text, onUndo) {
    $('toast-text').textContent = text;
    toastUndo = onUndo;
    $('toast-undo').hidden = !onUndo;
    $('toast').classList.toggle('plain', !onUndo);
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, onUndo ? 6000 : 4500);
  }
  function hideToast() { $('toast').hidden = true; toastUndo = null; }
  $('toast-undo').addEventListener('click', () => { const fn = toastUndo; hideToast(); if (fn) fn(); });

  /* ---------- Celebration sparks ---------- */
  function sparks(fromEl) {
    if (calmMotion() || !fromEl) return;
    const r = fromEl.getBoundingClientRect();
    const box = $('sparks');
    for (let i = 0; i < 14; i++) {
      const s = el('span', 'spark');
      s.style.left = r.left + r.width / 2 - 3 + 'px';
      s.style.top = r.top + r.height / 2 - 3 + 'px';
      s.style.setProperty('--dx', Math.round(Math.random() * 140 - 70) + 'px');
      s.style.setProperty('--dy', Math.round(-40 - Math.random() * 100) + 'px');
      s.style.animationDelay = Math.round(Math.random() * 150) + 'ms';
      box.appendChild(s);
      setTimeout(() => s.remove(), 1700);
    }
  }

  /* ---------- Header ---------- */
  function renderHeader() {
    const tasks = L.getDay(state, today).tasks;
    $('date').textContent = longDate(today);
    const h = new Date().getHours();
    const hello = t(h < 5 ? 'greet.late' : h < 12 ? 'greet.morning' : h < 18 ? 'greet.afternoon' : 'greet.evening');
    const done = tasks.filter((x) => x.done).length;
    const left = tasks.length - done;
    const g = $('greeting');
    g.textContent = '';
    if (tasks.length && !left) g.append(hello + ' ', el('span', 'warm', t('greet.allDone')));
    else if (!tasks.length) g.textContent = hello + ' ' + t('greet.empty');
    else g.textContent = hello + ' ' + (left === 1 ? t('greet.oneLeft') : t('greet.left', { things: pl(left, 'thingLeft') }));

    const n = L.streak(state, today);
    $('streak-n').textContent = n;
    $('streak').classList.toggle('on', n > 0);
    $('streak').setAttribute('aria-label', t('streak.aria', { days: pl(n, 'day') }));

    const f = L.getDay(state, today).focus || 0;
    $('focus-count').textContent = f ? t('focus.count', { n: f }) : '';
  }

  /* ---------- Tasks ---------- */
  function setView(next, focusTab) {
    view = next;
    for (const tab of document.querySelectorAll('.tab')) {
      const on = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focusTab) tab.focus();
    }
    $('task-panel').setAttribute('aria-labelledby', 'tab-' + view);
    $('add-input').placeholder = t(view === 'today' ? 'add.placeholder' : 'add.placeholderTomorrow');
    render();
  }
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => setView(tab.dataset.view));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setView(view === 'today' ? 'tomorrow' : 'today', true);
      }
    });
  }

  function renderCarry() {
    const box = $('carry');
    const src = view === 'today' ? L.carryOverSource(state, today) : null;
    if (!src || carryDismissed === today) { box.hidden = true; return; }
    const when = asDate(src.from).toLocaleDateString(loc(), { weekday: 'long' });
    const n = src.tasks.length;
    $('carry-text').textContent = upFirst(t('carry.text', { tasks: pl(n, 'unfinishedTask'), day: when }));
    $('carry-yes').textContent = t(n === 1 ? 'carry.yesOne' : 'carry.yesMany');
    box.hidden = false;
  }

  function startEdit(li, task) {
    const span = li.querySelector('.task-text');
    if (!span || li.classList.contains('editing')) return;
    const key = viewKey();
    const input = el('input', 'edit-input');
    input.value = task.text;
    input.maxLength = L.MAX_TEXT;
    input.setAttribute('aria-label', t('task.editField'));
    li.classList.add('editing');
    span.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) commit(L.editTask(state, key, task.id, input.value)); else render();
      const again = $('task-list').querySelector(`[data-id="${task.id}"] .edit`);
      if (again) again.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function moveBy(task, delta) {
    const key = viewKey();
    const tasks = L.getDay(state, key).tasks;
    const from = tasks.findIndex((x) => x.id === task.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= tasks.length) return;
    commit(L.moveTask(state, key, task.id, to));
    const again = $('task-list').querySelector(`[data-id="${task.id}"] .drag`);
    if (again) again.focus();
    say(t('task.moved', { n: to + 1 }));
  }

  /* Pointer drag on the handle: the row follows the finger, the others slide out of the way. */
  function startDrag(e, li, task) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const list = $('task-list');
    const rows = [...list.querySelectorAll('.task')];
    const from = rows.indexOf(li);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const step = rows.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
    const startY = e.clientY;
    let to = from;
    li.classList.add('dragging');
    list.classList.add('sorting');
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dy = Math.max(rects[0].top - rects[from].top, Math.min(rects[rects.length - 1].top - rects[from].top, ev.clientY - startY));
      li.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
      rows.forEach((r, i) => {
        if (r === li) return;
        const shift = from < to && i > from && i <= to ? -step : from > to && i < from && i >= to ? step : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      list.classList.remove('sorting');
      rows.forEach((r) => { r.style.transform = ''; r.classList.remove('dragging'); });
      if (to !== from) {
        commit(L.moveTask(state, viewKey(), task.id, to));
        say(t('task.moved', { n: to + 1 }));
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function renderTasks() {
    const key = viewKey();
    const tasks = L.getDay(state, key).tasks;
    const isToday = view === 'today';
    const done = tasks.filter((x) => x.done).length;

    $('tab-today-n').textContent = L.getDay(state, today).tasks.filter((x) => !x.done).length || '';
    $('tab-tomorrow-n').textContent = L.getDay(state, tomorrow()).tasks.length || '';
    $('task-progress').hidden = !isToday || !tasks.length;
    $('task-count').textContent = tasks.length ? t('tasks.count', { done, total: tasks.length }) : '';
    $('task-bar').style.transform = `scaleX(${tasks.length ? done / tasks.length : 0})`;

    const list = $('task-list');
    list.textContent = '';
    if (!tasks.length) list.appendChild(el('li', 'empty', t(isToday ? 'tasks.empty' : 'tasks.emptyTomorrow')));

    tasks.forEach((task, idx) => {
      const li = el('li', 'task' + (task.done ? ' done' : '') + (task.id === justToggled ? ' pop' : '') + (isToday ? '' : ' later'));
      li.dataset.id = task.id;

      if (tasks.length > 1) {
        const drag = el('button', 'icon-btn drag');
        drag.type = 'button';
        drag.setAttribute('aria-label', task.text + '. ' + t('task.drag'));
        drag.appendChild(icon('i-drag'));
        drag.addEventListener('pointerdown', (e) => startDrag(e, li, task));
        drag.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveBy(task, e.key === 'ArrowUp' ? -1 : 1); }
        });
        li.appendChild(drag);
      }

      if (isToday) {
        const check = el('button', 'check');
        check.type = 'button';
        check.setAttribute('role', 'checkbox');
        check.setAttribute('aria-checked', String(task.done));
        check.setAttribute('aria-label', task.text);
        check.appendChild(icon('i-check'));
        check.addEventListener('click', () => {
          const before = L.dayStats(state, today);
          justToggled = task.done ? null : task.id;
          commit(L.toggleTask(state, today, task.id));
          const after = L.dayStats(state, today);
          const again = list.querySelector(`[data-id="${task.id}"] .check`);
          if (again) again.focus();
          if (after.total && after.done === after.total && before.done !== before.total) sparks(again);
        });
        li.appendChild(check);
      } else {
        li.appendChild(el('span', 'bullet'));
      }

      const text = el('span', 'task-text', task.text);
      text.addEventListener('dblclick', () => startEdit(li, task));

      const tools = el('span', 'task-tools');
      const edit = el('button', 'icon-btn edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', t('task.edit', { text: task.text }));
      edit.title = t('task.editField');
      edit.appendChild(icon('i-edit'));
      edit.addEventListener('click', () => startEdit(li, task));

      const del = el('button', 'icon-btn del');
      del.type = 'button';
      del.setAttribute('aria-label', t('task.delete', { text: task.text }));
      del.appendChild(icon('i-x'));
      del.addEventListener('click', () => {
        commit(L.deleteTask(state, key, task.id));
        $('add-input').focus();
        showToast(t('task.deleted', { text: task.text }), () => {
          const d = L.getDay(state, key);
          if (d.tasks.some((x) => x.id === task.id)) return;
          const restored = [...d.tasks];
          restored.splice(Math.min(idx, restored.length), 0, task);
          commit({ ...state, days: { ...state.days, [key]: { ...d, tasks: restored } } });
        });
      });
      tools.append(edit, del);
      li.append(text, tools);

      li.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !li.classList.contains('editing')) {
          e.preventDefault();
          moveBy(task, e.key === 'ArrowUp' ? -1 : 1);
        }
      });
      list.appendChild(li);
    });
    justToggled = null;
  }

  /* ---------- Habits ---------- */
  function changeHabit(id, fn) {
    const wasPerfect = L.perfectDay(state, today);
    state = fn(state, today, id);
    store.set(KEY, JSON.stringify(state));
    render(id);
    if (!wasPerfect && L.perfectDay(state, today)) {
      sparks($('habit-list').querySelector(`[data-id="${CSS.escape(id)}"]`));
      showToast(t('habit.perfectToast'), null);
    }
  }

  function renderHabits(bounceId) {
    const box = $('habit-list');
    const hadFocus = document.activeElement && box.contains(document.activeElement)
      ? { id: document.activeElement.closest('.habit').dataset.id, cls: document.activeElement.classList[0] } : null;
    box.textContent = '';
    const counts = L.getDay(state, today).habits;
    $('habit-tip').hidden = !state.habits.length;
    if (!state.habits.length) box.appendChild(el('p', 'no-habits', t('habits.none')));

    for (const h of state.habits) {
      const c = counts[h.id] || 0;
      const status = L.habitStatus(state, today, h.id);
      const name = habitName(h);
      const card = el('div', 'habit' + (c >= h.goal ? ' full' : '') + (h.id === bounceId ? ' bounce' : '') +
        (status === 'rest' ? ' rest' : '') + (status === 'skip' ? ' skipped' : ''));
      card.dataset.id = h.id;

      const main = el('button', 'habit-main');
      main.type = 'button';
      const run = L.habitStreak(state, today, h.id);
      const runText = run ? t('habit.streak', { days: pl(run, 'day') }) : t('habit.noStreak');
      main.setAttribute('aria-label', t('habit.aria', { name, c, goal: h.goal, streak: runText }) +
        (status === 'rest' ? ' ' + t('habit.rest') + '.' : status === 'skip' ? ' ' + t('habit.skipped') + '.' : ''));
      main.disabled = c >= h.goal;

      const body = el('span', 'habit-body');
      const title = el('span', 'habit-name');
      title.append(icon(iconFor(h)), el('span', 'habit-label', name), el('span', 'habit-count', `${c}/${h.goal}`));
      const dots = el('span', 'dots');
      for (let d = 0; d < h.goal; d++) dots.appendChild(el('i', d < c ? 'on' : ''));
      const foot = el('span', 'habit-foot');
      const week = el('span', 'week');
      week.setAttribute('aria-hidden', 'true');
      for (const d of L.habitWeek(state, today, h.id)) {
        const sq = el('i', d.status + (d.key === today ? ' now' : ''));
        sq.title = asDate(d.key).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' });
        week.appendChild(sq);
      }
      const note = status === 'rest' ? t('habit.rest') : status === 'skip' ? t('habit.skipped') : run ? pl(run, 'day') : '—';
      foot.append(week, el('span', 'habit-run' + (run && status !== 'rest' && status !== 'skip' ? ' on' : ''), note));
      body.append(title, dots, foot);
      main.append(body);
      main.addEventListener('click', () => changeHabit(h.id, L.bumpHabit));
      main.addEventListener('contextmenu', (e) => { e.preventDefault(); changeHabit(h.id, L.unbumpHabit); });

      const tools = el('span', 'habit-tools');
      const more = el('button', 'habit-tool more');
      more.type = 'button';
      more.setAttribute('aria-label', t('habit.more', { name }));
      more.setAttribute('aria-haspopup', 'dialog');
      more.appendChild(icon('i-more'));
      more.addEventListener('click', () => openHabitSheet(h.id));
      const minus = el('button', 'habit-tool minus');
      minus.type = 'button';
      minus.setAttribute('aria-label', t('habit.minus', { name }));
      minus.disabled = c === 0;
      minus.appendChild(icon('i-minus'));
      minus.addEventListener('click', () => changeHabit(h.id, L.unbumpHabit));
      tools.append(more, minus);

      card.append(main, tools);
      box.appendChild(card);
    }

    if (hadFocus) {
      const card = box.querySelector(`[data-id="${CSS.escape(hadFocus.id)}"]`);
      const target = card && (card.querySelector('.' + hadFocus.cls + ':not(:disabled)') || card.querySelector('button:not(:disabled)'));
      if (target) target.focus();
    }
  }

  function render(bounceHabit) {
    renderHeader();
    renderCarry();
    renderTasks();
    renderHabits(bounceHabit);
    const perfect = L.perfectDay(state, today);
    $('habit-note').textContent = perfect ? t('habits.perfect') : '';
    $('habit-note').classList.toggle('warm', perfect);
    if (!$('habit-set').hidden) renderHabitPicker();
    if ($('cal').open) renderCal();
    if ($('habit-sheet').open) renderHabitSheet();
  }

  /* ---------- Habit picker ---------- */
  function renderHabitPicker(focusId) {
    const box = $('habit-catalog');
    box.textContent = '';
    const active = new Set(state.habits.map((h) => h.id));
    const full = state.habits.length >= L.MAX_HABITS;
    $('habit-limit').textContent = t('habits.limit', { n: state.habits.length, max: L.MAX_HABITS });
    const customs = state.habits.filter((h) => !isCatalog(h.id));
    for (const h of [...L.HABIT_CATALOG, ...customs]) {
      const on = active.has(h.id);
      const name = habitName(h);
      const b = el('button', 'pick');
      b.type = 'button';
      b.dataset.id = h.id;
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !on && full;
      b.setAttribute('aria-label', h.goal > 1 ? t('habit.timesPerDay', { name, n: h.goal }) : name);
      b.title = on ? t('habits.tapRemove') : full ? t('habits.full', { max: L.MAX_HABITS }) : t('habits.tapAdd');
      const tick = icon('i-check');
      tick.classList.add('tick');
      b.append(icon(iconFor(h)), el('span', 'pick-name', name), tick);
      b.addEventListener('click', () => {
        $('habit-err').textContent = '';
        commit(on ? L.removeHabit(state, h.id) : L.addHabit(state, isCatalog(h.id) ? { ...h, name } : h));
        renderHabitPicker(h.id);
      });
      box.appendChild(b);
    }
    if (focusId) {
      const again = box.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      if (again && !again.disabled) again.focus();
    }
  }
  function toggleHabitSet(open) {
    const box = $('habit-set');
    const show = open ?? box.hidden;
    box.hidden = !show;
    $('habit-edit').setAttribute('aria-expanded', String(show));
    $('habit-err').textContent = '';
    if (show) {
      renderHabitPicker();
      const first = $('habit-catalog').querySelector('.pick:not(:disabled)');
      if (first) first.focus();
    }
  }
  $('habit-edit').addEventListener('click', () => toggleHabitSet());
  $('habit-set').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); toggleHabitSet(false); $('habit-edit').focus(); }
  });
  $('habit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('habit-err');
    if (state.habits.length >= L.MAX_HABITS) { err.textContent = t('habits.errFull', { max: L.MAX_HABITS }); return; }
    const h = L.makeCustomHabit($('habit-name').value, $('habit-goal').value || 1);
    if (!h) { err.textContent = t('habits.errName'); $('habit-name').focus(); return; }
    err.textContent = '';
    commit(L.addHabit(state, h));
    $('habit-name').value = '';
    $('habit-goal').value = '';
    renderHabitPicker();
    $('habit-name').focus();
  });

  /* ---------- Dialogs ---------- */
  const returnFocus = new Map();
  function openDialog(d, from) {
    returnFocus.set(d, from || document.activeElement);
    d.showModal();
  }
  for (const d of document.querySelectorAll('dialog.sheet')) {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => {
      const back = returnFocus.get(d);
      if (back && document.contains(back)) back.focus();
    });
    for (const b of d.querySelectorAll('.sheet-close')) b.addEventListener('click', () => d.close());
  }

  /* ---------- Habit sheet ---------- */
  let sheetHabit = null;
  function openHabitSheet(id) {
    sheetHabit = id;
    renderHabitSheet();
    openDialog($('habit-sheet'));
  }
  function renderHabitSheet() {
    const h = state.habits.find((x) => x.id === sheetHabit);
    if (!h) { $('habit-sheet').close(); return; }
    const c = L.getDay(state, today).habits[h.id] || 0;
    const title = $('hs-title');
    title.textContent = '';
    title.append(icon(iconFor(h)), habitName(h));
    $('hs-count').textContent = t('sheet.today', { c, goal: h.goal });
    $('hs-minus').disabled = c === 0;
    $('hs-plus').disabled = c >= h.goal;
    const skipped = L.isSkipped(state, today, h.id);
    $('hs-skip').setAttribute('aria-pressed', String(skipped));
    $('hs-skip').querySelector('span').textContent = t(skipped ? 'sheet.unskip' : 'sheet.skip');
    const chosen = Array.isArray(h.days) ? h.days : [0, 1, 2, 3, 4, 5, 6];
    const box = $('hs-days');
    const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.d : null;
    box.textContent = '';
    for (const d of WEEK) {
      const on = chosen.includes(d);
      const b = el('button', 'day-chip', weekdayName(d, 'short'));
      b.type = 'button';
      b.dataset.d = d;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', weekdayName(d, 'long'));
      // The last chosen day can't be turned off: a habit needs at least one day.
      b.addEventListener('click', () => {
        if (on && chosen.length === 1) return;
        const next = on ? chosen.filter((x) => x !== d) : [...chosen, d];
        commit(L.setHabitDays(state, h.id, next));
      });
      box.appendChild(b);
    }
    if (focused != null) { const again = box.querySelector(`[data-d="${focused}"]`); if (again) again.focus(); }
  }
  $('hs-plus').addEventListener('click', () => { changeHabit(sheetHabit, L.bumpHabit); if ($('hs-plus').disabled) $('hs-minus').focus(); });
  $('hs-minus').addEventListener('click', () => { changeHabit(sheetHabit, L.unbumpHabit); if ($('hs-minus').disabled) $('hs-plus').focus(); });
  $('hs-skip').addEventListener('click', () => commit(L.toggleSkip(state, today, sheetHabit)));
  $('hs-remove').addEventListener('click', () => {
    const h = state.habits.find((x) => x.id === sheetHabit);
    if (!h) return;
    const before = state;
    $('habit-sheet').close();
    commit(L.removeHabit(state, h.id));
    showToast(t('task.deleted', { text: habitName(h) }), () => commit({ ...state, habits: before.habits }));
  });

  /* ---------- Calendar + weekly review ---------- */
  const cal = { y: 0, m: 0, sel: '' };
  const level = (done) => (done >= 4 ? 'lv3' : done >= 2 ? 'lv2' : done >= 1 ? 'lv1' : '');

  function renderWeek() {
    const w = L.weekSummary(state, today);
    const empty = !w.tasksDone && !w.focus && !w.perfectDays && !w.topHabit;
    $('week-line').textContent = empty ? t('week.empty') : upFirst(t('week.line', {
      tasks: pl(w.tasksDone, 'taskDone'), focus: pl(w.focus, 'focusSession'), perfect: pl(w.perfectDays, 'perfectDay'),
    }));
    const top = w.topHabit && L.habitInfo(state, w.topHabit.id);
    $('week-top').textContent = top ? t('week.top', { name: habitName(top), days: pl(w.topHabit.days, 'day') }) : '';
    $('week-top').hidden = !top;
  }

  function renderCal() {
    const now = new Date();
    $('cal-title').textContent = upFirst(new Date(cal.y, cal.m, 1).toLocaleDateString(loc(), { month: 'long', year: 'numeric' }));
    $('cal-next').disabled = cal.y > now.getFullYear() || (cal.y === now.getFullYear() && cal.m >= now.getMonth());

    const cells = L.monthGrid(cal.y, cal.m);
    const cur = L.streak(state, today);
    const best = L.bestStreak(state);
    const active = cells.filter((c) => c.inMonth && L.dayStats(state, c.key).done > 0).length;
    const stats = $('cal-stats');
    stats.textContent = '';
    if (cur) stats.append(el('strong', null, t('cal.streak', { n: cur })), ' · ' + t('cal.best', { days: pl(best, 'day') }));
    else stats.append(best ? t('cal.noStreak') + ' · ' + t('cal.best', { days: pl(best, 'day') }) : t('cal.start'));
    stats.append(' · ' + t('cal.active', { days: pl(active, 'activeDay') }));
    renderWeek();

    const grid = $('cal-grid');
    grid.textContent = '';
    for (const c of cells) {
      const b = el('button', 'day');
      b.type = 'button';
      if (!c.inMonth) { b.classList.add('out'); b.disabled = true; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); grid.appendChild(b); continue; }
      const { done } = L.dayStats(state, c.key);
      b.textContent = c.day;
      const lv = level(done);
      if (lv) b.classList.add(lv);
      if (c.key === today) b.classList.add('today');
      if (c.key === cal.sel) b.classList.add('sel');
      const perfect = c.key <= today && L.perfectDay(state, c.key);
      if (perfect) b.classList.add('perfect');
      b.disabled = c.key > today;
      b.setAttribute('aria-pressed', String(c.key === cal.sel));
      b.setAttribute('aria-label', t('cal.dayAria', {
        date: longDate(c.key), today: c.key === today ? t('cal.todaySuffix') : '',
        tasks: pl(done, 'task'), perfect: perfect ? t('cal.perfectSuffix') : '',
      }));
      b.addEventListener('click', () => {
        cal.sel = c.key;
        renderCal();
        const again = grid.querySelector('.sel');
        if (again) again.focus();
      });
      grid.appendChild(b);
    }
    renderCalDetail();
  }

  function renderCalDetail() {
    const box = $('cal-detail');
    box.textContent = '';
    const day = L.getDay(state, cal.sel);
    box.appendChild(el('h3', null, cal.sel === today ? t('cal.today') : longDate(cal.sel)));
    if (day.tasks.length) {
      const ul = el('ul');
      for (const x of day.tasks) ul.appendChild(el('li', x.done ? 'done' : '', x.text));
      box.appendChild(ul);
    }
    const bits = Object.keys(day.habits)
      .map((id) => ({ info: L.habitInfo(state, id), n: day.habits[id] }))
      .filter((x) => x.info && x.n > 0)
      .map((x) => `${habitName(x.info)} ${x.n}/${x.info.goal}`);
    if (day.focus) bits.push(pl(day.focus, 'focusSession'));
    if (bits.length) box.appendChild(el('p', 'meta', bits.join(' · ')));
    if (!day.tasks.length && !bits.length) box.appendChild(el('p', 'meta', t('cal.nothing')));
    renderCalHabits();
  }

  function renderCalHabits() {
    const box = $('cal-habits');
    box.textContent = '';
    if (!state.habits.length) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('h3', null, t('strength.title')));
    box.appendChild(el('p', 'meta', t('strength.hint')));
    const ul = el('ul', 'strength-list');
    for (const h of state.habits) {
      const pct = L.habitStrength(state, today, h.id);
      const run = L.habitStreak(state, today, h.id);
      const best = L.habitBestStreak(state, h.id);
      const li = el('li', 'strength');
      const top = el('div', 'strength-top');
      const label = el('span', 'strength-name');
      label.append(icon(iconFor(h)), habitName(h));
      top.append(label, el('span', 'strength-pct', pct + '%'));
      const bar = el('div', 'bar strength-bar');
      const fill = el('i');
      fill.style.transform = `scaleX(${pct / 100})`;
      bar.appendChild(fill);
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-label', t('strength.aria', { name: habitName(h) }));
      li.append(top, bar, el('p', 'strength-meta', t('strength.meta', { days: pl(run, 'day'), best: pl(best, 'day') })));
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  function openCal() {
    const now = new Date();
    cal.y = now.getFullYear(); cal.m = now.getMonth(); cal.sel = today;
    renderCal();
    openDialog($('cal'), $('streak'));
  }
  function shiftMonth(delta) {
    const d = new Date(cal.y, cal.m + delta, 1);
    cal.y = d.getFullYear(); cal.m = d.getMonth();
    renderCal();
  }
  $('streak').addEventListener('click', openCal);
  $('cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('cal-next').addEventListener('click', () => shiftMonth(1));

  /* ---------- Add task, carry-over, keyboard ---------- */
  $('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('add-input');
    commit(L.addTask(state, viewKey(), input.value));
    input.value = '';
    $('add-btn').disabled = true;
    input.focus();
  });
  $('add-form').addEventListener('click', (e) => { if (!e.target.closest('button, input')) $('add-input').focus(); });
  $('add-input').addEventListener('input', (e) => { $('add-btn').disabled = !e.target.value.trim(); });

  $('carry-yes').addEventListener('click', () => {
    const src = L.carryOverSource(state, today);
    if (src) commit(L.carryOver(state, src.from, today));
  });
  $('carry-no').addEventListener('click', () => {
    carryDismissed = today;
    store.set(DISMISS_KEY, today);
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape' && typing) document.activeElement.blur();
    else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      $('add-input').focus();
    }
  });

  /* ---------- Focus timer ----------
     Counts against an end timestamp (accurate in background tabs, survives reloads).
     The progress bar is painted every animation frame so it glides instead of jumping. */
  const startMinutes = L.parseMinutes(store.get(FOCUS_KEY)) || 25;
  const savedTimer = readJSON(TIMER_KEY);
  const restored = L.restoreTimer(savedTimer, Date.now(), startMinutes * 60);
  const timer = { total: restored.total, remaining: restored.remaining, endAt: restored.endAt, running: restored.running, tick: 0, raf: 0, lastText: '' };
  let finishedAway = restored.finished ? L.dayKey(new Date(savedTimer.endAt)) : null;

  function saveTimer() {
    store.set(TIMER_KEY, JSON.stringify({ total: timer.total, remaining: timer.remaining, endAt: timer.endAt, running: timer.running }));
  }
  const secondsLeft = () => (timer.running ? Math.max(0, (timer.endAt - Date.now()) / 1000) : timer.remaining);

  function paintLength() {
    const min = Math.round(timer.total / 60);
    $('timer-len').textContent = minutesLabel(min);
    $('timer-edit').setAttribute('aria-label', t('focus.change', { len: minutesLabel(min) }));
    for (const c of document.querySelectorAll('#focus-chips .chip')) c.setAttribute('aria-pressed', String(Number(c.dataset.min) === min));
  }
  function toggleFocusSet(open) {
    const box = $('focus-set');
    const show = open ?? box.hidden;
    box.hidden = !show;
    $('timer-edit').setAttribute('aria-expanded', String(show));
    $('focus-err').textContent = '';
    if (show) (box.querySelector('.chip[aria-pressed="true"]') || $('focus-min')).focus();
  }
  function setLength(min) {
    stopRun();
    timer.total = min * 60;
    timer.remaining = timer.total;
    store.set(FOCUS_KEY, String(min));
    saveTimer();
    paintLength();
    paintTimer();
    toggleFocusSet(false);
    $('focus-min').value = '';
    $('timer-msg').textContent = t('focus.setTo', { len: minutesLabel(min) });
    $('timer-edit').focus();
  }
  $('timer-edit').addEventListener('click', () => toggleFocusSet());
  $('focus-chips').addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip) setLength(Number(chip.dataset.min)); });
  $('focus-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const min = L.parseMinutes($('focus-min').value);
    if (min == null) {
      $('focus-err').textContent = t('focus.err', { min: L.MIN_FOCUS, max: L.MAX_FOCUS });
      $('focus-min').focus();
      return;
    }
    setLength(min);
  });
  $('focus-set').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); toggleFocusSet(false); $('timer-edit').focus(); }
  });

  function paintBar() {
    const left = secondsLeft();
    const p = Math.min(1, Math.max(0, 1 - left / timer.total));
    $('fbar-fill').style.transform = `translateX(${(p - 1) * 100}%)`;
    return { left, p };
  }
  function paintTimer() {
    const { left, p } = paintBar();
    const text = L.formatTime(left);
    if (text !== timer.lastText) {
      timer.lastText = text;
      $('timer').textContent = text;
      $('fbar').setAttribute('aria-valuenow', String(Math.round(p * 100)));
      document.title = timer.running ? t('app.titleRunning', { time: text }) : t('app.name');
    }
    $('timer').classList.toggle('running', timer.running);
    $('fbar').classList.toggle('running', timer.running);
    $('fbar').classList.toggle('started', p > 0);
    const go = $('timer-go');
    const label = t(timer.running ? 'focus.pause' : timer.remaining < timer.total ? 'focus.resume' : 'focus.start');
    if (go.dataset.label !== label) {
      go.dataset.label = label;
      go.textContent = '';
      go.append(icon(timer.running ? 'i-pause' : 'i-play'), el('span', null, label));
    }
  }
  function frame() {
    if (!timer.running) return;
    paintBar();
    timer.raf = requestAnimationFrame(frame);
  }
  function onTick() {
    if (!timer.running) return;
    if (Date.now() >= timer.endAt) { finishFocus(); return; }
    paintTimer();
  }
  function startRun() {
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.running = true;
    timer.tick = setInterval(onTick, 250);
    cancelAnimationFrame(timer.raf);
    timer.raf = requestAnimationFrame(frame);
    saveTimer();
  }
  function stopRun() {
    if (timer.running) timer.remaining = Math.max(0, (timer.endAt - Date.now()) / 1000);
    timer.running = false;
    clearInterval(timer.tick);
    cancelAnimationFrame(timer.raf);
    timer.tick = 0;
    timer.endAt = 0;
  }
  function finishFocus() {
    stopRun();
    timer.remaining = timer.total;
    saveTimer();
    $('timer-msg').textContent = t('focus.done');
    $('fbar').classList.remove('complete');
    void $('fbar').offsetWidth;
    $('fbar').classList.add('complete');
    $('fbar-fill').style.transform = 'translateX(0)';
    setTimeout(() => { if (!timer.running) paintTimer(); }, calmMotion() ? 0 : 1100);
    commit(L.addFocus(state, today));
    timer.lastText = '';
    $('timer').textContent = L.formatTime(timer.total);
    chime();
    sparks($('timer'));
  }
  $('timer-go').addEventListener('click', () => {
    $('fbar').classList.remove('complete');
    if (timer.running) { stopRun(); saveTimer(); } else { startRun(); $('timer-msg').textContent = ''; }
    paintTimer();
  });
  $('timer-reset').addEventListener('click', () => {
    stopRun();
    timer.remaining = timer.total;
    saveTimer();
    $('timer-msg').textContent = '';
    $('fbar').classList.remove('complete');
    paintTimer();
  });
  function chime() {
    if (!prefs.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const at = ctx.currentTime + i * 0.22;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(i === 2 ? 0.08 : 0.15, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
        o.connect(g).connect(ctx.destination);
        o.start(at);
        o.stop(at + 0.75);
      });
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------- Settings ---------- */
  function setSwitch(id, on) { $(id).setAttribute('aria-checked', String(!!on)); }
  function renderSettings() {
    $('size-now').textContent = t(SIZES[prefs.size]);
    $('size-down').disabled = prefs.size <= 0;
    $('size-up').disabled = prefs.size >= 2;
    $('w-size-down').disabled = prefs.size <= 0;
    $('w-size-up').disabled = prefs.size >= 2;
    setSwitch('set-contrast', prefs.contrast);
    setSwitch('set-motion', prefs.motion);
    setSwitch('set-sound', prefs.sound);
    setSwitch('set-remind', !!prefs.remind);
    $('set-remind-time').disabled = !prefs.remind;
    if (prefs.remind) $('set-remind-time').value = prefs.remind;
    $('remind-blocked').hidden = !(prefs.remind && 'Notification' in window && Notification.permission === 'denied');
    renderInstall();
  }
  function changeSize(delta) {
    prefs.size = Math.max(0, Math.min(2, prefs.size + delta));
    savePrefs(); applyPrefs(); renderSettings();
  }
  $('size-down').addEventListener('click', () => changeSize(-1));
  $('size-up').addEventListener('click', () => changeSize(1));
  $('w-size-down').addEventListener('click', () => changeSize(-1));
  $('w-size-up').addEventListener('click', () => changeSize(1));
  for (const [id, k] of [['set-contrast', 'contrast'], ['set-motion', 'motion'], ['set-sound', 'sound']]) {
    $(id).addEventListener('click', () => { prefs[k] = !prefs[k]; savePrefs(); applyPrefs(); renderSettings(); });
  }
  function setLang(lang) {
    prefs.lang = I.setLang(lang);
    savePrefs(); applyPrefs(); applyStatic();
    timer.lastText = '';
    delete $('timer-go').dataset.label;
    $('add-input').placeholder = t(view === 'today' ? 'add.placeholder' : 'add.placeholderTomorrow');
    paintLength(); paintTimer(); render(); renderSettings();
  }
  $('set-lang').addEventListener('change', (e) => setLang(e.target.value));
  $('welcome-lang').addEventListener('change', (e) => setLang(e.target.value));

  $('set-remind').addEventListener('click', async () => {
    if (prefs.remind) prefs.remind = '';
    else {
      prefs.remind = $('set-remind-time').value || '20:00';
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
      }
    }
    savePrefs(); renderSettings();
  });
  $('set-remind-time').addEventListener('change', (e) => {
    if (!e.target.value) return;
    prefs.remind = e.target.value;
    store.del(REMINDED_KEY);
    savePrefs();
  });

  function checkReminder() {
    if (!prefs.remind) return;
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (hhmm < prefs.remind || store.get(REMINDED_KEY) === today) return;
    const open = L.habitsDue(state, today).filter((h) => (L.getDay(state, today).habits[h.id] || 0) < h.goal);
    store.set(REMINDED_KEY, today);
    if (!open.length) return;
    const body = t('remind.body', { habits: open.map(habitName).join(', ') });
    const title = t('remind.title');
    let shown = false;
    if ('Notification' in window && Notification.permission === 'granted') {
      const opts = { body, icon: 'icons/icon-192.png', tag: 'today-reminder' };
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((r) => r.showNotification(title, opts)).catch(() => {});
        shown = true;
      } else {
        try { new Notification(title, opts); shown = true; } catch (e) { /* mobile needs the service worker */ }
      }
    }
    if (!shown || !document.hidden) showToast(body, null);
  }
  setInterval(checkReminder, 30 * 1000);

  /* Backup */
  $('backup-btn').addEventListener('click', () => {
    const blob = new Blob([L.exportData(state)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `today-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast(t('set.saved'), null);
  });
  $('restore-btn').addEventListener('click', () => $('restore-file').click());
  $('restore-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const next = L.importData(text);
    if (!next) { showToast(t('set.badFile'), null); return; }
    let when = file.name;
    try { const meta = JSON.parse(text); if (meta.exportedAt) when = new Date(meta.exportedAt).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' }); } catch (err) { /* keep file name */ }
    if (!window.confirm(t('set.restoreConfirm', { date: when }))) return;
    commit(next);
    showToast(t('set.restored'), null);
  });

  /* Install as an app */
  let installEvent = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function renderInstall() {
    const note = $('install-note');
    $('install-btn').hidden = !installEvent || standalone();
    if (standalone()) note.textContent = t('set.installed');
    else if (installEvent) note.textContent = '';
    else note.textContent = t(isIOS() ? 'set.installIos' : 'set.installLater');
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { installEvent = null; renderInstall(); });
  $('install-btn').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch (e) { /* ignore */ }
    installEvent = null;
    renderInstall();
  });

  $('settings-btn').addEventListener('click', () => { renderSettings(); openDialog($('settings'), $('settings-btn')); });
  $('tour-btn').addEventListener('click', () => { $('settings').close(); showWelcome(); });

  /* ---------- Welcome (first visit) ---------- */
  function showWelcome() {
    renderSettings();
    openDialog($('welcome'), $('add-input'));
    $('welcome-go').focus();
  }
  const finishWelcome = () => { store.set(WELCOME_KEY, '1'); $('welcome').close(); };
  $('welcome-go').addEventListener('click', () => { finishWelcome(); $('add-input').focus(); });
  $('welcome-skip').addEventListener('click', finishWelcome);
  $('welcome').addEventListener('cancel', () => store.set(WELCOME_KEY, '1'));

  /* ---------- Day rollover, tab sync, offline ---------- */
  function checkDay() {
    const k = L.dayKey(new Date());
    if (k !== today) { today = k; render(); }
  }
  setInterval(checkDay, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    checkDay();
    if (timer.running) { onTick(); cancelAnimationFrame(timer.raf); timer.raf = requestAnimationFrame(frame); }
    checkReminder();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { state = L.loadState(e.newValue); render(); }
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', renderSettings);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  try { localStorage.removeItem('today.theme'); } catch (e) { /* ignore */ }

  /* ---------- Start ---------- */
  applyPrefs();
  applyStatic();
  $('add-input').placeholder = t('add.placeholder');
  if (finishedAway) {
    state = L.addFocus(state, finishedAway);
    store.set(KEY, JSON.stringify(state));
    saveTimer();
    $('timer-msg').textContent = t('focus.doneAway');
  }
  paintLength();
  paintTimer();
  if (timer.running) { timer.tick = setInterval(onTick, 250); timer.raf = requestAnimationFrame(frame); }
  render();
  checkReminder();
  if (!store.get(WELCOME_KEY)) showWelcome();
})();
