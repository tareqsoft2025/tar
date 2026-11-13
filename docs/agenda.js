// الأجندة: مهام ومواعيد وملاحظات، مع جدولة المهام نسبةً لأوقات الصلاة
(function () {
  const { $, state, store, icon, toast, go } = App;
  const TZ = Core.TZ;
  const PR = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const PRN = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  const CATS = [
    { k: 'personal', n: 'شخصي', c: '#7CB7FF' },
    { k: 'work', n: 'عمل', c: '#F0A64B' },
    { k: 'family', n: 'عائلة', c: '#F27FA5' },
    { k: 'worship', n: 'عبادة', c: '#2FBF71' },
    { k: 'study', n: 'دراسة', c: '#C9A7FF' },
    { k: 'other', n: 'أخرى', c: '#8FA2B2' }
  ];
  const catOf = (k) => CATS.find((c) => c.k === k) || CATS[CATS.length - 1];
  const REMINDS = [[-1, 'بدون'], [0, 'عند الموعد'], [5, 'قبل 5 د'], [15, 'قبل 15 د'], [30, 'قبل 30 د'], [60, 'قبل ساعة']];
  const REPEATS = [['none', 'مرة واحدة'], ['daily', 'يومياً'], ['weekly', 'أسبوعياً'], ['monthly', 'شهرياً'], ['yearly', 'سنوياً']];
  const OFFS = [0, 10, 15, 30, 45, 60];

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  const dlong = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  const dshort = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { day: 'numeric', month: 'short', timeZone: TZ });
  const wdn = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'short', timeZone: TZ });
  const today = () => Tracker.dayStr();
  const addDays = Tracker.addDays;

  /* ---------- الوقت داخل المنطقة الزمنية ---------- */
  const offFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  function tzOffset(ms) {
    const p = {}; offFmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000;
  }
  function zoned(ds, h, m) {
    const [y, mo, d] = ds.split('-').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, m);
    let t = guess - tzOffset(guess);
    t = guess - tzOffset(t);
    return t;
  }
  const noonOf = (ds) => new Date(zoned(ds, 12, 0));
  const pcache = {};
  function prayersOn(ds) {
    const key = ds + '|' + JSON.stringify(state.coords || state.city) + '|' + state.method + '|' + state.madhab;
    if (!pcache[key]) {
      const t = Core.calc(state, noonOf(ds));
      pcache[key] = {}; PR.forEach((k) => { pcache[key][k] = t[k].getTime(); });
    }
    return pcache[key];
  }

  /* ---------- البيانات ---------- */
  const load = () => store.get('agenda', []);
  const save = (list) => { store.set('agenda', list); if (App.reschedule) App.reschedule(); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // هل يقع العنصر في هذا اليوم؟
  function occurs(it, ds) {
    if (!it.date || it.type === 'note') return false;
    if (ds < it.date) return false;
    if (ds === it.date) return true;
    const [, m1, d1] = it.date.split('-'), [, m2, d2] = ds.split('-');
    switch (it.repeat) {
      case 'daily': return true;
      case 'weekly': return Tracker.dowOf(ds) === Tracker.dowOf(it.date);
      case 'monthly': return d1 === d2;
      case 'yearly': return d1 === d2 && m1 === m2;
      default: return false;
    }
  }
  // وقت العنصر في يوم معيّن (ms) أو null إن كان بلا وقت
  function timeOf(it, ds) {
    const a = it.at || { mode: 'none' };
    if (a.mode === 'time' && a.time) { const [h, m] = a.time.split(':').map(Number); return zoned(ds, h, m); }
    if (a.mode === 'prayer') {
      const base = prayersOn(ds)[a.p || 'asr'];
      return base + (a.rel === 'before' ? -1 : 1) * (+a.mins || 0) * 60000;
    }
    return null;
  }
  const isDone = (it, ds) => it.repeat && it.repeat !== 'none' ? !!(it.doneOn && it.doneOn[ds]) : !!it.done;
  function toggleDone(id, ds) {
    const list = load(); const it = list.find((x) => x.id === id); if (!it) return;
    if (it.repeat && it.repeat !== 'none') {
      it.doneOn = it.doneOn || {};
      if (it.doneOn[ds]) delete it.doneOn[ds]; else it.doneOn[ds] = 1;
      Object.keys(it.doneOn).sort().slice(0, -120).forEach((k) => delete it.doneOn[k]);
    } else it.done = !it.done;
    save(list);
    if (navigator.vibrate) navigator.vibrate(12);
  }
  function anchorLabel(it) {
    const a = it.at || { mode: 'none' };
    if (a.mode === 'prayer') {
      const n = PRN[a.p] || '';
      if (!+a.mins) return a.rel === 'before' ? `قبيل ${n}` : `بعد ${n} مباشرة`;
      return `${a.rel === 'before' ? 'قبل' : 'بعد'} ${n} بـ ${a.mins} د`;
    }
    return '';
  }
  function itemsOn(ds) {
    return load().filter((it) => occurs(it, ds)).map((it) => ({ it, at: timeOf(it, ds), done: isDone(it, ds) }))
      .sort((a, b) => (a.at == null) - (b.at == null) || (a.at || 0) - (b.at || 0));
  }

  /* ---------- التذكيرات (تُضاف إلى جدول الإشعارات) ---------- */
  window.Agenda = {
    notifs(st, nowMs, push) {
      const list = load(); if (!list.length) return;
      const base = today();
      for (let d = 0; d < 7; d++) {
        const ds = addDays(base, d);
        list.forEach((it) => {
          if (it.type === 'note' || it.remind == null || it.remind < 0 || !occurs(it, ds) || isDone(it, ds)) return;
          const at = timeOf(it, ds); if (at == null) return;
          const lbl = anchorLabel(it);
          const body = [it.remind > 0 ? `بعد ${it.remind} دقيقة` : 'الآن', lbl || tf.format(new Date(at)), it.note ? it.note.slice(0, 80) : ''].filter(Boolean).join(' · ');
          push(at - it.remind * 60000, it.title, body, { tab: 'agenda' });
        });
      }
    }
  };

  /* ---------- الشاشة ---------- */
  let view = 'day', cur = today(), noteQ = '';
  function render() {
    document.querySelectorAll('#agSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    $('agDayNav').hidden = view !== 'day';
    $('agNoteSearch').hidden = view !== 'notes';
    if (view === 'day') renderDay(); else if (view === 'tasks') renderTasks(); else renderNotes();
  }

  function renderNav() {
    const t = today();
    $('agDate').textContent = cur === t ? 'اليوم' : cur === addDays(t, 1) ? 'غداً' : cur === addDays(t, -1) ? 'أمس' : dlong.format(noonOf(cur));
    const h = Core.hijri(noonOf(cur), state.hijriAdj);
    $('agHijri').textContent = `${cur === t || cur === addDays(t, 1) || cur === addDays(t, -1) ? dlong.format(noonOf(cur)) + ' · ' : ''}${h.d} ${Core.HIJRI_MONTHS[h.m - 1]} ${h.y}`;
    const strip = $('agWeek'); strip.innerHTML = '';
    const start = addDays(cur, -3);
    for (let i = 0; i < 7; i++) {
      const ds = addDays(start, i);
      const n = itemsOn(ds).filter((x) => !x.done).length;
      const b = el('button', 'agw' + (ds === cur ? ' on' : '') + (ds === t ? ' now' : ''), `<small>${wdn.format(noonOf(ds))}</small><b>${+ds.slice(8)}</b><i>${n ? '•'.repeat(Math.min(3, n)) : ''}</i>`);
      b.onclick = () => { cur = ds; render(); };
      strip.appendChild(b);
    }
  }

  function row(x, ds) {
    const it = x.it, c = catOf(it.cat);
    const meta = [];
    if (x.at != null) meta.push(`<span class="ag-time">${tf.format(new Date(x.at))}</span>`);
    const lbl = anchorLabel(it); if (lbl) meta.push(`<span class="ag-anch">${icon('mosque')}${lbl}</span>`);
    if (it.repeat && it.repeat !== 'none') meta.push(`<span>${icon('refresh')}${REPEATS.find((r) => r[0] === it.repeat)[1]}</span>`);
    if (it.remind != null && it.remind >= 0) meta.push(`<span>${icon('bell')}</span>`);
    const r = el('div', 'ag-row' + (x.done ? ' done' : ''));
    r.style.setProperty('--cc', c.c);
    r.innerHTML = `<button class="jck" aria-label="إنجاز">${icon('check')}</button><button class="ag-body"><b>${esc(it.title)}</b>${it.note ? `<small class="ag-n">${esc(it.note)}</small>` : ''}<span class="ag-meta"><span class="ag-cat">${c.n}</span>${meta.join('')}</span></button>`;
    r.firstChild.onclick = () => { toggleDone(it.id, ds); render(); };
    r.lastChild.onclick = () => openEditor(it);
    return r;
  }

  function renderDay() {
    renderNav();
    const box = $('agBody'); box.innerHTML = '';
    const items = itemsOn(cur);
    const p = prayersOn(cur);
    const nowMs = Date.now();
    const slots = [{ k: 'pre', n: 'قبل الفجر', from: -Infinity }].concat(PR.map((k) => ({ k, n: PRN[k], from: p[k] })));
    const untimed = items.filter((x) => x.at == null);
    const done = items.filter((x) => x.done).length;
    if (items.length) {
      const sum = el('div', 'ag-sum', `<span>${items.length - done} متبقية · ${done} منجزة</span><span class="progress"><i style="width:${done / items.length * 100}%"></i></span>`);
      box.appendChild(sum);
    }
    if (untimed.length) {
      box.appendChild(el('div', 'sec', 'خلال اليوم'));
      const g = el('div', 'group'); untimed.forEach((x) => g.appendChild(row(x, cur))); box.appendChild(g);
    }
    slots.forEach((s, i) => {
      const to = i + 1 < slots.length ? slots[i + 1].from : Infinity;
      const inSlot = items.filter((x) => x.at != null && x.at >= s.from && x.at < to);
      if (s.k === 'pre' && !inSlot.length) return;
      const live = nowMs >= s.from && nowMs < to && cur === today();
      const head = el('div', 'ag-slot' + (live ? ' live' : ''), `<span class="ag-pdot"></span><b>${s.n}</b>${s.k !== 'pre' ? `<em>${tf.format(new Date(s.from))}</em>` : ''}${live ? '<span class="chipx">الآن</span>' : ''}<button class="ag-add" aria-label="إضافة">${icon('plus')}</button>`);
      head.querySelector('.ag-add').onclick = () => openEditor(null, s.k === 'pre' ? { date: cur } : { date: cur, at: { mode: 'prayer', p: s.k, rel: 'after', mins: 15 } });
      box.appendChild(head);
      const g = el('div', 'group ag-slotg');
      if (inSlot.length) inSlot.forEach((x) => g.appendChild(row(x, cur)));
      else g.appendChild(el('div', 'ag-empty', 'لا شيء في هذه الفترة'));
      box.appendChild(g);
    });
  }

  function renderTasks() {
    const box = $('agBody'); box.innerHTML = '';
    const t = today();
    const list = load().filter((it) => it.type !== 'note');
    const groups = { late: [], today: [], soon: [], nodate: [], done: [] };
    list.forEach((it) => {
      const rep = it.repeat && it.repeat !== 'none';
      if (!it.date) { (it.done ? groups.done : groups.nodate).push({ it, at: null, done: !!it.done, ds: t }); return; }
      if (rep) {
        // المتكرر: نعرض أقرب موعد قادم خلال سنة
        let ds = it.date < t ? t : it.date;
        for (let i = 0; i < 370 && !occurs(it, ds); i++) ds = addDays(ds, 1);
        const x = { it, at: timeOf(it, ds), done: isDone(it, ds), ds };
        (ds === t ? groups.today : groups.soon).push(x);
        return;
      }
      const x = { it, at: timeOf(it, it.date), done: !!it.done, ds: it.date };
      if (it.done) groups.done.push(x);
      else if (it.date < t) groups.late.push(x);
      else if (it.date === t) groups.today.push(x);
      else groups.soon.push(x);
    });
    const byTime = (a, b) => (a.ds > b.ds) - (a.ds < b.ds) || (a.at || 0) - (b.at || 0);
    const sec = (title, arr, showDate) => {
      if (!arr.length) return;
      box.appendChild(el('div', 'sec', `${title} <span class="muted">(${arr.length})</span>`));
      const g = el('div', 'group');
      arr.sort(byTime).forEach((x) => {
        const r = row(x, x.ds);
        if (showDate && x.ds) r.querySelector('.ag-meta').insertAdjacentHTML('afterbegin', `<span class="ag-time">${x.ds === addDays(t, 1) ? 'غداً' : dshort.format(noonOf(x.ds))}</span>`);
        g.appendChild(r);
      });
      box.appendChild(g);
    };
    sec('متأخرة', groups.late, true);
    sec('اليوم', groups.today, false);
    sec('القادمة', groups.soon, true);
    sec('بدون موعد', groups.nodate, false);
    sec('المنجزة', groups.done.slice(-30), true);
    if (!list.length) box.appendChild(emptyState('لا توجد مهام بعد', 'أضف مهمة واربطها بوقت صلاة، مثل: "بعد العصر بربع ساعة"'));
    else if (groups.done.length) {
      const clr = el('button', 'btn-outline wide', `${icon('x')}<span>حذف المهام المنجزة</span>`);
      clr.onclick = () => { if (confirm('حذف كل المهام المنجزة غير المتكررة؟')) { save(load().filter((it) => !(it.type !== 'note' && it.done && (!it.repeat || it.repeat === 'none')))); render(); } };
      box.appendChild(clr);
    }
  }

  function renderNotes() {
    const box = $('agBody'); box.innerHTML = '';
    const q = noteQ.trim();
    const notes = load().filter((it) => it.type === 'note' && (!q || (it.title + ' ' + (it.note || '')).includes(q)))
      .sort((a, b) => (!!b.pin - !!a.pin) || (b.upd || 0) - (a.upd || 0));
    if (!notes.length) { box.appendChild(emptyState(q ? 'لا نتائج' : 'لا توجد ملاحظات بعد', q ? 'جرّب كلمة أخرى' : 'دوّن أفكارك وفوائد الدروس وما تريد تذكّره')); return; }
    const grid = el('div', 'ag-notes');
    notes.forEach((it) => {
      const c = catOf(it.cat);
      const card = el('button', 'ag-note', `${it.pin ? `<span class="ag-pin">${icon('bookmark')}</span>` : ''}<b>${esc(it.title)}</b><p>${esc(it.note || '')}</p><small><span class="ag-cat">${c.n}</span>${dshort.format(new Date(it.upd || Date.now()))}</small>`);
      card.style.setProperty('--cc', c.c);
      card.onclick = () => openEditor(it);
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }
  const emptyState = (t, s) => el('div', 'ag-emptyst', `<span class="hub-ic">${icon('note')}</span><b>${t}</b><small>${s}</small>`);

  /* ---------- محرّر المهمة / الملاحظة ---------- */
  let draft = null;
  function openEditor(it, preset) {
    const t = view === 'day' ? cur : today();
    draft = it ? JSON.parse(JSON.stringify(it)) : Object.assign({
      id: null, type: view === 'notes' ? 'note' : 'task', title: '', note: '', cat: 'personal',
      date: view === 'notes' ? null : t, at: { mode: 'none' }, remind: 0, repeat: 'none'
    }, preset || {});
    draft.at = draft.at || { mode: 'none' };
    $('agEdTitle').textContent = it ? (draft.type === 'note' ? 'تعديل الملاحظة' : 'تعديل المهمة') : 'إضافة جديدة';
    $('agDel').hidden = !it;
    $('agTitle').value = draft.title;
    $('agNote').value = draft.note || '';
    $('agSheet').hidden = false;
    drawEditor();
    if (!it) setTimeout(() => $('agTitle').focus(), 80);
  }
  const closeEditor = () => { $('agSheet').hidden = true; draft = null; };

  function chips(boxId, opts, curVal, onPick) {
    const box = $(boxId); box.innerHTML = '';
    opts.forEach(([v, n, color]) => {
      const b = el('button', 'chip sm' + (v === curVal ? ' on' : ''), color ? `<i class="dot" style="background:${color}"></i>${n}` : n);
      b.type = 'button';
      b.onclick = () => { onPick(v); drawEditor(); };
      box.appendChild(b);
    });
  }
  function drawEditor() {
    const d = draft, isTask = d.type !== 'note';
    document.querySelectorAll('#agType button').forEach((b) => b.classList.toggle('on', b.dataset.t === d.type));
    $('agTaskOpts').hidden = !isTask;
    $('agPinRow').hidden = isTask;
    $('agPin').checked = !!d.pin;
    chips('agCats', CATS.map((c) => [c.k, c.n, c.c]), d.cat, (v) => { d.cat = v; });
    if (!isTask) return;
    const t = today();
    const dsel = d.date === t ? 'today' : d.date === addDays(t, 1) ? 'tom' : !d.date ? 'none' : 'pick';
    chips('agDates', [['today', 'اليوم'], ['tom', 'غداً'], ['none', 'بلا تاريخ'], ['pick', 'تاريخ آخر']], dsel, (v) => {
      if (v === 'today') d.date = t; else if (v === 'tom') d.date = addDays(t, 1); else if (v === 'none') { d.date = null; d.repeat = 'none'; } else d.date = d.date || t;
      if (v === 'pick') setTimeout(() => { try { $('agDate2').showPicker(); } catch (e) { $('agDate2').focus(); } }, 50);
    });
    $('agDate2').hidden = dsel !== 'pick';
    $('agDate2').value = d.date || '';
    $('agWhen').hidden = !d.date;
    chips('agModes', [['none', 'بدون وقت'], ['prayer', 'مرتبط بصلاة'], ['time', 'وقت محدد']], d.at.mode, (v) => {
      d.at = v === 'prayer' ? { mode: 'prayer', p: d.at.p || 'asr', rel: d.at.rel || 'after', mins: d.at.mins != null ? d.at.mins : 15 } : v === 'time' ? { mode: 'time', time: d.at.time || '09:00' } : { mode: 'none' };
    });
    $('agTimeBox').hidden = d.at.mode !== 'time';
    $('agTime').value = d.at.time || '09:00';
    $('agPrayBox').hidden = d.at.mode !== 'prayer';
    if (d.at.mode === 'prayer') {
      chips('agPrays', PR.map((k) => [k, PRN[k]]), d.at.p, (v) => { d.at.p = v; });
      chips('agRel', [['before', 'قبل'], ['after', 'بعد']], d.at.rel, (v) => { d.at.rel = v; });
      chips('agOffs', OFFS.map((m) => [m, m ? `${m} د` : 'مباشرة']), +d.at.mins, (v) => { d.at.mins = v; });
      const at = d.date ? timeOf(d, d.date) : null;
      $('agPrev').textContent = at ? `يوافق الساعة ${tf.format(new Date(at))} ${d.date === t ? 'اليوم' : 'في ذلك اليوم'}، ويتغيّر تلقائياً مع تغيّر المواقيت` : '';
    }
    $('agRemBox').hidden = d.at.mode === 'none' || !d.date;
    chips('agRems', REMINDS, d.remind == null ? -1 : d.remind, (v) => { d.remind = v; });
    $('agRepBox').hidden = !d.date;
    chips('agReps', REPEATS, d.repeat || 'none', (v) => { d.repeat = v; });
    // تحذير التعارض مع وقت الصلاة (خلال 10 دقائق بعد الأذان)
    let warn = '';
    if (d.date && d.at.mode === 'time') {
      const at = timeOf(d, d.date), p = prayersOn(d.date);
      const k = PR.find((k) => at >= p[k] - 5 * 60000 && at < p[k] + 15 * 60000);
      if (k) warn = `انتبه: هذا الموعد يوافق وقت صلاة ${PRN[k]} (${tf.format(new Date(p[k]))}). جرّب "مرتبط بصلاة" ليكون بعدها.`;
    }
    $('agWarn').textContent = warn; $('agWarn').hidden = !warn;
  }

  function wireEditor() {
    document.querySelectorAll('#agType button').forEach((b) => b.onclick = () => {
      draft.type = b.dataset.t;
      if (draft.type === 'task' && !draft.date && !draft.id) draft.date = view === 'day' ? cur : today();
      drawEditor();
    });
    $('agTitle').oninput = (e) => { draft.title = e.target.value; };
    $('agNote').oninput = (e) => { draft.note = e.target.value; };
    $('agDate2').onchange = (e) => { draft.date = e.target.value || null; drawEditor(); };
    $('agTime').onchange = (e) => { draft.at.time = e.target.value; drawEditor(); };
    $('agPin').onchange = (e) => { draft.pin = e.target.checked; };
    $('agSave').onclick = () => {
      const d = draft;
      d.title = $('agTitle').value.trim(); d.note = $('agNote').value.trim();
      if (!d.title) { if (d.note) d.title = d.note.split('\n')[0].slice(0, 40); else { toast('اكتب عنواناً أولاً'); $('agTitle').focus(); return; } }
      if (d.type === 'note') { d.date = null; d.at = { mode: 'none' }; d.remind = -1; d.repeat = 'none'; }
      if (!d.date) { d.at = { mode: 'none' }; d.repeat = 'none'; }
      if (d.at.mode === 'none') d.remind = -1;
      d.upd = Date.now();
      const list = load();
      if (d.id) { const i = list.findIndex((x) => x.id === d.id); if (i >= 0) list[i] = d; else list.push(d); }
      else { d.id = uid(); d.created = d.upd; list.push(d); }
      save(list);
      const needsNotif = d.remind != null && d.remind >= 0 && App.B && App.B.notificationsAllowed && !App.B.notificationsAllowed();
      toast(needsNotif ? 'تم الحفظ. فعّل الإشعارات للتطبيق ليصلك التذكير' : d.type === 'note' ? 'تم حفظ الملاحظة' : 'تمت إضافة المهمة إلى أجندتك');
      if (d.type !== 'note' && d.date && view === 'day') cur = d.date;
      if (d.type === 'note' && view !== 'notes') view = 'notes';
      closeEditor(); render();
    };
    $('agDel').onclick = () => {
      if (!draft || !draft.id || !confirm('حذف هذا العنصر نهائياً؟')) return;
      save(load().filter((x) => x.id !== draft.id));
      toast('تم الحذف'); closeEditor(); render();
    };
    $('agSheet').onclick = (e) => { if (e.target.hasAttribute('data-close')) closeEditor(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('agSheet').hidden) closeEditor(); });
  }

  /* ---------- ربط الشاشة ---------- */
  document.querySelectorAll('#agSeg button').forEach((b) => b.onclick = () => { view = b.dataset.v; render(); });
  $('agPrevD').onclick = () => { cur = addDays(cur, -1); render(); };
  $('agNextD').onclick = () => { cur = addDays(cur, 1); render(); };
  $('agToday').onclick = () => { cur = today(); render(); };
  $('agFab').onclick = () => openEditor(null);
  $('agQ').oninput = (e) => { noteQ = e.target.value; renderNotes(); };
  wireEditor();
  App.screens.agenda = () => render();
  // تحديث "الآن" في العرض اليومي كل دقيقة
  setInterval(() => { if (App.isActive('agenda') && view === 'day' && !document.hidden && $('agSheet').hidden) renderDay(); }, 60000);
  if (App.reschedule) App.reschedule();
})();
