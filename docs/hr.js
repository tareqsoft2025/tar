// شاشات الموارد البشرية: الدخول، لوحة اليوم، الحضور، الموظفون، العقود، التكليفات، الإعدادات
(function () {
  const { $, icon, toast, store } = App;
  const B = App.B;
  const TZ = Core.TZ;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = (o) => new Intl.DateTimeFormat('ar-PS-u-nu-latn', Object.assign({ timeZone: TZ }, o));
  const tf = F({ hour: 'numeric', minute: '2-digit', hour12: true });
  const dF = F({ day: 'numeric', month: 'short', year: 'numeric' });
  const dLong = F({ weekday: 'long', day: 'numeric', month: 'long' });
  const today = () => Tracker.dayStr();
  const addDays = Tracker.addDays;
  const noon = (ds) => new Date(ds + 'T12:00:00Z');
  const fd = (ds) => { if (!ds) return '—'; const [y, m, d] = String(ds).slice(0, 10).split('-'); return y && m && d ? `${+d}/${+m}/${y}` : String(ds); };
  const daysTo = (ds) => ds ? Math.round((noon(ds) - noon(today())) / 864e5) : null;
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'الآن' : m < 60 ? `منذ ${m} د` : m < 1440 ? `منذ ${Math.round(m / 60)} س` : `منذ ${Math.round(m / 1440)} يوم`; };
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  const TYPE = { office: 'مكتبي', field: 'ميداني' };
  const KIND = { contract: 'عقد', extension: 'تمديد', annex: 'ملحق', placement: 'تسكين', amendment: 'تعديل' };
  const STATUS = { present: ['حاضر', 'ok'], late: ['متأخر', 'warn'], absent: ['بلا تسجيل', 'bad'], leave: ['إجازة / مهمة', 'info'], off: ['عطلة', 'mute'], noin: ['بلا دخول', 'warn'] };
  const LEAVE = { annual: 'سنوية', sick: 'مرضية', mission: 'مهمة عمل', task: 'مهمة', official: 'رسمية', unpaid: 'بدون راتب', leave: 'إجازة', holiday: 'عطلة', compensatory: 'تعويضية', maternity: 'أمومة' };
  Object.assign(LEAVE, { emergency: 'طارئة', marriage: 'زواج', study_leave: 'دراسية', official_duty: 'مهمة رسمية', work_mission: 'مهمة عمل', personal_hourly: 'مغادرة شخصية', hajj: 'حج', bereavement: 'وفاة', paternity: 'أبوة' });
  const leaveLbl = (n) => LEAVE[String(n || '').toLowerCase()] || n || 'إجازة';
  const RQ = { daily: ['إجازة يومية', 'info', 'cal'], hourly: ['مغادرة ساعية', 'warn', 'clock'], mission: ['مهمة عمل', 'ok', 'briefcase'], overtime: ['عمل إضافي', 'k-annex', 'plus'], holiday: ['عمل في عطلة', 'k-placement', 'star'] };
  const RQS = { draft: ['مسودة', 'mute'], submitted: ['مُرسل', 'warn'], pending: ['قيد الاعتماد', 'warn'], manager_approved: ['معتمد من المدير', 'info'], approved: ['معتمد', 'ok'], rejected: ['مرفوض', 'bad'], cancelled: ['ملغى', 'bad'], canceled: ['ملغى', 'bad'], new: ['جديد', 'info'] };
  const rqStatus = (st) => st ? (RQS[st] || [st, 'mute']) : null;
  const hhm = (h) => { const n = +h; if (!isFinite(n) || !n) return null; const H = Math.floor(n), M = Math.round((n - H) * 60); return `${H}:${String(M).padStart(2, '0')} س`; };
  const rqWhen = (q) => q.kind === 'daily' ? (q.from === q.to ? fd(q.from) : `${fd(q.from)} ← ${fd(q.to)}`) + (q.days ? ` (${q.days} يوم)` : '') : `${fd(q.from)}${q.start ? ' · ' + q.start + (q.end ? ' ← ' + q.end : '') : ''}${hhm(q.hours) ? ' · ' + hhm(q.hours) : ''}`;
  const rqChip = (q) => `<span class="hr-b ${RQ[q.kind][1]}">${RQ[q.kind][0]}${q.kind === 'daily' && q.nature ? ' · ' + esc(leaveLbl(q.nature)) : q.start ? ' ' + q.start + (q.end ? ' ← ' + q.end : '') : ''}</span>`;
  const hrs = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} س`;
  const plName = (pl) => pl.name || (pl.st === 'outside' && pl.near ? 'أقرب موقع: ' + pl.near : PLACE[pl.st][0]);
  const PLACE = { matched: ['داخل موقع العمل', 'ok'], outside: ['خارج نطاق الموقع', 'bad'], unknown: ['بلا موقع جغرافي', 'mute'] };
  const fmtDist = (d) => d == null ? '' : d >= 1000 ? (d / 1000).toFixed(1) + ' كم' : d + ' م';

  let tab = store.get('hrTab', 'dash');
  const f = Object.assign({ day: today(), org: 'all', type: 'all', st: 'all', q: '', es: 'active', ck: 'all', cs: 'active', cf: 'all', ws: 'hours', wf: 'all', as: 'month', av: 'emp', am: today().slice(0, 7), proj: 'all' }, store.get('hrF', {}));
  if (!/^\d{4}-\d{2}$/.test(f.am || '')) f.am = today().slice(0, 7);
  f.day = today(); f.q = '';
  const saveF = () => store.set('hrF', { org: f.org, type: f.type, es: f.es, ck: f.ck, cs: f.cs, cf: f.cf, as: f.as, av: f.av });

  /* ---------- الهيكل ---------- */
  function render() {
    const box = $('hrBody'); box.innerHTML = '';
    $('hrSync').hidden = !HR.hasSession();
    $('hrBell').hidden = !HR.hasSession();
    updateBell();
    if (!HR.hasSession()) { renderLogin(box); return; }
    const meta = HR.meta();
    const acc = el('div', 'hr-acc', `<span class="hr-av">${icon('users')}</span><div><b>نظام PEF</b><small id="hrSyncTxt">${meta.lastSync ? 'آخر مزامنة ' + ago(meta.lastSync) : 'لم تتم المزامنة بعد'}</small></div><div class="hr-prog" id="hrProg" hidden><i></i></div>`);
    box.appendChild(acc);
    // خمسة أقسام ثابتة، وتحتها شرائح فرعية لقسم التقارير
    const secOf = () => tab === 'dash' ? 'today' : tab === 'emp' ? 'team' : tab === 'set' ? 'more' : (tab === 'lv' && f.lv === 'req') ? 'req' : 'rep';
    const pend = pendingReqs().length;
    const nav = el('div', 'hr2-nav');
    [['today', 'اليوم', 'grid', () => { tab = 'dash'; }], ['team', 'الفريق', 'users', () => { tab = 'emp'; }], ['req', 'الطلبات', 'inbox', () => { tab = 'lv'; f.lv = 'req'; }],
      ['rep', 'التقارير', 'chart', () => { if (secOf() !== 'rep') tab = 'att'; }], ['more', 'المزيد', 'sliders', () => { tab = 'set'; }]].forEach(([k, n, ic, go]) => {
      const b = el('button', 'hr2-n' + (secOf() === k ? ' on' : ''), `${icon(ic)}<span>${n}</span>${k === 'req' && pend ? `<i class="hr2-bd">${pend > 99 ? '99+' : pend}</i>` : ''}`);
      b.type = 'button';
      b.onclick = () => { go(); f.q = ''; store.set('hrTab', tab); selOff(); render(); window.scrollTo && window.scrollTo(0, 0); };
      nav.appendChild(b);
    });
    box.appendChild(nav);
    if (secOf() === 'rep') {
      const sub = el('div', 'chips hr-tabs');
      [['att', 'الحضور', 'clock'], ['sites', 'المواقع', 'pin'], ['wk', 'ساعات الأسبوع', 'chart'], ['bal', 'الأرصدة', 'cal'], ['con', 'العقود', 'note'], ['asg', 'التكليفات', 'briefcase']].forEach(([k, n, ic]) => {
        const on = k === 'bal' ? tab === 'lv' : tab === k;
        const b = el('button', 'chip sm' + (on ? ' on' : ''), `${icon(ic)}${n}`);
        b.onclick = () => { if (k === 'bal') { tab = 'lv'; f.lv = 'bal'; } else tab = k; f.q = ''; store.set('hrTab', tab); selOff(); render(); };
        sub.appendChild(b);
      });
      box.appendChild(sub);
    }
    const body = el('div', 'hr-view'); box.appendChild(body);
    if (!meta.lastSync && tab !== 'set') { renderFirst(body); return; }
    ({ dash: renderDash, sites: renderSites, att: renderAtt, wk: renderWeek, lv: renderLv, emp: renderEmp, con: renderCon, asg: renderAsg, set: renderSet }[tab] || renderDash)(body);
    const on = box.querySelector('.hr-tabs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    // زر "تحديد" في شريط أدوات القائمة
    const ts = body.querySelectorAll('.hr-tools');
    if (SELTABS.includes(tab) && ts.length) addSelBtn(ts[ts.length - 1]);
    selBarUpdate();
  }

  /* ---------- تسجيل الدخول ---------- */
  function renderLogin(box) {
    const c = el('div', 'hr-login', `
      <div class="hr-lhero"><span class="hr-lic">${icon('users')}</span><b>ربط حسابك بنظام المؤسسة</b><small>PEF Comprehensive System · جمعية أصدقاء البيئة الفلسطينية</small></div>
      <form id="hrLoginF" autocomplete="on">
        <label class="hr-f"><span>رقم الهوية</span><input id="hrUser" inputmode="numeric" autocomplete="username" required></label>
        <label class="hr-f"><span>كلمة المرور</span><div class="hr-pw"><input id="hrPass" type="password" autocomplete="current-password" required><button type="button" id="hrEye" aria-label="إظهار">${icon('eye')}</button></div></label>
        <label class="ag-check hr-rem"><input id="hrRem" type="checkbox" checked> حفظ بيانات الدخول على هذا الجوال</label>
        <div id="hrLErr" class="hr-err" hidden></div>
        <button class="btn-gold" id="hrLBtn" type="submit">تسجيل الدخول</button>
      </form>
      <ul class="hr-notes">
        <li>${icon('check')}<span>الاتصال مباشر بين جوالك ونظام المؤسسة فقط.</span></li>
        <li>${icon('check')}<span>عند اختيار "حفظ بيانات الدخول" تُشفَّر كلمة المرور بمفتاح أندرويد الآمن، ويعيد التطبيق الدخول تلقائياً عند انتهاء الجلسة.</span></li>
        <li>${icon('check')}<span>البيانات تُحفظ على جوالك وتعمل بدون إنترنت، وتُحدَّث بزر المزامنة.</span></li>
        <li>${icon('info')}<span>التطبيق يقرأ البيانات فقط ولا يعدّل شيئاً في النظام.</span></li>
      </ul>`);
    box.appendChild(c);
    $('hrUser').value = localStorage.getItem('hrUser') || '';
    $('hrEye').onclick = () => { const p = $('hrPass'); p.type = p.type === 'password' ? 'text' : 'password'; };
    $('hrLoginF').onsubmit = async (e) => {
      e.preventDefault();
      const u = $('hrUser').value.trim(), p = $('hrPass').value;
      const err = $('hrLErr'); err.hidden = true;
      if (!u || !p) return;
      $('hrLBtn').disabled = true; $('hrLBtn').textContent = 'جارٍ الدخول…';
      const r = await HR.login(u, p, $('hrRem').checked);
      $('hrLBtn').disabled = false; $('hrLBtn').textContent = 'تسجيل الدخول';
      if (!r.ok) { err.textContent = HR.errText(r); err.hidden = false; return; }
      localStorage.setItem('hrUser', u);
      if (!B) localStorage.setItem('hrWebSession', '1');
      toast('تم ربط حسابك بنجاح');
      tab = 'dash'; render(); applyBg(); doSync();
    };
  }

  function renderFirst(body) {
    body.appendChild(el('div', 'hr-empty', `<span class="hr-eic">${icon('refresh')}</span><b>جاهز للمزامنة الأولى</b><small>سنجلب الموظفين والعقود والتكليفات وكل سجلات الحضور والانصراف من ${fd(HR.settings().attStart)} حتى اليوم ونحفظها على جوالك. بعد ذلك تجلب كل مزامنة الجديد والمتغيّر فقط. (يمكن تغيير تاريخ البداية من الإعدادات)</small>`));
    const b = el('button', 'btn-gold', 'ابدأ المزامنة');
    b.onclick = doSync; body.appendChild(b);
  }

  /* ---------- المزامنة ---------- */
  async function doSync(silent) {
    if (HR.isSyncing()) return;
    silent = silent === true;
    const btn = $('hrSync'); btn.classList.add('spin');
    const prog = () => $('hrProg'), txt = () => $('hrSyncTxt');
    if (prog()) prog().hidden = false;
    try {
      const st = await HR.sync((m) => { if (txt()) txt().textContent = 'جارٍ المزامنة: ' + m; }, { requests: !silent });
      if (!st) return;
      const parts = [];
      const add = (n, s) => { if (s && (s.added || s.updated || s.removed)) parts.push(`${n}: ${s.added ? '+' + s.added + ' جديد' : ''}${s.updated ? ' ' + s.updated + ' محدّث' : ''}${s.removed ? ' ' + s.removed + ' محذوف' : ''}`.trim()); };
      add('الموظفون', st.employees); add('العقود', st.contracts); add('التكليفات', st.assignments);
      if (st.attendance && st.attendance.changed) parts.push(`الحضور: ${st.attendance.changed} يوم محدّث`);
      const bad = st.errors && st.errors.length;
      if (bad) toast('تمت المزامنة جزئياً بسبب ضعف الاتصال (' + bad + ' قسم متبقٍ) — سيُستكمل تلقائياً' + (parts.length ? ' — ' + parts.join('، ') : ''));
      else if (!silent || parts.length) toast(parts.length ? 'تمت المزامنة — ' + parts.join('، ') : 'تمت المزامنة، لا تغييرات جديدة');
      if (st.fresh && st.fresh.length) showAttPopup(st.fresh);
      const dg = HR.maybeDigest(); if (dg) toast('ملخص اليوم: ' + dg.body);
    } catch (e) {
      if (e.res && e.res.status === 401) { toast('انتهت الجلسة، سجّل الدخول من جديد'); HR.logout(); }
      else if (!silent) toast(e.message || 'تعذّرت المزامنة');
    } finally { btn.classList.remove('spin'); updateBell(); if (App.isActive('hr')) render(); }
  }

  // نافذة منتصف الشاشة عند وصول تسجيل حضور/انصراف جديد
  function showAttPopup(fresh, tries) {
    const ev = HR.alertFilter(fresh);
    if (!ev.length) return;
    const host = $('remPop');
    if (host.firstChild) { if ((tries || 0) < 8) setTimeout(() => showAttPopup(fresh, (tries || 0) + 1), 4000); return; }
    RemindUI.showAttendance(host, { events: ev }, {
      view: (v) => {
        App.go('hr');
        if (v) openDay(v.empId, v.ds); else { tab = 'att'; store.set('hrTab', 'att'); f.day = today(); render(); }
      }
    });
  }
  window.hrAttPopup = showAttPopup;

  /* ---------- مكوّنات ---------- */
  function filterChips(parent, key, opts, counts) {
    const row = el('div', 'chips hr-fc');
    opts.forEach(([v, n]) => {
      const c = counts && counts[v] != null ? `<em>${counts[v]}</em>` : '';
      const b = el('button', 'chip sm' + (f[key] === v ? ' on' : ''), n + c);
      b.onclick = () => { f[key] = v; saveF(); render(); };
      row.appendChild(b);
    });
    parent.appendChild(row);
  }
  function search(parent, ph) {
    const s = el('div', 'search hr-search', `${icon('search')}<input type="search" placeholder="${ph}" aria-label="بحث">`);
    const i = s.querySelector('input'); i.value = f.q;
    let h; i.oninput = () => { clearTimeout(h); h = setTimeout(() => { f.q = i.value; const pos = i.selectionStart; render(); const n = document.querySelector('.hr-search input'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); };
    parent.appendChild(s);
  }
  const match = (q, ...vals) => !q || vals.some((v) => v != null && String(v).toLowerCase().includes(q.toLowerCase()));
  const orgOk = (e) => f.org === 'all' || e.org === f.org;
  const typeOk = (e) => f.type === 'all' || e.type === f.type;
  function personRow(e, right, sub, tone) {
    const r = el('button', 'hr-row');
    r.innerHTML = `<span class="hr-ava ${tone || ''}">${esc(initials(e.name))}</span><span class="hr-rt"><b>${esc(e.name)}</b><small>${sub != null ? sub : esc([e.pos || e.dept, TYPE[e.type], e.org].filter(Boolean).join(' · '))}</small></span><span class="hr-rr">${right || ''}</span>`;
    r.onclick = () => openEmp(e.id);
    r.dataset.emp = e.id;
    return r;
  }
  function list(parent, rows, empty, limit) {
    if (!rows.length) { parent.appendChild(el('div', 'hr-none', empty)); return; }
    const g = el('div', 'hr-list');
    rows.slice(0, limit || 400).forEach((r) => g.appendChild(r));
    parent.appendChild(g);
    decorate(g);
    if (rows.length > (limit || 400)) parent.appendChild(el('p', 'note c', `<span>يُعرض أول ${limit || 400} من ${rows.length}. استخدم البحث أو الفلاتر.</span>`));
  }
  const badge = (txt, tone) => `<span class="hr-b ${tone || ''}">${txt}</span>`;
  const remain = (ds) => { const d = daysTo(ds); if (d == null) return ''; return d < 0 ? badge(`انتهى منذ ${-d} يوم`, 'mute') : d === 0 ? badge('ينتهي اليوم', 'bad') : badge(`${d} يوم`, d <= 30 ? 'bad' : d <= 60 ? 'warn' : 'ok'); };
  function shareList(title, lines) {
    const text = title + '\n' + lines.join('\n');
    if (B && B.share) B.share(text); else if (navigator.share) navigator.share({ text }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(text); toast('تم النسخ'); }
  }

  // تفصيل الحضور حسب الجهة (PEF/HHO) ونوع الدوام (مكتبي/ميداني)
  function breakdown(body, rows, ds, apply) {
    const groups = [['PEF', 'PEF', (r) => r.e.org === 'PEF', { org: 'PEF', type: 'all' }], ['HHO', 'HHO', (r) => r.e.org === 'HHO', { org: 'HHO', type: 'all' }],
      ['office', 'المكتبي', (r) => r.e.type !== 'field', { org: 'all', type: 'office' }], ['field', 'الميداني', (r) => r.e.type === 'field', { org: 'all', type: 'field' }]];
    const box = el('div', 'hr-bd');
    box.appendChild(el('div', 'hr-bd-h', '<span></span><span>الكل</span><span>حاضر</span><span>متأخر</span><span>بلا تسجيل</span><span>إجازة</span>'));
    groups.forEach(([key, label, test, flt], i) => {
      const g = rows.filter(test);
      const n = (fn) => g.filter(fn).length;
      const present = n((r) => r.list.length), late = n((r) => r.status === 'late'), absent = n((r) => r.status === 'absent'), leave = n((r) => r.status === 'leave');
      const pct = g.length ? Math.round(present * 100 / g.length) : 0;
      const row = el('button', 'hr-bd-r' + (i === 2 ? ' sep' : ''), `<span class="hr-bd-n"><b>${label}</b><i style="--p:${pct}%"></i></span><span>${g.length}</span><span class="ok">${present}</span><span class="warn">${late}</span><span class="bad">${absent}</span><span class="info">${leave}</span>`);
      row.type = 'button';
      row.onclick = () => apply(flt);
      box.appendChild(row);
    });
    body.appendChild(box);
  }

  const pendingReqs = () => { try { return HR.pendingReqs(); } catch (e) { return []; } };



  /* ---------- الحضور في المواقع: عدد الحاضرين في كل موقع عمل ---------- */
  // يُحسب من بيانات اليوم المحفوظة على الجهاز (بلا أي طلب للنظام)
  function siteStats(ds, filt) {
    const rep = HR.dayReport(ds), isToday = ds === today(), groups = new Map();
    const mk = (key, name, kind) => { if (!groups.has(key)) groups.set(key, { key, name, kind, rows: [], inside: 0 }); return groups.get(key); };
    const byName = {};
    HR.sites().forEach((x) => { const g = mk('s:' + x.id, x.name || 'موقع', 'site'); byName[x.name] = g; });
    let active = 0;
    rep.rows.forEach((r) => {
      if (filt && !filt(r)) return;
      active++;
      if (!r.list.length) return;
      const ins = r.list.filter((x) => x.eventType === 'check_in');
      const ev = ins[ins.length - 1] || r.list[r.list.length - 1];
      const pl = HR.place(ev);
      const g = pl.st === 'matched' ? (byName[pl.name] || mk('n:' + pl.name, pl.name || 'موقع', 'site')) : pl.st === 'outside' ? mk('out', 'خارج نطاق مواقع العمل', 'outside') : mk('unk', 'بلا موقع جغرافي', 'unknown');
      g.rows.push({ r, ev, pl });
      if (isToday && r.openShift) g.inside++;
    });
    const list = [...groups.values()].sort((a, b) => (a.kind === 'site' ? 0 : 1) - (b.kind === 'site' ? 0 : 1) || b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'ar'));
    const total = list.reduce((n, g) => n + g.rows.length, 0);
    return { rep, list, total, active, isToday, inside: list.reduce((n, g) => n + g.inside, 0) };
  }
  const openSites = new Set();
  function renderSites(body) {
    const nav = el('div', 'hr-dnav', `<button class="icon-btn flip" data-d="-1" aria-label="اليوم السابق">${icon('chev')}</button><label><b>${f.day === today() ? 'اليوم' : dLong.format(noon(f.day))}</b><small>${fd(f.day)}</small><input type="date" value="${f.day}" max="${today()}"></label><button class="icon-btn" data-d="1" aria-label="اليوم التالي" ${f.day >= today() ? 'disabled' : ''}>${icon('chev')}</button>`);
    nav.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { f.day = addDays(f.day, +b.dataset.d); render(); });
    nav.querySelector('input').onchange = (e) => { if (e.target.value) { f.day = e.target.value; render(); } };
    body.appendChild(nav);
    if (!HR.dayReport(f.day).synced) { body.appendChild(el('div', 'hr-empty', `<span class="hr-eic">${icon('pin')}</span><b>حضور هذا اليوم غير محفوظ على الجهاز</b><small>زامن من زر المزامنة لعرض الحضور في المواقع.</small>`)); return; }
    filterChips(body, 'org', [['all', 'الكل'], ['PEF', 'PEF'], ['HHO', 'HHO']]);
    filterChips(body, 'type', [['all', 'الكل'], ['office', 'مكتبي'], ['field', 'ميداني']]);
    const st = siteStats(f.day, (r) => orgOk(r.e) && typeOk(r.e));
    const max = Math.max(1, ...st.list.map((g) => g.rows.length));
    body.appendChild(el('div', 'st-sum', `<div><b>${st.total}</b><small>سجّلوا حضوراً من ${st.active}</small></div>${st.isToday ? `<div><b>${st.inside}</b><small>داخل الدوام الآن</small></div>` : ''}<div><b>${st.list.filter((g) => g.kind === 'site' && g.rows.length).length}</b><small>مواقع بها حضور</small></div>`));
    const tools = el('div', 'hr-tools', `<small>${st.list.length} موقع</small><span><button class="hr-tmap">${icon('pin')}الخريطة</button><button class="hr-tshare">${icon('share')}مشاركة</button></span>`);
    const allRows = st.list.flatMap((g) => g.rows.map((x) => x.r));
    tools.querySelector('.hr-tmap').onclick = () => openAllMap(allRows, f.day);
    tools.querySelector('.hr-tshare').onclick = () => shareList(`الحضور في المواقع ${fd(f.day)}`, st.list.filter((g) => g.rows.length).map((g) => `${g.name}: ${g.rows.length}${st.isToday ? ' (داخل الآن ' + g.inside + ')' : ''}\n   ` + g.rows.map((x) => x.r.e.name).join('، ')));
    body.appendChild(tools);
    if (!st.list.length) { body.appendChild(el('div', 'hr-none', 'لا مواقع عمل محفوظة بعد، اضغط زر المزامنة')); return; }
    st.list.forEach((g) => {
      const open = openSites.has(g.key), n = g.rows.length;
      const card = el('section', 'st-card ' + g.kind + (open ? ' open' : '') + (n ? '' : ' zero'));
      card.innerHTML = `<button type="button" class="st-h" aria-expanded="${open}"><span class="st-ic">${icon(g.kind === 'site' ? 'pin' : 'alert')}</span><span class="st-t"><b>${esc(g.name)}</b><small>${n ? (st.isToday ? `داخل الآن ${g.inside} · انصرف ${n - g.inside}` : `${n} سجّلوا حضوراً`) : 'لا حضور'}</small></span><span class="st-n">${n}</span></button><div class="st-bar"><i style="width:${Math.round(n / max * 100)}%"></i></div><div class="st-b"></div>`;
      const bodyEl = card.querySelector('.st-b');
      g.rows.slice().sort((a, z) => String(a.ev.recordedAt).localeCompare(String(z.ev.recordedAt))).forEach(({ r, ev }) => {
        const row = el('button', 'st-e', `<span class="hr-ava ${r.status === 'late' ? 'warn' : r.openShift ? 'ok' : 'mute'}">${esc(initials(r.e.name))}</span><span class="st-et"><b>${esc(r.e.name)}</b><small>${esc([r.e.dept, TYPE[r.e.type], r.e.org].filter(Boolean).join(' · '))}</small></span><span class="st-ee"><time>${tf.format(new Date(ev.recordedAt))}</time>${r.lateMin > 0 ? badge('+' + r.lateMin + ' د', 'warn') : ''}${st.isToday ? badge(r.openShift ? 'داخل' : 'منصرف', r.openShift ? 'ok' : 'mute') : ''}</span>`);
        row.type = 'button'; row.onclick = () => openDay(r.e.id, f.day); bodyEl.appendChild(row);
      });
      card.querySelector('.st-h').onclick = () => { if (openSites.has(g.key)) openSites.delete(g.key); else openSites.add(g.key); card.classList.toggle('open'); card.querySelector('.st-h').setAttribute('aria-expanded', card.classList.contains('open')); };
      body.appendChild(card);
    });
  }

  /* ---------- مركز الإشعارات ---------- */
  const NT = { att: ['clock', 'ok'], req: ['inbox', 'info'], digest: ['bell', 'warn'] };
  function updateBell() {
    const n = $('hrBellN'); if (!n) return;
    let c = 0; try { c = HR.unreadCount(); } catch (e) { c = 0; }
    n.hidden = !c; n.textContent = c > 99 ? '99+' : String(c);
  }
  let ntFilter = 'all';
  function openInbox() {
    const list = HR.notices();
    const shown = list.filter((n) => ntFilter === 'unread' ? !n.read : ntFilter === 'todo' ? !n.done : true);
    const dayName = (ms) => { const d = new Date(ms).toISOString().slice(0, 10), t = today(); return d === t ? 'اليوم' : d === addDays(t, -1) ? 'أمس' : fd(d); };
    let last = '';
    const rows = shown.map((n) => {
      const g = dayName(n.at), head = g !== last ? `<div class="nt-day">${g}</div>` : ''; last = g;
      const [ic, tone] = NT[n.type] || ['bell', 'mute'];
      return `${head}<div class="nt${n.read ? '' : ' unread'}${n.done ? ' done' : ''}" data-id="${esc(n.id)}"><button type="button" class="nt-main" data-open="${esc(n.id)}"><span class="nt-ic ${n.data && n.data.bad ? 'bad' : tone}">${icon(ic)}</span><span class="nt-t"><b>${esc(n.title)}</b><small>${esc(n.body || '')}</small></span><time>${tf.format(new Date(n.at))}</time></button><button type="button" class="nt-done" data-done="${esc(n.id)}" aria-label="${n.done ? 'إلغاء تم التصرف' : 'تم التصرف'}">${icon('check')}</button></div>`;
    }).join('');
    sheet(`<div class="hr-ph"><span class="hr-ava big info">${icon('bell')}</span><div><b>مركز الإشعارات</b><small>${list.length ? list.filter((n) => !n.read).length + ' غير مقروء من ' + list.length : 'لا إشعارات بعد'}</small></div></div>
      <div class="chips nt-f" id="ntF"></div>
      <div class="nt-bar"><button type="button" id="ntAll" class="btn-outline">تعليم الكل كمقروء</button><button type="button" id="ntClr" class="btn-outline">مسح ما تمّ التصرف فيه</button></div>
      <div class="nt-list">${rows || '<div class="hr-none">لا توجد إشعارات في هذا العرض</div>'}</div>`);
    const fb = $('ntF');
    [['all', 'الكل'], ['unread', 'غير المقروء'], ['todo', 'لم يُتصرف فيه']].forEach(([k, n]) => { const c = el('button', 'chip sm' + (ntFilter === k ? ' on' : ''), n); c.type = 'button'; c.onclick = () => { ntFilter = k; openInbox(); }; fb.appendChild(c); });
    $('ntAll').onclick = () => { HR.markAllRead(); updateBell(); openInbox(); };
    $('ntClr').onclick = () => { HR.clearDone(); openInbox(); };
    document.querySelectorAll('#hrSheetBody [data-open]').forEach((b) => b.onclick = () => { const n = HR.notices().find((x) => x.id === b.dataset.open); if (n) noticeGo(n); });
    document.querySelectorAll('#hrSheetBody [data-done]').forEach((b) => b.onclick = () => { const n = HR.notices().find((x) => x.id === b.dataset.done); if (!n) return; HR.patchNotice(n.id, { done: !n.done, read: true }); updateBell(); openInbox(); });
  }
  function noticeGo(n) {
    HR.patchNotice(n.id, { read: true }); updateBell();
    const d = n.data || {};
    if (n.type === 'att' && d.empId) { openDay(d.empId, d.ds || today()); return; }
    if (n.type === 'req') {
      const q = d.reqId ? HR.requests().find((x) => x.id === d.reqId) : null;
      if (q) { openReq(q); return; }
      closeSheet(); window.hrGo('req'); return;
    }
    if (n.type === 'digest') { openDigest(); return; }
    closeSheet();
  }
  // الملخص بأرقام اليوم الحالية، وكل سطر ينقل إلى شاشته، مع تذكير جماعي للمتأخرين وغير المسجلين
  function openDigest() {
    const d = HR.digest();
    if (!d) { toast('لم يُزامن حضور اليوم بعد'); closeSheet(); return; }
    const row = (key, ic, label, n, remind) => n ? `<div class="dg-row"><button type="button" class="dg-go" data-go="${key}">${icon(ic)}<span><b>${n}</b> ${label}</span></button>${remind ? `<button type="button" class="dg-msg" data-msg="${remind}">${icon('note')}راسلهم</button>` : ''}</div>` : '';
    const html = row('late', 'clock', 'متأخرون اليوم', d.counts.late, 'late') + row('absent', 'alert', 'بلا تسجيل ولا إجازة', d.counts.absent, 'absent') + row('req', 'inbox', 'طلبات قيد الاعتماد', d.counts.req) + row('con', 'note', 'عقود تنتهي خلال أسبوع', d.counts.con) + row('asg', 'briefcase', 'تكليفات تنتهي خلال أسبوع', d.counts.asg);
    sheet(`<div class="hr-ph"><span class="hr-ava big warn">${icon('bell')}</span><div><b>ملخص اليوم</b><small>${esc(dLong.format(new Date()))}</small></div></div>${html || `<div class="hr2-ok">${icon('check')}<span>كل شيء على ما يرام اليوم</span></div>`}<button class="btn-outline wide" id="dgBack">${icon('bell')}<span>مركز الإشعارات</span></button>`);
    document.querySelectorAll('#hrSheetBody [data-go]').forEach((b) => b.onclick = () => { closeSheet(); window.hrGo(b.dataset.go); });
    document.querySelectorAll('#hrSheetBody [data-msg]').forEach((b) => b.onclick = () => remindGroup(b.dataset.msg));
    $('dgBack').onclick = () => openInbox();
  }
  // تذكير جماعي للمتأخرين أو غير المسجلين اليوم بقالب جاهز (يفتح نافذة الإرسال)
  function remindGroup(kind) {
    const rows = HR.dayReport(today()).rows.filter((r) => r.status === kind);
    if (!rows.length) { toast('لا يوجد موظفون لإرسال تذكير لهم'); return; }
    closeSheet();
    setTimeout(() => openCompose(rows.map((r) => ({ empId: r.e.id })), kind), 250);
  }
  // وجهات الانتقال (من الإشعارات والملخص الصباحي): late / absent / req / con / asg / inbox
  window.hrGo = (key) => {
    if (!HR.hasSession()) return;
    if (!App.isActive('hr')) App.go('hr');
    selOff(); f.q = ''; f.day = today(); f.org = 'all'; f.type = 'all';
    if (key === 'late' || key === 'absent') { tab = 'att'; f.st = key; }
    else if (key === 'req') { tab = 'lv'; f.lv = 'req'; f.rs = 'pending'; f.rk = 'all'; f.am = today().slice(0, 7); }
    else if (key === 'sites') { tab = 'sites'; }
    else if (key === 'con') { tab = 'con'; f.cs = 'soon30'; }
    else if (key === 'asg') { tab = 'asg'; f.as = 'soon'; }
    else if (key === 'inbox') { render(); openInbox(); return; }
    store.set('hrTab', tab); render();
  };

  /* ---------- لوحة اليوم ---------- */
  function renderDash(body) {
    const t = today();
    const rep = HR.dayReport(t);
    const rows = rep.rows;
    const cnt = (s) => rows.filter((r) => r.status === s).length;
    const cons = HR.contracts().filter((c) => c.end && daysTo(c.end) >= 0 && daysTo(c.end) <= 30);
    const asgs = HR.assignments().filter((a) => a.end && daysTo(a.end) >= 0 && daysTo(a.end) <= 30);
    body.appendChild(el('div', 'hr-day', `<b>${dLong.format(new Date())}</b><small>${rep.synced ? 'حسب آخر مزامنة' : 'لم يُزامن حضور اليوم بعد'}${rep.weekend ? ' · عطلة' : ''}</small>`));
    // بحث شامل: يفتح قائمة الفريق مفلترة
    const gs = el('form', 'hr2-search', `${icon('search')}<input id="hrGS" type="search" enterkeyhint="search" placeholder="ابحث عن موظف: اسم، رقم، هاتف، قسم…" autocomplete="off">`);
    gs.onsubmit = (ev) => { ev.preventDefault(); const v = $('hrGS').value.trim(); if (!v) return; tab = 'emp'; f.es = 'all'; f.q = v; store.set('hrTab', tab); render(); };
    body.appendChild(gs);
    // حلقة حال اليوم
    const nPresent = cnt('present') + cnt('noin'), nLate = cnt('late'), nAbs = cnt('absent'), nLv = cnt('leave'), tot = rows.length || 1;
    const seg = [[nPresent, 'var(--ok)'], [nLate, '#F0A64B'], [nAbs, '#F2716A'], [nLv, '#5B9DFF']];
    let acc = 0; const stops = seg.map(([n, c]) => { const a0 = acc; acc += n / tot * 100; return `${c} ${a0}% ${acc}%`; });
    if (acc < 100) stops.push(`var(--line) ${acc}% 100%`);
    const went = nPresent + nLate;
    const hero = el('div', 'hr2-hero', `<div class="hr2-ring" style="background:conic-gradient(${stops.join(',')})"><div><b>${went}</b><small>من ${rows.length} حضروا</small></div></div>
      <div class="hr2-leg">${[['present', 'في الموعد', nPresent, 'var(--ok)', 'in'], ['late', 'متأخرون', nLate, '#F0A64B', 'late'], ['absent', 'بلا تسجيل', nAbs, '#F2716A', 'absent'], ['leave', 'إجازة / مهمة', nLv, '#5B9DFF', 'leave']].map(([k, l, n, c, st]) => `<button type="button" data-st="${st}"><i style="background:${c}"></i>${l}<b>${n}</b></button>`).join('')}</div>`);
    hero.querySelectorAll('[data-st]').forEach((x) => x.onclick = () => { tab = 'att'; f.st = x.dataset.st; f.day = t; f.q = ''; render(); });
    body.appendChild(hero);
    // يحتاج انتباهك
    const att = [];
    const outside = rows.filter((r) => r.outside).length, pend = pendingReqs();
    if (!rep.synced) att.push(['info', 'clock', 'حضور اليوم غير مزامن', 'اضغط لمزامنة الآن', () => doSync()]);
    if (nLate) { const top = rows.filter((r) => r.status === 'late').sort((a, z) => z.lateMin - a.lateMin)[0]; att.push(['warn', 'clock', `${nLate} متأخرون اليوم`, `أطولهم: ${top.e.name} +${top.lateMin} د`, () => { tab = 'att'; f.st = 'late'; }]); }
    if (nAbs) att.push(['bad', 'alert', `${nAbs} بلا تسجيل ولا إجازة`, 'راسلهم من قائمة الحضور', () => { tab = 'att'; f.st = 'absent'; }]);
    if (outside) att.push(['bad', 'pin', `${outside} سجّلوا خارج نطاق الموقع`, 'راجع مواقعهم على الخريطة', () => { tab = 'att'; f.st = 'outside'; }]);
    if (pend.length) att.push(['info', 'inbox', `${pend.length} طلبات قيد الاعتماد`, 'إجازات، مغادرات، عمل إضافي', () => { tab = 'lv'; f.lv = 'req'; f.rs = 'pending'; f.rk = 'all'; f.am = today().slice(0, 7); }]);
    if (cons.length) att.push(['warn', 'note', `${cons.length} عقود تنتهي خلال 30 يوماً`, 'ارسل إشعار الانتهاء من القائمة', () => { tab = 'con'; f.cs = 'soon30'; }]);
    if (asgs.length) att.push(['warn', 'briefcase', `${asgs.length} تكليفات تنتهي خلال 30 يوماً`, 'راجع نسب التكليف', () => { tab = 'asg'; f.as = 'soon'; }]);
    body.appendChild(el('div', 'hr-sec', `<span>يحتاج انتباهك</span><small>${att.length ? att.length + ' عناصر' : ''}</small>`));
    const ab = el('div', 'hr2-attn');
    if (!att.length) ab.appendChild(el('div', 'hr2-ok', `${icon('check')}<span>كل شيء على ما يرام اليوم</span>`));
    att.forEach(([tone, ic, title, sub, go]) => {
      const c = el('button', 'hr2-ac ' + tone, `<span class="hr2-ic">${icon(ic)}</span><span class="hr2-at"><b>${title}</b><small>${esc(sub)}</small></span><span class="flip hr2-go">${icon('chev')}</span>`);
      c.type = 'button';
      c.onclick = () => { go(); f.day = t; f.q = ''; store.set('hrTab', tab); render(); };
      ab.appendChild(c);
    });
    body.appendChild(ab);
    // آخر التسجيلات
    const last = rows.filter((r) => r.list.length).map((r) => ({ r, ev: r.list[r.list.length - 1] })).sort((a, z) => String(z.ev.recordedAt).localeCompare(String(a.ev.recordedAt))).slice(0, 4);
    if (last.length) {
      body.appendChild(el('div', 'hr-sec', '<span>آخر التسجيلات</span>'));
      const fd2 = el('div', 'hr2-feed');
      last.forEach(({ r, ev }) => {
        const bad = r.outside || r.lateMin > 0;
        const row = el('button', 'hr2-fr', `<i class="${r.outside ? 'bad' : r.lateMin > 0 ? 'warn' : 'ok'}"></i><b>${esc(r.e.name)}</b><span>${ev.eventType === 'check_out' ? 'خروج' : 'دخول'}${r.outside ? ' · خارج الموقع' : ''}</span><time>${tf.format(new Date(ev.recordedAt))}</time>`);
        row.type = 'button'; row.onclick = () => openDay(r.e.id, t);
        fd2.appendChild(row);
      });
      body.appendChild(fd2);
    }
    if (rows.length) {
      body.appendChild(el('div', 'hr-sec', '<span>تفصيل حضور اليوم</span>'));
      breakdown(body, rows, t, (flt) => { f.org = flt.org; f.type = flt.type; f.st = 'all'; f.day = t; f.q = ''; tab = 'att'; render(); });
    }
    if (rep.synced && rows.some((r) => r.list.length)) {
      const ss = siteStats(t), top = ss.list.filter((g) => g.rows.length).slice(0, 4);
      if (top.length) {
        const h = el('div', 'hr-sec', '<span>الحضور في المواقع</span><button>عرض الكل</button>');
        h.querySelector('button').onclick = () => { tab = 'sites'; f.day = t; f.org = 'all'; f.type = 'all'; f.q = ''; store.set('hrTab', tab); render(); };
        body.appendChild(h);
        const grid = el('div', 'st-mini');
        top.forEach((g) => { const c = el('button', 'st-m ' + g.kind, `<b>${g.rows.length}</b><small>${esc(g.name)}</small>`); c.type = 'button'; c.onclick = () => { openSites.add(g.key); tab = 'sites'; f.day = t; f.org = 'all'; f.type = 'all'; store.set('hrTab', tab); render(); }; grid.appendChild(c); });
        body.appendChild(grid);
      }
    }
    const sec = (title, arr, empty, more) => {
      const h = el('div', 'hr-sec', `<span>${title}</span>${more ? '<button>عرض الكل</button>' : ''}`);
      if (more) h.querySelector('button').onclick = () => { more(); f.q = ''; render(); };
      body.appendChild(h); list(body, arr, empty, 6);
    };
    sec('المتأخرون اليوم', rows.filter((r) => r.status === 'late').sort((a, b) => b.lateMin - a.lateMin).map((r) => personRow(r.e, badge('+' + r.lateMin + ' د', 'warn') + `<small>${tf.format(new Date(r.firstIn))}</small>`)), 'لا يوجد متأخرون', () => { tab = 'att'; f.st = 'late'; f.day = t; });
    sec('بلا تسجيل دوام ولا إجازة ولا مهمة', rows.filter((r) => r.status === 'absent').map((r) => personRow(r.e, r.hasAsg ? '' : badge('بلا تكليف', 'mute'), null, 'bad')), rep.synced ? 'الجميع مسجّل أو في إجازة' : 'زامن لعرض حضور اليوم', () => { tab = 'att'; f.st = 'absent'; f.day = t; });
    sec('عقود تنتهي قريباً', cons.sort((a, b) => a.end.localeCompare(b.end)).map((c) => conRow(c)), 'لا عقود تنتهي خلال 30 يوماً', () => { tab = 'con'; f.cs = 'soon30'; });
    sec('تكليفات تنتهي قريباً', asgs.sort((a, b) => a.end.localeCompare(b.end)).map((a) => asgRow(a)), 'لا تكليفات تنتهي خلال 30 يوماً', () => { tab = 'asg'; f.as = 'soon'; });
  }

  /* ---------- الحضور ---------- */
  function renderAtt(body) {
    const nav = el('div', 'hr-dnav', `<button class="icon-btn flip" data-d="-1" aria-label="اليوم السابق">${icon('chev')}</button><label><b>${f.day === today() ? 'اليوم' : dLong.format(noon(f.day))}</b><small>${fd(f.day)}</small><input type="date" value="${f.day}" max="${today()}"></label><button class="icon-btn" data-d="1" aria-label="اليوم التالي" ${f.day >= today() ? 'disabled' : ''}>${icon('chev')}</button>`);
    nav.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { f.day = addDays(f.day, +b.dataset.d); render(); });
    nav.querySelector('input').onchange = (e) => { if (e.target.value) { f.day = e.target.value; render(); } };
    body.appendChild(nav);
    const rep = HR.dayReport(f.day);
    if (!rep.synced) {
      const m = el('div', 'hr-empty', `<span class="hr-eic">${icon('clock')}</span><b>حضور هذا اليوم غير محفوظ على الجهاز</b><small>زامن هذا اليوم لجلب سجلاته من النظام.</small>`);
      const b = el('button', 'btn-outline wide', `${icon('refresh')}<span>مزامنة ${fd(f.day)}</span>`);
      b.onclick = async () => { b.disabled = true; try { await HR.sync(null, { from: f.day }); } catch (e) { toast(e.message); } render(); };
      m.appendChild(b); body.appendChild(m); return;
    }
    breakdown(body, rep.rows, f.day, (flt) => { f.org = flt.org; f.type = flt.type; render(); });
    const base = rep.rows.filter((r) => orgOk(r.e) && typeOk(r.e));
    filterChips(body, 'org', [['all', 'الكل'], ['PEF', 'موظفو PEF'], ['HHO', 'موظفو HHO']]);
    filterChips(body, 'type', [['all', 'الكل'], ['office', 'مكتبي'], ['field', 'ميداني']]);
    const c = (s) => base.filter((r) => s === 'in' ? r.list.length : r.status === s).length;
    filterChips(body, 'st', [['all', 'الكل'], ['late', 'متأخرون'], ['absent', 'بلا تسجيل'], ['in', 'حاضرون'], ['leave', 'إجازة/مهمة'], ['noin', 'بلا دخول'], ['outside', 'خارج الموقع'], ['rq_hourly', 'مغادرة ساعية'], ['rq_mission', 'مهمة عمل'], ['rq_overtime', 'عمل إضافي'], ['rq_holiday', 'عمل في عطلة'], ['noasg', 'بلا تكليف']],
      { all: base.length, late: c('late'), absent: c('absent'), in: c('in'), leave: c('leave'), noin: c('noin'), outside: base.filter((r) => r.outside).length, rq_hourly: base.filter((r) => r.reqs.some((q) => q.kind === 'hourly')).length, rq_mission: base.filter((r) => r.reqs.some((q) => q.kind === 'mission')).length, rq_overtime: base.filter((r) => r.reqs.some((q) => q.kind === 'overtime')).length, rq_holiday: base.filter((r) => r.reqs.some((q) => q.kind === 'holiday')).length, noasg: base.filter((r) => !r.hasAsg).length });
    search(body, 'ابحث بالاسم أو الرقم أو القسم');
    const rows = base.filter((r) => (f.st === 'all' || (f.st === 'in' ? r.list.length : f.st === 'noasg' ? !r.hasAsg : f.st === 'outside' ? r.outside : f.st.startsWith('rq_') ? r.reqs.some((q) => q.kind === f.st.slice(3)) : r.status === f.st)) && match(f.q, r.e.name, r.e.empId, r.e.dept, r.e.nid))
      .sort((a, b) => (b.lateMin - a.lateMin) || String(a.firstIn || 'z').localeCompare(String(b.firstIn || 'z')) || a.e.name.localeCompare(b.e.name, 'ar'));
    const tools = el('div', 'hr-tools', `<small>${rows.length} موظف</small><span><button class="hr-tmap">${icon('pin')}الخريطة</button><button class="hr-tshare">${icon('share')}مشاركة</button></span>`);
    if ((f.st === 'late' || f.st === 'absent') && f.day === today() && rows.length) {
      const rb = el('button', 'hr-tremind', `${icon('note')}تذكير جماعي (${rows.length})`); rb.type = 'button';
      rb.onclick = () => openCompose(rows.map((r) => ({ empId: r.e.id })), f.st);
      tools.querySelector('span').prepend(rb);
    }
    tools.querySelector('.hr-tmap').onclick = () => openAllMap(rows, f.day);
    tools.querySelector('.hr-tshare').onclick = () => shareList(`الحضور ${fd(f.day)} (${rows.length})`, rows.map((r, i) => `${i + 1}. ${r.e.name}${r.firstIn ? ' — ' + tf.format(new Date(r.firstIn)) : ''}${r.lastOut ? ' ← ' + tf.format(new Date(r.lastOut)) : ''}${r.workMin ? ' [' + hrs(r.workMin) + ']' : ''}${r.lateMin ? ' (تأخير ' + r.lateMin + ' د)' : ''}${r.outside ? ' (خارج الموقع)' : ''}${r.reqs.length ? ' — ' + r.reqs.map((q) => RQ[q.kind][0] + (q.start ? ' ' + q.start + (q.end ? '-' + q.end : '') : '')).join('، ') : ''}${r.leave ? ' — ' + leaveLbl(r.leave) : ''}`));
    body.appendChild(tools);
    list(body, rows.map((r) => {
      const st = STATUS[r.status];
      let right = badge(st[0], st[1]);
      if (r.status === 'late') right = badge('+' + r.lateMin + ' د', 'warn');
      if (r.status === 'leave') right = badge(leaveLbl(r.leave), 'info');
      const times = r.firstIn ? `${tf.format(new Date(r.firstIn))}${r.lastOut ? ' ← ' + tf.format(new Date(r.lastOut)) : r.live ? ' ← الآن' : ''}` : '';
      const pl = r.list.length ? HR.place(r.list[0]) : null;
      const sub = r.list.length
        ? `<span class="hr-pl ${PLACE[pl.st][1]}">${icon('pin')}${esc(plName(pl))}${r.outside && pl.st !== 'outside' ? ' · تسجيل خارج النطاق' : ''}</span>`
        : esc([r.e.dept, TYPE[r.e.type], r.e.org].filter(Boolean).join(' · '));
      const rqs = r.reqs.filter((q) => !(q.kind === 'daily' && r.status === 'leave'));
      const row = personRow(r.e, right + (times ? `<small>${times}</small>` : '') + (r.workMin ? `<small class="hr-h">${icon('clock')}${hrs(r.workMin)}</small>` : ''), sub + (rqs.length ? `<span class="hr-flags">${rqs.map(rqChip).join('')}</span>` : ''), st[1]);
      row.onclick = () => openDay(r.e.id, f.day);
      return row;
    }), 'لا نتائج بهذه الفلاتر');
  }

  /* ---------- الموظفون ---------- */
  function renderEmp(body) {
    const all = HR.employees();
    filterChips(body, 'es', [['active', 'على رأس العمل'], ['ended', 'منتهية خدمتهم'], ['all', 'الكل']]);
    filterChips(body, 'org', [['all', 'الكل'], ['PEF', 'PEF'], ['HHO', 'HHO']]);
    filterChips(body, 'type', [['all', 'الكل'], ['office', 'مكتبي'], ['field', 'ميداني']]);
    search(body, 'الاسم، الرقم الوظيفي، الهوية، القسم');
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const qd = digits(f.q);
    const rows = all.filter((e) => (f.es === 'all' || (f.es === 'active' ? e.active : !e.active)) && orgOk(e) && typeOk(e) && (match(f.q, e.name, e.nameEn, e.empId, e.nid, e.dept, e.pos) || (qd.length >= 4 && digits(e.phone).includes(qd.replace(/^0+/, '').replace(/^(970|972)/, '')))))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    body.appendChild(el('div', 'hr-tools', `<small>${rows.length} من ${all.length} موظف</small>`));
    // حالة اليوم بجانب كل موظف
    const trep = HR.dayReport(today()), tmap = {}; trep.rows.forEach((r) => { tmap[r.e.id] = r; });
    list(body, rows.map((e) => {
      const r = tmap[e.id];
      let right = e.empId ? `<small>#${esc(e.empId)}</small>` : '';
      if (r && trep.synced) { const st = STATUS[r.status]; right = (r.status === 'late' ? badge('+' + r.lateMin + ' د', 'warn') : r.status === 'leave' ? badge(leaveLbl(r.leave), 'info') : badge(st[0], st[1])) + (r.firstIn ? `<small>${tf.format(new Date(r.firstIn))}</small>` : ''); }
      return personRow(e, right);
    }), 'لا نتائج');
  }

  /* ---------- العقود ---------- */
  const CHANGE = { INITIAL: 'تفاصيل الراتب عند التعاقد', SALARY_SCALE: 'تحديث سلم الرواتب', PROMOTION: 'ترقية', ANNUAL_INCREMENT: 'زيادة سنوية', SPECIAL_INCREMENT: 'زيادة خاصة', CORRECTION: 'تصحيح إداري', MANUAL: 'تحديث يدوي للراتب', EMPLOYMENT_PERCENTAGE_CHANGE: 'تغيير نسبة التوظيف', PLACEMENT: 'تغيير خطوة التسكين', EXTENSION: 'تمديد', ANNEX: 'ملحق', AMENDMENT: 'تعديل' };
  const chg = (t) => t ? (CHANGE[String(t).toUpperCase()] || t) : '';
  const money = (v, cur) => { if (v == null || v === '') return null; const n = +v; if (!isFinite(n)) return String(v); try { return new Intl.NumberFormat('ar-PS-u-nu-latn', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(n); } catch (e) { return n.toLocaleString('en') + ' ' + (cur || ''); } };
  const nz = (v) => v != null && v !== '';
  const gls = (c) => [nz(c.grade) ? '\u200Fالدرجة ' + c.grade : null, nz(c.level) ? '\u200Fالفئة ' + c.level : null, nz(c.step) ? '\u200Fالخطوة ' + String(c.step).replace(/^S/i, '') : null].filter(Boolean).join(' · ');
  const PLACE_T = ['PLACEMENT', 'SALARY_SCALE', 'PROMOTION'];
  // ملخص عقود الموظف: عددها، هل مُدّد، وهل تغيّر تسكينه
  let sumCache = null;
  function conSummary(empId) {
    if (!sumCache) {
      sumCache = {};
      HR.contracts().forEach((c) => { (sumCache[c.empId] = sumCache[c.empId] || []).push(c); });
    }
    const list = (sumCache[empId] || []).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const nos = new Set(list.filter((c) => c.kind === 'contract').map((c) => c.no || c.id));
    const extended = list.some((c) => c.kind === 'extension' || c.ext) || list.some((c) => c.history.some((h) => h.end));
    const steps = new Set(list.map(gls).concat(...list.map((c) => c.history.map(gls))).filter(Boolean));
    const placed = list.some((c) => c.kind === 'placement' || PLACE_T.includes(String(c.changeType || '').toUpperCase()) || c.history.some((h) => PLACE_T.includes(String(h.type || '').toUpperCase()))) || steps.size > 1;
    return { list, count: Math.max(nos.size, list.filter((c) => c.kind === 'contract').length), records: list.length, extended, placed, multi: nos.size > 1 };
  }
  const flags = (sm) => [sm.extended ? badge('ممدّد', 'ok') : '', sm.placed ? badge('تغيّر التسكين', 'warn') : '', sm.multi ? badge(`${sm.count} عقود`, 'info') : ''].join('');
  function conRow(c) {
    const sm = conSummary(c.empId);
    const r = el('button', 'hr-row hr-crow');
    r.innerHTML = `<span class="hr-ava k-${c.kind}">${esc(KIND[c.kind].slice(0, 2))}</span><span class="hr-rt"><b>${esc(c.name)}</b>
      <small>${badge(KIND[c.kind], 'k-' + c.kind)} ${c.no ? '#' + esc(c.no) : ''}${c.ext ? ' · تمديد ' + esc(c.ext) : ''}${c.annex ? ' · ملحق ' + esc(c.annex) : ''}</small>
      <small>${esc([c.pos, gls(c), money(c.salary, c.cur)].filter(Boolean).join(' · '))}</small>
      <small>${fd(c.start)} ← ${fd(c.end)}</small>${flags(sm) ? `<span class="hr-flags">${flags(sm)}</span>` : ''}</span><span class="hr-rr">${remain(c.end)}</span>`;
    r.onclick = () => openCon(c);
    r.dataset.emp = c.empId; r.dataset.ctx = 'c:' + c.id;
    return r;
  }
  function conCard(c, focus) {
    const cells = [['المسمى الوظيفي', c.pos], ['الراتب', money(c.salary, c.cur)], ['تاريخ البداية', fd(c.start)], ['تاريخ النهاية', c.end ? fd(c.end) : null], ['الدرجة', c.grade], ['الفئة', c.level], ['الخطوة', nz(c.step) ? String(c.step).replace(/^S/i, '') : null], ['سلّم الرواتب', c.scale], ['نسبة التوظيف', c.pct != null ? c.pct + '%' : null], ['القسم', c.dept]].filter((x) => x[1]);
    const hist = c.history.slice().sort((a, b) => String(a.from).localeCompare(String(b.from)));
    return `<div class="hr-con${focus ? ' on' : ''}" style="--kc:var(--k-${c.kind})">
      <div class="hr-conh"><span class="hr-b k-${c.kind}">${KIND[c.kind]}</span><b>${c.no ? 'عقد #' + esc(c.no) : 'عقد'}${c.ext ? ' · تمديد ' + esc(c.ext) : ''}${c.annex ? ' · ملحق ' + esc(c.annex) : ''}</b>${remain(c.end)}</div>
      ${c.changeType ? `<div class="hr-conr">${esc(chg(c.changeType))}${c.reason ? ' — ' + esc(c.reason) : ''}</div>` : ''}
      <div class="hr-cgrid">${cells.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
      ${hist.length ? `<div class="hr-hist"><small class="hr-histt">سجل التغييرات (${hist.length})</small>${hist.map((h) => `<div class="hr-hi"><i></i><div><b>${esc(chg(h.type) || 'تغيير')}</b><small>${[h.from ? fd(h.from) : '', gls(h), money(h.salary, c.cur), h.end ? 'حتى ' + fd(h.end) : '', h.reason].filter(Boolean).map(esc).join(' · ')}</small></div></div>`).join('')}</div>` : ''}
    </div>`;
  }
  function openCon(c) {
    const sm = conSummary(c.empId);
    const others = sm.list.filter((x) => x.id !== c.id).sort((a, b) => String(b.start).localeCompare(String(a.start)));
    sheet(`<div class="hr-ph"><span class="hr-ava big k-${c.kind}">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>${sm.records} سجل عقد</small><div class="hr-tags">${flags(sm) || badge('عقد واحد بلا تغييرات', 'mute')}</div></div></div>
      ${conCard(c, true)}
      ${others.length ? `<div class="hr-sec"><span>عقود وسجلات أخرى لنفس الموظف (${others.length})</span></div>${others.map((x) => conCard(x)).join('')}` : ''}
      ${c.empId && HR.db.get('employees', {})[c.empId] ? `<button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>` : ''}
      ${c.empId ? `<button class="btn-outline wide" id="hrMsgCon">${icon('note')}<span>إرسال إشعار انتهاء العقد</span></button>` : ''}
      ${rawTable(c.raw)}`);
    const b = $('hrToEmp'); if (b) b.onclick = () => openEmp(c.empId, c.id);
    const mc = $('hrMsgCon'); if (mc) mc.onclick = () => openCompose([{ empId: c.empId, con: c }], 'contract');
  }
  function renderCon(body) {
    sumCache = null;
    const all = HR.contracts();
    const kc = {}; all.forEach((c) => { kc[c.kind] = (kc[c.kind] || 0) + 1; }); kc.all = all.length;
    filterChips(body, 'ck', [['all', 'الكل'], ['contract', 'عقود'], ['extension', 'تمديد'], ['annex', 'ملاحق'], ['placement', 'تسكين'], ['amendment', 'تعديل']], kc);
    filterChips(body, 'cs', [['active', 'سارية'], ['soon30', 'تنتهي خلال 30 يوماً'], ['soon60', 'خلال 60 يوماً'], ['ended', 'منتهية'], ['all', 'الكل']]);
    const fc = { all: all.length, ext: 0, placed: 0, multi: 0 };
    all.forEach((c) => { const sm = conSummary(c.empId); if (sm.extended) fc.ext++; if (sm.placed) fc.placed++; if (sm.multi) fc.multi++; });
    filterChips(body, 'cf', [['all', 'كل الموظفين'], ['ext', 'عقود ممدّدة'], ['placed', 'تغيّر التسكين'], ['multi', 'أكثر من عقد']], fc);
    search(body, 'الاسم أو رقم العقد أو المسمى');
    const st = (c) => { const d = daysTo(c.end); return f.cs === 'all' || (f.cs === 'active' ? (d == null || d >= 0) && (!c.start || c.start <= today()) : f.cs === 'ended' ? d != null && d < 0 : d != null && d >= 0 && d <= (f.cs === 'soon30' ? 30 : 60)); };
    const fl = (c) => { if (!f.cf || f.cf === 'all') return true; const sm = conSummary(c.empId); return f.cf === 'ext' ? sm.extended : f.cf === 'placed' ? sm.placed : sm.multi; };
    const rows = all.filter((c) => (f.ck === 'all' || c.kind === f.ck) && st(c) && fl(c) && match(f.q, c.name, c.no, c.pos, c.dept)).sort((a, b) => String(a.end || '9').localeCompare(String(b.end || '9')));
    const tools = el('div', 'hr-tools', `<small>${rows.length} سجل</small><button>${icon('share')}مشاركة</button>`);
    tools.querySelector('button').onclick = () => shareList('العقود', rows.map((c, i) => `${i + 1}. ${c.name} — ${KIND[c.kind]} ${c.no || ''} — ${c.pos || ''} — ${fd(c.start)} إلى ${fd(c.end)}${gls(c) ? ' — ' + gls(c) : ''}${c.salary != null ? ' — ' + money(c.salary, c.cur) : ''}`));
    body.appendChild(tools);
    list(body, rows.map(conRow), 'لا عقود بهذه الفلاتر');
  }

  /* ---------- التكليفات ---------- */
  const ENTRY = { new: ['جديد', 'info'], draft: ['مسودة', 'mute'], pending: ['بانتظار الاعتماد', 'warn'], submitted: ['مُرسل', 'warn'], approved: ['معتمد', 'ok'], active: ['فعّال', 'ok'], confirmed: ['مؤكد', 'ok'], ended: ['منتهٍ', 'mute'], closed: ['مغلق', 'mute'], cancelled: ['ملغى', 'bad'], canceled: ['ملغى', 'bad'], rejected: ['مرفوض', 'bad'], locked: ['مقفل', 'info'] };
  const entry = (a) => { const k = String(a.status || '').toLowerCase(); const v = ENTRY[k] || (a.status ? [a.status, 'mute'] : null); return a.locked ? [((v && v[0]) || '') + ' · فترة مقفلة', 'info'] : v; };
  const empName = (id) => { const r = HR.db.get('employees', {})[id]; return r ? HR.emp(r).name : null; };
  function asgRow(a) {
    const name = a.name || empName(a.empId) || '—';
    const en = entry(a);
    const r = el('button', 'hr-row hr-crow');
    r.innerHTML = `<span class="hr-ava info">${icon('briefcase')}</span><span class="hr-rt"><b>${esc(name)}</b>
      <small>${esc([a.code, a.pno, a.project].filter(Boolean).join(' · ') || 'مشروع')}</small>${a.no ? `<small>#${esc(a.no)}</small>` : ''}
      <small>${fd(a.start)} ← ${fd(a.end)}${a.pct != null ? ' · ' + esc(a.pct) + '%' : ''}${a.cur ? ' · ' + esc(a.cur) : ''}</small>${en ? `<span class="hr-flags">${badge(en[0], en[1])}</span>` : ''}</span><span class="hr-rr">${remain(a.end)}</span>`;
    r.onclick = () => openAsg(a);
    r.dataset.emp = a.empId; r.dataset.ctx = 'a:' + a.id;
    return r;
  }
  function asgCard(a) {
    const en = entry(a);
    const cells = [['رقم التكليف', a.no], ['حالة الإدخال', en ? badge(en[0], en[1]) : null, true], ['الموظف', a.name || empName(a.empId)], ['المشروع', a.project], ['رقم المشروع', a.pno], ['رمز المشروع', a.code], ['عملة المشروع', a.cur], ['النسبة', a.pct != null ? a.pct + '%' : null], ['البداية', fd(a.start)], ['النهاية', a.end ? fd(a.end) : null]].filter((x) => x[1]);
    return `<div class="hr-con" style="--kc:#5B9DFF"><div class="hr-conh">${badge('تكليف', 'info')}<b>${esc([a.code, a.pno].filter(Boolean).join(' · ') || a.project || '')}</b>${remain(a.end)}</div>
      ${a.pct != null ? `<div class="hr-pct"><i style="width:${Math.min(100, +a.pct || 0)}%"></i></div>` : ''}
      <div class="hr-cgrid">${cells.map(([k, v, html]) => `<div><small>${k}</small><b>${html ? v : esc(v)}</b></div>`).join('')}</div></div>`;
  }
  function openAsg(a) {
    const name = a.name || empName(a.empId) || '—';
    sheet(`<div class="hr-ph"><span class="hr-ava big info">${icon('briefcase')}</span><div><b>${esc(name)}</b><small>${esc([a.code, a.project].filter(Boolean).join(' · '))}</small></div></div>${asgCard(a)}
      ${a.empId && HR.db.get('employees', {})[a.empId] ? `<button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>` : ''}
      ${a.empId ? `<button class="btn-outline wide" id="hrMsgAsg">${icon('note')}<span>إرسال إشعار انتهاء التكليف</span></button>` : ''}${rawTable(a.raw)}`);
    const b = $('hrToEmp'); if (b) b.onclick = () => openEmp(a.empId);
    const ma = $('hrMsgAsg'); if (ma) ma.onclick = () => openCompose([{ empId: a.empId, asg: a }], 'assignment');
  }
  /* ----- التكليفات حسب الشهر ----- */
  const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
  const monthBounds = (ym) => { const [y, m] = ym.split('-').map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${ym}-01`, to: `${ym}-${String(days).padStart(2, '0')}`, days }; };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const dayDiff = (a, b) => Math.round((noon(b) - noon(a)) / 864e5) + 1;
  // نصيب التكليف من الشهر: النسبة × (أيام التكليف داخل الشهر ÷ أيام الشهر)
  function inMonth(a, ym) {
    const mb = monthBounds(ym);
    const s0 = a.start && a.start > mb.from ? a.start : mb.from, e0 = a.end && a.end < mb.to ? a.end : mb.to;
    if (s0 > e0) return null;
    const days = dayDiff(s0, e0), pct = parseFloat(a.pct) || 0;
    return { from: s0, to: e0, days, full: days === mb.days, pct, eff: pct * days / mb.days };
  }
  // العقد الساري للموظف خلال الشهر (الأحدث بدايةً) لاستدعاء الراتب
  function contractFor(empId, ym) {
    const mb = monthBounds(ym);
    const list = HR.contracts().filter((c) => c.empId === empId && (!c.start || c.start <= mb.to) && (!c.end || c.end >= mb.from));
    const withSal = list.filter((c) => c.salary != null && c.salary !== '');
    return (withSal.length ? withSal : list).sort((a, b) => String(b.start).localeCompare(String(a.start)))[0] || null;
  }
  const pctTxt = (n) => (Math.round(n * 100) / 100).toLocaleString('en', { maximumFractionDigits: 2 }) + '%';
  const pctTone = (n) => Math.abs(n - 100) < 0.01 ? 'ok' : n > 100 ? 'bad' : 'warn';
  function monthNav(body) {
    const nav = el('div', 'hr-dnav', `<button class="icon-btn flip" data-m="-1" aria-label="الشهر السابق">${icon('chev')}</button><label><b>${monthName(f.am)}</b><small>${f.am === today().slice(0, 7) ? 'الشهر الحالي' : 'اضغط لاختيار شهر'}</small><input type="month" value="${f.am}"></label><button class="icon-btn" data-m="1" aria-label="الشهر التالي">${icon('chev')}</button>`);
    nav.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { f.am = shiftMonth(f.am, +b.dataset.m); render(); });
    nav.querySelector('input').onchange = (e) => { if (e.target.value) { f.am = e.target.value; render(); } };
    body.appendChild(nav);
  }
  function monthGroups(ym) {
    const by = {};
    HR.assignments().forEach((a) => { const m = inMonth(a, ym); if (!m) return; (by[a.empId] = by[a.empId] || []).push({ a, m }); });
    return Object.entries(by).map(([empId, items]) => {
      const total = items.reduce((t, x) => t + x.m.eff, 0);
      return { empId, items, total, name: items[0].a.name || empName(empId) || '—' };
    });
  }
  function renderAsgByEmp(body) {
    const groups = monthGroups(f.am);
    const cnt = { all: groups.length, full: 0, under: 0, over: 0 };
    groups.forEach((g) => { cnt[pctTone(g.total) === 'ok' ? 'full' : g.total > 100 ? 'over' : 'under']++; });
    if (!['all', 'full', 'under', 'over'].includes(f.ag)) f.ag = 'all';
    filterChips(body, 'ag', [['all', 'كل الموظفين'], ['full', 'مكتمل 100%'], ['under', 'أقل من 100%'], ['over', 'أكثر من 100%']], cnt);
    search(body, 'اسم الموظف أو المشروع');
    const rows = groups.filter((g) => (f.ag === 'all' || (f.ag === 'full' ? pctTone(g.total) === 'ok' : f.ag === 'over' ? g.total > 100.001 : g.total < 99.999)) && match(f.q, g.name, ...g.items.map((x) => x.a.project), ...g.items.map((x) => x.a.pno), ...g.items.map((x) => x.a.code)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const tools = el('div', 'hr-tools', `<small>${rows.length} موظف · ${rows.reduce((t, g) => t + g.items.length, 0)} تكليف</small><button>${icon('share')}مشاركة</button>`);
    tools.querySelector('button').onclick = () => shareList(`التكليفات حسب الموظف — ${monthName(f.am)}`, rows.map((g, i) => `${i + 1}. ${g.name} — ${pctTxt(g.total)} (${g.items.length} تكليف)`));
    body.appendChild(tools);
    list(body, rows.map((g) => {
      const tone = pctTone(g.total);
      const r = el('button', 'hr-row hr-crow');
      const projs = g.items.map((x) => x.a.pno || x.a.code || x.a.project).filter(Boolean);
      r.innerHTML = `<span class="hr-ava ${tone}">${esc(initials(g.name))}</span><span class="hr-rt"><b>${esc(g.name)}</b><small>${g.items.length} ${g.items.length === 1 ? 'تكليف' : 'تكليفات'} · ${esc(projs.slice(0, 2).join(' · '))}${projs.length > 2 ? ' …' : ''}</small>
        <span class="hr-pbar ${tone}"><i style="width:${Math.min(100, g.total)}%"></i></span></span><span class="hr-rr"><b class="hr-pt ${tone}">${pctTxt(g.total)}</b><small>من الشهر</small></span>`;
      r.onclick = () => openAsgMonth(g.empId); r.dataset.emp = g.empId;
      return r;
    }), 'لا تكليفات في هذا الشهر');
  }
  function openAsgMonth(empId) {
    const g = monthGroups(f.am).find((x) => x.empId === empId);
    if (!g) return;
    const c = contractFor(empId, f.am);
    const sal = c && c.salary != null && c.salary !== '' ? +c.salary : null;
    const cur = c ? c.cur : null;
    const tone = pctTone(g.total);
    const rowsHtml = g.items.sort((a, b) => b.m.eff - a.m.eff).map(({ a, m }) => {
      const amt = sal != null ? sal * m.eff / 100 : null;
      const en = entry(a);
      return `<div class="hr-am">
        <div class="hr-amh"><b>${esc(a.pno || a.code || 'مشروع')}</b><span class="hr-amp">${pctTxt(m.eff)}</span></div>
        ${a.project ? `<small class="hr-amn">${esc(a.project)}</small>` : ''}
        <div class="hr-pbar"><i style="width:${Math.min(100, m.eff)}%"></i></div>
        <div class="hr-amg">
          <span><small>رقم التكليف</small><b>${esc(a.no || '—')}</b></span>
          <span><small>نسبة التكليف</small><b>${pctTxt(m.pct)}</b></span>
          <span><small>الفترة في الشهر</small><b>${fd(m.from)} ← ${fd(m.to)}${m.full ? '' : ` (${m.days} يوم)`}</b></span>
          <span><small>المبلغ من الراتب</small><b class="hr-money">${amt != null ? money(amt, cur) : '—'}</b></span>
          ${a.cur ? `<span><small>عملة المشروع</small><b>${esc(a.cur)}</b></span>` : ''}
          ${en ? `<span><small>حالة الإدخال</small><b>${badge(en[0], en[1])}</b></span>` : ''}
        </div></div>`;
    }).join('');
    const totalAmt = sal != null ? sal * g.total / 100 : null;
    sheet(`<div class="hr-ph"><span class="hr-ava big ${tone}">${esc(initials(g.name))}</span><div><b>${esc(g.name)}</b><small>التكليفات في ${monthName(f.am)}</small></div></div>
      <div class="hr-dsum">
        <div><small>مجموع النسب</small><b class="hr-pt ${tone}">${pctTxt(g.total)}</b></div>
        <div><small>عدد التكليفات</small><b>${g.items.length}</b></div>
        <div><small>الراتب (من العقد)</small><b>${sal != null ? money(sal, cur) : '—'}</b></div>
        <div><small>الموزّع على المشاريع</small><b>${totalAmt != null ? money(totalAmt, cur) : '—'}</b></div>
      </div>
      ${c ? `<div class="hr-ctag">${icon('note')}<span>العقد ${c.no ? '#' + esc(c.no) : ''} · ${esc(c.pos || '')} · ${fd(c.start)} ← ${fd(c.end)}${gls(c) ? ' · ' + esc(gls(c)) : ''}</span></div>` : `<div class="hr-err">لا يوجد عقد ساري لهذا الموظف خلال الشهر، فلا يمكن حساب المبالغ.</div>`}
      ${tone !== 'ok' ? `<div class="hr-warnbox ${tone}">${g.total > 100 ? 'مجموع النسب يتجاوز 100% بـ ' + pctTxt(g.total - 100) : 'مجموع النسب أقل من 100% بـ ' + pctTxt(100 - g.total) + (sal != null ? ' (غير موزّع: ' + money(sal * (100 - g.total) / 100, cur) + ')' : '')}</div>` : ''}
      <div class="hr-sec"><span>تفاصيل النسب والتكليفات</span></div>${rowsHtml}
      <p class="note c"><span>المبلغ = الراتب × نسبة التكليف × (أيام التكليف داخل الشهر ÷ أيام الشهر).</span></p>
      ${HR.db.get('employees', {})[empId] ? `<button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>` : ''}`);
    const b = $('hrToEmp'); if (b) b.onclick = () => openEmp(empId);
  }
  function renderAsg(body) {
    const all = HR.assignments();
    const seg = el('div', 'seg hr-vseg', `<button data-v="emp" class="${f.av === 'emp' ? 'on' : ''}">${icon('users')}حسب الموظف</button><button data-v="list" class="${f.av !== 'emp' ? 'on' : ''}">${icon('briefcase')}قائمة مسطّحة</button>`);
    seg.querySelectorAll('button').forEach((b) => b.onclick = () => { f.av = b.dataset.v; saveF(); render(); });
    body.appendChild(seg);
    if (f.av === 'emp' || f.as === 'month') monthNav(body);
    if (f.av === 'emp') { renderAsgByEmp(body); return; }
    filterChips(body, 'as', [['month', 'خلال الشهر'], ['active', 'سارية اليوم'], ['soon', 'تنتهي خلال 30 يوماً'], ['ended', 'منتهية'], ['all', 'الكل']]);
    const projs = {}; all.forEach((a) => { const k = a.pno || a.code || a.project; if (k) projs[k] = (projs[k] || 0) + 1; });
    const top = Object.entries(projs).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (top.length > 1) filterChips(body, 'proj', [['all', 'كل المشاريع']].concat(top.map(([k]) => [k, k])), Object.assign({ all: all.length }, projs));
    search(body, 'الاسم أو المشروع');
    const t = today();
    const st = (a) => f.as === 'all' || (f.as === 'month' ? !!inMonth(a, f.am) : f.as === 'active' ? (!a.start || a.start <= t) && (!a.end || a.end >= t) : f.as === 'ended' ? a.end && a.end < t : a.end && daysTo(a.end) >= 0 && daysTo(a.end) <= 30);
    const rows = all.filter((a) => st(a) && (f.proj === 'all' || (a.pno || a.code || a.project) === f.proj) && match(f.q, a.name || empName(a.empId), a.project, a.code, a.pno, a.no, a.status)).sort((a, b) => String(a.end || '9').localeCompare(String(b.end || '9')));
    body.appendChild(el('div', 'hr-tools', `<small>${rows.length} تكليف</small>`));
    list(body, rows.map(asgRow), 'لا تكليفات بهذه الفلاتر');
  }

  /* ---------- الإجازات: الأرصدة والطلبات ---------- */
  function rqCard(q) {
    const st = rqStatus(q.status);
    const cells = [['النوع', q.kind === 'daily' && q.nature ? leaveLbl(q.nature) : RQ[q.kind][0]], ['التاريخ', q.kind === 'daily' && q.from !== q.to ? `${fd(q.from)} ← ${fd(q.to)}` : fd(q.from)], ['الوقت', q.start ? q.start + (q.end ? ' ← ' + q.end : '') : null], ['المخطط', q.planned && q.planned !== (q.start + (q.end ? ' ← ' + q.end : '')) ? q.planned : null], ['المدة', q.kind === 'daily' ? (q.days ? q.days + ' يوم' : null) : hhm(q.hours)], ['المشروع', q.project], ['اعتمده', q.by]].filter((x) => x[1]);
    return `<div class="hr-con" style="--kc:var(--rq-${q.kind})"><div class="hr-conh">${rqChip(q)}<b></b>${st ? badge(st[0], st[1]) : ''}</div>
      <div class="hr-cgrid">${cells.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>${q.reason ? `<div class="hr-conr" style="color:var(--muted);margin:8px 0 0">${esc(q.reason)}</div>` : ''}</div>`;
  }
  const num2 = (n) => n == null ? '—' : (Math.round(n * 100) / 100).toLocaleString('en', { maximumFractionDigits: 2 });
  function poolCard(title, p, unit, tone) {
    if (!p) return '';
    const pct = p.ent ? Math.max(0, Math.min(100, (p.rem || 0) / p.ent * 100)) : 0;
    return `<div class="hr-pool ${tone}"><small>${title}</small><b class="${p.rem < 0 ? 'neg' : ''}">${num2(p.rem)} <em>${unit}</em></b><span class="hr-pbar ${tone}"><i style="width:${pct}%"></i></span><small>مستحقة ${num2(p.ent)} · مستهلكة ${num2(p.used)}</small></div>`;
  }
  // تفاصيل الطلب + اعتماد/رفض من التطبيق
  function openReq(q) {
    const raw = HR.db.get('employees', {})[q.empId];
    const e = raw ? HR.emp(raw) : { name: q.name || empName(q.empId) || '—', id: q.empId };
    const st = rqStatus(q.status), act = HR.reqActions(q), b = HR.balanceOf(q.empId);
    const an = b && b.annual;
    const kv = [['النوع', RQ[q.kind][0] + (q.kind === 'daily' && q.nature ? ' · ' + leaveLbl(q.nature) : '')], ['الفترة', rqWhen(q)], ['السبب', q.reason], ['المشروع', q.project], ['اعتمده', q.by]].filter((x) => x[1]);
    sheet(`<div class="hr-ph"><span class="hr-ava big ${RQ[q.kind][1]}">${esc(initials(e.name))}</span><div><b>${esc(e.name)}</b><small>${RQ[q.kind][0]}</small><div class="hr-tags">${st ? badge(st[0], st[1]) : ''}</div></div></div>
      <div class="hr-cgrid">${kv.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
      ${q.kind === 'daily' && an ? `<div class="hr2-bal"><span>رصيد الموظف السنوي</span><b>${num2(an.rem)} يوم${q.days && an.rem != null ? ' ← ' + num2(an.rem - q.days) + ' بعد هذه الإجازة' : ''}</b></div>` : ''}
      ${act ? `<div class="hr2-dec" id="hrDec">
          <textarea id="hrDecWhy" rows="2" placeholder="سبب الرفض (اختياري)" hidden></textarea>
          <div class="hr2-decb"><button type="button" class="btn-gold" id="hrOk">${act.label === 'الاعتماد' ? 'اعتماد' : 'موافقة المدير'}</button><button type="button" class="btn-outline" id="hrNo">رفض</button></div>
          <p class="hr-omn" id="hrDecMsg" style="margin:6px 0 0">سيُرسَل القرار فوراً إلى نظام PEF ويُسجَّل باسم حسابك.</p></div>`
        : `<div class="hr-omn">${q.status === 'approved' || q.status === 'applied' ? 'الطلب معتمد.' : q.kind === 'overtime' || q.kind === 'holiday' ? 'اعتماد العمل الإضافي والعمل في العطل يتم من نظام PEF.' : 'لا إجراء متاح على هذا الطلب في حالته الحالية.'}</div>`}
      <button class="btn-outline wide" id="hrReqBal">${icon('cal')}<span>رصيد الموظف وطلباته</span></button>
      ${raw ? `<button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>` : ''}`);
    $('hrReqBal').onclick = () => openBalance(q.empId);
    const t = $('hrToEmp'); if (t) t.onclick = () => openEmp(q.empId);
    if (!act) return;
    const msg = $('hrDecMsg'), ok = $('hrOk'), no = $('hrNo'), why = $('hrDecWhy');
    const lbl = act.label === 'الاعتماد' ? 'اعتماد' : 'موافقة المدير';
    const IDLE = 'سيُرسَل القرار فوراً إلى نظام PEF ويُسجَّل باسم حسابك.';
    let state = 'idle';
    const paint = (note) => {
      ok.textContent = state === 'ok' ? 'تأكيد الموافقة' : state === 'no' ? 'إلغاء' : lbl;
      no.textContent = state === 'no' ? 'تأكيد الرفض' : state === 'ok' ? 'إلغاء' : 'رفض';
      why.hidden = state !== 'no';
      msg.style.color = '';
      msg.textContent = note || (state === 'ok' ? 'اضغط "تأكيد الموافقة" لإرسال القرار إلى النظام.' : state === 'no' ? 'أدخل السبب إن رغبت ثم اضغط "تأكيد الرفض".' : IDLE);
    };
    const run = async (action) => {
      ok.disabled = no.disabled = true; msg.textContent = 'جارٍ الإرسال إلى النظام…';
      let r; try { r = await HR.decide(q, action, why.value.trim()); } catch (er) { r = { ok: false, status: 0 }; }
      if (r.ok) { toast(action === 'approve' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب'); closeSheet(); render(); return; }
      ok.disabled = no.disabled = false; state = 'idle';
      const code = r.data && (r.data.error || r.data.message);
      paint(r.status === 403 ? 'ليست لديك صلاحية لهذا الإجراء في النظام.' : r.status === 401 ? 'انتهت الجلسة، أعد تسجيل الدخول.' : r.status === 0 ? 'تعذّر الاتصال ولم يُرسل القرار. حاول مرة أخرى.' : 'رفض النظام الطلب' + (code ? ': ' + code : '') + '.');
      msg.style.color = '#F2716A';
    };
    ok.onclick = () => { if (state === 'ok') run('approve'); else { state = state === 'idle' ? 'ok' : 'idle'; paint(); } };
    no.onclick = () => { if (state === 'no') run('reject'); else { state = state === 'idle' ? 'no' : 'idle'; paint(); } };
  }

  function openBalance(empId) {
    const raw = HR.db.get('employees', {})[empId];
    const e = raw ? HR.emp(raw) : { name: empName(empId) || '—', id: empId };
    const b = HR.balanceOf(empId);
    const yr = today().slice(0, 4);
    const rq = HR.requests().filter((q) => q.empId === empId && String(q.from || '').startsWith(yr)).sort((a, z) => String(z.from).localeCompare(String(a.from)));
    const sum = (k) => rq.filter((q) => q.kind === k && !['rejected', 'cancelled', 'canceled'].includes(q.status));
    sheet(`<div class="hr-ph"><span class="hr-ava big info">${esc(initials(e.name))}</span><div><b>${esc(e.name)}</b><small>رصيد الإجازات ${yr}${b && b.at ? ' · حُدّث ' + ago(b.at) : ''}</small></div></div>
      ${b ? `<div class="hr-pools">${poolCard('السنوية / الطارئة', b.annual, 'يوم', 'ok')}${poolCard('المرضية (كامل الأجر)', b.sickFull, 'يوم', 'warn')}${poolCard('المرضية (نصف الأجر)', b.sickHalf, 'يوم', 'mute')}
        ${b.comp ? `<div class="hr-pool info"><small>التعويضية</small><b>${num2(b.comp.remH)} <em>ساعة</em></b><small>مكتسبة ${num2(b.comp.earned)} · مستخدمة ${num2(b.comp.used)}${b.comp.exp ? ' · أقرب انتهاء ' + fd(b.comp.exp) : ''}</small></div>` : ''}</div>`
        : '<div class="hr-none">لم يُجلب رصيد هذا الموظف بعد</div>'}
      <button class="btn-outline wide" id="hrBalRe">${icon('refresh')}<span>تحديث الرصيد من النظام</span></button>
      <div class="hr-quick"><div><b>${sum('daily').length}</b><small>إجازة يومية</small></div><div><b>${sum('hourly').length}</b><small>مغادرة</small></div><div><b>${sum('mission').length}</b><small>مهمة عمل</small></div><div><b>${sum('overtime').length}</b><small>عمل إضافي</small></div></div>
      <div class="hr-sec"><span>طلبات ${yr} (${rq.length})</span></div>${rq.map(rqCard).join('') || '<div class="hr-none">لا طلبات</div>'}
      ${raw ? `<button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>` : ''}`);
    $('hrBalRe').onclick = async () => { $('hrBalRe').disabled = true; const ok = await HR.syncBalance(empId); toast(ok ? 'تم تحديث الرصيد' : 'تعذّر جلب الرصيد (تحقق من الصلاحية)'); openBalance(empId); };
    const t = $('hrToEmp'); if (t) t.onclick = () => openEmp(empId);
  }
  function renderLv(body) {
    if (!['bal', 'req'].includes(f.lv)) f.lv = 'bal';
    const seg = el('div', 'seg hr-vseg', `<button data-v="bal" class="${f.lv === 'bal' ? 'on' : ''}">${icon('chart')}الأرصدة</button><button data-v="req" class="${f.lv === 'req' ? 'on' : ''}">${icon('note')}الطلبات</button>`);
    seg.querySelectorAll('button').forEach((b) => b.onclick = () => { f.lv = b.dataset.v; render(); });
    if (f.lv === 'bal') {
      const bm = HR.db.get('balMeta', {});
      const head = el('div', 'hr-tools', `<small>${bm.at ? 'الأرصدة محدّثة ' + ago(bm.at) + ` · ${bm.ok || 0} موظف` : 'لم تُجلب الأرصدة بعد'}</small><button>${icon('refresh')}جلب كل الأرصدة</button>`);
      head.querySelector('button').onclick = async (ev) => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'جارٍ الجلب…'; try { const st = await HR.syncBalances((m) => { b.textContent = m; }); toast(`تم جلب ${st.ok} من ${st.total} رصيد`); } catch (e) { toast(e.message); } render(); };
      body.appendChild(head);
      if (!['all', 'low', 'neg'].includes(f.lb)) f.lb = 'all';
      const emps = HR.employees().filter((e) => e.active && orgOk(e) && typeOk(e));
      const rows = emps.map((e) => ({ e, b: HR.balanceOf(e.id) }));
      filterChips(body, 'org', [['all', 'الكل'], ['PEF', 'PEF'], ['HHO', 'HHO']]);
      filterChips(body, 'lb', [['all', 'كل الموظفين'], ['low', 'رصيد سنوي ≤ 2 يوم'], ['neg', 'رصيد سالب']], { all: rows.length, low: rows.filter((x) => x.b && x.b.annual && x.b.annual.rem != null && x.b.annual.rem <= 2).length, neg: rows.filter((x) => x.b && x.b.annual && x.b.annual.rem < 0).length });
      search(body, 'ابحث عن موظف لعرض رصيده');
      const list2 = rows.filter((x) => (f.lb === 'all' || (x.b && x.b.annual && (f.lb === 'neg' ? x.b.annual.rem < 0 : x.b.annual.rem <= 2))) && match(f.q, x.e.name, x.e.empId, x.e.nid, x.e.dept))
        .sort((a, z) => a.e.name.localeCompare(z.e.name, 'ar'));
      const tools = el('div', 'hr-tools', `<small>${list2.length} موظف</small><button>${icon('share')}مشاركة</button>`);
      tools.querySelector('button').onclick = () => shareList('أرصدة الإجازات', list2.map((x, i) => `${i + 1}. ${x.e.name} — سنوية: ${x.b && x.b.annual ? num2(x.b.annual.rem) : '—'} يوم · مرضية: ${x.b && x.b.sickFull ? num2(x.b.sickFull.rem) : '—'} يوم${x.b && x.b.comp ? ' · تعويضية: ' + num2(x.b.comp.remH) + ' س' : ''}`));
      body.appendChild(tools);
      list(body, list2.map(({ e, b }) => {
        const r = el('button', 'hr-row hr-crow');
        const an = b && b.annual, sk = b && b.sickFull;
        const tone = !an || an.rem == null ? 'mute' : an.rem < 0 ? 'bad' : an.rem <= 2 ? 'warn' : 'ok';
        r.innerHTML = `<span class="hr-ava ${tone}">${esc(initials(e.name))}</span><span class="hr-rt"><b>${esc(e.name)}</b><small>${esc([e.dept, e.org].filter(Boolean).join(' · '))}</small>
          ${b ? `<span class="hr-flags">${badge('مرضية ' + num2(sk ? sk.rem : null), 'warn')}${b.comp && b.comp.remH ? badge('تعويضية ' + num2(b.comp.remH) + ' س', 'info') : ''}</span>` : ''}</span>
          <span class="hr-rr"><b class="hr-pt ${tone}">${an ? num2(an.rem) : '—'}</b><small>${an ? 'يوم سنوي' : 'غير مجلوب'}</small></span>`;
        r.onclick = () => openBalance(e.id); r.dataset.emp = e.id;
        return r;
      }), 'لا موظفين');
      return;
    }
    // الطلبات
    const all = HR.requests();
    if (!f.rk) f.rk = 'all'; if (!f.rs) f.rs = 'all';
    monthNav(body);
    const mb = monthBounds(f.am);
    const inM = all.filter((q) => q.from && q.from <= mb.to && (q.to || q.from) >= mb.from);
    const kc = { all: inM.length }; inM.forEach((q) => { kc[q.kind] = (kc[q.kind] || 0) + 1; });
    filterChips(body, 'rk', [['all', 'الكل'], ['daily', 'إجازة يومية'], ['hourly', 'مغادرة ساعية'], ['mission', 'مهمة عمل'], ['overtime', 'عمل إضافي'], ['holiday', 'عمل في عطلة']], kc);
    filterChips(body, 'rs', [['all', 'كل الحالات'], ['approved', 'معتمد'], ['pending', 'قيد الاعتماد'], ['draft', 'مسودة'], ['rejected', 'مرفوض']]);
    search(body, 'اسم الموظف أو السبب أو المشروع');
    const okSt = (q) => f.rs === 'all' || (f.rs === 'pending' ? ['pending', 'submitted', 'manager_approved', 'new'].includes(q.status) : f.rs === 'rejected' ? ['rejected', 'cancelled', 'canceled'].includes(q.status) : q.status === f.rs);
    const rows = inM.filter((q) => (f.rk === 'all' || q.kind === f.rk) && okSt(q) && match(f.q, q.name || empName(q.empId), q.reason, q.project, leaveLbl(q.nature)))
      .sort((a, z) => String(z.from).localeCompare(String(a.from)));
    const tools = el('div', 'hr-tools', `<small>${rows.length} طلب</small><button>${icon('share')}مشاركة</button>`);
    tools.querySelector('button').onclick = () => shareList(`الطلبات — ${monthName(f.am)}`, rows.map((q, i) => `${i + 1}. ${q.name || empName(q.empId) || '—'} — ${RQ[q.kind][0]}${q.nature && q.kind === 'daily' ? ' (' + leaveLbl(q.nature) + ')' : ''} — ${rqWhen(q)}${q.status ? ' — ' + rqStatus(q.status)[0] : ''}`));
    body.appendChild(tools);
    if (!all.length) { body.appendChild(el('div', 'hr-none', 'لم تُجلب الطلبات بعد — اضغط زر المزامنة')); return; }
    list(body, rows.map((q) => {
      const st = rqStatus(q.status);
      const r = el('button', 'hr-row hr-crow');
      r.innerHTML = `<span class="hr-ava ${RQ[q.kind][1]}">${icon(RQ[q.kind][2])}</span><span class="hr-rt"><b>${esc(q.name || empName(q.empId) || '—')}</b><small>${RQ[q.kind][0]}${q.kind === 'daily' && q.nature ? ' · ' + esc(leaveLbl(q.nature)) : ''}${q.project ? ' · ' + esc(q.project) : ''}</small><small>${rqWhen(q)}</small>${q.reason ? `<small>${esc(q.reason)}</small>` : ''}</span><span class="hr-rr">${st ? badge(st[0], st[1]) : ''}</span>`;
      r.onclick = () => openReq(q); r.dataset.emp = q.empId;
      return r;
    }), 'لا طلبات بهذه الفلاتر');
  }

  /* ---------- ساعات الأسبوع ---------- */
  const wdN = F({ weekday: 'narrow' });
  const wdS = F({ weekday: 'long' });
  const weekStart = (ds) => addDays(ds, -((Tracker.dowOf(ds) + 1) % 7)); // الأسبوع يبدأ السبت
  const hh = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  let wkCache = null;
  // تجميع الأسبوع لكل موظف: مجموع الساعات، المطلوب حتى اليوم، أيام الحضور، التأخير، نسيان الخروج
  function weekData(ws) {
    const t = today(), cfg = HR.settings(), key = `${ws}|${HR.meta().lastSync}|${cfg.dayHours}|${cfg.weekend}|${cfg.office}|${cfg.field}|${cfg.grace}`;
    if (wkCache && wkCache.key === key) return wkCache.data;
    const days = []; for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
    const by = {}; let synced = 0;
    days.forEach((ds) => {
      if (ds > t) return;
      const rep = HR.dayReport(ds);
      if (rep.synced) synced++;
      rep.rows.forEach((r) => {
        const o = by[r.e.id] = by[r.e.id] || { e: r.e, days: {}, total: 0, expected: 0, present: 0, late: 0, noOut: 0, outside: 0, leave: 0 };
        o.days[ds] = { r, synced: rep.synced, weekend: rep.weekend };
        if (!rep.synced) return;
        if (r.workMin) o.total += r.workMin;
        if (r.list.length) o.present++;
        if (r.lateMin > 0) o.late++;
        if (r.outside) o.outside++;
        if (r.status === 'leave') o.leave++;
        if (r.openShift && !r.live && r.list.length) o.noOut++;
        if (!rep.weekend && r.status !== 'leave') o.expected += (cfg.dayHours || 8) * 60;
      });
    });
    const data = { days, rows: Object.values(by), synced };
    wkCache = { key, data };
    return data;
  }
  const wkTone = (o) => !o.expected ? (o.total ? 'ok' : 'mute') : o.total >= o.expected * 0.995 ? 'ok' : o.total >= o.expected * 0.8 ? 'warn' : 'bad';
  function weekNav(body) {
    const ws = f.wk || weekStart(today()), we = addDays(ws, 6), cur = ws === weekStart(today());
    const nav = el('div', 'hr-dnav', `<button class="icon-btn flip" data-w="-7" aria-label="الأسبوع السابق">${icon('chev')}</button><label><b>${cur ? 'هذا الأسبوع' : 'من ' + fd(ws)}</b><small>${fd(ws)} ← ${fd(we)}</small><input type="date" value="${ws}" max="${today()}"></label><button class="icon-btn" data-w="7" aria-label="الأسبوع التالي" ${addDays(ws, 7) > today() ? 'disabled' : ''}>${icon('chev')}</button>`);
    nav.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { f.wk = addDays(ws, +b.dataset.w); render(); });
    nav.querySelector('input').onchange = (e) => { if (e.target.value) { f.wk = weekStart(e.target.value); render(); } };
    body.appendChild(nav);
    return ws;
  }
  function renderWeek(body) {
    const ws = weekNav(body);
    const D = weekData(ws), cfg = HR.settings();
    if (!D.synced) {
      const m = el('div', 'hr-empty', `<span class="hr-eic">${icon('chart')}</span><b>حضور هذا الأسبوع غير محفوظ على الجهاز</b><small>زامن الأيام لعرض ساعات العمل.</small>`);
      const b = el('button', 'btn-outline wide', `${icon('refresh')}<span>مزامنة هذا الأسبوع</span>`);
      b.onclick = async () => { b.disabled = true; try { await HR.sync(null, { from: ws }); } catch (e) { toast(e.message); } render(); };
      m.appendChild(b); body.appendChild(m); return;
    }
    const base = D.rows.filter((o) => orgOk(o.e) && typeOk(o.e));
    filterChips(body, 'org', [['all', 'الكل'], ['PEF', 'موظفو PEF'], ['HHO', 'موظفو HHO']]);
    filterChips(body, 'type', [['all', 'الكل'], ['office', 'مكتبي'], ['field', 'ميداني']]);
    const cnt = { all: base.length, under: base.filter((o) => o.expected && o.total < o.expected * 0.8).length, over: base.filter((o) => o.expected && o.total > o.expected * 1.05).length, none: base.filter((o) => !o.total).length, noout: base.filter((o) => o.noOut).length };
    if (!['all', 'under', 'over', 'none', 'noout'].includes(f.wf)) f.wf = 'all';
    filterChips(body, 'wf', [['all', 'كل الموظفين'], ['under', 'أقل من المطلوب'], ['over', 'أكثر من المطلوب'], ['none', 'بلا ساعات'], ['noout', 'نسوا الخروج']], cnt);
    filterChips(body, 'ws', [['hours', 'الأكثر ساعات'], ['low', 'الأقل ساعات'], ['diff', 'الأكثر نقصاً'], ['name', 'الاسم']]);
    search(body, 'ابحث بالاسم أو الرقم أو القسم');
    const flt = { all: () => true, under: (o) => o.expected && o.total < o.expected * 0.8, over: (o) => o.expected && o.total > o.expected * 1.05, none: (o) => !o.total, noout: (o) => o.noOut };
    const sorters = { hours: (a, b) => b.total - a.total, low: (a, b) => a.total - b.total, diff: (a, b) => (a.total - a.expected) - (b.total - b.expected), name: (a, b) => a.e.name.localeCompare(b.e.name, 'ar') };
    const rows = base.filter((o) => flt[f.wf](o) && match(f.q, o.e.name, o.e.empId, o.e.dept, o.e.nid)).sort((a, b) => sorters[f.ws](a, b) || a.e.name.localeCompare(b.e.name, 'ar'));
    const sumT = rows.reduce((t, o) => t + o.total, 0), sumE = rows.reduce((t, o) => t + o.expected, 0);
    body.appendChild(el('div', 'hr-wsum', `<div><small>الموظفون</small><b>${rows.length}</b></div><div><small>مجموع الساعات</small><b>${hh(sumT)}</b></div><div><small>متوسط الموظف</small><b>${rows.length ? hh(sumT / rows.length) : '—'}</b></div><div><small>من المطلوب</small><b class="${sumE && sumT < sumE * 0.8 ? 'bad' : ''}">${sumE ? Math.round(sumT / sumE * 100) + '%' : '—'}</b></div>`));
    const tools = el('div', 'hr-tools', `<small>${fd(ws)} ← ${fd(addDays(ws, 6))} · المطلوب ${cfg.dayHours} س يومياً</small><button>${icon('share')}مشاركة</button>`);
    tools.querySelector('button').onclick = () => shareList(`ساعات العمل من ${fd(ws)} إلى ${fd(addDays(ws, 6))}`, rows.map((o, i) => `${i + 1}. ${o.e.name} — ${hh(o.total)} س${o.expected ? ' من ' + hh(o.expected) : ''} · ${o.present} أيام${o.late ? ' · تأخير ' + o.late : ''}${o.noOut ? ' · بلا خروج ' + o.noOut : ''}`));
    body.appendChild(tools);
    const maxDay = Math.max(1, (cfg.dayHours || 8) * 60 * 1.25);
    list(body, rows.map((o) => {
      const tone = wkTone(o);
      const bars = D.days.map((ds) => {
        const c = o.days[ds], m = c && c.synced ? c.r.workMin : 0;
        const cls = !c ? 'x' : !c.synced ? 'x' : c.r.status === 'leave' ? 'lv' : c.weekend && !m ? 'off' : m ? (c.r.lateMin > 0 ? 'late' : 'ok') : 'no';
        return `<span title="${fd(ds)}"><i class="${cls}" style="height:${m ? Math.max(12, Math.min(100, m / maxDay * 100)) : 10}%"></i><em>${wdN.format(noon(ds))}</em></span>`;
      }).join('');
      const r = el('button', 'hr-row hr-crow');
      r.innerHTML = `<span class="hr-ava ${tone}">${esc(initials(o.e.name))}</span><span class="hr-rt"><b>${esc(o.e.name)}</b><small>${esc([o.e.dept, TYPE[o.e.type], o.e.org].filter(Boolean).join(' · '))}</small><span class="hr-wbars">${bars}</span>
        <span class="hr-flags">${o.late ? badge('تأخير ' + o.late, 'warn') : ''}${o.noOut ? badge('بلا خروج ' + o.noOut, 'bad') : ''}${o.outside ? badge('خارج الموقع ' + o.outside, 'bad') : ''}${o.leave ? badge('إجازة ' + o.leave, 'info') : ''}</span></span>
        <span class="hr-rr"><b class="hr-pt ${tone}">${hh(o.total)}</b><small>${o.expected ? 'من ' + hh(o.expected) : 'ساعة'}</small>${o.expected && o.total !== o.expected ? `<small class="hr-df ${o.total > o.expected ? 'up' : 'dn'}">${o.total > o.expected ? 'زيادة' : 'نقص'} ${hh(Math.abs(o.total - o.expected))}</small>` : ''}</span>`;
      r.onclick = () => openWeek(o.e.id, ws); r.dataset.emp = o.e.id;
      return r;
    }), 'لا موظفين بهذه الفلاتر', 300);
  }
  function openWeek(empId, ws) {
    const D = weekData(ws), o = D.rows.find((x) => x.e.id === empId);
    if (!o) return;
    const cfg = HR.settings(), e = o.e, tone = wkTone(o), t = today();
    const maxDay = Math.max(1, (cfg.dayHours || 8) * 60 * 1.25);
    const chart = D.days.map((ds) => {
      const c = o.days[ds], m = c && c.synced ? c.r.workMin : 0, fut = ds > t;
      const cls = fut || !c || !c.synced ? 'x' : c.r.status === 'leave' ? 'lv' : m ? (c.r.lateMin > 0 ? 'late' : 'ok') : 'no';
      return `<button class="hr-wc" data-day="${ds}" ${fut ? 'disabled' : ''}><span class="hr-wcb"><i class="${cls}" style="height:${m ? Math.max(8, Math.min(100, m / maxDay * 100)) : 0}%"></i><u style="bottom:${Math.min(100, (cfg.dayHours || 8) * 60 / maxDay * 100)}%"></u></span><b>${m ? hh(m) : '—'}</b><small>${wdN.format(noon(ds))}</small></button>`;
    }).join('');
    const rowsHtml = D.days.map((ds) => {
      const c = o.days[ds], fut = ds > t;
      if (fut) return `<div class="hr-wd fut"><div class="hr-wdh"><b>${wdS.format(noon(ds))}</b><small>${fd(ds)}</small></div><span class="hr-b mute">لم يأتِ بعد</span></div>`;
      if (!c) return `<div class="hr-wd"><div class="hr-wdh"><b>${wdS.format(noon(ds))}</b><small>${fd(ds)}</small></div><span class="hr-b mute">غير نشط</span></div>`;
      if (!c.synced) return `<button class="hr-wd" data-day="${ds}"><div class="hr-wdh"><b>${wdS.format(noon(ds))}</b><small>${fd(ds)}</small></div><span class="hr-b mute">غير مزامن</span></button>`;
      const r = c.r, st = STATUS[r.status];
      const times = r.firstIn ? `${tf.format(new Date(r.firstIn))}${r.lastOut ? ' ← ' + tf.format(new Date(r.lastOut)) : r.live ? ' ← الآن' : ' ← بلا خروج'}` : '';
      const rq = r.reqs.map(rqChip).join('');
      return `<button class="hr-wd" data-day="${ds}"><div class="hr-wdh"><b>${wdS.format(noon(ds))}</b><small>${fd(ds)}</small></div>
        <div class="hr-wdm"><span class="hr-wdt">${times || '—'}</span><span class="hr-flags">${badge(r.status === 'late' ? 'متأخر +' + r.lateMin + ' د' : st[0], st[1])}${r.outside ? badge('خارج الموقع', 'bad') : ''}${r.openShift && !r.live && r.list.length ? badge('بلا خروج', 'bad') : ''}${rq}</span></div>
        <b class="hr-wdh2 ${r.workMin ? '' : 'z'}">${r.workMin ? hh(r.workMin) : '—'}</b></button>`;
    }).join('');
    sheet(`<div class="hr-ph"><span class="hr-ava big ${tone}">${esc(initials(e.name))}</span><div><b>${esc(e.name)}</b><small>${fd(ws)} ← ${fd(addDays(ws, 6))}</small><div class="hr-tags">${badge(e.org, 'info')}${badge(TYPE[e.type], 'mute')}</div></div></div>
      <div class="hr-dsum">
        <div><small>مجموع الساعات</small><b class="hr-pt ${tone}">${hh(o.total)}</b></div>
        <div><small>المطلوب حتى اليوم</small><b>${o.expected ? hh(o.expected) : '—'}</b></div>
        <div><small>الفرق</small><b class="${o.total >= o.expected ? 'okc' : 'warn'}">${o.expected ? (o.total >= o.expected ? 'زيادة ' : 'نقص ') + hh(Math.abs(o.total - o.expected)) : '—'}</b></div>
        <div><small>أيام الحضور</small><b>${o.present}${o.present ? ` <em>معدل ${hh(o.total / o.present)}</em>` : ''}</b></div>
      </div>
      <div class="hr-sec"><span>الساعات يومياً</span><small>الخط = ${cfg.dayHours} س</small></div><div class="hr-wchart">${chart}</div>
      <div class="hr-sec"><span>تفاصيل الأيام</span><small>اضغط يوماً لعرض سجله</small></div><div class="hr-wds">${rowsHtml}</div>
      <button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>`);
    const body = $('hrSheetBody');
    body.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => openDay(empId, b.dataset.day); });
    $('hrToEmp').onclick = () => openEmp(empId);
  }

  /* ---------- الرسائل: القوالب والإرسال لعدة موظفين ---------- */
  const SELTABS = ['att', 'wk', 'lv', 'emp', 'con', 'asg'];
  let selMode = false; const sel = new Map(); // معرّف الموظف ← { empId, ctx }
  const TPL = [
    { id: 'contract', name: 'إنهاء العقد', kind: 'contract', text: 'عزيزي الموظف {الاسم}\nنعلمكم بانتهاء العقد الخاص بكم يوم {اليوم} الموافق {التاريخ}.' },
    { id: 'assignment', name: 'انتهاء التكليف', kind: 'assignment', text: 'عزيزي الموظف {الاسم}\nنعلمكم بانتهاء التكليف الخاص بكم يوم {اليوم} الموافق {التاريخ}، ويعتبر هذا إشعاراً رسمياً من الموارد البشرية.' },
    { id: 'late', name: 'تذكير بالتأخر', kind: 'custom', text: 'عزيزي الموظف {الاسم}\nنلفت انتباهكم إلى تأخركم عن الدوام اليوم {يوم_اليوم} {تاريخ_اليوم} ({دقائق_التأخير} دقيقة). نرجو الالتزام بمواعيد الدوام.' },
    { id: 'absent', name: 'عدم تسجيل الحضور', kind: 'custom', text: 'عزيزي الموظف {الاسم}\nلم يُسجَّل حضوركم اليوم {يوم_اليوم} {تاريخ_اليوم}. نرجو تسجيل الحضور أو إفادتنا بسبب الغياب.' },
    { id: 'free', name: 'رسالة حرة', kind: 'custom', text: 'عزيزي الموظف {الاسم}\n' }
  ];
  const TOKENS = ['الاسم', 'اليوم', 'التاريخ', 'نهاية_العقد', 'نهاية_التكليف', 'المشروع', 'المسمى', 'رقم_العقد', 'تاريخ_اليوم', 'يوم_اليوم', 'وقت_الدخول', 'دقائق_التأخير'];
  const tplStore = () => Object.assign({ over: {}, custom: [] }, HR.db.get('msgTpl', {}));
  const templates = () => { const st = tplStore(); return TPL.map((t) => Object.assign({}, t, { text: st.over[t.id] != null ? st.over[t.id] : t.text, edited: st.over[t.id] != null })).concat(st.custom.map((c) => ({ id: c.id, name: c.name, kind: 'custom', text: c.text, custom: true }))); };
  const todayS = () => today();
  // العقد/التكليف الأنسب للموظف: ما ينتهي أولاً من الجاري، وإلا الأحدث انتهاءً
  function bestContract(empId) {
    const l = HR.contracts().filter((c) => c.empId === empId && c.end);
    const act = l.filter((c) => c.end >= todayS()).sort((a, b) => b.end.localeCompare(a.end));
    return act[0] || l.sort((a, b) => b.end.localeCompare(a.end))[0] || null;
  }
  function bestAsg(empId) {
    const l = HR.assignments().filter((a) => a.empId === empId && a.end);
    const act = l.filter((a) => a.end >= todayS()).sort((a, b) => a.end.localeCompare(b.end));
    return act[0] || l.sort((a, b) => b.end.localeCompare(a.end))[0] || null;
  }
  let trCache = null;
  function todayRow(id) {
    const key = todayS() + '|' + (HR.meta().lastSync || 0);
    if (!trCache || trCache.key !== key) { const m = {}; HR.dayReport(todayS()).rows.forEach((r) => { m[r.e.id] = r; }); trCache = { key, m }; }
    return trCache.m[id];
  }
  function tokenMap(rec, kind) {
    const e = rec.e, c = rec.con || bestContract(e.id), a = rec.asg || bestAsg(e.id);
    const date = kind === 'assignment' ? (a && a.end) : kind === 'contract' ? (c && c.end) : ((c && c.end) || (a && a.end));
    return { date, t: { 'الاسم': e.name, 'اليوم': date ? wdS.format(noon(date)) : '—', 'التاريخ': date ? fd(date) : '—', 'نهاية_العقد': c && c.end ? fd(c.end) : '—', 'نهاية_التكليف': a && a.end ? fd(a.end) : '—', 'المشروع': (a && (a.project || a.code)) || '—', 'المسمى': (c && c.pos) || e.pos || '—', 'رقم_العقد': (c && c.no) || '—', 'تاريخ_اليوم': fd(todayS()), 'يوم_اليوم': wdS.format(noon(todayS())), 'وقت_الدخول': todayRow(e.id) && todayRow(e.id).firstIn ? tf.format(new Date(todayRow(e.id).firstIn)) : '—', 'دقائق_التأخير': todayRow(e.id) ? String(todayRow(e.id).lateMin || 0) : '0' } };
  }
  const fillText = (text, rec, kind) => { const m = tokenMap(rec, kind).t; return text.replace(/\{([^{}]+)\}/g, (x, k) => (m[k] != null ? m[k] : x)); };

  /* --- وضع التحديد --- */
  function selOff() { selMode = false; sel.clear(); }
  function ensureSelBar() {
    let bar = $('hrSelBar');
    if (bar) return bar;
    bar = el('div', 'hr-selbar', `<span id="selCount">0 محدد</span><button id="selAll" type="button">تحديد الكل</button><button id="selMsg" type="button" class="go">${icon('note')}رسالة</button><button id="selX" type="button" aria-label="إلغاء">${icon('x')}</button>`);
    bar.id = 'hrSelBar'; bar.hidden = true;
    $('tab-hr').appendChild(bar);
    $('selX').onclick = () => { selOff(); render(); };
    $('selAll').onclick = () => {
      const rows = [...document.querySelectorAll('#hrBody .hr-row[data-emp]')];
      const all = rows.length && rows.every((r) => sel.has(r.dataset.emp));
      rows.forEach((r) => { if (all) sel.delete(r.dataset.emp); else if (!sel.has(r.dataset.emp)) sel.set(r.dataset.emp, { empId: r.dataset.emp, ctx: r.dataset.ctx || null }); });
      rows.forEach((r) => { r.classList.toggle('sel', sel.has(r.dataset.emp)); const c = r.querySelector('.hr-chk'); if (c) c.classList.toggle('on', sel.has(r.dataset.emp)); });
      selBarUpdate();
    };
    $('selMsg').onclick = () => {
      if (!sel.size) { toast('اختر موظفاً واحداً على الأقل'); return; }
      openCompose([...sel.values()].map((v) => { const r = { empId: v.empId }; if (v.ctx && v.ctx.startsWith('c:')) r.con = HR.contracts().find((c) => c.id === v.ctx.slice(2)); if (v.ctx && v.ctx.startsWith('a:')) r.asg = HR.assignments().find((a) => a.id === v.ctx.slice(2)); return r; }), tab === 'con' ? 'contract' : tab === 'asg' ? 'assignment' : 'free');
    };
    return bar;
  }
  function selBarUpdate() {
    const bar = ensureSelBar();
    bar.hidden = !(selMode && SELTABS.includes(tab));
    $('selCount').textContent = `${sel.size} محدد`;
    $('selMsg').disabled = !sel.size;
  }
  function addSelBtn(tools) {
    const wrap = el('span');
    const b = el('button', 'hr-tsel' + (selMode ? ' on' : ''), `${icon('check')}${selMode ? 'إنهاء التحديد' : 'تحديد'}`);
    b.onclick = () => { selMode = !selMode; if (!selMode) sel.clear(); render(); };
    [...tools.children].filter((x) => x.tagName === 'BUTTON').forEach((x) => wrap.appendChild(x));
    const inner = tools.querySelector(':scope > span'); if (inner) { inner.prepend(b); return; }
    wrap.prepend(b); tools.appendChild(wrap);
  }
  function decorate(g) {
    if (!selMode) return;
    g.querySelectorAll('.hr-row[data-emp]').forEach((r) => {
      const k = r.dataset.emp, on = sel.has(k);
      r.classList.toggle('sel', on);
      r.insertBefore(el('span', 'hr-chk' + (on ? ' on' : ''), icon('check')), r.firstChild);
      r.onclick = (ev) => {
        ev.preventDefault();
        if (sel.has(k)) sel.delete(k); else sel.set(k, { empId: k, ctx: r.dataset.ctx || null });
        r.classList.toggle('sel', sel.has(k)); r.querySelector('.hr-chk').classList.toggle('on', sel.has(k));
        selBarUpdate();
      };
    });
  }

  /* --- نافذة الإرسال --- */
  let cmp = null;
  function openCompose(items, tplId) {
    const seen = new Set(), emps = HR.db.get('employees', {}), recs = [];
    items.forEach((it) => {
      if (seen.has(it.empId) || !emps[it.empId]) return; seen.add(it.empId);
      const e = HR.emp(emps[it.empId]);
      recs.push({ key: it.empId, e, con: it.con || null, asg: it.asg || null, sms: smsNumber(e.phone), wa: (phoneInfo(e.phone) || { wa: [] }).wa, cc: 0 });
    });
    if (!recs.length) { toast('لا يوجد موظفون للإرسال'); return; }
    const t = templates().find((x) => x.id === tplId) || templates()[0];
    cmp = { recs, tplId: t.id, text: t.text, ch: store.get('hrMsgCh', 'sms'), done: {}, newName: false };
    drawCompose();
  }
  const waNum = (r) => (r.wa[r.cc] || r.wa[0] || {}).num || '';
  const numOf = (r) => cmp.ch === 'sms' ? r.sms : waNum(r);
  function bodyFor(r) { const t = templates().find((x) => x.id === cmp.tplId) || { kind: 'custom' }; return fillText(cmp.text, r, t.kind); }
  function drawCompose() {
    const tp = templates(), cur = tp.find((x) => x.id === cmp.tplId), kind = cur ? cur.kind : 'custom';
    const noNum = cmp.recs.filter((r) => !numOf(r)).length;
    const noDate = kind === 'custom' ? 0 : cmp.recs.filter((r) => !tokenMap(r, kind).date).length;
    const first = cmp.recs.find((r) => numOf(r)) || cmp.recs[0];
    sheet(`<div class="hr-ph"><span class="hr-ava big info">${icon('note')}</span><div><b>إرسال رسالة</b><small>${cmp.recs.length} موظف</small></div></div>
      <div class="seg hr-vseg" id="cmCh"><button data-c="sms" class="${cmp.ch === 'sms' ? 'on' : ''}">رسالة SMS</button><button data-c="wa" class="${cmp.ch === 'wa' ? 'on' : ''}">واتساب</button></div>
      <div class="ag-lbl">القالب</div><div class="chips" id="cmTpl">${tp.map((x) => `<button class="chip sm${x.id === cmp.tplId ? ' on' : ''}" data-t="${esc(x.id)}">${esc(x.name)}</button>`).join('')}<button class="chip sm" data-t="__new">+ قالب جديد</button></div>
      ${cmp.newName ? `<div class="hr-newtpl"><input id="cmNewName" class="ag-in" placeholder="اسم القالب الجديد" maxlength="40"><button class="btn-gold" id="cmNewOk" type="button">حفظ</button></div>` : ''}
      <textarea id="cmText" class="ag-in hr-cmt" rows="5" placeholder="نص الرسالة"></textarea>
      <div class="hr-toks" id="cmToks">${TOKENS.map((k) => `<button type="button" data-k="${k}">{${k}}</button>`).join('')}</div>
      <div class="hr-cmact"><button class="btn-outline" id="cmSave" type="button">${icon('check')}<span>${cur && cur.custom ? 'حفظ التعديل' : 'حفظ تعديلي على القالب'}</span></button>${cur && cur.custom ? `<button class="btn-outline hr-out" id="cmDel" type="button">${icon('x')}<span>حذف القالب</span></button>` : (cur && cur.edited ? `<button class="btn-outline" id="cmReset" type="button">${icon('refresh')}<span>استعادة الأصلي</span></button>` : '')}</div>
      <div class="hr-sec"><span>معاينة</span><small>${first ? esc(first.e.name) : ''}</small></div>
      <div class="hr-bubble" id="cmPrev"></div>
      ${noDate ? `<div class="hr-warnbox warn">${noDate} موظف بلا تاريخ انتهاء في بياناتهم، سيظهر "—" في مكان التاريخ.</div>` : ''}
      <div class="hr-sec"><span>المستلمون (${cmp.recs.length})</span><small>${cmp.ch === 'sms' ? 'الرقم كما هو في النظام' : 'اضغط المقدمة لتبديلها'}</small></div>
      <div class="hr-rcp" id="cmRecs">${cmp.recs.map((r, i) => {
        const n = numOf(r);
        return `<div class="hr-rc${n ? '' : ' no'}"><span class="hr-ava">${esc(initials(r.e.name))}</span><div class="hr-rct"><b>${esc(r.e.name)}</b><small dir="ltr">${n ? (cmp.ch === 'wa' ? '+' : '') + esc(n) : 'لا يوجد رقم جوال'}</small></div>
          ${cmp.ch === 'wa' && r.wa.length > 1 ? `<button class="hr-cc" data-i="${i}" type="button">+${esc(r.wa[r.cc].cc)}</button>` : ''}<button class="hr-rx" data-i="${i}" type="button" aria-label="إزالة">${icon('x')}</button></div>`;
      }).join('')}</div>
      ${noNum ? `<div class="hr-warnbox bad">${noNum} موظف بلا رقم جوال صالح، سيُتخطّون.</div>` : ''}
      <button class="btn-gold" id="cmGo" type="button" ${cmp.recs.length - noNum ? '' : 'disabled'}>بدء الإرسال (${cmp.recs.length - noNum})</button>
      <p class="hr-omn">تُفتح الرسائل واحدة تلو الأخرى في تطبيق ${cmp.ch === 'sms' ? 'الرسائل' : 'واتساب'} بنص مخصّص لكل موظف، وتضغط "إرسال" فيه ثم ترجع إلى هنا للتالي.</p>`);
    const ta = $('cmText'); ta.value = cmp.text;
    const prev = () => { $('cmPrev').textContent = first ? bodyFor(first) : ''; };
    ta.oninput = () => { cmp.text = ta.value; prev(); }; prev();
    document.querySelectorAll('#cmCh button').forEach((b) => b.onclick = () => { cmp.ch = b.dataset.c; store.set('hrMsgCh', cmp.ch); drawCompose(); });
    document.querySelectorAll('#cmTpl button').forEach((b) => b.onclick = () => {
      if (b.dataset.t === '__new') { cmp.newName = true; drawCompose(); setTimeout(() => { const i = $('cmNewName'); if (i) i.focus(); }, 60); return; }
      const t = templates().find((x) => x.id === b.dataset.t); cmp.tplId = t.id; cmp.text = t.text; cmp.newName = false; drawCompose();
    });
    document.querySelectorAll('#cmToks button').forEach((b) => b.onclick = () => {
      const a = ta.selectionStart == null ? ta.value.length : ta.selectionStart, z = ta.selectionEnd == null ? a : ta.selectionEnd, tok = `{${b.dataset.k}}`;
      ta.value = ta.value.slice(0, a) + tok + ta.value.slice(z); ta.focus(); ta.setSelectionRange(a + tok.length, a + tok.length); cmp.text = ta.value; prev();
    });
    if ($('cmNewOk')) $('cmNewOk').onclick = () => {
      const nm = $('cmNewName').value.trim(); if (!nm) { toast('اكتب اسم القالب'); return; }
      const st = tplStore(); const id = 'c' + Date.now().toString(36); st.custom.push({ id, name: nm, text: cmp.text }); HR.db.put('msgTpl', st);
      cmp.tplId = id; cmp.newName = false; toast('تم حفظ القالب'); drawCompose();
    };
    $('cmSave').onclick = () => {
      const st = tplStore();
      if (cur && cur.custom) { const c = st.custom.find((x) => x.id === cur.id); if (c) c.text = cmp.text; } else st.over[cmp.tplId] = cmp.text;
      HR.db.put('msgTpl', st); toast('تم حفظ القالب'); drawCompose();
    };
    if ($('cmDel')) $('cmDel').onclick = () => { if (!confirm('حذف هذا القالب؟')) return; const st = tplStore(); st.custom = st.custom.filter((x) => x.id !== cmp.tplId); HR.db.put('msgTpl', st); const t = templates()[0]; cmp.tplId = t.id; cmp.text = t.text; drawCompose(); };
    if ($('cmReset')) $('cmReset').onclick = () => { const st = tplStore(); delete st.over[cmp.tplId]; HR.db.put('msgTpl', st); cmp.text = TPL.find((x) => x.id === cmp.tplId).text; drawCompose(); };
    document.querySelectorAll('.hr-cc').forEach((b) => b.onclick = () => { const r = cmp.recs[+b.dataset.i]; r.cc = (r.cc + 1) % r.wa.length; drawCompose(); });
    document.querySelectorAll('.hr-rx').forEach((b) => b.onclick = () => { cmp.recs.splice(+b.dataset.i, 1); if (!cmp.recs.length) { closeSheet(); return; } drawCompose(); });
    $('cmGo').onclick = () => { cmp.done = {}; drawQueue(); };
  }
  function sendTo(r) {
    const n = numOf(r); if (!n) return;
    const body = bodyFor(r);
    if (cmp.ch === 'sms') smsSend(n, body); else openExt('https://wa.me/' + n + '?text=' + encodeURIComponent(body));
    cmp.done[r.key] = true;
  }
  function drawQueue() {
    const list2 = cmp.recs.filter((r) => numOf(r)), done = list2.filter((r) => cmp.done[r.key]).length, next = list2.find((r) => !cmp.done[r.key]);
    sheet(`<div class="hr-ph"><span class="hr-ava big ${next ? 'info' : 'ok'}">${icon(next ? 'note' : 'check')}</span><div><b>${next ? 'قائمة الإرسال' : 'تم فتح كل الرسائل'}</b><small>${done} من ${list2.length}</small></div></div>
      <div class="hr-pbar ${next ? '' : 'ok'}"><i style="width:${list2.length ? done / list2.length * 100 : 0}%"></i></div>
      ${next ? `<button class="btn-gold hr-qnext" id="qNext" type="button">${icon('note')}<span>إرسال إلى ${esc(next.e.name)}</span></button><p class="hr-omn">يفتح ${cmp.ch === 'sms' ? 'تطبيق الرسائل' : 'واتساب'} بالرسالة جاهزة؛ اضغط إرسال هناك ثم ارجع (زر الرجوع) واضغط "التالي".</p>` : `<div class="hr-warnbox" style="color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent)">اكتمل فتح الرسائل لكل الموظفين.</div>`}
      <div class="hr-rcp">${list2.map((r) => `<div class="hr-rc ${cmp.done[r.key] ? 'ok' : ''}"><span class="hr-ava ${cmp.done[r.key] ? 'ok' : ''}">${cmp.done[r.key] ? icon('check') : esc(initials(r.e.name))}</span><div class="hr-rct"><b>${esc(r.e.name)}</b><small dir="ltr">${cmp.ch === 'wa' ? '+' : ''}${esc(numOf(r))}</small></div>
        ${cmp.ch === 'wa' && r.wa.length > 1 ? `<button class="hr-cc" data-k="${esc(r.key)}" type="button">+${esc(r.wa[r.cc].cc)}</button>` : ''}<button class="hr-qs" data-k="${esc(r.key)}" type="button">${cmp.done[r.key] ? 'إعادة' : 'إرسال'}</button></div>`).join('')}</div>
      <button class="btn-outline wide" id="qBack" type="button">${icon('chev')}<span>تعديل الرسالة والمستلمين</span></button>`);
    const q = $('qNext'); if (q) q.onclick = () => { sendTo(next); setTimeout(drawQueue, 350); };
    document.querySelectorAll('.hr-qs').forEach((b) => b.onclick = () => { sendTo(cmp.recs.find((r) => r.key === b.dataset.k)); setTimeout(drawQueue, 350); });
    document.querySelectorAll('.hr-cc').forEach((b) => b.onclick = () => { const r = cmp.recs.find((x) => x.key === b.dataset.k); r.cc = (r.cc + 1) % r.wa.length; drawQueue(); });
    $('qBack').onclick = drawCompose;
  }

  /* ---------- الإعدادات ---------- */
  function renderSet(body) {
    const s = HR.settings();
    const meta = HR.meta();
    const put = (patch) => { HR.db.put('settings', Object.assign(HR.settings(), patch)); applyBg(); };
    // حالة المزامنة والاتصال + اختصارات
    const ni = HR.netInfo(), slow = HR.isSlow(), ws0 = HR.watchState();
    body.appendChild(el('div', 'hr2-status' + (ni.online ? '' : ' off'), `${icon('refresh')}<div><b>${meta.lastSync ? 'آخر مزامنة ' + ago(meta.lastSync) : 'لم تتم المزامنة بعد'}</b><small>${!ni.online ? 'لا يوجد اتصال: يعمل التطبيق من البيانات المحفوظة' : slow ? 'اتصال ضعيف (2G): تُجلب البيانات الصغيرة فقط' : ni.wifi ? 'متصل عبر Wi‑Fi' : 'متصل ببيانات الجوال'}${ws0.min ? ' · المتابعة الخلفية كل ' + ws0.min + ' د' : ''}</small></div>`));
    const quick = el('div', 'hr2-tiles');
    [['note', 'العقود', () => { tab = 'con'; }], ['briefcase', 'التكليفات', () => { tab = 'asg'; }], ['cal', 'الأرصدة', () => { tab = 'lv'; f.lv = 'bal'; }], ['chart', 'ساعات الأسبوع', () => { tab = 'wk'; }], ['note', 'تنبيهات الإدارة', () => { App.go('mgmt'); }]].forEach(([ic, n, go]) => {
      const b = el('button', 'hr2-tile', `${icon(ic)}<b>${n}</b>`); b.type = 'button';
      b.onclick = () => { go(); if (!App.isActive('hr')) return; store.set('hrTab', tab); render(); }; quick.appendChild(b);
    });
    body.appendChild(quick);
    // المزامنة
    const sy = el('div', 'group pad hr-set', `
      <div class="hr-sl">${icon('refresh')}المزامنة</div>
      <label class="hr-srow"><span>جلب الحضور والانصراف ابتداءً من</span><input type="date" id="hsStart" value="${s.attStart}" max="${today()}"></label>
      <div class="hr-sl2">التحديث التلقائي</div><div id="hsAuto" class="chips"></div>
      <div id="hsEveryBox"><div class="hr-sl2">كل</div><div id="hsEvery" class="chips"></div></div>
      <label class="hr-srow" id="hsBgRow"><span>المزامنة في الخلفية حتى لو كان التطبيق مغلقاً<small>عند توفر الإنترنت، بحد أدنى كل 15 دقيقة</small></span><input type="checkbox" id="hsBg" class="hr-tog" ${s.bg ? 'checked' : ''}></label>`);
    body.appendChild(sy);
    const chipSet = (id, opts, cur, fn) => { const b = $(id); opts.forEach(([v, n]) => { const c = el('button', 'chip sm' + (v === cur ? ' on' : ''), n); c.onclick = () => { fn(v); render(); }; b.appendChild(c); }); };
    chipSet('hsAuto', [['open', 'تلقائي'], ['off', 'يدوي فقط']], s.auto, (v) => put({ auto: v }));
    chipSet('hsEvery', [[5, '5 دقائق'], [15, '15 دقيقة'], [30, '30 دقيقة'], [60, 'ساعة'], [120, 'ساعتين'], [360, '6 ساعات']], s.every, (v) => put({ every: v }));
    $('hsEveryBox').hidden = $('hsBgRow').hidden = s.auto === 'off';
    $('hsBg').onchange = (e) => { put({ bg: e.target.checked }); toast(e.target.checked ? 'ستتم المزامنة في الخلفية' : 'أُوقفت المزامنة في الخلفية'); };
    // إعادة جلب كل شيء (نادر الحاجة): الزر العادي يجلب الجديد فقط بعد المحفوظ على الجهاز
    const full = el('button', 'btn-outline wide', `${icon('refresh')}<span>إعادة جلب كل البيانات من النظام</span>`);
    full.type = 'button';
    full.onclick = async () => { full.disabled = true; toast('جارٍ جلب كل البيانات…'); try { await HR.sync(null, { full: true }); toast('تم جلب كل البيانات'); } catch (e) { toast(e.message || 'تعذّرت المزامنة'); } full.disabled = false; render(); };
    sy.appendChild(full);
    $('hsStart').onchange = async (e) => {
      if (!e.target.value) return;
      put({ attStart: e.target.value });
      if (meta.attFrom && e.target.value < meta.attFrom) { toast('جارٍ جلب السجلات الأقدم…'); await doSync(); }
    };
    // المتابعة في الخلفية (تعمل والتطبيق مغلق)
    const wst = HR.watchState();
    const wc = el('div', 'group pad hr-set', `<div class="hr-sl">${icon('refresh')}المتابعة الفورية والتطبيق مغلق</div>
      <p class="hr-omn" style="margin:0 0 8px">خدمة خفيفة تفحص تسجيلات الحضور الجديدة كل بضع دقائق وتعرض النافذة في منتصف الشاشة حتى لو كان التطبيق مغلقاً. تستهلك بيانات قليلة جداً (طلب صغير لتسجيلات اليوم الجديدة فقط) فتناسب الإنترنت الضعيف. والفحص تكيّفي لتقليل الطلبات: بالفترة المختارة وقت وصول الموظفين وانصرافهم، وكل 20 دقيقة بين الفترتين، ويهدأ ليلاً وفي العطلة.</p>
      <div id="hsWatch" class="chips"></div>
      <div class="hr-srow"><span>آخر فحص</span><b id="hsWLast">${wst.last ? new Date(wst.last).toLocaleTimeString('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit' }) + (wst.ok ? '' : ' (تعذّر)') : '—'}</b></div>
      ${B && B.batteryOk && !B.batteryOk() ? `<button class="btn-outline wide" id="wBat" type="button">${icon('bell')}<span>استثناء التطبيق من توفير البطارية (مهم)</span></button><p class="hr-omn" style="margin:4px 0 0">بدونه قد يوقف أندرويد المتابعة عند تعطيل الشاشة لفترة طويلة.</p>` : ''}`);
    body.appendChild(wc);
    chipSet('hsWatch', [[0, 'إيقاف'], [2, 'كل 2 د'], [5, 'كل 5 د'], [10, 'كل 10 د'], [15, 'كل 15 د']], wst.min || 0, (v) => { HR.setWatch(v); toast(v ? 'بدأت المتابعة في الخلفية (إشعار دائم صغير)' : 'أُوقفت المتابعة في الخلفية'); });
    if ($('wBat')) $('wBat').onclick = () => B.batteryAsk();
    // إشعارات الحضور المنبثقة
    // الملخص الصباحي
    const dg = el('div', 'group pad hr-set', `<div class="hr-sl">${icon('bell')}الملخص الصباحي</div>
      <p class="hr-omn" style="margin:0 0 8px">إشعار واحد كل يوم عمل يلخّص: المتأخرين، وغير المسجلين، والطلبات المعلّقة، والعقود والتكليفات التي تنتهي هذا الأسبوع. يصل حتى والتطبيق مغلق (مع تفعيل المتابعة الخلفية).</p>
      <label class="hr-srow"><span>تفعيل الملخص الصباحي</span><input type="checkbox" id="dgOn" class="hr-tog" ${s.digestOn === false ? '' : 'checked'}></label>
      <label class="hr-srow"><span>وقت الإرسال<small>بعد بداية الدوام وتسجيلات الصباح</small></span><input type="time" id="dgAt" value="${s.digestAt || '08:45'}"></label>
      <button class="btn-outline wide" id="dgNow" type="button">${icon('bell')}<span>عرض ملخص اليوم الآن</span></button>`);
    body.appendChild(dg);
    $('dgOn').onchange = (e) => { put({ digestOn: e.target.checked }); toast(e.target.checked ? 'فُعّل الملخص الصباحي' : 'أُوقف الملخص الصباحي'); };
    $('dgAt').onchange = (e) => { if (e.target.value) { put({ digestAt: e.target.value }); toast('وقت الملخص ' + e.target.value); } };
    $('dgNow').onclick = () => openDigest();
    const al = el('div', 'group pad hr-set', `<div class="hr-sl">${icon('bell')}إشعارات الحضور المنبثقة</div>
      <p class="hr-omn" style="margin:0 0 8px">تظهر نافذة في منتصف الشاشة عند وصول تسجيل حضور أو انصراف جديد بعد كل مزامنة، حتى لو كنت في شاشة أخرى من التطبيق، وفوق التطبيقات عند المزامنة في الخلفية.</p>
      <div id="hsAl" class="chips"></div>
      ${B && B.canOverlay && !B.canOverlay() ? `<button class="btn-outline wide" id="alOv" type="button">${icon('eye')}<span>السماح بالظهور فوق التطبيقات</span></button>` : ''}
      <button class="btn-outline wide" id="alTest" type="button">${icon('bell')}<span>تجربة النافذة</span></button>`);
    body.appendChild(al);
    chipSet('hsAl', [['all', 'كل التسجيلات'], ['in', 'الحضور فقط'], ['issues', 'المتأخرون والخارجون عن الموقع'], ['off', 'إيقاف']], s.attAlert || 'all', (v) => put({ attAlert: v }));
    if ($('alOv')) $('alOv').onclick = () => B.requestOverlay();
    $('alTest').onclick = () => {
      const now = Date.now();
      RemindUI.showAttendance($('remPop'), { events: [{ name: 'اسم الموظف التجريبي', dept: 'الإدارة', org: 'PEF', type: 'office', kind: 'in', ts: now, late: 12, st: 'matched', place: 'المكتب الرئيسي', dist: 35, work: 0, empId: '', ds: today() }] }, { view: () => {}, close: () => {} });
    };
    // حساب الدخول
    const acc = el('div', 'group pad hr-set', `<div class="hr-sl">${icon('users')}الحساب</div>
      <div class="hr-srow"><span>رقم الهوية</span><b>${esc(localStorage.getItem('hrUser') || '—')}</b></div>
      <div class="hr-srow"><span>بيانات الدخول محفوظة</span><b>${HR.hasCreds() ? 'نعم (مشفّرة)' : 'لا'}</b></div>`);
    if (HR.hasCreds()) {
      const fg = el('button', 'btn-outline wide', `${icon('x')}<span>حذف بيانات الدخول المحفوظة</span>`);
      fg.onclick = () => { HR.forgetCreds(); toast('حُذفت بيانات الدخول المحفوظة'); render(); };
      acc.appendChild(fg);
    }
    body.appendChild(acc);
    // الخريطة دون إنترنت
    const OM = window.OfflineMap;
    if (OM) {
      const mb = (n) => (n / 1048576).toFixed(1) + ' م.ب';
      const om = el('div', 'group pad hr-set', `<div class="hr-sl">${icon('pin')}الخريطة دون إنترنت</div>
        <div class="hr-srow"><span>خريطة قطاع غزة<small>OpenStreetMap · Protomaps · نحو 11 م.ب</small></span><b id="omSt"></b></div>
        <div class="hr-pbar ok" id="omBarW" hidden><i id="omBar" style="width:0"></i></div>
        <div class="hr-omb"><button class="btn-outline" id="omDl">${icon('down')}<span>تنزيل الآن</span></button><button class="btn-outline hr-out" id="omRm">${icon('x')}<span>حذف</span></button></div>
        <label class="hr-srow"><span>تنزيل تلقائي عند توفر الإنترنت<small>لتعمل الخريطة دون إنترنت تلقائياً</small></span><input type="checkbox" id="omAuto" class="hr-tog" ${s.mapAuto === false ? '' : 'checked'}></label>
        <p class="hr-omn">تُستخدم الخريطة المحفوظة تلقائياً لمواقع الحضور داخل قطاع غزة، بدون إنترنت. خارج غزة تُعرض الخرائط عبر الإنترنت.</p>`);
      body.appendChild(om);
      const draw = (st) => {
        if (!$('omSt')) return;
        st = st || OM.state();
        $('omSt').textContent = !st.native ? 'متاحة في تطبيق أندرويد' : st.downloading ? `جارٍ التنزيل ${st.pct}%` : st.have ? `محفوظة · ${mb(st.size)}` : 'غير محمّلة';
        $('omSt').className = st.have ? 'omok' : '';
        $('omBarW').hidden = !st.downloading; $('omBar').style.width = st.pct + '%';
        $('omDl').hidden = !st.native || st.have; $('omDl').disabled = st.downloading;
        $('omRm').hidden = !st.have;
      };
      omDraw = draw; draw();
      $('omDl').onclick = () => { if (!OM.download()) toast('تعذّر بدء التنزيل'); };
      $('omRm').onclick = () => { if (confirm('حذف الخريطة المحفوظة من الجهاز؟')) { OM.remove(); toast('تم حذف الخريطة'); draw(); } };
      $('omAuto').onchange = (e) => { put({ mapAuto: e.target.checked }); if (e.target.checked) OM.ensure(); };
    }
    const c = el('div', 'group pad hr-set', `
      <div class="hr-sl">بداية الدوام (لحساب التأخير)</div>
      <label class="hr-srow"><span>مكتبي</span><input type="time" id="hsOff" value="${s.office}"></label>
      <label class="hr-srow"><span>ميداني</span><input type="time" id="hsFld" value="${s.field}"></label>
      <label class="hr-srow"><span>فترة السماح (دقيقة)</span><input type="number" id="hsGr" min="0" max="120" value="${s.grace}"></label>
      <label class="hr-srow"><span>ساعات الدوام اليومية (لحساب المطلوب أسبوعياً)</span><input type="number" id="hsDh" min="1" max="16" step="0.5" value="${s.dayHours}"></label>
      <div class="hr-sl">أيام العطلة الأسبوعية</div><div id="hsWk" class="chips"></div>`);
    body.appendChild(c);
    const save = () => { HR.db.put('settings', Object.assign(HR.settings(), { office: $('hsOff').value || '08:00', field: $('hsFld').value || '08:00', grace: Math.max(0, +$('hsGr').value || 0), dayHours: Math.min(16, Math.max(1, +$('hsDh').value || 8)) })); toast('تم الحفظ'); };
    ['hsOff', 'hsFld', 'hsGr', 'hsDh'].forEach((id) => { $(id).onchange = save; });
    const wk = $('hsWk');
    ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].forEach((n, i) => {
      const b = el('button', 'chip sm' + (s.weekend.includes(i) ? ' on' : ''), n);
      b.onclick = () => { const w = HR.settings().weekend.slice(); const j = w.indexOf(i); if (j >= 0) w.splice(j, 1); else w.push(i); HR.db.put('settings', Object.assign(HR.settings(), { weekend: w })); render(); };
      wk.appendChild(b);
    });
    const st = meta.last || {};
    const info = el('div', 'group pad hr-set', `<div class="hr-sl">البيانات على الجهاز</div>
      <div class="hr-srow"><span>الموظفون</span><b>${Object.keys(HR.db.get('employees', {})).length}</b></div>
      <div class="hr-srow"><span>العقود</span><b>${Object.keys(HR.db.get('contracts', {})).length}</b></div>
      <div class="hr-srow"><span>التكليفات</span><b>${Object.keys(HR.db.get('assignments', {})).length}</b></div>
      <div class="hr-srow"><span>الحضور محفوظ من</span><b>${fd(meta.attFrom)}</b></div>
      <div class="hr-srow"><span>آخر مزامنة</span><b>${meta.lastSync ? ago(meta.lastSync) : '—'}</b></div>
      ${st.employees ? `<div class="hr-srow"><span>نتيجة آخر مزامنة</span><b>+${(st.employees.added || 0) + (st.contracts ? st.contracts.added : 0)} جديد · ${(st.employees.updated || 0) + (st.contracts ? st.contracts.updated : 0)} محدّث</b></div>` : ''}`);
    body.appendChild(info);
    const more = el('button', 'btn-outline wide', `${icon('cal')}<span>جلب حضور 30 يوماً سابقة</span>`);
    more.onclick = async () => { more.disabled = true; try { await HR.sync(null, { from: addDays(meta.attFrom || today(), -30) }); toast('تم'); } catch (e) { toast(e.message); } render(); };
    body.appendChild(more);
    const diag = el('button', 'btn-outline wide', `${icon('copy')}<span>نسخ هيكل البيانات (أسماء الحقول فقط) للدعم</span>`);
    diag.onclick = () => {
      const keysOf = (o) => o ? Object.keys(o).join(', ') : '—';
      const first = (n) => Object.values(HR.db.get(n, {}))[0];
      const ev = (() => { for (let i = 0; i < 7; i++) { const e = HR.events(addDays(today(), -i)); if (e && e.length) return e[0]; } return null; })();
      const txt = `employees: ${keysOf(first('employees'))}\n\ncontracts: ${keysOf(first('contracts'))}\n\nassignments: ${keysOf(first('assignments'))}\n\nevent: ${keysOf(ev)}\n\nleave natures: ${[...new Set(Object.values(HR.db.get('leaves', {})))].join(', ')}`;
      if (B && B.copy) B.copy(txt); else if (navigator.clipboard) navigator.clipboard.writeText(txt);
      toast('تم نسخ أسماء الحقول (بدون أي بيانات شخصية)');
    };
    body.appendChild(diag);
    const out = el('button', 'btn-outline wide hr-out', `${icon('x')}<span>تسجيل الخروج وحذف البيانات من الجهاز</span>`);
    out.onclick = () => { if (confirm('سيتم حذف كل بيانات الموارد البشرية من هذا الجهاز وتسجيل الخروج. متابعة؟')) { HR.logout(); toast('تم تسجيل الخروج'); render(); } };
    body.appendChild(out);
  }

  /* ---------- ملف الموظف ---------- */
  function sheet(html) { $('hrSheetBody').innerHTML = html; $('hrSheet').hidden = false; requestAnimationFrame(() => $('hrSheet').classList.add('in')); }
  const closeSheet = () => { $('hrSheet').classList.remove('in'); setTimeout(() => { $('hrSheet').hidden = true; }, 200); };
  function rawTable(o) {
    const rows = Object.entries(o || {}).filter(([, v]) => v != null && v !== '' && typeof v !== 'object');
    return `<details class="hr-raw"><summary>البيانات الخام من النظام (${rows.length})</summary><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></details>`;
  }
  // تسميات حقول ملف الموظف وتجميعها في أقسام
  const GROUPS = [
    ['البيانات الشخصية', 'users', { fullNameAr: 'الاسم (عربي)', fullNameEn: 'الاسم (إنجليزي)', nationalId: 'رقم الهوية', birthDate: 'تاريخ الميلاد', dateOfBirth: 'تاريخ الميلاد', birthPlace: 'مكان الميلاد', placeOfBirth: 'مكان الميلاد', gender: 'النوع الاجتماعي', maritalStatus: 'الحالة الاجتماعية', familyMembers: 'عدد أفراد الأسرة', familyCount: 'عدد أفراد الأسرة', familySize: 'عدد أفراد الأسرة', nationality: 'الجنسية', educationLevel: 'المستوى التعليمي', education: 'المستوى التعليمي', specialization: 'التخصص', major: 'التخصص', hasDrivingLicense: 'لديه رخصة قيادة', drivingLicense: 'رخصة قيادة' }],
    ['بيانات العمل', 'briefcase', { empId: 'الرقم الوظيفي', departmentName: 'القسم', positionName: 'المنصب الوظيفي', directManagerName: 'المدير المباشر', joinDate: 'تاريخ التعيين', hireDate: 'تاريخ التعيين', workScheduleMode: 'طبيعة الدوام', status: 'الحالة', activeOnJob: 'على رأس عمله', hasValidContract: 'عقد ساري', contractNumbers: 'أرقام العقود', contractNumber: 'رقم العقد', terminationDate: 'تاريخ إنهاء الخدمة', actualCloseDate: 'تاريخ الإغلاق الفعلي', terminationReason: 'سبب إنهاء الخدمة' }],
    ['التواصل والعنوان', 'pin', { mobileNumber: 'رقم الجوال', mobile: 'رقم الجوال', phone: 'الهاتف', phoneNumber: 'الهاتف', email: 'البريد الإلكتروني', address: 'العنوان', currentAddress: 'العنوان الحالي', city: 'المدينة', governorate: 'المحافظة', emergencyContact: 'جهة اتصال للطوارئ', emergencyPhone: 'هاتف الطوارئ' }],
    ['البيانات البنكية', 'chart', { bankName: 'البنك', bankBranch: 'الفرع', branchName: 'الفرع', accountNumber: 'رقم الحساب', iban: 'IBAN', accountName: 'اسم الحساب' }]
  ];
  const HIDE = new Set(['id', 'employeeId', 'employeeRef', 'name', 'createdAt', 'updatedAt', 'deletedAt', 'fullNameEnFromGetVal', 'authzUi', 'directManagerId', 'departmentId', 'positionId', 'userId', 'periodId']);
  const VALS = { male: 'ذكر', female: 'أنثى', m: 'ذكر', f: 'أنثى', single: 'أعزب', married: 'متزوج', divorced: 'مطلّق', widowed: 'أرمل', active: 'نشط', inactive: 'غير نشط', terminated: 'منتهية خدماته', office: 'عمل مكتبي', 'office-hho': 'مكتبي - HHO', field: 'عمل ميداني', true: 'نعم', false: 'لا' };
  const human = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  function fmtVal(k, v) {
    if (v == null || v === '') return null;
    if (Array.isArray(v)) { const t = v.map((x) => typeof x === 'object' ? (x && (x.nameAr || x.titleAr || x.name || x.code)) : x).filter(Boolean); return t.length ? t.join('، ') : null; }
    if (typeof v === 'object') return v.nameAr || v.titleAr || v.name || v.fullNameAr || v.code || null;
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    const sv = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(sv)) return fd(sv.slice(0, 10));
    return VALS[sv.toLowerCase()] || sv;
  }
  function fieldGroups(raw) {
    const used = new Set();
    const out = GROUPS.map(([title, ic, map]) => {
      const cells = [];
      Object.keys(map).forEach((k) => { if (k in raw && !used.has(map[k])) { const v = fmtVal(k, raw[k]); used.add(k); if (v) { cells.push([map[k], v, k]); used.add(map[k]); } } });
      Object.keys(map).forEach((k) => used.add(k));
      return [title, ic, cells];
    });
    const extra = Object.keys(raw).filter((k) => !used.has(k) && !HIDE.has(k)).map((k) => [human(k), fmtVal(k, raw[k]), k]).filter((x) => x[1] && String(x[1]).length < 200);
    out.push(['معلومات إضافية', 'info', extra]);
    return out.filter((g) => g[2].length);
  }
  // أرقام الجوال: 0598815128 أو 598815128 أو +970/+972… → رقم محلي للاتصال، ورقمان دوليان محتملان لواتساب
  function phoneInfo(raw) {
    let d = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
    if (!d) return null;
    let nat = d;
    if (/^97[02]\d{8,9}$/.test(d)) nat = d.slice(3);
    nat = nat.replace(/^0+/, '');
    if (nat.length < 8 || nat.length > 10) return { dial: String(raw).trim(), wa: [] };
    // 059 جوال و056 أوريدو (فلسطين +970)، وباقي 05x شبكات +972
    const ps = /^5[69]/.test(nat);
    const wa = (ps ? ['970', '972'] : ['972', '970']).map((cc) => ({ cc, num: cc + nat, label: '+' + cc + ' ' + nat }));
    return { dial: '0' + nat, nat, wa };
  }
  const openExt = (url) => { if (B && B.openExternal) B.openExternal(url); else window.open(url, '_blank'); };
  window.hrDial = (n) => openExt('tel:' + n);
  window.hrWa = (n) => openExt('https://wa.me/' + n);
  // الرسائل القصيرة: الرقم كما هو (0598815128)؛ إذا كُتب بلا صفر (598815128) نضيف 0؛ والدولي (+970…) يبقى كما هو
  function smsNumber(raw) {
    const s0 = String(raw || '').trim(), plus = s0.startsWith('+'), d = s0.replace(/\D/g, '');
    if (!d) return '';
    if (/^5\d{8}$/.test(d)) return '0' + d;
    return (plus ? '+' : '') + d;
  }
  const smsSend = (num, body) => { if (B && B.smsCompose) B.smsCompose(num, body || ''); else window.open('sms:' + num + (body ? '?body=' + encodeURIComponent(body) : ''), '_blank'); };
  window.hrSms = (n) => smsSend(n, '');
  function contactBar(raw) {
    const p = phoneInfo(raw);
    if (!p) return '';
    return `<div class="hr-contact">
      <button class="hr-cbtn call" onclick="hrDial('${p.dial}')">${icon('phone')}<span><b>اتصال</b><small>${esc(p.dial)}</small></span></button>
      ${p.wa.map((w, i) => `<button class="hr-cbtn wa${i ? ' alt' : ''}" onclick="hrWa('${w.num}')"><svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg><span><b>واتساب ${i ? '(بديل)' : ''}</b><small dir="ltr">${esc(w.label)}</small></span></button>`).join('')}
      <button class="hr-cbtn sms" onclick="hrSms('${esc(smsNumber(raw))}')">${icon('note')}<span><b>رسالة</b><small dir="ltr">${esc(smsNumber(raw))}</small></span></button>
    </div>${p.wa.length ? '<p class="hr-wanote">إذا ظهر في واتساب أن الرقم غير مسجّل، جرّب زر البديل (+970 / +972).</p>' : ''}`;
  }
  const telLink = (k, v) => /mobile|phone/i.test(k) ? (phoneInfo(v) ? `<button class="hr-tel" onclick="hrDial('${phoneInfo(v).dial}')">${icon('phone')}${esc(v)}</button>` : esc(v)) : /email/i.test(k) ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : esc(v);
  function openRaw(title, o) { sheet(`<div class="hr-ph"><b>${title}</b></div>${rawTable(o)}`); }
  function openEmp(id, focusCon) {
    const raw = HR.db.get('employees', {})[id];
    if (!raw) { toast('الموظف غير موجود في البيانات المحفوظة'); return; }
    const e = HR.emp(raw);
    const cons = HR.contracts().filter((c) => c.empId === id).sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const asgs = HR.assignments().filter((a) => a.empId === id).sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const cells = [];
    for (let i = 13; i >= 0; i--) {
      const ds = addDays(today(), -i);
      const r = HR.events(ds) ? HR.dayReport(ds).rows.find((x) => x.e.id === id) : null;
      const st = r ? STATUS[r.status] : ['غير مزامن', 'none'];
      cells.push(`<i class="${st[1]}" data-day="${ds}" title="${fd(ds)}: ${st[0]}${r && r.firstIn ? ' ' + tf.format(new Date(r.firstIn)) : ''}"><small>${+ds.slice(8)}</small></i>`);
    }
    const sm = conSummary(id);
    const groups = fieldGroups(raw);
    sumCache = null;
    sheet(`
      <div class="hr-hero2"><span class="hr-ava big">${esc(initials(e.name))}</span><div><b>${esc(e.name)}</b>${e.nameEn ? `<small>${esc(e.nameEn)}</small>` : ''}<small>${esc([e.pos, e.dept].filter(Boolean).join(' · '))}</small>
        <div class="hr-tags">${badge(e.org, 'info')}${badge(TYPE[e.type], 'mute')}${badge(e.active ? 'على رأس العمل' : 'منتهية الخدمة', e.active ? 'ok' : 'bad')}${flags(sm)}</div></div></div>
      <div class="hr-quick">
        <div><b>${e.empId ? esc(e.empId) : '—'}</b><small>الرقم الوظيفي</small></div>
        <div><b>${e.join ? fd(e.join) : '—'}</b><small>تاريخ التعيين</small></div>
        <div><b>${sm.count || cons.length}</b><small>${(sm.count || cons.length) === 1 ? 'عقد' : 'عقود'}</small></div>
        <div><b>${asgs.length}</b><small>تكليفات</small></div>
      </div>
      ${contactBar(e.phone)}
      <button class="btn-outline wide hr-mbtn" id="hrMsgEmp">${icon('note')}<span>إرسال رسالة بقالب جاهز</span></button>
      ${groups.map(([title, ic, cells]) => `<div class="hr-grp"><div class="hr-grph">${icon(ic)}<span>${title}</span></div><div class="hr-info">${cells.map(([k, v, key]) => `<div><small>${esc(k)}</small><b>${telLink(key, v)}</b></div>`).join('')}</div></div>`).join('')}
      <div class="hr-sec"><span>الحضور آخر 14 يوماً</span><small>اضغط على يوم لعرض التفاصيل</small></div><div class="hr-cal14">${cells.join('')}</div>
      <div class="hr-sec"><span>العقود (${cons.length})</span></div>
      ${cons.map((c) => conCard(c, c.id === focusCon)).join('') || '<div class="hr-none">لا عقود محفوظة</div>'}
      <div class="hr-sec"><span>التكليفات (${asgs.length})</span></div>
      ${asgs.map(asgCard).join('') || '<div class="hr-none">لا تكليفات</div>'}
      ${rawTable(raw)}`);
    $('hrSheetBody').querySelectorAll('[data-day]').forEach((c) => { c.onclick = () => openDay(id, c.dataset.day); });
    $('hrMsgEmp').onclick = () => openCompose([{ empId: id }], 'free');
  }

  /* ---------- الخريطة داخل التطبيق ---------- */
  function evPoints(list, empName0) {
    return list.map((x, i) => {
      const pl = HR.place(x);
      return { lat: pl.lat, lon: pl.lon, acc: pl.acc, st: pl.st, dist: pl.dist, kind: x.eventType === 'check_in' ? 'in' : x.eventType === 'check_out' ? 'out' : 'other',
        label: x.eventType === 'check_in' ? 'د' : x.eventType === 'check_out' ? 'خ' : i + 1, time: tf.format(new Date(x.recordedAt)),
        name: (x.eventType === 'check_in' ? 'دخول' : x.eventType === 'check_out' ? 'خروج' : 'تسجيل') + (empName0 ? ' — ' + empName0 : ''), place: plName(pl) };
    });
  }
  function openDayMap(id, ds, focusIdx) {
    const r = HR.dayReport(ds).rows.find((x) => x.e.id === id);
    if (!r) return;
    HRMap.open({ title: r.e.name, sub: `${dLong.format(noon(ds))} · ${r.list.length} تسجيل${r.workMin ? ' · ' + hrs(r.workMin) : ''}`, sites: HR.sites(), points: evPoints(r.list), focus: focusIdx, fitSites: false });
  }
  // خريطة اليوم لكل الموظفين: أول تسجيل دخول لكل موظف
  function openAllMap(rows, ds) {
    const pts = [];
    rows.forEach((r) => {
      const first = r.list.find((x) => x.eventType === 'check_in') || r.list[0];
      if (!first) return;
      const pl = HR.place(first);
      if (pl.lat == null) return;
      pts.push({ lat: pl.lat, lon: pl.lon, acc: null, st: pl.st, dist: pl.dist, kind: 'in', label: initials(r.e.name), time: tf.format(new Date(first.recordedAt)) + (r.lateMin ? ' · تأخير ' + r.lateMin + ' د' : ''), name: r.e.name, place: plName(pl) });
    });
    HRMap.open({ title: 'خريطة الحضور', sub: `${dLong.format(noon(ds))} · ${pts.length} موظف`, sites: HR.sites(), points: pts, path: false });
  }

  /* ---------- تفاصيل حضور يوم ---------- */
  function openDay(id, ds) {
    const raw = HR.db.get('employees', {})[id];
    if (!raw) return;
    const e = HR.emp(raw);
    const evs = HR.events(ds);
    const r = evs ? HR.dayReport(ds).rows.find((x) => x.e.id === id) : null;
    const st = r ? STATUS[r.status] : ['غير مزامن', 'mute'];
    let evIdx = 0;
    const hasGeo = r && r.list.some((x) => HR.place(x).lat != null);
    const evRows = (r ? r.list : []).map((x) => {
      const pl = HR.place(x);
      const isIn = x.eventType === 'check_in';
      const maps = pl.lat != null ? `<button class="hr-map" data-i="${evIdx++}">${icon('pin')}عرض على الخريطة</button>` : (evIdx++, '');
      return `<div class="hr-ev ${isIn ? 'in' : 'out'}">
        <span class="hr-evdot"></span>
        <div class="hr-evb">
          <div class="hr-evh"><b>${isIn ? 'تسجيل دخول' : x.eventType === 'check_out' ? 'تسجيل خروج' : esc(x.eventType)}</b><span class="hr-evt">${tf.format(new Date(x.recordedAt))}</span></div>
          <div class="hr-evp ${PLACE[pl.st][1]}">${icon('pin')}<span>${esc(plName(pl))}</span>${pl.st !== 'unknown' ? badge(PLACE[pl.st][0] + (pl.dist != null ? ' · ' + fmtDist(pl.dist) : ''), PLACE[pl.st][1]) : ''}</div>
          ${pl.lat != null ? `<small class="hr-evc">${pl.lat.toFixed(5)}, ${pl.lon.toFixed(5)}${pl.acc ? ' · دقة ±' + Math.round(pl.acc) + ' م' : ''}</small>` : ''}
          ${x.source || x.device ? `<small class="hr-evc">${esc([x.source, x.mode, x.device].filter(Boolean).join(' · '))}</small>` : ''}
          ${x.note ? `<small class="hr-evc">ملاحظة: ${esc(x.note)}</small>` : ''}${x.by ? `<small class="hr-evc">بواسطة: ${esc(x.by)}</small>` : ''}
          ${maps}
        </div></div>`;
    }).join('');
    sheet(`
      <div class="hr-ph"><span class="hr-ava big ${st[1]}">${esc(initials(e.name))}</span><div><b>${esc(e.name)}</b><small>${dLong.format(noon(ds))} · ${fd(ds)}</small><div class="hr-tags">${badge(st[0], st[1])}${r && r.leave ? badge(leaveLbl(r.leave), 'info') : ''}${r && r.outside ? badge('تسجيل خارج النطاق', 'bad') : ''}</div></div></div>
      <div class="hr-dsum">
        <div><small>أول دخول</small><b>${r && r.firstIn ? tf.format(new Date(r.firstIn)) : '—'}</b></div>
        <div><small>آخر خروج</small><b>${r && r.lastOut ? tf.format(new Date(r.lastOut)) : r && r.live ? 'لم يخرج بعد' : '—'}</b></div>
        <div><small>ساعات العمل</small><b>${r && r.workMin ? hrs(r.workMin) : '—'}${r && r.live ? ' <em>مستمر</em>' : ''}</b></div>
        <div><small>التأخير</small><b class="${r && r.lateMin ? 'warn' : ''}">${r && r.lateMin ? r.lateMin + ' دقيقة' : 'لا يوجد'}</b></div>
      </div>
      ${r && r.reqs.length ? `<div class="hr-sec"><span>الطلبات في هذا اليوم (${r.reqs.length})</span></div>${r.reqs.map(rqCard).join('')}` : ''}
      <div class="hr-sec"><span>سجل اليوم (${r ? r.list.length : 0})</span></div>
      ${hasGeo ? `<button class="hr-mapbig" id="hrDayMap"><span class="hr-mapart"></span><span><b>${icon('pin')}خريطة تسجيلات اليوم</b><small>المسار بين الدخول والخروج ونطاق موقع العمل</small></span></button>` : ''}
      ${evs ? (evRows ? `<div class="hr-evs">${evRows}</div>` : '<div class="hr-none">لا يوجد تسجيل في هذا اليوم</div>') : '<div class="hr-none">هذا اليوم غير مزامن على الجهاز</div>'}
      <button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>`);
    const body = $('hrSheetBody');
    body.querySelectorAll('.hr-map').forEach((b) => b.onclick = () => openDayMap(id, ds, +b.dataset.i));
    const am = $('hrDayMap'); if (am) am.onclick = () => openDayMap(id, ds);
    $('hrToEmp').onclick = () => openEmp(id);
  }

  /* ---------- الربط ---------- */
  let omDraw = null;
  if (window.OfflineMap) OfflineMap.onChange((st) => { if (omDraw) omDraw(st); });
  $('hrSync').onclick = () => doSync();
  $('hrBell').onclick = () => { ntFilter = 'all'; openInbox(); };
  // المزامنة التلقائية: عند فتح القسم وأثناء استخدامه حسب الإعدادات، وفي الخلفية عبر أندرويد
  const due = () => { const s = HR.settings(); const m = HR.meta(); return HR.hasSession() && m.lastSync && s.auto !== 'off' && Date.now() - m.lastSync >= s.every * 60000; };
  function applyBg() { const s = HR.settings(); HR.setBackground(HR.hasSession() && s.bg && s.auto !== 'off' ? s.every : 0); }
  setInterval(() => { if (!document.hidden && due()) doSync(true); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { HR.db.reload(); updateBell(); if (due()) doSync(true); } });
  $('hrSheet').onclick = (e) => { if (e.target.hasAttribute('data-close')) closeSheet(); };
  App.screens.hr = () => { render(); if (window.OfflineMap && HR.hasSession()) OfflineMap.ensure(); if (due() || (HR.hasSession() && HR.settings().auto === 'open' && HR.meta().lastSync && Date.now() - HR.meta().lastSync > 5 * 60000)) doSync(true); };
  if (HR.hasSession()) applyBg();
  window.hrOpenEmp = openEmp; window.hrOpenDay = openDay;
})();
