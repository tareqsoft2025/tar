// الأجندة: مهام بالتاريخ والوقت (بأسلوب مهام Google)، تقويم وخريطة لليوم، ملاحظات، وتذكير في منتصف الشاشة
(function () {
  const { $, state, store, icon, toast } = App;
  const B = App.B;
  const TZ = Core.TZ;
  const { CATS, catOf, tzOffset, zoned, hm, isTask, rep, occurs, dueOf, isDone } = AgendaCore;
  const REMINDS = [[-1, 'بدون'], [0, 'عند الموعد'], [5, 'قبل 5 د'], [15, 'قبل 15 د'], [30, 'قبل 30 د'], [60, 'قبل ساعة'], [1440, 'قبل يوم']];
  const REPEATS = [['none', 'لا يتكرر'], ['daily', 'يومياً'], ['weekdays', 'أيام العمل'], ['weekly', 'أسبوعياً'], ['monthly', 'شهرياً'], ['yearly', 'سنوياً']];
  const QUICK_TIMES = ['08:00', '12:00', '17:00', '21:00'];

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = (o) => new Intl.DateTimeFormat('ar-PS-u-nu-latn', Object.assign({ timeZone: TZ }, o));
  const tf = F({ hour: 'numeric', minute: '2-digit', hour12: true });
  const dlong = F({ weekday: 'long', day: 'numeric', month: 'long' });
  const dmed = F({ weekday: 'short', day: 'numeric', month: 'short' });
  const wdn = F({ weekday: 'long' });
  const monthF = F({ month: 'long', year: 'numeric' });
  const hourLbl = F({ hour: 'numeric', hour12: true });
  const today = () => Tracker.dayStr();
  const addDays = Tracker.addDays;
  const dow = Tracker.dowOf;

  /* ---------- الوقت ---------- */
  const noonOf = (ds) => new Date(zoned(ds, 12, 0));
  const clockAt = (h, m) => new Date(zoned(today(), h, m || 0));
  const fmtTime = (t) => tf.format(clockAt(...hm(t)));
  const nowMin = () => { const n = Date.now(); return Math.floor((n + tzOffset(n)) / 60000) % 1440; };

  /* ---------- البيانات ---------- */
  function migrate(list) {
    let changed = false;
    list.forEach((it) => {
      if (it.at && it.time === undefined) {
        // النسخة السابقة كانت تربط المهمة بالصلاة: نحوّلها إلى وقت ثابت
        if (it.at.mode === 'time') it.time = it.at.time;
        else if (it.at.mode === 'prayer' && it.date) {
          try {
            const t = Core.calc(state, noonOf(it.date))[it.at.p || 'asr'].getTime() + (it.at.rel === 'before' ? -1 : 1) * (+it.at.mins || 0) * 60000;
            it.time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(t));
          } catch (e) { it.time = null; }
        } else it.time = null;
        delete it.at; changed = true;
      }
      if (!it.subs) { it.subs = []; changed = true; }
    });
    return changed;
  }
  function load() { const l = store.get('agenda', []); if (migrate(l)) store.set('agenda', l); return l; }
  const save = (list) => { store.set('agenda', list); if (App.reschedule) App.reschedule(); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // أقرب موعد للمهمة المتكررة لم يُنجز (ابتداءً من اليوم)
  function nextOcc(it) {
    const t = today();
    let ds = it.date < t ? t : it.date;
    for (let i = 0; i < 400; i++, ds = addDays(ds, 1)) if (occurs(it, ds) && !isDone(it, ds)) return ds;
    return null;
  }
  function toggleDone(id, ds) {
    const list = load(); const it = list.find((x) => x.id === id); if (!it) return false;
    let now;
    if (rep(it)) { it.doneOn = it.doneOn || {}; now = !it.doneOn[ds]; if (now) it.doneOn[ds] = 1; else delete it.doneOn[ds]; Object.keys(it.doneOn).sort().slice(0, -200).forEach((k) => delete it.doneOn[k]); }
    else { it.done = !it.done; now = it.done; it.doneAt = now ? Date.now() : null; }
    it.upd = Date.now();
    save(list);
    if (navigator.vibrate) navigator.vibrate(now ? [10, 40, 18] : 10);
    return now;
  }
  function itemsOn(ds) {
    return load().filter((it) => occurs(it, ds)).map((it) => ({ it, ds, due: dueOf(it, ds), done: isDone(it, ds) }))
      .sort((a, b) => (a.due == null) - (b.due == null) || (a.due || 0) - (b.due || 0));
  }

  /* ---------- الحالة ---------- */
  let view = store.get('agView', 'tasks'), selDay = today(), calMonth = today().slice(0, 7), noteQ = '', showDone = false, onlyStar = false;
  if (!['tasks', 'cal', 'notes'].includes(view)) view = 'tasks';

  function render() {
    document.querySelectorAll('#agSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    store.set('agView', view);
    const box = $('agBody'); box.innerHTML = '';
    if (view === 'tasks') renderTasks(box); else if (view === 'cal') renderCal(box); else renderNotes(box);
  }

  /* ---------- صف المهمة ---------- */
  function dateChip(it, ds, due, done) {
    const t = today();
    if (!ds) return '';
    let lbl = ds === t ? 'اليوم' : ds === addDays(t, 1) ? 'غداً' : ds === addDays(t, -1) ? 'أمس' : (ds > t && ds < addDays(t, 7)) ? wdn.format(noonOf(ds)) : dmed.format(noonOf(ds));
    if (it.time) lbl += ' · ' + fmtTime(it.time);
    const late = !done && (ds < t || (due && due < Date.now()));
    return `<span class="ag-chip${late ? ' late' : ds === t ? ' today' : ''}">${icon('cal')}${lbl}</span>`;
  }
  function row(x, opts) {
    opts = opts || {};
    const { it, ds, due, done } = x;
    const c = catOf(it.cat);
    const subs = it.subs || [];
    const sd = subs.filter((s) => s.d).length;
    const late = !done && due && due < Date.now();
    const timeChip = it.time ? `<span class="ag-chip${late ? ' late' : ''}">${icon('clock')}${fmtTime(it.time)}</span>` : '';
    const r = el('div', 'ag-task' + (done ? ' done' : ''));
    r.style.setProperty('--cc', c.c);
    r.innerHTML = `
      <button class="ag-ck" aria-label="${done ? 'إلغاء الإنجاز' : 'إنجاز'}"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></button>
      <button class="ag-main">
        <b>${esc(it.title)}</b>
        ${it.note ? `<small class="ag-n">${esc(it.note)}</small>` : ''}
        <span class="ag-meta">${opts.noDate ? timeChip : dateChip(it, ds, due, done)}${rep(it) ? `<span class="ag-ic" title="متكرر">${icon('refresh')}</span>` : ''}${it.time && it.remind >= 0 ? `<span class="ag-ic" title="تذكير">${icon('bell')}</span>` : ''}${subs.length ? `<span class="ag-ic sub">${icon('check')}${sd}/${subs.length}</span>` : ''}<span class="ag-tag">${c.n}</span></span>
      </button>
      <button class="ag-star${it.star ? ' on' : ''}" aria-label="مميزة">${icon('star')}</button>`;
    r.querySelector('.ag-ck').onclick = (e) => {
      e.stopPropagation();
      const nowDone = toggleDone(it.id, ds || today());
      r.classList.toggle('done', nowDone);
      if (nowDone) { r.classList.add('pop'); toast(rep(it) ? 'أُنجزت لهذا اليوم، أحسنت' : 'أحسنت! تمّت المهمة'); }
      setTimeout(render, nowDone ? 520 : 0);
    };
    r.querySelector('.ag-main').onclick = () => openEditor(it);
    r.querySelector('.ag-star').onclick = (e) => {
      e.stopPropagation();
      const list = load(); const t = list.find((y) => y.id === it.id); if (!t) return;
      t.star = !t.star; save(list); render();
    };
    return r;
  }

  /* ---------- عرض المهام ---------- */
  function renderTasks(box) {
    const t = today();
    const all = load().filter(isTask);
    const todays = itemsOn(t);
    const dn = todays.filter((x) => x.done).length;
    const next = todays.find((x) => !x.done && x.due && x.due > Date.now());
    const frac = todays.length ? dn / todays.length : 0;
    box.appendChild(el('div', 'ag-hero', `
      <div class="ag-ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" class="bg"/><circle cx="32" cy="32" r="27" class="fg" style="stroke-dashoffset:${(170 * (1 - frac)).toFixed(1)}"/></svg><span><b>${dn}</b><small>من ${todays.length}</small></span></div>
      <div class="ag-hero-t"><small>${dlong.format(new Date())}</small><b>${!todays.length ? 'لا مهام لليوم بعد' : dn === todays.length ? 'أنجزت كل مهام اليوم' : `تبقّى ${todays.length - dn} من مهام اليوم`}</b>
      ${next ? `<span class="ag-next">${icon('bell')}<span>التالية ${RemindUI.left(next.due)}: <em>${esc(next.it.title)}</em></span></span>` : ''}</div>`));
    // إضافة سريعة
    const qa = el('form', 'ag-quick', `<span class="ag-qplus">${icon('plus')}</span><input id="agQuick" type="text" maxlength="120" placeholder="أضف مهمة لليوم…" enterkeyhint="done" autocomplete="off" aria-label="إضافة سريعة"><button type="button" class="ag-qmore" aria-label="مع تاريخ ووقت">${icon('clock')}</button>`);
    qa.onsubmit = (e) => {
      e.preventDefault();
      const v = qa.querySelector('input').value.trim(); if (!v) return;
      const list = load();
      list.push({ id: uid(), type: 'task', title: v, note: '', cat: 'personal', date: t, time: null, remind: -1, repeat: 'none', subs: [], created: Date.now(), upd: Date.now() });
      save(list); toast('أُضيفت إلى مهام اليوم'); render();
      setTimeout(() => { const i = $('agQuick'); if (i) i.focus(); }, 30);
    };
    qa.querySelector('.ag-qmore').onclick = () => openEditor(null, { title: qa.querySelector('input').value.trim() });
    box.appendChild(qa);
    const fl = el('div', 'chips ag-filter');
    [[false, 'كل المهام'], [true, '★ المميزة']].forEach(([k, n]) => {
      const b = el('button', 'chip sm' + (k === onlyStar ? ' on' : ''), n);
      b.onclick = () => { onlyStar = k; render(); };
      fl.appendChild(b);
    });
    box.appendChild(fl);

    const groups = { late: [], today: [], tom: [], week: [], later: [], none: [], done: [] };
    const tom = addDays(t, 1), wk = addDays(t, 7);
    all.filter((it) => !onlyStar || it.star).forEach((it) => {
      if (!it.date) { (it.done ? groups.done : groups.none).push({ it, ds: null, due: null, done: !!it.done }); return; }
      if (rep(it)) {
        const ds = nextOcc(it);
        if (!ds) return;
        const x = { it, ds, due: dueOf(it, ds), done: false };
        if (ds === t) groups.today.push(x); else if (ds === tom) groups.tom.push(x); else if (ds < wk) groups.week.push(x); else groups.later.push(x);
        return;
      }
      const x = { it, ds: it.date, due: dueOf(it, it.date), done: !!it.done };
      if (it.done) groups.done.push(x);
      else if (it.date < t) groups.late.push(x);
      else if (it.date === t) groups.today.push(x);
      else if (it.date === tom) groups.tom.push(x);
      else if (it.date < wk) groups.week.push(x);
      else groups.later.push(x);
    });
    const sortX = (a, b) => ((a.ds || '9') > (b.ds || '9') ? 1 : (a.ds || '9') < (b.ds || '9') ? -1 : 0) || (a.due == null) - (b.due == null) || (a.due || 0) - (b.due || 0) || (!!b.it.star - !!a.it.star);
    const section = (title, arr, cls, noDate) => {
      if (!arr.length) return;
      box.appendChild(el('div', 'ag-sec ' + (cls || ''), `<span>${title}</span><em>${arr.length}</em>`));
      const g = el('div', 'ag-list');
      arr.sort(sortX).forEach((x) => g.appendChild(row(x, { noDate })));
      box.appendChild(g);
    };
    section('متأخرة', groups.late, 'late');
    section('اليوم', groups.today, 'today', true);
    section('غداً', groups.tom, '', true);
    section('الأيام القادمة', groups.week);
    section('لاحقاً', groups.later);
    section('بلا تاريخ', groups.none);
    if (!all.length) box.appendChild(emptyState('ابدأ أول مهمة', 'اكتب مهمتك في الأعلى، أو اضغط + لتحديد اليوم والوقت والتذكير'));
    else if (onlyStar && !all.some((it) => it.star)) box.appendChild(emptyState('لا مهام مميزة', 'اضغط النجمة بجانب أي مهمة لتمييزها'));
    if (groups.done.length) {
      const tg = el('button', 'ag-donetg' + (showDone ? ' open' : ''), `${icon('down')}<span>المكتملة (${groups.done.length})</span>`);
      tg.onclick = () => { showDone = !showDone; render(); };
      box.appendChild(tg);
      if (showDone) {
        const g = el('div', 'ag-list');
        groups.done.sort((a, b) => (b.it.doneAt || 0) - (a.it.doneAt || 0)).slice(0, 50).forEach((x) => g.appendChild(row(x)));
        box.appendChild(g);
        const clr = el('button', 'btn-outline wide', `${icon('x')}<span>حذف المهام المكتملة</span>`);
        clr.onclick = () => { if (confirm('حذف كل المهام المكتملة غير المتكررة؟')) { save(load().filter((it) => !(isTask(it) && it.done && !rep(it)))); render(); } };
        box.appendChild(clr);
      }
    }
  }

  /* ---------- التقويم + خريطة اليوم ---------- */
  function renderCal(box) {
    const t = today();
    const [y, m] = calMonth.split('-').map(Number);
    const first = `${calMonth}-01`;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = (dow(first) + 1) % 7; // الأسبوع يبدأ السبت
    const list = load().filter(isTask);
    const card = el('div', 'ag-cal');
    const h1 = Core.hijri(noonOf(first), state.hijriAdj), h2 = Core.hijri(noonOf(`${calMonth}-${String(dim).padStart(2, '0')}`), state.hijriAdj);
    const n1 = Core.HIJRI_MONTHS[h1.m - 1], n2 = Core.HIJRI_MONTHS[h2.m - 1];
    card.innerHTML = `<div class="ag-calh"><button class="icon-btn flip" data-m="-1" aria-label="الشهر السابق">${icon('chev')}</button><div><b>${monthF.format(noonOf(first))}</b><small>${n1}${n1 !== n2 ? ' – ' + n2 : ''} ${h2.y}هـ</small></div><button class="icon-btn" data-m="1" aria-label="الشهر التالي">${icon('chev')}</button></div>`;
    const grid = el('div', 'ag-grid');
    ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].forEach((d) => grid.appendChild(el('span', 'ag-wd', d)));
    for (let i = 0; i < lead; i++) grid.appendChild(el('span'));
    for (let d = 1; d <= dim; d++) {
      const ds = `${calMonth}-${String(d).padStart(2, '0')}`;
      const its = list.filter((it) => occurs(it, ds));
      const open = its.filter((it) => !isDone(it, ds));
      const dots = open.slice(0, 3).map((it) => `<i style="background:${catOf(it.cat).c}"></i>`).join('');
      const b = el('button', 'ag-day' + (ds === t ? ' now' : '') + (ds === selDay ? ' on' : '') + (its.length && !open.length ? ' clear' : ''), `<b>${d}</b><span>${dots}</span>`);
      b.onclick = () => { selDay = ds; render(); };
      grid.appendChild(b);
    }
    card.appendChild(grid);
    card.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
      const nm = new Date(Date.UTC(y, m - 1 + +b.dataset.m, 1));
      calMonth = `${nm.getUTCFullYear()}-${String(nm.getUTCMonth() + 1).padStart(2, '0')}`; render();
    });
    box.appendChild(card);
    if (calMonth !== t.slice(0, 7) || selDay !== t) {
      const tb = el('button', 'ag-totoday', `${icon('cal')}<span>العودة إلى اليوم</span>`);
      tb.onclick = () => { selDay = t; calMonth = t.slice(0, 7); render(); };
      box.appendChild(tb);
    }
    renderMap(box);
  }

  // خريطة اليوم: خط زمني بالساعات تتوزع عليه المهام، مع مؤشر "الآن"
  function renderMap(box) {
    const ds = selDay, t = today();
    const items = itemsOn(ds);
    const timed = items.filter((x) => x.it.time), allDay = items.filter((x) => !x.it.time);
    const hh = Core.hijri(noonOf(ds), state.hijriAdj);
    const head = el('div', 'ag-maph', `<div><b>خريطة ${ds === t ? 'اليوم' : ds === addDays(t, 1) ? 'الغد' : 'اليوم'}</b><small>${dlong.format(noonOf(ds))} · ${hh.d} ${Core.HIJRI_MONTHS[hh.m - 1]}</small></div><button class="ag-add2" type="button">${icon('plus')}<span>مهمة</span></button>`);
    head.querySelector('.ag-add2').onclick = () => openEditor(null, { date: ds });
    box.appendChild(head);
    if (allDay.length) {
      const ad = el('div', 'ag-allday', '<small>طوال اليوم</small>');
      allDay.forEach((x) => {
        const p = el('button', 'ag-pill' + (x.done ? ' done' : ''), esc(x.it.title));
        p.style.setProperty('--cc', catOf(x.it.cat).c);
        p.onclick = () => openEditor(x.it);
        ad.appendChild(p);
      });
      box.appendChild(ad);
    }
    const hrs = timed.map((x) => hm(x.it.time)[0]);
    const nowH = Math.floor(nowMin() / 60);
    const from = Math.max(0, Math.min(7, ...hrs, ds === t ? nowH : 24));
    const to = Math.min(24, Math.max(22, ...hrs.map((v) => v + 1), ds === t ? nowH + 1 : 0));
    const HP = 56; // ارتفاع الساعة
    const map = el('div', 'ag-map');
    map.style.height = (to - from) * HP + 'px';
    for (let hr = from; hr < to; hr++) {
      const line = el('button', 'ag-hr', `<span>${hourLbl.format(clockAt(hr, 0))}</span>`);
      line.style.top = (hr - from) * HP + 'px';
      line.setAttribute('aria-label', 'إضافة مهمة في هذه الساعة');
      line.onclick = () => openEditor(null, { date: ds, time: String(hr).padStart(2, '0') + ':00', remind: 15 });
      map.appendChild(line);
    }
    // توزيع المهام المتقاربة على أعمدة حتى لا تتداخل
    const placed = [];
    timed.forEach((x) => {
      const [h, m] = hm(x.it.time);
      const top = (h - from + m / 60) * HP;
      let col = 0;
      while (placed.some((p) => p.col === col && Math.abs(p.top - top) < 46)) col++;
      placed.push({ x, top, col });
    });
    const cols = Math.max(1, ...placed.map((p) => p.col + 1));
    placed.forEach(({ x, top, col }) => {
      const ev = el('button', 'ag-ev' + (x.done ? ' done' : '') + (x.due < Date.now() && !x.done ? ' past' : ''), `<b>${esc(x.it.title)}</b><small>${fmtTime(x.it.time)}${x.it.remind >= 0 ? ' · تذكير' : ''}</small>`);
      ev.style.cssText = `top:${top + 2}px;--cc:${catOf(x.it.cat).c};inset-inline-start:calc(62px + (100% - 66px) * ${col / cols});width:calc((100% - 66px) / ${cols} - 4px)`;
      ev.onclick = () => openEditor(x.it);
      map.appendChild(ev);
    });
    if (ds === t) {
      const nm = nowMin();
      if (nm / 60 >= from && nm / 60 < to) {
        const nl = el('div', 'ag-now', `<span>${tf.format(new Date())}</span>`);
        nl.style.top = (nm / 60 - from) * HP + 'px';
        map.appendChild(nl);
      }
    }
    box.appendChild(map);
    if (!items.length) box.appendChild(el('p', 'note c', '<span>لا مهام في هذا اليوم. اضغط على أي ساعة في الخريطة لإضافة مهمة فيها.</span>'));
  }

  /* ---------- الملاحظات ---------- */
  function renderNotes(box) {
    const s = el('div', 'search', `${icon('search')}<input id="agQ" type="search" placeholder="ابحث في الملاحظات" aria-label="بحث">`);
    s.querySelector('input').value = noteQ;
    box.appendChild(s);
    const res = el('div');
    box.appendChild(res);
    const draw = () => {
      res.innerHTML = '';
      const q = noteQ.trim();
      const notes = load().filter((it) => !isTask(it) && (!q || (it.title + ' ' + (it.note || '')).includes(q)))
        .sort((a, b) => (!!b.pin - !!a.pin) || (b.upd || 0) - (a.upd || 0));
      if (!notes.length) { res.appendChild(emptyState(q ? 'لا نتائج' : 'لا ملاحظات بعد', q ? 'جرّب كلمة أخرى' : 'دوّن أفكارك وفوائدك وما تريد تذكّره')); return; }
      const grid = el('div', 'ag-notes');
      notes.forEach((it) => {
        const c = catOf(it.cat);
        const card = el('button', 'ag-note', `${it.pin ? `<span class="ag-pin">${icon('bookmark')}</span>` : ''}<b>${esc(it.title)}</b><p>${esc(it.note || '')}</p><small><span class="ag-tag">${c.n}</span>${F({ day: 'numeric', month: 'short' }).format(new Date(it.upd || Date.now()))}</small>`);
        card.style.setProperty('--cc', c.c);
        card.onclick = () => openEditor(it);
        grid.appendChild(card);
      });
      res.appendChild(grid);
    };
    s.querySelector('input').oninput = (e) => { noteQ = e.target.value; draw(); };
    draw();
  }
  const emptyState = (t, s) => el('div', 'ag-emptyst', `<span class="ag-eic">${icon('note')}</span><b>${t}</b><small>${s}</small>`);

  /* ---------- المحرّر ---------- */
  let draft = null;
  function openEditor(it, preset) {
    draft = it ? JSON.parse(JSON.stringify(it)) : Object.assign({
      id: null, type: view === 'notes' ? 'note' : 'task', title: '', note: '', cat: 'personal',
      date: view === 'notes' ? null : (view === 'cal' ? selDay : today()), time: null, remind: 15, repeat: 'none', subs: [], star: false
    }, preset || {});
    draft.subs = draft.subs || [];
    if (draft.remind == null) draft.remind = -1;
    $('agEdTitle').textContent = it ? (isTask(draft) ? 'تعديل المهمة' : 'تعديل الملاحظة') : 'إضافة جديدة';
    $('agDel').hidden = !it;
    $('agTitle').value = draft.title || '';
    $('agNote').value = draft.note || '';
    $('agSheet').hidden = false;
    requestAnimationFrame(() => $('agSheet').classList.add('in'));
    drawEditor();
    if (!it) setTimeout(() => $('agTitle').focus(), 140);
  }
  const closeEditor = () => { $('agSheet').classList.remove('in'); setTimeout(() => { $('agSheet').hidden = true; }, 220); draft = null; };

  function chips(boxId, opts, cur, onPick) {
    const box = $(boxId); box.innerHTML = '';
    opts.forEach(([v, n, color]) => {
      const b = el('button', 'chip sm' + (v === cur ? ' on' : ''), color ? `<i class="dot" style="background:${color}"></i>${n}` : n);
      b.type = 'button';
      b.onclick = () => { onPick(v); drawEditor(); };
      box.appendChild(b);
    });
  }
  function drawEditor() {
    const d = draft, task = isTask(d), t = today();
    document.querySelectorAll('#agType button').forEach((b) => b.classList.toggle('on', b.dataset.t === d.type));
    $('agStar').classList.toggle('on', !!d.star);
    $('agStar').hidden = !task;
    $('agTaskOpts').hidden = !task;
    $('agPinRow').hidden = task;
    $('agPin').checked = !!d.pin;
    chips('agCats', CATS.map((c) => [c.k, c.n, c.c]), d.cat, (v) => { d.cat = v; });
    if (!task) return;
    const nextSat = (() => { let x = addDays(t, 1); while (dow(x) !== 6) x = addDays(x, 1); return x; })();
    const dsel = d.date === t ? 't' : d.date === addDays(t, 1) ? 'tm' : d.date === nextSat ? 'nw' : !d.date ? 'no' : 'pk';
    chips('agDates', [['t', 'اليوم'], ['tm', 'غداً'], ['nw', 'الأسبوع القادم'], ['pk', 'تاريخ آخر'], ['no', 'بلا تاريخ']], dsel, (v) => {
      if (v === 't') d.date = t; else if (v === 'tm') d.date = addDays(t, 1); else if (v === 'nw') d.date = nextSat;
      else if (v === 'no') { d.date = null; d.repeat = 'none'; d.time = null; }
      else { d.date = d.date || t; setTimeout(() => { try { $('agDate2').showPicker(); } catch (e) { $('agDate2').focus(); } }, 60); }
    });
    $('agDateLbl').textContent = d.date ? dlong.format(noonOf(d.date)) : '';
    $('agDateRow').hidden = !d.date;
    $('agDate2').value = d.date || '';
    $('agWhen').hidden = !d.date;
    const tOpts = [['', 'بلا وقت']].concat(QUICK_TIMES.map((x) => [x, fmtTime(x)]));
    if (d.time && !QUICK_TIMES.includes(d.time)) tOpts.push([d.time, fmtTime(d.time)]);
    chips('agTimes', tOpts, d.time || '', (v) => { d.time = v || null; if (d.time && d.remind < 0) d.remind = 15; });
    $('agTime').value = d.time || '';
    $('agRemBox').hidden = !d.time;
    chips('agRems', REMINDS, d.remind, (v) => { d.remind = v; });
    let hint = '';
    if (d.time && d.remind >= 0 && d.date) {
      const at = dueOf(d, d.date) - d.remind * 60000;
      hint = at > Date.now() ? `يظهر التذكير في منتصف الشاشة ${dlong.format(new Date(at))} الساعة ${tf.format(new Date(at))}` : 'وقت هذا التذكير قد مضى';
    }
    $('agRemHint').textContent = hint;
    chips('agReps', REPEATS, d.repeat || 'none', (v) => { d.repeat = v; });
    drawSubs();
  }
  function drawSubs() {
    const box = $('agSubs'); box.innerHTML = '';
    draft.subs.forEach((s, i) => {
      const r = el('div', 'ag-sub' + (s.d ? ' done' : ''), `<button type="button" class="ag-ck sm" aria-label="إنجاز الخطوة"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></button><input type="text" maxlength="100" placeholder="خطوة" aria-label="خطوة"><button type="button" class="ag-subx" aria-label="حذف">${icon('x')}</button>`);
      r.querySelector('input').value = s.t;
      r.querySelector('.ag-ck').onclick = () => { s.d = !s.d; drawSubs(); };
      r.querySelector('input').oninput = (e) => { s.t = e.target.value; };
      r.querySelector('input').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('agSubAdd').click(); } };
      r.querySelector('.ag-subx').onclick = () => { draft.subs.splice(i, 1); drawSubs(); };
      box.appendChild(r);
    });
  }

  function wireEditor() {
    document.querySelectorAll('#agType button').forEach((b) => b.onclick = () => {
      draft.type = b.dataset.t;
      if (isTask(draft) && !draft.date && !draft.id) draft.date = today();
      drawEditor();
    });
    $('agStar').onclick = () => { draft.star = !draft.star; drawEditor(); };
    $('agTitle').oninput = (e) => { draft.title = e.target.value; };
    $('agNote').oninput = (e) => { draft.note = e.target.value; };
    $('agDate2').onchange = (e) => { if (e.target.value) draft.date = e.target.value; drawEditor(); };
    $('agDateRow').onclick = () => { try { $('agDate2').showPicker(); } catch (e) { $('agDate2').focus(); } };
    $('agTime').onchange = (e) => { draft.time = e.target.value || null; if (draft.time && draft.remind < 0) draft.remind = 15; drawEditor(); };
    $('agPin').onchange = (e) => { draft.pin = e.target.checked; };
    $('agSubAdd').onclick = () => {
      draft.subs.push({ t: '', d: false }); drawSubs();
      const ins = $('agSubs').querySelectorAll('input'); ins[ins.length - 1].focus();
    };
    $('agSave').onclick = () => {
      const d = draft;
      d.title = $('agTitle').value.trim(); d.note = $('agNote').value.trim();
      d.subs = (d.subs || []).map((s) => ({ t: (s.t || '').trim(), d: !!s.d })).filter((s) => s.t);
      if (!d.title) { if (d.note) d.title = d.note.split('\n')[0].slice(0, 40); else { toast('اكتب عنواناً أولاً'); $('agTitle').focus(); return; } }
      if (!isTask(d)) { d.date = null; d.time = null; d.remind = -1; d.repeat = 'none'; }
      if (!d.date) { d.time = null; d.repeat = 'none'; }
      if (!d.time) d.remind = -1;
      d.upd = Date.now();
      const list = load();
      if (d.id) { const i = list.findIndex((x) => x.id === d.id); if (i >= 0) list[i] = d; else list.push(d); }
      else { d.id = uid(); d.created = d.upd; list.push(d); }
      save(list);
      let msg = isTask(d) ? 'تم حفظ المهمة' : 'تم حفظ الملاحظة';
      if (d.remind >= 0) {
        if (B && B.notificationsAllowed && !B.notificationsAllowed()) msg = 'تم الحفظ. فعّل إشعارات التطبيق ليصلك التذكير';
        else if (B && B.canOverlay && !B.canOverlay()) { msg = 'تم الحفظ. اسمح بـ"العرض فوق التطبيقات" ليظهر التذكير في منتصف الشاشة دائماً'; if (!store.get('agOvAsked', false)) { store.set('agOvAsked', true); setTimeout(() => B.requestOverlay && B.requestOverlay(), 1600); } }
        else msg = 'تم الحفظ، وسيظهر التذكير في وقته';
      }
      toast(msg);
      if (isTask(d) && d.date) selDay = d.date;
      if (!isTask(d)) view = 'notes'; else if (view === 'notes') view = 'tasks';
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

  /* ---------- التذكير داخل الصفحة (نسخة الويب) ---------- */
  // في تطبيق أندرويد تظهر نافذة أصلية فوق كل التطبقات؛ هنا نعرضها عندما تكون الصفحة مفتوحة في المتصفح
  function popup(data) {
    RemindUI.show($('remPop'), data, {
      done: () => { RemindUI.markDone(data.tid, data.ds); if (App.reschedule) App.reschedule(); if (App.isActive('agenda')) render(); toast('أحسنت! تمّت المهمة'); },
      snooze: (min) => { const s = store.get('agSnooze', []); s.push(Object.assign({}, data, { at: Date.now() + min * 60000 })); store.set('agSnooze', s); toast(`سنذكّرك بعد ${min} دقيقة`); },
      open: () => App.go('agenda')
    });
  }
  window.agendaPopup = popup;
  if (!B) {
    let last = Date.now();
    setInterval(() => {
      const now = Date.now(), due = [];
      window.Agenda.notifs(state, now, (at, title, body, extra) => { if (at > last - 1000 && at <= now) due.push(JSON.parse(extra.popup)); });
      const sn = store.get('agSnooze', []);
      const keep = sn.filter((s) => { if (s.at <= now) { due.push(s); return false; } return true; });
      if (keep.length !== sn.length) store.set('agSnooze', keep);
      last = now;
      if (due.length && !$('remPop').firstChild) popup(due[0]);
    }, 15000);
  }

  /* ---------- ربط الشاشة ---------- */
  document.querySelectorAll('#agSeg button').forEach((b) => b.onclick = () => { view = b.dataset.v; render(); });
  $('agFab').onclick = () => openEditor(null);
  wireEditor();
  App.screens.agenda = () => render();
  setInterval(() => { if (App.isActive('agenda') && !document.hidden && $('agSheet').hidden && view !== 'notes' && document.activeElement.tagName !== 'INPUT') render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && App.isActive('agenda') && $('agSheet').hidden) render(); });
  load(); // ترحيل بيانات النسخة السابقة قبل أول جدولة
  if (App.reschedule) App.reschedule();
})();
