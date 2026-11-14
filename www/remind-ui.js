// نافذة التذكير في منتصف الشاشة (تُستخدم داخل التطبيق وفي نافذة أندرويد المنبثقة reminder.html)
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: (window.Core && Core.TZ) || 'Asia/Hebron' });
  const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function left(due) {
    const m = Math.round((due - Date.now()) / 60000);
    if (Math.abs(m) < 1) return 'الآن';
    const a = Math.abs(m);
    const txt = a < 60 ? `${a} دقيقة` : a < 1440 ? `${Math.floor(a / 60)} س${a % 60 ? ` و${a % 60} د` : ''}` : `${Math.round(a / 1440)} يوم`;
    return m > 0 ? `بعد ${txt}` : `منذ ${txt}`;
  }

  // يضع علامة الإنجاز مباشرة في بيانات الأجندة المحفوظة
  function markDone(tid, ds) {
    try {
      const list = JSON.parse(localStorage.getItem('agenda') || '[]');
      const it = list.find((x) => x.id === tid);
      if (!it) return false;
      if (it.repeat && it.repeat !== 'none') { it.doneOn = it.doneOn || {}; it.doneOn[ds] = 1; } else it.done = true;
      it.upd = Date.now();
      localStorage.setItem('agenda', JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }

  let timer = null;
  function show(host, d, h) {
    h = h || {};
    clearInterval(timer);
    const color = d.color || 'var(--gold)';
    const subs = (d.subs || []).filter((s) => !s.d).slice(0, 4);
    host.innerHTML = `<div class="rp" role="alertdialog" aria-modal="true" aria-labelledby="rpT" style="--rc:${esc(color)}">
      <div class="rp-scrim"></div>
      <div class="rp-card">
        <div class="rp-glow"></div>
        <div class="rp-bellwrap"><span class="rp-wave"></span><span class="rp-wave w2"></span><span class="rp-bell">${BELL}</span></div>
        <div class="rp-eyebrow">${esc(d.cat || 'تذكير بمهمة')}</div>
        <h2 id="rpT" class="rp-title">${esc(d.title)}</h2>
        ${d.due ? `<div class="rp-when"><b>${tf.format(new Date(d.due))}</b><span id="rpLeft">${left(d.due)}</span></div>` : ''}
        ${d.body ? `<p class="rp-body">${esc(d.body)}</p>` : ''}
        ${subs.length ? `<ul class="rp-subs">${subs.map((s) => `<li>${esc(s.t)}</li>`).join('')}</ul>` : ''}
        <button class="rp-done" type="button" data-a="done"><span>${CHECK}</span>تمّ الإنجاز</button>
        <div class="rp-row">
          <button type="button" data-a="s10">تأجيل 10 د</button>
          <button type="button" data-a="s30">تأجيل 30 د</button>
          ${h.open ? '<button type="button" data-a="open">فتح</button>' : ''}
        </div>
        <button class="rp-x" type="button" data-a="close">إغلاق</button>
      </div></div>`;
    const root = host.firstElementChild;
    requestAnimationFrame(() => root.classList.add('in'));
    if (d.due) timer = setInterval(() => { const e = host.querySelector('#rpLeft'); if (e) e.textContent = left(d.due); }, 15000);
    const finish = (fn) => {
      clearInterval(timer);
      root.classList.remove('in'); root.classList.add('out');
      setTimeout(() => { host.innerHTML = ''; if (fn) fn(); }, 260);
    };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'done') { root.querySelector('.rp-card').classList.add('ok'); setTimeout(() => finish(h.done), 420); }
      else if (a === 's10') finish(() => h.snooze && h.snooze(10));
      else if (a === 's30') finish(() => h.snooze && h.snooze(30));
      else if (a === 'open') finish(h.open);
      else finish(h.close);
    });
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
    setTimeout(() => { const b = root.querySelector('.rp-done'); if (b) b.focus(); }, 300);
  }

  /* ---------- نافذة حضور الموظفين ---------- */
  const ARR_IN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/></svg>';
  const ARR_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>';
  const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const INI = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  const accentOf = (v) => v.st === 'outside' ? '#F2716A' : v.late > 0 ? '#F0A64B' : v.kind === 'out' ? '#5B9DFF' : '#2FBF71';
  const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} س`;
  const dist = (d) => d == null ? '' : d >= 1000 ? (d / 1000).toFixed(1) + ' كم' : d + ' م';
  const TYPE_AR = { office: 'مكتبي', field: 'ميداني' };
  function chipsOf(v) {
    const c = [];
    if (v.kind === 'in') c.push(v.late > 0 ? `<span class="ap-chip warn">متأخر ${v.late} د</span>` : '<span class="ap-chip ok">في الموعد</span>');
    if (v.kind === 'out' && v.work) c.push(`<span class="ap-chip info">ساعات العمل ${hhmm(v.work)}</span>`);
    if (v.st === 'matched') c.push(`<span class="ap-chip ok">داخل موقع العمل${v.dist != null ? ' · ' + dist(v.dist) : ''}</span>`);
    else if (v.st === 'outside') c.push(`<span class="ap-chip bad">خارج نطاق الموقع${v.dist != null ? ' · ' + dist(v.dist) : ''}</span>`);
    return c.join('');
  }
  // d = { events:[{ name, dept, org, type, kind:'in'|'out', ts, late, st, place, dist, work, empId, ds }] }
  function showAttendance(host, d, h) {
    h = h || {};
    clearInterval(timer);
    const ev = (d.events || []).slice().sort((a, b) => a.ts - b.ts);
    if (!ev.length) return;
    const last = ev[ev.length - 1], many = ev.length > 1;
    const color = many ? (ev.some((x) => x.st === 'outside') ? '#F2716A' : ev.some((x) => x.late > 0) ? '#F0A64B' : '#2FBF71') : accentOf(last);
    const ms = many ? 20000 : 14000;
    const body = many
      ? `<div class="ap-top"><span class="ap-pill"><i></i>تحديث الحضور</span><span class="ap-time">${tf.format(new Date(last.ts))}</span></div>
         <div class="ap-count"><b>${ev.length}</b><span>تسجيلات جديدة</span></div>
         <ul class="ap-list">${ev.slice(-6).reverse().map((v) => `<li style="--ac:${accentOf(v)}"><span class="ap-mini">${v.kind === 'in' ? ARR_IN : ARR_OUT}</span><div><b>${esc(v.name)}</b><small>${v.kind === 'in' ? 'دخول' : 'خروج'} ${tf.format(new Date(v.ts))}${v.late > 0 ? ' · متأخر ' + v.late + ' د' : ''}${v.st === 'outside' ? ' · خارج الموقع' : ''}</small></div></li>`).join('')}${ev.length > 6 ? `<li class="more">و${ev.length - 6} آخرين</li>` : ''}</ul>`
      : `<div class="ap-top"><span class="ap-pill"><i></i>${last.kind === 'in' ? 'حضور جديد' : 'انصراف جديد'}</span><span class="ap-time">الآن</span></div>
         <div class="ap-av"><span class="ap-ring"></span><span class="ap-ring r2"></span><span class="ap-ini">${esc(INI(last.name))}</span><span class="ap-kind">${last.kind === 'in' ? ARR_IN : ARR_OUT}</span></div>
         <h2 class="rp-title" id="rpT">${esc(last.name)}</h2>
         <div class="ap-sub">${esc([last.dept, last.org, TYPE_AR[last.type]].filter(Boolean).join(' · '))}</div>
         <div class="ap-what"><span>${last.kind === 'in' ? 'سجّل دخوله' : 'سجّل انصرافه'}</span><b>${tf.format(new Date(last.ts))}</b></div>
         <div class="ap-chips">${chipsOf(last)}</div>
         ${last.place ? `<div class="ap-place">${PIN}<span>${esc(last.place)}</span></div>` : ''}`;
    host.innerHTML = `<div class="rp ap" role="alertdialog" aria-modal="true" style="--rc:${color}">
      <div class="rp-scrim"></div>
      <div class="rp-card ap-card">
        <div class="rp-glow"></div>
        ${body}
        <div class="ap-btns"><button type="button" class="ap-view" data-a="view">${many ? 'عرض الحضور' : 'عرض سجل اليوم'}</button><button type="button" class="ap-x" data-a="close">إغلاق</button></div>
        <div class="ap-bar"><i style="animation-duration:${ms}ms"></i></div>
      </div></div>`;
    const root = host.firstElementChild;
    requestAnimationFrame(() => root.classList.add('in'));
    let auto = setTimeout(() => finish(h.close), ms);
    const stopAuto = () => { clearTimeout(auto); const b = root.querySelector('.ap-bar'); if (b) b.style.opacity = '0'; };
    root.addEventListener('pointerdown', stopAuto, { once: true });
    const finish = (fn) => {
      clearTimeout(auto);
      root.classList.remove('in'); root.classList.add('out');
      setTimeout(() => { host.innerHTML = ''; if (fn) fn(); }, 260);
    };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'view') finish(() => h.view && h.view(many ? null : last)); else finish(h.close);
    });
    if (navigator.vibrate) navigator.vibrate([90, 60, 90]);
  }

  window.RemindUI = { show, showAttendance, markDone, left };
})();
