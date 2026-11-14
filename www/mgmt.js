// تنبيهات الإدارة: جلسات توجيهات الإدارة إلى الموارد البشرية، مرتبطة بنظام tarsof.top (/hrnew/mgmt/api.php)
(function () {
  const { $, icon, toast, store } = App;
  const B = App.B;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fd = (ds) => { if (!ds || ds === '0000-00-00') return ''; const [y, m, d] = String(ds).slice(0, 10).split('-'); return y && m && d ? `${+d}/${+m}/${y}` : ''; };
  const badYear = (ds) => { const y = +String(ds || '').slice(0, 4); return !!ds && ds !== '0000-00-00' && (y < 1900 || y > 2200); };
  const today = () => new Date().toISOString().slice(0, 10);
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const ymLbl = (ym) => { const [y, m] = String(ym).split('-'); return (MONTHS[+m - 1] || m) + ' ' + y; };
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'الآن' : m < 60 ? `منذ ${m} د` : m < 1440 ? `منذ ${Math.round(m / 60)} س` : `منذ ${Math.round(m / 1440)} يوم`; };
  const TONE = { slate: '#8FA2B2', brand: '#7C8CFF', danger: '#F2716A', green: '#4FD08B', gold: '#E2B84A', info: '#5B9DFF', amber: '#F0A64B' };
  const STC = { new: ['جديد', '#8FA2B2'], in_progress: ['قيد التنفيذ', '#F0A64B'], done: ['منفّذ', '#4FD08B'] };

  /* ---------- الاتصال ---------- */
  const pending = {}; let seq = 0;
  window.__mgmt = (id, status, body) => {
    const p = pending[id]; if (!p) return; delete pending[id];
    let data = null; try { data = body ? JSON.parse(body) : null; } catch (e) { data = null; }
    p({ status, ok: status >= 200 && status < 300 && !(data && data.ok === false), data });
  };
  const webBase = () => { try { return localStorage.getItem('mgmtBase') || ''; } catch (e) { return ''; } };
  async function webCall(method, query, body) {
    try {
      const r = await fetch(webBase() + '/hrnew/mgmt/api.php' + (query ? '?' + query : ''), { method, credentials: 'include', headers: { 'X-Requested-With': 'tarsof-app', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      let data = null; try { data = await r.json(); } catch (e) { /* not json */ }
      return { status: r.status, ok: r.ok && !(data && data.ok === false), data };
    } catch (e) { return { status: 0, ok: false, data: { error: 'network' } }; }
  }
  function call(method, query, body) {
    if (!B || !B.mgmtCall) return webCall(method, query, body);
    return new Promise((res) => { const id = 'm' + (++seq); pending[id] = res; B.mgmtCall(id, method, query || '', body ? JSON.stringify(body) : ''); });
  }
  function login(user, pass, remember) {
    return new Promise((res) => { const id = 'l' + (++seq); pending[id] = res; B.mgmtLogin(id, user, pass, !!remember); });
  }
  const connected = () => B && B.mgmtSession ? B.mgmtSession() : true;

  /* ---------- التخزين على الجوال (قراءة دون إنترنت) + طابور الإرسال ---------- */
  const putFile = (name, v) => { try { const s = JSON.stringify(v); if (B && B.hrPut) B.hrPut(name, s); else localStorage.setItem(name, s); } catch (e) { /* full */ } };
  const getFile = (name, d) => { try { const s = B && B.hrGet ? B.hrGet(name) : localStorage.getItem(name); return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  let D = getFile('mgmt_cache', null);
  let outbox = getFile('mgmt_outbox', []);
  const saveCache = () => putFile('mgmt_cache', D);
  const saveBox = () => putFile('mgmt_outbox', outbox);

  const S = { tab: 'dir', st: '', act: '', q: '', open: new Set(), loading: false, err: '', exp: { cid: 0, end: '', data: null, loading: false } };
  const canEdit = () => !D || !D.user || D.user.canEdit !== false;
  const actOf = (slug) => (D && D.actions.find((a) => a.slug === slug)) || { slug, label: slug, tone: 'slate', endOnly: false };

  /* ---------- جلب البيانات ---------- */
  let busy = false;
  async function refresh(silent) {
    if (busy) return; busy = true; S.loading = true; if (!silent) draw();
    try {
      await flush();
      const r = await call('GET', 'a=bootstrap');
      if (r.status === 401) { if (B && B.mgmtLogout && !(B.mgmtHasCreds && B.mgmtHasCreds())) B.mgmtLogout(); S.err = 'auth'; }
      else if (r.ok && r.data && r.data.sessions) { D = r.data; D.cachedAt = Date.now(); saveCache(); S.err = ''; applyOutboxLocal(); }
      else S.err = r.status === 0 ? 'net' : r.status === 403 ? 'forbidden' : 'server';
    } finally { busy = false; S.loading = false; draw(); }
  }

  /* ---------- الكتابة: مباشرة للنظام، وعند انقطاع الاتصال تُحفظ وتُرسل تلقائياً ---------- */
  const QUEUEABLE = ['directive_status', 'directive_save', 'directive_delete'];
  async function send(a, payload) {
    const body = Object.assign({ a }, payload);
    const r = await call('POST', '', body);
    if (r.status === 0 && QUEUEABLE.includes(a)) {
      outbox.push({ body, t: Date.now() }); saveBox(); applyOutboxLocal(); draw();
      return { ok: true, queued: true };
    }
    if (r.status === 401) { S.err = 'auth'; draw(); }
    return { ok: r.ok, status: r.status, error: r.data && r.data.error, data: r.data };
  }
  async function flush() {
    while (outbox.length) {
      const it = outbox[0];
      const r = await call('POST', '', it.body);
      if (r.status === 0 || r.status === 401) return false; // نحاول لاحقاً
      outbox.shift(); saveBox(); // نجح أو رُفض نهائياً (مثلاً جلسة مُقفلة)
      if (!r.ok) toast('تعذّر تنفيذ تغيير محفوظ: ' + ((r.data && r.data.error) || 'رفضه النظام'));
    }
    return true;
  }
  function applyOutboxLocal() {
    if (!D || !outbox.length) return;
    outbox.forEach(({ body }) => {
      D.sessions.forEach((s) => {
        if (body.a === 'directive_status') { const d = s.directives.find((x) => x.id === body.id); if (d) { d.status = body.status; if ('hr_note' in body) d.hr_note = body.hr_note || null; d.pending = true; } }
        if (body.a === 'directive_delete') s.directives = s.directives.filter((x) => x.id !== body.id);
        if (body.a === 'directive_save' && body.id) { const d = s.directives.find((x) => x.id === body.id); if (d) { Object.assign(d, { target_name: body.target_name || d.target_name, action_type: body.action_type, start_date: body.start_date || null, end_date: body.end_date || null, details: body.details || null, project: body.project || null, pending: true }); } }
        if (body.a === 'directive_save' && !body.id && s.id === body.session_id) s.directives.push({ id: 'tmp' + body.__t, pending: true, session_id: s.id, target_type: body.target_type, target_name: body.target_name || '—', target_title: body.target_title || '', action_type: body.action_type, start_date: body.start_date || null, end_date: body.end_date || null, details: body.details || null, project: body.project || null, status: 'new' });
      });
    });
  }

  /* ---------- الرسم ---------- */
  const root = () => $('mgBody');
  function draw() {
    const box = root(); if (!box) return;
    box.innerHTML = '';
    if (!connected() || S.err === 'auth') { box.appendChild(loginView()); return; }
    if (!D) {
      box.appendChild(el('div', 'mg-empty', S.err === 'net' ? `${icon('alert')}<b>لا يوجد اتصال</b><small>لم تُحمَّل البيانات بعد. تحقق من الإنترنت ثم اضغط تحديث.</small>` : S.err === 'forbidden' ? `${icon('alert')}<b>لا تملك الصلاحية</b><small>حسابك لا يملك عرض عمليات الإدارة في النظام.</small>` : S.err === 'server' ? `${icon('alert')}<b>تعذّر التحميل</b><small>تأكد أن ملف api.php مرفوع على السيرفر في /hrnew/mgmt/.</small>` : `${icon('refresh')}<b>جارٍ التحميل…</b>`));
      return;
    }
    box.appendChild(hero());
    box.appendChild(tabs());
    ({ dir: drawDir, exp: drawExp, types: drawTypes }[S.tab] || drawDir)(box);
  }
  window.mgRedraw = draw;

  function loginView() {
    const c = el('div', 'hr-login', `
      <div class="hr-lhero"><span class="hr-lic">${icon('note')}</span><b>الدخول إلى نظام الموارد البشرية</b><small>tarsof.top · جمعية أصدقاء البيئة الفلسطينية</small></div>
      <form id="mgLF" autocomplete="on">
        <label class="hr-f"><span>اسم المستخدم</span><input id="mgU" autocomplete="username" required></label>
        <label class="hr-f"><span>كلمة المرور</span><div class="hr-pw"><input id="mgP" type="password" autocomplete="current-password" required><button type="button" id="mgEye" aria-label="إظهار">${icon('eye')}</button></div></label>
        <label class="ag-check hr-rem"><input id="mgRem" type="checkbox" checked> حفظ بيانات الدخول على هذا الجوال</label>
        <div id="mgErr" class="hr-err" hidden></div>
        <button class="btn-gold" id="mgBtn" type="submit">تسجيل الدخول</button>
      </form>
      <ul class="hr-notes"><li>${icon('check')}<span>الاتصال مباشر بين جوالك ونظام المؤسسة فقط، وصلاحياتك في النظام هي المرجع.</span></li><li>${icon('check')}<span>كلمة المرور تُحفظ مشفّرة بمفتاح أندرويد الآمن عند اختيار الحفظ.</span></li></ul>`);
    setTimeout(() => {
      const f = c.querySelector('#mgLF'); if (!f) return;
      c.querySelector('#mgEye').onclick = () => { const p = c.querySelector('#mgP'); p.type = p.type === 'password' ? 'text' : 'password'; };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const err = c.querySelector('#mgErr'), btn = c.querySelector('#mgBtn'); err.hidden = true; btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
        const r = await login(c.querySelector('#mgU').value.trim(), c.querySelector('#mgP').value, c.querySelector('#mgRem').checked);
        btn.disabled = false; btn.textContent = 'تسجيل الدخول';
        if (r.status === 200) { S.err = ''; refresh(); return; }
        err.hidden = false; err.textContent = r.status === 401 ? 'اسم المستخدم أو كلمة المرور غير صحيحين' : r.status === 0 ? 'تعذّر الاتصال، تحقق من الإنترنت' : 'تعذّر الدخول إلى النظام، حاول لاحقاً';
      };
    }, 0);
    return c;
  }

  function counts() { const c = { new: 0, in_progress: 0, done: 0 }; D.sessions.forEach((s) => s.directives.forEach((d) => { if (c[d.status] != null) c[d.status]++; })); return c; }

  function hero() {
    const c = counts(), n = D.sessions.length;
    const h = el('div', 'mg-hero', `
      <div class="mg-hid"><span class="mg-eyebrow">الإدارة ← الموارد البشرية</span><h2>تنبيهات الإدارة</h2>
        <small>${n} جلسة${outbox.length ? ` · <b class="mg-wait">${outbox.length} بانتظار الإرسال</b>` : ''}${D.cachedAt ? ' · حُدّث ' + ago(D.cachedAt) : ''}</small></div>
      <div class="mg-hside"><button class="icon-btn mg-ref${S.loading ? ' spin' : ''}" id="mgRef" aria-label="تحديث">${icon('refresh')}</button>${canEdit() ? `<button class="btn-gold mg-new" id="mgNew">${icon('plus')}<span>جلسة جديدة</span></button>` : ''}</div>`);
    const cr = el('div', 'mg-counts');
    [['new', 'جديد', 'note'], ['in_progress', 'قيد التنفيذ', 'clock'], ['done', 'منفّذ', 'check']].forEach(([k, l, ic]) => {
      const b = el('button', 'mg-count' + (S.st === k ? ' on' : ''), `<span class="mg-cic" style="--c:${STC[k][1]}">${icon(ic)}</span><b>${c[k]}</b><small>${l}</small>`);
      b.type = 'button'; b.disabled = !c[k] && S.st !== k; b.onclick = () => { S.st = S.st === k ? '' : k; S.tab = 'dir'; draw(); };
      cr.appendChild(b);
    });
    const w = el('div'); w.appendChild(h); w.appendChild(cr);
    setTimeout(() => { const r = w.querySelector('#mgRef'); if (r) r.onclick = () => refresh(); const nw = w.querySelector('#mgNew'); if (nw) nw.onclick = () => sessionSheet(); }, 0);
    return w;
  }

  function tabs() {
    const t = el('div', 'mg-tabs');
    [['dir', 'التوجيهات', 'note'], ['exp', 'العقود المنتهية', 'cal'], ['types', 'أنواع التوجيهات', 'sliders']].forEach(([k, n, ic]) => {
      const b = el('button', 'mg-tab' + (S.tab === k ? ' on' : ''), `${icon(ic)}${n}`); b.type = 'button';
      b.onclick = () => { S.tab = k; draw(); if (k === 'exp' && !S.exp.data) loadExp(); }; t.appendChild(b);
    });
    return t;
  }

  /* ----- التوجيهات ----- */
  function matchD(d, s) {
    if (S.st && d.status !== S.st) return false;
    if (S.act && d.action_type !== S.act) return false;
    if (!S.q) return true;
    const q = S.q.toLowerCase();
    return [d.target_name, d.target_title, d.details, d.project, s.title].some((v) => v && String(v).toLowerCase().includes(q));
  }
  function drawDir(box) {
    const tb = el('div', 'mg-tool', `<div class="search hr-search mg-search">${icon('search')}<input id="mgQ" type="search" placeholder="ابحث بالاسم أو عنوان الجلسة أو التفاصيل" value="${esc(S.q)}" aria-label="بحث"></div>
      <select id="mgAct" class="mg-sel" aria-label="نوع التوجيه"><option value="">كل الأنواع</option>${D.actions.map((a) => `<option value="${esc(a.slug)}"${S.act === a.slug ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
      <select id="mgSt" class="mg-sel" aria-label="الحالة"><option value="">كل الحالات</option>${D.statuses.map((s) => `<option value="${esc(s.k)}"${S.st === s.k ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>`);
    box.appendChild(tb);
    let h; const qi = tb.querySelector('#mgQ'); qi.oninput = () => { clearTimeout(h); h = setTimeout(() => { S.q = qi.value.trim(); const p = qi.selectionStart; draw(); const n = $('mgQ'); if (n) { n.focus(); n.setSelectionRange(p, p); } }, 250); };
    tb.querySelector('#mgAct').onchange = (e) => { S.act = e.target.value; draw(); };
    tb.querySelector('#mgSt').onchange = (e) => { S.st = e.target.value; draw(); };
    const filtering = S.st || S.act || S.q;
    let shown = 0;
    D.sessions.forEach((s) => {
      const list = s.directives.filter((d) => matchD(d, s));
      if (filtering && !list.length && !(S.q && String(s.title).toLowerCase().includes(S.q.toLowerCase()))) return;
      shown++; box.appendChild(sessionCard(s, list, filtering));
    });
    if (!D.sessions.length) box.appendChild(el('div', 'mg-empty', `${icon('note')}<b>لا جلسات بعد</b><small>ابدأ بإنشاء جلسة توجيهات ثم أضف إليها توجيهات الإدارة للموارد البشرية.</small>`));
    else if (!shown) box.appendChild(el('div', 'mg-empty', `${icon('search')}<b>لا نتائج مطابقة</b><small>جرّب تعديل البحث أو مسح المرشِّحات.</small>`));
  }

  function sessionCard(s, list, filtering) {
    const all = s.directives, closed = s.status === 'closed';
    const c = { new: 0, in_progress: 0, done: 0 }; all.forEach((d) => { if (c[d.status] != null) c[d.status]++; });
    const pct = all.length ? Math.round(c.done / all.length * 100) : 0;
    const open = filtering || S.open.has(s.id) || (!S.openInit && !closed && c.new + c.in_progress > 0);
    const card = el('section', 'mg-memo' + (closed ? ' closed' : '') + (open ? ' open' : ''));
    card.id = 'mgs' + s.id;
    card.innerHTML = `<button class="mg-mh" type="button" aria-expanded="${open}">
        <span class="mg-caret">${icon('chev')}</span>
        <span class="mg-mt"><span class="mg-ref"><bdi>${esc(s.ref)}</bdi></span><b>${esc(s.title)}</b>
          <small>${fd(s.session_date) ? `<bdi>${fd(s.session_date)}</bdi>` : ''}${s.issued_by ? ' · ' + esc(s.issued_by) : ''} · ${all.length} توجيه${s.notes ? ' · ' + esc(s.notes) : ''}</small></span>
        <span class="mg-ms">${c.new ? `<i style="--c:${STC.new[1]}">${c.new} جديد</i>` : ''}${c.in_progress ? `<i style="--c:${STC.in_progress[1]}">${c.in_progress} قيد التنفيذ</i>` : ''}${c.done ? `<i style="--c:${STC.done[1]}">${c.done} منفّذ</i>` : ''}${closed ? `<i class="lock">${icon('lock')}مُقفلة</i>` : ''}</span>
        ${all.length ? `<span class="mg-prog"><b style="width:${pct}%"></b></span>` : ''}</button>
      <div class="mg-mb"></div>`;
    card.querySelector('.mg-mh').onclick = () => { S.openInit = true; if (S.open.has(s.id)) S.open.delete(s.id); else S.open.add(s.id); if (!open) S.open.add(s.id); card.classList.toggle('open'); card.querySelector('.mg-mh').setAttribute('aria-expanded', card.classList.contains('open')); if (!card.classList.contains('open')) S.open.delete(s.id); };
    const body = card.querySelector('.mg-mb');
    const bar = el('div', 'mg-bar');
    if (canEdit() && !closed) { const a = el('button', 'btn-gold mg-add', `${icon('plus')}<span>إضافة توجيه</span>`); a.onclick = () => dirSheet(s); bar.appendChild(a); }
    const tools = el('div', 'mg-tools');
    const tb = (ic, label, fn, cls) => { const b = el('button', 'mg-tbtn' + (cls ? ' ' + cls : ''), `${icon(ic)}<span>${label}</span>`); b.type = 'button'; b.onclick = fn; tools.appendChild(b); };
    tb('share', 'تقرير الجلسة', () => shareReport(s));
    if (canEdit()) {
      if (!closed) { tb('note', 'تعديل', () => sessionSheet(s)); tb('lock', 'إقفال', () => confirmSheet('إقفال الجلسة', `ستصير الجلسة «${s.title}» للقراءة فقط${c.new + c.in_progress ? ` (فيها ${c.new + c.in_progress} توجيه لم يُنجز)` : ''}. يمكنك إعادة فتحها لاحقاً.`, 'إقفال الجلسة', () => run('session_close', { id: s.id }, 'أُقفلت الجلسة'))); }
      else tb('unlock', 'إعادة فتح', () => run('session_reopen', { id: s.id }, 'أُعيد فتح الجلسة'));
      tb('trash', 'حذف', () => confirmSheet('حذف الجلسة', `سيُحذف «${s.title}» مع كل توجيهاتها (${all.length}) نهائياً من النظام.`, 'حذف نهائي', () => run('session_delete', { id: s.id }, 'حُذفت الجلسة'), true), 'danger');
    }
    bar.appendChild(tools); body.appendChild(bar);
    const dl = el('div', 'mg-dirs');
    if (!list.length) dl.appendChild(el('div', 'mg-dnone', all.length ? 'لا توجيهات مطابقة للمرشِّحات.' : 'لا توجيهات في هذه الجلسة بعد.'));
    list.forEach((d) => dl.appendChild(dirCard(s, d, closed)));
    body.appendChild(dl);
    return card;
  }

  function dirCard(s, d, closed) {
    const at = actOf(d.action_type), col = TONE[at.tone] || TONE.slate;
    const from = fd(d.start_date), to = fd(d.end_date);
    const facts = [];
    if (at.endOnly && to) facts.push(`<span class="mg-fact end">${icon('cal')}ينتهي التكليف في <b${badYear(d.end_date) ? ' class="bad"' : ''}><bdi>${to}</bdi></b></span>`);
    else if (from || to) facts.push(`<span class="mg-fact">${icon('cal')}${from && to ? `<b${badYear(d.start_date) ? ' class="bad"' : ''}><bdi>${from}</bdi></b> ← <b${badYear(d.end_date) ? ' class="bad"' : ''}><bdi>${to}</bdi></b>` : from ? `من <b><bdi>${from}</bdi></b>` : `حتى <b><bdi>${to}</bdi></b>`}</span>`);
    if (d.project) facts.push(`<span class="mg-fact">${icon('briefcase')}<b><bdi>${esc(d.project)}</bdi></b></span>`);
    if (d.scale_grade) facts.push(`<span class="mg-fact">${icon('chart')}درجة السلم <b><bdi>${esc(d.scale_grade)} · مستوى ${d.scale_level}${d.scale_step ? ' · درجة ' + d.scale_step : ''}${d.scale_amount != null ? ' · ' + Number(d.scale_amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + esc(String(d.scale_currency || '').split('→').pop().trim()) : ''}</bdi></b></span>`);
    const card = el('article', 'mg-dir' + (d.pending ? ' wait' : ''));
    card.style.setProperty('--tc', col);
    card.innerHTML = `<div class="mg-dtop"><span class="mg-seal">${esc(at.label)}</span><b class="mg-dname">${esc(d.target_name)}</b><span class="mg-ttag">${esc((D.targets && D.targets[d.target_type]) || d.target_type)}</span>${d.target_title ? `<span class="mg-dtitle">— ${esc(d.target_title)}</span>` : ''}${d.pending ? `<span class="mg-pend">${icon('clock')}بانتظار الإرسال</span>` : ''}</div>
      ${facts.length ? `<div class="mg-facts">${facts.join('')}</div>` : ''}
      ${d.details ? `<p class="mg-det">${esc(d.details)}</p>` : ''}
      ${d.hr_note ? `<p class="mg-note"><b>ملاحظة الموارد البشرية:</b> ${esc(d.hr_note)}</p>` : ''}`;
    const side = el('div', 'mg-dside');
    if (canEdit() && !closed) {
      const sw = el('div', 'mg-sw');
      D.statuses.forEach((st) => { const b = el('button', d.status === st.k ? 'on' : '', esc(st.label)); b.type = 'button'; b.style.setProperty('--c', (STC[st.k] || [0, '#8FA2B2'])[1]); b.onclick = () => { if (d.status !== st.k) setStatus(d, st.k); }; sw.appendChild(b); });
      side.appendChild(sw);
      const t = el('div', 'mg-dtools');
      const e = el('button', 'mg-link', `${icon('note')}تعديل`); e.type = 'button'; e.onclick = () => dirSheet(s, d);
      const x = el('button', 'mg-link danger', `${icon('trash')}حذف`); x.type = 'button'; x.onclick = () => confirmSheet('حذف التوجيه', `سيُحذف توجيه «${d.target_name}» نهائياً من النظام.`, 'حذف', () => run('directive_delete', { id: d.id }, 'حُذف التوجيه', true), true);
      t.appendChild(e); t.appendChild(x); side.appendChild(t);
    } else side.appendChild(el('span', 'mg-stat', esc((STC[d.status] || [d.status])[0])));
    card.appendChild(side);
    return card;
  }

  async function setStatus(d, status) {
    const prev = d.status; d.status = status; draw();
    const r = await send('directive_status', { id: d.id, status });
    if (!r.ok) { d.status = prev; toast(r.error || 'تعذّر تحديث الحالة'); draw(); return; }
    if (r.queued) toast('حُفظ على الجوال وسيُرسل للنظام عند توفر الإنترنت'); else { toast('حُدّثت الحالة'); refresh(true); }
  }
  async function run(a, payload, okMsg, queueable) {
    const r = await send(a, payload);
    if (!r.ok) { toast(r.error || 'رفض النظام العملية'); return false; }
    closeSheet(); toast(r.queued ? 'حُفظ على الجوال وسيُرسل للنظام عند توفر الإنترنت' : okMsg); if (!r.queued) refresh(true); return true;
  }

  /* ----- نوافذ ----- */
  const sheet = (html) => { $('mgSheetBody').innerHTML = html; $('mgSheet').hidden = false; requestAnimationFrame(() => { $('mgSheet').classList.add('in'); $('mgSheetBody').scrollTop = 0; }); };
  const closeSheet = () => { $('mgSheet').classList.remove('in'); setTimeout(() => { $('mgSheet').hidden = true; }, 200); };
  function confirmSheet(title, text, label, fn, danger) {
    sheet(`<div class="mg-cf"><b>${esc(title)}</b><p>${esc(text)}</p><div class="mg-cfb"><button class="${danger ? 'mg-danger' : 'btn-gold'}" id="mgYes" type="button">${esc(label)}</button><button class="btn-outline" data-close type="button">إلغاء</button></div><p class="hr-err" id="mgCfErr" hidden></p></div>`);
    $('mgYes').onclick = async () => { $('mgYes').disabled = true; const ok = await fn(); if (ok === false) { $('mgYes').disabled = false; } };
  }

  function sessionSheet(s) {
    sheet(`<h3 class="mg-sh">${s ? 'تعديل الجلسة' : 'جلسة توجيهات جديدة'}</h3>
      <form id="mgSF" class="mg-form">
        <label class="hr-f"><span>عنوان الجلسة</span><input id="msT" required value="${esc(s ? s.title : '')}"></label>
        <label class="hr-f"><span>تاريخ الجلسة</span><input id="msD" type="date" value="${esc(s ? s.session_date : today())}"></label>
        <label class="hr-f"><span>صادر عن</span><input id="msB" value="${esc(s ? s.issued_by || '' : '')}" placeholder="الاسم أو الجهة المصدِّرة للتوجيهات"></label>
        <label class="hr-f"><span>ملاحظات</span><textarea id="msN" rows="2">${esc(s ? s.notes || '' : '')}</textarea></label>
        <div class="hr-err" id="msErr" hidden></div>
        <button class="btn-gold" type="submit" id="msGo">${s ? 'حفظ التعديلات' : 'إنشاء الجلسة'}</button></form>`);
    $('mgSF').onsubmit = async (e) => {
      e.preventDefault(); const b = $('msGo'); b.disabled = true;
      const r = await send('session_save', { id: s ? s.id : 0, title: $('msT').value.trim(), session_date: $('msD').value, issued_by: $('msB').value.trim(), notes: $('msN').value.trim() });
      b.disabled = false;
      if (!r.ok) { const er = $('msErr'); er.hidden = false; er.textContent = r.status === 0 ? 'يلزم اتصال بالإنترنت لحفظ الجلسة' : r.error || 'تعذّر الحفظ'; return; }
      if (r.data && r.data.id) S.open.add(r.data.id);
      closeSheet(); toast(s ? 'حُفظت تعديلات الجلسة' : 'أُنشئت الجلسة، أضف التوجيهات إليها الآن'); refresh(true);
    };
  }

  function dirSheet(s, d) {
    const edit = !!d;
    const F = { tt: d ? d.target_type : 'employee', emp: d ? d.employee_id : null, cand: d ? d.candidate_id : null, name: d ? d.target_name : '', title: d ? d.target_title || '' : '', at: d ? d.action_type : '', row: 0, step: 0 };
    if (d && d.scale_grade) { const row = D.scale.find((r) => r.grade === d.scale_grade && r.level === d.scale_level); if (row) { F.row = row.id; F.step = d.scale_step || 0; } }
    const actions = D.actions.filter((a) => a.active || a.slug === F.at);
    const targets = Object.keys(D.targets || { employee: 'موظف', candidate: 'مرشّح', other: 'آخر' });
    sheet(`<h3 class="mg-sh">${edit ? 'تعديل التوجيه' : 'توجيه جديد'}<small>${esc(s.ref)} · ${esc(s.title)}</small></h3>
      <form id="mgDF" class="mg-form">
        <div class="hr-sl2">المعنيّ بالتوجيه</div>
        <div class="chips" id="mdTT"></div>
        <div id="mdWho"></div>
        <div class="hr-sl2">نوع التوجيه</div>
        <div class="chips mg-acts" id="mdAT"></div>
        <div class="mg-two"><label class="hr-f" id="mdSW"><span>تاريخ البداية</span><input id="mdSD" type="date" value="${esc(d && d.start_date && d.start_date !== '0000-00-00' ? d.start_date : '')}"></label>
        <label class="hr-f"><span id="mdEL">تاريخ النهاية</span><input id="mdED" type="date" value="${esc(d && d.end_date && d.end_date !== '0000-00-00' ? d.end_date : '')}"></label></div>
        <label class="hr-f"><span>المشروع</span><input id="mdPJ" list="mdPJL" value="${esc(d ? d.project || '' : '')}" placeholder="اختر من المشاريع أو اكتب"><datalist id="mdPJL">${D.projects.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
        <div class="hr-sl2">درجة السلم (اختياري)</div>
        <div class="mg-two"><select id="mdRow" class="mg-sel" aria-label="الدرجة والمستوى"><option value="0">بدون</option>${D.scale.map((r) => `<option value="${r.id}"${F.row === r.id ? ' selected' : ''}>${esc(r.grade)} · مستوى ${r.level}</option>`).join('')}</select>
        <select id="mdStep" class="mg-sel" aria-label="الدرجة"></select></div>
        <div class="mg-amt" id="mdAmt" hidden></div>
        <label class="hr-f"><span>التفاصيل</span><textarea id="mdDT" rows="3">${esc(d ? d.details || '' : '')}</textarea></label>
        ${edit ? `<label class="hr-f"><span>ملاحظة الموارد البشرية</span><textarea id="mdHN" rows="2">${esc(d.hr_note || '')}</textarea></label>` : ''}
        <div class="hr-err" id="mdErr" hidden></div>
        <button class="btn-gold" type="submit" id="mdGo">${edit ? 'حفظ التعديلات' : 'إضافة التوجيه'}</button></form>`);
    const chipRow = (id, opts, cur, fn) => { const b = $(id); b.innerHTML = ''; opts.forEach(([v, n]) => { const c = el('button', 'chip sm' + (v === cur ? ' on' : ''), esc(n)); c.type = 'button'; c.onclick = () => { fn(v); }; b.appendChild(c); }); };
    const who = () => {
      const w = $('mdWho');
      if (F.tt === 'employee') {
        w.innerHTML = `<div class="search hr-search">${icon('search')}<input id="mdQ" type="search" placeholder="ابحث عن موظف" aria-label="بحث موظف"></div><div class="mg-pick" id="mdPick"></div>`;
        const draw2 = () => { const q = $('mdQ').value.trim().toLowerCase(); const list = D.employees.filter((e) => !q || String(e.name).toLowerCase().includes(q)).slice(0, 40);
          $('mdPick').innerHTML = list.map((e) => `<button type="button" class="mg-opt${F.emp === e.id ? ' on' : ''}" data-id="${e.id}"><b>${esc(e.name)}</b><small>${esc(e.title || '')}</small></button>`).join('') || '<div class="mg-dnone">لا نتائج</div>';
          $('mdPick').querySelectorAll('.mg-opt').forEach((b) => b.onclick = () => { F.emp = +b.dataset.id; const e = D.employees.find((x) => x.id === F.emp); F.name = e.name; F.title = e.title || ''; draw2(); }); };
        $('mdQ').oninput = draw2; draw2();
      } else if (F.tt === 'candidate') {
        w.innerHTML = `<div class="search hr-search">${icon('search')}<input id="mdQ" type="search" placeholder="ابحث عن مرشّح" aria-label="بحث مرشح"></div><div class="mg-pick" id="mdPick"></div>`;
        const draw2 = () => { const q = $('mdQ').value.trim().toLowerCase(); const list = D.candidates.filter((c) => !q || String(c.name).toLowerCase().includes(q) || String(c.job || '').toLowerCase().includes(q)).slice(0, 40);
          $('mdPick').innerHTML = list.map((c) => `<button type="button" class="mg-opt${F.cand === c.id ? ' on' : ''}" data-id="${c.id}"><b>${esc(c.name)}</b><small>${esc(c.job || 'وظائف أخرى')}${c.decision === 'appointed' ? ' · مُعيَّن' : c.decision === 'waitlist' ? ' · قائمة انتظار' : ''}</small></button>`).join('') || '<div class="mg-dnone">لا نتائج</div>';
          $('mdPick').querySelectorAll('.mg-opt').forEach((b) => b.onclick = () => { F.cand = +b.dataset.id; const c = D.candidates.find((x) => x.id === F.cand); F.name = c.name; F.title = c.job || ''; draw2(); }); };
        $('mdQ').oninput = draw2; draw2();
      } else {
        w.innerHTML = `<label class="hr-f"><span>الاسم</span><input id="mdNm" value="${esc(F.name)}"></label><label class="hr-f"><span>المسمّى</span><input id="mdTl" value="${esc(F.title)}"></label>`;
        $('mdNm').oninput = (e) => { F.name = e.target.value; }; $('mdTl').oninput = (e) => { F.title = e.target.value; };
      }
    };
    const ttRow = () => chipRow('mdTT', targets.map((k) => [k, (D.targets && D.targets[k]) || k]), F.tt, (v) => { F.tt = v; ttRow(); who(); });
    const atRow = () => { chipRow('mdAT', actions.map((a) => [a.slug, a.label]), F.at, (v) => { F.at = v; atRow(); endOnly(); }); };
    const endOnly = () => { const eo = (actions.find((a) => a.slug === F.at) || {}).endOnly; $('mdSW').hidden = !!eo; $('mdEL').textContent = eo ? 'تاريخ انتهاء التكليف' : 'تاريخ النهاية'; };
    const steps = () => {
      const row = D.scale.find((r) => r.id === F.row); const sel = $('mdStep');
      sel.disabled = !row; sel.innerHTML = row ? '<option value="0">اختر الدرجة</option>' + row.steps.map((a, i) => `<option value="${i + 1}"${F.step === i + 1 ? ' selected' : ''}>درجة ${i + 1} — ${a.toLocaleString('en', { minimumFractionDigits: 2 })}</option>`).join('') : '<option value="0">—</option>';
      const am = $('mdAmt'); const v = row && F.step ? row.steps[F.step - 1] : null;
      am.hidden = v == null; if (v != null) am.innerHTML = `الراتب: <b>${v.toLocaleString('en', { minimumFractionDigits: 2 })}</b> ${esc(String(row.currency || '').split('→').pop().trim())}${row.desc ? ' · ' + esc(row.desc) : ''}`;
    };
    $('mdRow').onchange = (e) => { F.row = +e.target.value; F.step = 0; steps(); };
    $('mdStep').onchange = (e) => { F.step = +e.target.value; steps(); };
    ttRow(); who(); atRow(); endOnly(); steps();
    $('mgDF').onsubmit = async (e) => {
      e.preventDefault(); const er = $('mdErr'); er.hidden = true;
      const fail = (m) => { er.hidden = false; er.textContent = m; };
      if (!F.at) return fail('يرجى اختيار نوع التوجيه.');
      if (F.tt === 'employee' && !F.emp) return fail('يرجى اختيار الموظف المعنيّ.');
      if (F.tt === 'candidate' && !F.cand) return fail('يرجى اختيار المرشّح المعنيّ.');
      if (F.tt !== 'employee' && F.tt !== 'candidate' && !String(F.name).trim()) return fail('يرجى كتابة اسم المعنيّ بالتوجيه.');
      const eo = (actions.find((a) => a.slug === F.at) || {}).endOnly;
      if (eo && !$('mdED').value) return fail('يرجى تحديد تاريخ انتهاء التكليف.');
      const body = { id: d ? d.id : 0, session_id: s.id, target_type: F.tt, employee_id: F.tt === 'employee' ? F.emp : 0, candidate_id: F.tt === 'candidate' ? F.cand : 0, target_name: F.name, target_title: F.title, action_type: F.at,
        start_date: eo ? '' : $('mdSD').value, end_date: $('mdED').value, project: $('mdPJ').value.trim(), details: $('mdDT').value.trim(), scale_row_id: F.row, scale_step: F.step, __t: Date.now() };
      const b = $('mdGo'); b.disabled = true;
      let r = await send('directive_save', body);
      if (r.ok && !r.queued && edit && $('mdHN') && ($('mdHN').value.trim() !== (d.hr_note || ''))) r = await send('directive_status', { id: d.id, status: d.status, hr_note: $('mdHN').value.trim() });
      b.disabled = false;
      if (!r.ok) return fail(r.status === 0 ? 'تعذّر الاتصال' : r.error || 'تعذّر الحفظ');
      S.open.add(s.id); closeSheet(); toast(r.queued ? 'حُفظ على الجوال وسيُرسل للنظام عند توفر الإنترنت' : edit ? 'حُفظ التوجيه' : 'أُضيف التوجيه إلى الجلسة'); if (!r.queued) refresh(true); else draw();
    };
  }

  function shareReport(s) {
    const lines = s.directives.map((d, i) => { const at = actOf(d.action_type); const per = at.endOnly ? (d.end_date ? 'ينتهي في ' + fd(d.end_date) : '') : [fd(d.start_date), fd(d.end_date)].filter(Boolean).join(' ← '); return `${i + 1}. [${at.label}] ${d.target_name}${d.target_title ? ' — ' + d.target_title : ''}${per ? ' (' + per + ')' : ''}${d.project ? ' · المشروع: ' + d.project : ''}${d.details ? '\n   ' + d.details : ''}\n   الحالة: ${(STC[d.status] || [d.status])[0]}${d.hr_note ? ' — ' + d.hr_note : ''}`; });
    const text = `تقرير جلسة ${s.ref}\n${s.title}\nالتاريخ: ${fd(s.session_date)}${s.issued_by ? '\nصادر عن: ' + s.issued_by : ''}\n\n${lines.join('\n') || 'لا توجيهات في هذه الجلسة.'}`;
    if (B && B.share) B.share(text); else if (navigator.share) navigator.share({ text }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(text); toast('تم النسخ'); }
  }

  /* ----- العقود المنتهية ----- */
  async function loadExp(cid, end) {
    S.exp.loading = true; draw();
    const r = await call('GET', 'a=expiring' + (cid ? '&cid=' + cid : '') + (end ? '&end=' + end : ''));
    S.exp.loading = false;
    if (r.ok && r.data) { S.exp.data = r.data; S.exp.cid = r.data.cid; S.exp.end = r.data.end; putFile('mgmt_exp', r.data); }
    else { S.exp.data = S.exp.data || getFile('mgmt_exp', null); toast(r.status === 0 ? 'لا يوجد اتصال — يُعرض آخر ما حُفظ' : 'تعذّر جلب العقود'); }
    draw();
  }
  function drawExp(box) {
    const E = S.exp.data;
    if (S.exp.loading && !E) { box.appendChild(el('div', 'mg-empty', `${icon('refresh')}<b>جارٍ التحميل…</b>`)); return; }
    if (!E) { box.appendChild(el('div', 'mg-empty', `${icon('cal')}<b>العقود المنتهية</b><small>اضغط لجلب العقود حسب دورة الرواتب وشهر الانتهاء.</small>`)); const b = el('button', 'btn-gold wide', 'جلب العقود'); b.onclick = () => loadExp(); box.appendChild(b); return; }
    box.appendChild(el('p', 'hr-omn', 'اختر دورة الرواتب (مجتمع الموظفين)، ثم شهر الانتهاء لعرض العقود التي تنتهي فيه لاتخاذ قرار التجديد أو الإيقاف.'));
    const cyc = el('select', 'mg-sel wide', E.cycles.map((c) => `<option value="${c.id}"${c.id === E.cid ? ' selected' : ''}>دورة ${ymLbl(c.ym)}</option>`).join('')); cyc.setAttribute('aria-label', 'دورة الرواتب');
    cyc.onchange = () => loadExp(+cyc.value, ''); box.appendChild(cyc);
    const ch = el('div', 'chips mg-months');
    E.months.forEach((m) => { const b = el('button', 'chip sm' + (m.ym === E.end ? ' on' : ''), `${ymLbl(m.ym)} <b>${m.n}</b>`); b.type = 'button'; b.onclick = () => loadExp(E.cid, m.ym); ch.appendChild(b); });
    box.appendChild(ch);
    if (!E.list.length) { box.appendChild(el('div', 'mg-empty', `${icon('check')}<b>لا عقود تنتهي في هذا الشهر</b>`)); return; }
    const renewed = E.list.filter((x) => x.renewed).length;
    box.appendChild(el('div', 'hr-tools', `<small>${E.list.length} عقد${renewed ? ` · ${renewed} تم تجديده` : ''}</small><button type="button" id="mgExpShare">${icon('share')}مشاركة</button>`));
    setTimeout(() => { const sb = $('mgExpShare'); if (sb) sb.onclick = () => { const t = `العقود المنتهية — ${ymLbl(E.end)}\n` + E.list.map((x, i) => `${i + 1}. ${x.name} — ${x.title || ''} (${fd(x.start)} ← ${fd(x.end)})${x.renewed ? ' ✔ تم التجديد' : ''}`).join('\n'); if (B && B.share) B.share(t); else if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(t); toast('تم النسخ'); } }; }, 0);
    const wrap = el('div', 'mg-exp');
    E.list.forEach((x) => {
      const left = x.end ? Math.round((new Date(x.end + 'T12:00:00Z') - new Date(today() + 'T12:00:00Z')) / 864e5) : null;
      const st = x.renewed ? `<span class="mg-bdg ok">✔ تم التجديد${x.renew_end ? ' حتى ' + fd(x.renew_end) : ''}</span>` : left == null ? '' : left < 0 ? `<span class="mg-bdg bad">منتهٍ منذ ${-left} يوم</span>` : left <= 30 ? `<span class="mg-bdg warn">${left} يوم</span>` : `<span class="mg-bdg">${left} يوم</span>`;
      wrap.appendChild(el('div', 'mg-er' + (x.renewed ? ' renewed' : ''), `<div><b>${esc(x.name)}</b><small>${esc(x.title || '—')}${x.contract_no ? ' · عقد ' + esc(x.contract_no) : ''}</small><small><bdi>${fd(x.start) || '—'}</bdi> ← <bdi>${fd(x.end) || '—'}</bdi></small></div>${st}`));
    });
    box.appendChild(wrap);
  }

  function drawTypes(box) {
    box.appendChild(el('p', 'hr-omn', 'الأنواع المعرَّفة في النظام. إضافة الأنواع وتعطيلها تتم من نظام الموارد البشرية على الويب.'));
    const g = el('div', 'mg-types');
    D.actions.forEach((a) => { const c = el('div', 'mg-type' + (a.active ? '' : ' off'), `<span class="mg-seal" style="--tc:${TONE[a.tone] || TONE.slate}">${esc(a.label)}</span><small>${a.endOnly ? 'يُسجَّل تاريخ النهاية فقط' : ''}${a.active ? '' : ' مُعطَّل'}</small>`); g.appendChild(c); });
    box.appendChild(g);
  }

  /* ---------- التشغيل ---------- */
  App.screens.mgmt = () => {
    if (!D) draw(); else draw();
    if (connected()) refresh(!!D);
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && App.isActive('mgmt') && connected()) refresh(true); });
  window.addEventListener('online', () => { if (outbox.length && connected()) refresh(true); });
  setInterval(() => { if (App.isActive('mgmt') && !document.hidden && connected() && !$('mgSheet').classList.contains('in')) refresh(true); }, 120000);
  $('mgSheet').onclick = (e) => { if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeSheet(); };
  window.Mgmt = { refresh, draw };
})();
