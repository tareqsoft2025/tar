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
  const f = Object.assign({ day: today(), org: 'all', type: 'all', st: 'all', q: '', es: 'active', ck: 'all', cs: 'active', cf: 'all', as: 'month', av: 'emp', am: today().slice(0, 7), proj: 'all' }, store.get('hrF', {}));
  if (!/^\d{4}-\d{2}$/.test(f.am || '')) f.am = today().slice(0, 7);
  f.day = today(); f.q = '';
  const saveF = () => store.set('hrF', { org: f.org, type: f.type, es: f.es, ck: f.ck, cs: f.cs, cf: f.cf, as: f.as, av: f.av });

  /* ---------- الهيكل ---------- */
  function render() {
    const box = $('hrBody'); box.innerHTML = '';
    $('hrSync').hidden = !HR.hasSession();
    if (!HR.hasSession()) { renderLogin(box); return; }
    const meta = HR.meta();
    const acc = el('div', 'hr-acc', `<span class="hr-av">${icon('users')}</span><div><b>نظام PEF</b><small id="hrSyncTxt">${meta.lastSync ? 'آخر مزامنة ' + ago(meta.lastSync) : 'لم تتم المزامنة بعد'}</small></div><div class="hr-prog" id="hrProg" hidden><i></i></div>`);
    box.appendChild(acc);
    const tabs = el('div', 'chips hr-tabs');
    [['dash', 'لوحة اليوم', 'grid'], ['att', 'الحضور', 'clock'], ['lv', 'الإجازات', 'cal'], ['emp', 'الموظفون', 'users'], ['con', 'العقود', 'note'], ['asg', 'التكليفات', 'briefcase'], ['set', 'الإعدادات', 'sliders']].forEach(([k, n, ic]) => {
      const b = el('button', 'chip sm' + (tab === k ? ' on' : ''), `${icon(ic)}${n}`);
      b.onclick = () => { tab = k; store.set('hrTab', k); render(); };
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    const body = el('div', 'hr-view'); box.appendChild(body);
    if (!meta.lastSync && tab !== 'set') { renderFirst(body); return; }
    ({ dash: renderDash, att: renderAtt, lv: renderLv, emp: renderEmp, con: renderCon, asg: renderAsg, set: renderSet }[tab] || renderDash)(body);
    const on = box.querySelector('.hr-tabs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
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
      const st = await HR.sync((m) => { if (txt()) txt().textContent = 'جارٍ المزامنة: ' + m; });
      if (!st) return;
      const parts = [];
      const add = (n, s) => { if (s && (s.added || s.updated || s.removed)) parts.push(`${n}: ${s.added ? '+' + s.added + ' جديد' : ''}${s.updated ? ' ' + s.updated + ' محدّث' : ''}${s.removed ? ' ' + s.removed + ' محذوف' : ''}`.trim()); };
      add('الموظفون', st.employees); add('العقود', st.contracts); add('التكليفات', st.assignments);
      if (st.attendance && st.attendance.changed) parts.push(`الحضور: ${st.attendance.changed} يوم محدّث`);
      if (!silent || parts.length) toast(parts.length ? 'تمت المزامنة — ' + parts.join('، ') : 'تمت المزامنة، لا تغييرات جديدة');
    } catch (e) {
      if (e.res && e.res.status === 401) { toast('انتهت الجلسة، سجّل الدخول من جديد'); HR.logout(); }
      else if (!silent) toast(e.message || 'تعذّرت المزامنة');
    } finally { btn.classList.remove('spin'); render(); }
  }

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
    return r;
  }
  function list(parent, rows, empty, limit) {
    if (!rows.length) { parent.appendChild(el('div', 'hr-none', empty)); return; }
    const g = el('div', 'hr-list');
    rows.slice(0, limit || 400).forEach((r) => g.appendChild(r));
    parent.appendChild(g);
    if (rows.length > (limit || 400)) parent.appendChild(el('p', 'note c', `<span>يُعرض أول ${limit || 400} من ${rows.length}. استخدم البحث أو الفلاتر.</span>`));
  }
  const badge = (txt, tone) => `<span class="hr-b ${tone || ''}">${txt}</span>`;
  const remain = (ds) => { const d = daysTo(ds); if (d == null) return ''; return d < 0 ? badge(`انتهى منذ ${-d} يوم`, 'mute') : d === 0 ? badge('ينتهي اليوم', 'bad') : badge(`${d} يوم`, d <= 30 ? 'bad' : d <= 60 ? 'warn' : 'ok'); };
  function shareList(title, lines) {
    const text = title + '\n' + lines.join('\n');
    if (B && B.share) B.share(text); else if (navigator.share) navigator.share({ text }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(text); toast('تم النسخ'); }
  }

  /* ---------- لوحة اليوم ---------- */
  function renderDash(body) {
    const t = today();
    const rep = HR.dayReport(t);
    const rows = rep.rows;
    const cnt = (s) => rows.filter((r) => r.status === s).length;
    const cons = HR.contracts().filter((c) => c.end && daysTo(c.end) >= 0 && daysTo(c.end) <= 30);
    const asgs = HR.assignments().filter((a) => a.end && daysTo(a.end) >= 0 && daysTo(a.end) <= 30);
    body.appendChild(el('div', 'hr-day', `<b>${dLong.format(new Date())}</b><small>${rep.synced ? 'حسب آخر مزامنة' : 'لم يُزامن حضور اليوم بعد'}${rep.weekend ? ' · عطلة' : ''}</small>`));
    const k = el('div', 'hr-kpis');
    [['emp', rows.length, 'موظف نشط', '', () => { tab = 'emp'; }],
      ['present', cnt('present') + cnt('late'), 'سجّلوا حضوراً', 'ok', () => { tab = 'att'; f.st = 'in'; }],
      ['late', cnt('late'), 'متأخرون', 'warn', () => { tab = 'att'; f.st = 'late'; }],
      ['absent', cnt('absent'), 'بلا تسجيل ولا إجازة', 'bad', () => { tab = 'att'; f.st = 'absent'; }],
      ['leave', cnt('leave'), 'إجازة / مهمة', 'info', () => { tab = 'att'; f.st = 'leave'; }],
      ['con', cons.length, 'عقود تنتهي خلال 30 يوماً', 'warn', () => { tab = 'con'; f.cs = 'soon30'; }]
    ].forEach(([key, n, l, tone, go]) => {
      const c = el('button', 'hr-kpi ' + tone, `<b>${n}</b><small>${l}</small>`);
      c.onclick = () => { go(); f.day = t; f.q = ''; render(); };
      k.appendChild(c);
    });
    body.appendChild(k);
    // شريط الحالة
    if (rows.length) {
      const seg = ['present', 'late', 'leave', 'absent', 'noin'].map((s) => [s, cnt(s)]).filter((x) => x[1]);
      body.appendChild(el('div', 'hr-bar', seg.map(([s, n]) => `<i class="${STATUS[s][1]}" style="flex:${n}" title="${STATUS[s][0]}"></i>`).join('')));
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
    const rows = all.filter((e) => (f.es === 'all' || (f.es === 'active' ? e.active : !e.active)) && orgOk(e) && typeOk(e) && match(f.q, e.name, e.nameEn, e.empId, e.nid, e.dept, e.pos))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    body.appendChild(el('div', 'hr-tools', `<small>${rows.length} من ${all.length} موظف</small>`));
    list(body, rows.map((e) => personRow(e, e.empId ? `<small>#${esc(e.empId)}</small>` : '')), 'لا نتائج');
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
      ${rawTable(c.raw)}`);
    const b = $('hrToEmp'); if (b) b.onclick = () => openEmp(c.empId, c.id);
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
      ${a.empId && HR.db.get('employees', {})[a.empId] ? `<button class="btn-outline wide" id="hrToEmp">${icon('users')}<span>ملف الموظف</span></button>` : ''}${rawTable(a.raw)}`);
    const b = $('hrToEmp'); if (b) b.onclick = () => openEmp(a.empId);
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
      r.onclick = () => openAsgMonth(g.empId);
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
    body.appendChild(seg);
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
        r.onclick = () => openBalance(e.id);
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
      r.onclick = () => openBalance(q.empId);
      return r;
    }), 'لا طلبات بهذه الفلاتر');
  }

  /* ---------- الإعدادات ---------- */
  function renderSet(body) {
    const s = HR.settings();
    const meta = HR.meta();
    const put = (patch) => { HR.db.put('settings', Object.assign(HR.settings(), patch)); applyBg(); };
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
    chipSet('hsEvery', [[15, '15 دقيقة'], [30, '30 دقيقة'], [60, 'ساعة'], [120, 'ساعتين'], [360, '6 ساعات']], s.every, (v) => put({ every: v }));
    $('hsEveryBox').hidden = $('hsBgRow').hidden = s.auto === 'off';
    $('hsBg').onchange = (e) => { put({ bg: e.target.checked }); toast(e.target.checked ? 'ستتم المزامنة في الخلفية' : 'أُوقفت المزامنة في الخلفية'); };
    $('hsStart').onchange = async (e) => {
      if (!e.target.value) return;
      put({ attStart: e.target.value });
      if (meta.attFrom && e.target.value < meta.attFrom) { toast('جارٍ جلب السجلات الأقدم…'); await doSync(); }
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
    const c = el('div', 'group pad hr-set', `
      <div class="hr-sl">بداية الدوام (لحساب التأخير)</div>
      <label class="hr-srow"><span>مكتبي</span><input type="time" id="hsOff" value="${s.office}"></label>
      <label class="hr-srow"><span>ميداني</span><input type="time" id="hsFld" value="${s.field}"></label>
      <label class="hr-srow"><span>فترة السماح (دقيقة)</span><input type="number" id="hsGr" min="0" max="120" value="${s.grace}"></label>
      <div class="hr-sl">أيام العطلة الأسبوعية</div><div id="hsWk" class="chips"></div>`);
    body.appendChild(c);
    const save = () => { HR.db.put('settings', Object.assign(HR.settings(), { office: $('hsOff').value || '08:00', field: $('hsFld').value || '08:00', grace: Math.max(0, +$('hsGr').value || 0) })); toast('تم الحفظ'); };
    ['hsOff', 'hsFld', 'hsGr'].forEach((id) => { $(id).onchange = save; });
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
  window.hrSms = (n) => openExt('sms:' + n);
  function contactBar(raw) {
    const p = phoneInfo(raw);
    if (!p) return '';
    return `<div class="hr-contact">
      <button class="hr-cbtn call" onclick="hrDial('${p.dial}')">${icon('phone')}<span><b>اتصال</b><small>${esc(p.dial)}</small></span></button>
      ${p.wa.map((w, i) => `<button class="hr-cbtn wa${i ? ' alt' : ''}" onclick="hrWa('${w.num}')"><svg viewBox="0 0 24 24" class="ic"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg><span><b>واتساب ${i ? '(بديل)' : ''}</b><small dir="ltr">${esc(w.label)}</small></span></button>`).join('')}
      <button class="hr-cbtn sms" onclick="hrSms('${p.dial}')">${icon('note')}<span><b>رسالة</b><small>SMS</small></span></button>
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
      ${groups.map(([title, ic, cells]) => `<div class="hr-grp"><div class="hr-grph">${icon(ic)}<span>${title}</span></div><div class="hr-info">${cells.map(([k, v, key]) => `<div><small>${esc(k)}</small><b>${telLink(key, v)}</b></div>`).join('')}</div></div>`).join('')}
      <div class="hr-sec"><span>الحضور آخر 14 يوماً</span><small>اضغط على يوم لعرض التفاصيل</small></div><div class="hr-cal14">${cells.join('')}</div>
      <div class="hr-sec"><span>العقود (${cons.length})</span></div>
      ${cons.map((c) => conCard(c, c.id === focusCon)).join('') || '<div class="hr-none">لا عقود محفوظة</div>'}
      <div class="hr-sec"><span>التكليفات (${asgs.length})</span></div>
      ${asgs.map(asgCard).join('') || '<div class="hr-none">لا تكليفات</div>'}
      ${rawTable(raw)}`);
    $('hrSheetBody').querySelectorAll('[data-day]').forEach((c) => { c.onclick = () => openDay(id, c.dataset.day); });
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
  $('hrSync').onclick = () => doSync();
  // المزامنة التلقائية: عند فتح القسم وأثناء استخدامه حسب الإعدادات، وفي الخلفية عبر أندرويد
  const due = () => { const s = HR.settings(); const m = HR.meta(); return HR.hasSession() && m.lastSync && s.auto !== 'off' && Date.now() - m.lastSync >= s.every * 60000; };
  function applyBg() { const s = HR.settings(); HR.setBackground(HR.hasSession() && s.bg && s.auto !== 'off' ? s.every : 0); }
  setInterval(() => { if (!document.hidden && App.isActive('hr') && due()) doSync(true); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && App.isActive('hr') && due()) doSync(true); });
  $('hrSheet').onclick = (e) => { if (e.target.hasAttribute('data-close')) closeSheet(); };
  App.screens.hr = () => { render(); if (due() || (HR.hasSession() && HR.settings().auto === 'open' && HR.meta().lastSync && Date.now() - HR.meta().lastSync > 5 * 60000)) doSync(true); };
  if (HR.hasSession()) applyBg();
  window.hrOpenEmp = openEmp; window.hrOpenDay = openDay;
})();
