// النظام المساعد HR (تنبيهات الإدارة): جلسات توجيهات الإدارة إلى الموارد البشرية، مرتبطة بنظام tarsof.top (/hrnew/mgmt/api.php)
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
  let M = getFile('mgmt_modules', null);   // الوحدات (من الخادم)
  let BK = getFile('mgmt_basket', null);   // مهام السلة
  let outbox = getFile('mgmt_outbox', []);
  const saveCache = () => putFile('mgmt_cache', D);
  const saveBox = () => putFile('mgmt_outbox', outbox);

  const S = { mod: 'mgmt', bkf: 'todo', code: 0, msg: '', tab: 'dir', st: '', act: '', q: '', open: new Set(), loading: false, err: '', exp: { cid: 0, end: '', data: null, loading: false } };
  const canEdit = () => !D || !D.user || D.user.canEdit !== false;
  const actOf = (slug) => (D && D.actions.find((a) => a.slug === slug)) || { slug, label: slug, tone: 'slate', endOnly: false };

  /* ---------- جلب البيانات ---------- */
  let busy = false;
  const modOn = (k) => !M || M.some((m) => m.key === k && m.enabled);
  async function loadBasket() {
    const r = await call('GET', 'a=basket');
    if (r.ok && r.data && r.data.items) { BK = r.data; BK.cachedAt = Date.now(); putFile('mgmt_basket', BK); applyOutboxLocal(); return true; }
    return false;
  }
  async function refresh(silent) {
    if (busy) return; busy = true; S.loading = true; if (!silent) draw();
    try {
      await flush();
      // الوحدات المتاحة (خادم أقدم لا يعرفها: نكمل بوحدة الإدارة وحدها)
      const rm = await call('GET', 'a=modules');
      if (rm.status === 401) { if (B && B.mgmtLogout && !(B.mgmtHasCreds && B.mgmtHasCreds())) B.mgmtLogout(); S.err = 'auth'; return; }
      if (rm.ok && rm.data && Array.isArray(rm.data.modules)) { M = rm.data.modules; putFile('mgmt_modules', M); }
      if (!modOn(S.mod)) S.mod = (M.find((m) => m.enabled) || {}).key || 'mgmt';
      if (modOn('mgmt')) {
        const r = await call('GET', 'a=bootstrap');
        if (r.status === 401) { if (B && B.mgmtLogout && !(B.mgmtHasCreds && B.mgmtHasCreds())) B.mgmtLogout(); S.err = 'auth'; }
        else if (r.ok && r.data && r.data.sessions) { D = r.data; D.cachedAt = Date.now(); saveCache(); S.err = ''; applyOutboxLocal(); }
        else { S.err = r.status === 0 ? 'net' : r.status === 403 ? 'forbidden' : 'server'; S.code = r.status; S.msg = (r.data && r.data.error) || (r.status === 200 ? 'الرد ليس بصيغة JSON المتوقعة' : ''); }
      } else S.err = '';
      if (S.mod === 'basket' && modOn('basket')) await loadBasket();
    } finally { busy = false; S.loading = false; draw(); }
  }

  /* ---------- الكتابة: مباشرة للنظام، وعند انقطاع الاتصال تُحفظ وتُرسل تلقائياً ---------- */
  const QUEUEABLE = ['directive_status', 'directive_save', 'directive_delete', 'basket_item_status'];
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
    if (BK && outbox.length) outbox.forEach(({ body }) => { if (body.a === 'basket_item_status') { const it = BK.items.find((x) => x.id === body.id); if (it) { it.status = body.status; if (body.result_note) it.result_note = body.result_note; it.pending = true; } } });
    if (!D || !outbox.length) return;
    outbox.forEach(({ body }) => {
      D.sessions.forEach((s) => {
        if (body.a === 'directive_status') { const d = s.directives.find((x) => x.id === body.id); if (d) { d.status = body.status; if ('hr_note' in body) d.hr_note = body.hr_note || null; d.pending = true; } }
        if (body.a === 'directive_delete') s.directives = s.directives.filter((x) => x.id !== body.id);
        if (body.a === 'directive_save' && body.id) { const d = s.directives.find((x) => x.id === body.id); if (d) { Object.assign(d, { extra: Object.assign({}, d.extra || {}, body.extra || {}), target_name: body.target_name || d.target_name, action_type: body.action_type, start_date: body.start_date || null, end_date: body.end_date || null, details: body.details || null, project: body.project || null, pending: true }); } }
        if (body.a === 'directive_save' && !body.id && s.id === body.session_id) s.directives.push({ id: 'tmp' + body.__t, pending: true, session_id: s.id, target_type: body.target_type, target_name: body.target_name || '—', target_title: body.target_title || '', action_type: body.action_type, start_date: body.start_date || null, end_date: body.end_date || null, details: body.details || null, project: body.project || null, status: 'new' });
      });
    });
  }

  /* ---------- الرسم ---------- */
  const root = () => $('mgBody');
  function modBar() {
    const list = (M || []).filter((m) => m.enabled);
    if (list.length < 2) return null;
    const ICONS = { mgmt: 'note', basket: 'briefcase' };
    const bar = el('div', 'mg-mods');
    list.forEach((m) => {
      const b = el('button', 'mg-mod' + (S.mod === m.key ? ' on' : ''), `${icon(ICONS[m.key] || 'grid')}<span>${esc(m.label)}</span>${m.badge ? `<i class="mg-mbd">${m.badge > 99 ? '99+' : m.badge}</i>` : ''}`);
      b.type = 'button';
      b.onclick = () => { S.mod = m.key; draw(); if (m.key === 'basket') refresh(true); };
      bar.appendChild(b);
    });
    return bar;
  }
  function draw() {
    const box = root(); if (!box) return;
    box.innerHTML = '';
    if (!connected() || S.err === 'auth') { box.appendChild(loginView()); return; }
    const mb = modBar(); if (mb) box.appendChild(mb);
    if (S.mod === 'basket') { drawBasket(box); return; }
    if (S.mod !== 'mgmt') { box.appendChild(el('div', 'mg-empty', `${icon('alert')}<b>وحدة جديدة</b><small>هذه الوحدة غير مدعومة في هذا الإصدار من التطبيق. حدّث التطبيق لتظهر.</small>`)); return; }
    if (!D) {
      box.appendChild(el('div', 'mg-empty', S.err === 'net' ? `${icon('alert')}<b>لا يوجد اتصال</b><small>لم تُحمَّل البيانات بعد. تحقق من الإنترنت ثم اضغط تحديث.</small>` : S.err === 'forbidden' ? `${icon('alert')}<b>لا تملك الصلاحية</b><small>حسابك لا يملك عرض عمليات الإدارة في النظام.</small>` : S.err === 'server' ? `${icon('alert')}<b>تعذّر التحميل</b><small>رمز الخطأ: ${esc(S.code)}${S.msg ? ' — ' + esc(S.msg) : ''}</small><small>إن تكرر الخطأ أرسل هذا الرمز والرسالة للدعم.</small>` : `${icon('refresh')}<b>جارٍ التحميل…</b>`));
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
      <div class="mg-hid"><span class="mg-eyebrow">الإدارة ← الموارد البشرية</span><h2>النظام المساعد HR</h2>
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
          <small>${fd(s.session_date) ? `<bdi>${fd(s.session_date)}</bdi>` : ''}${s.issued_by ? ' · ' + esc(s.issued_by) : ''} · ${all.length} توجيه${s.notes ? ' · ' + esc(s.notes) : ''}${exLine('session', s.extra)}</small></span>
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
    let extraText = '';
    extraDefs('directive').forEach((f) => {
      const v = exFmt(f, (d.extra || {})[f.k]); if (!v) return;
      if (f.type === 'text') extraText += `<p class="mg-det"><b>${esc(exLabel(f))}:</b> ${esc(v)}</p>`;
      else facts.push(`<span class="mg-fact">${icon('note')}${esc(exLabel(f))}: <b><bdi>${esc(v)}</bdi></b></span>`);
    });
    const card = el('article', 'mg-dir' + (d.pending ? ' wait' : ''));
    card.style.setProperty('--tc', col);
    card.innerHTML = `<div class="mg-dtop"><span class="mg-seal">${esc(at.label)}</span><b class="mg-dname">${esc(d.target_name)}</b><span class="mg-ttag">${esc((D.targets && D.targets[d.target_type]) || d.target_type)}</span>${d.target_title ? `<span class="mg-dtitle">— ${esc(d.target_title)}</span>` : ''}${d.pending ? `<span class="mg-pend">${icon('clock')}بانتظار الإرسال</span>` : ''}</div>
      ${facts.length ? `<div class="mg-facts">${facts.join('')}</div>` : ''}
      ${d.details ? `<p class="mg-det">${esc(d.details)}</p>` : ''}
      ${extraText}
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
    if (d.target_type === 'employee' && window.HR && HR.matchEmp) {
      const pf = el('button', 'mg-pefb', `${icon('users')}ملف PEF`); pf.type = 'button'; pf.onclick = () => openPef(d, s);
      const row = side.querySelector('.mg-dtools'); if (row) row.prepend(pf); else side.appendChild(pf);
    }
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


  /* ----- السلة: مهام أُرسلت إليك من النظام ----- */
  function drawBasket(box) {
    const BKS = BK && BK.statuses && BK.statuses.length ? BK.statuses : [{ k: 'todo', label: 'للتنفيذ' }, { k: 'in_progress', label: 'قيد التنفيذ' }, { k: 'done', label: 'منفّذ' }];
    const SC = { todo: '#8FA2B2', in_progress: '#F0A64B', done: '#4FD08B' };
    const col = (k) => SC[k] || '#5B9DFF';
    if (!BK) { box.appendChild(el('div', 'mg-empty', S.loading ? `${icon('refresh')}<b>جارٍ التحميل…</b>` : `${icon('briefcase')}<b>السلة</b><small>${S.err === 'net' ? 'لا يوجد اتصال. تحقق من الإنترنت ثم اضغط تحديث.' : 'اضغط تحديث لجلب مهامك.'}</small>`)); const rb = el('button', 'btn-gold wide', 'تحديث'); rb.onclick = () => refresh(); box.appendChild(rb); return; }
    const todo = BK.items.filter((i) => i.status !== 'done'), doneN = BK.items.length - todo.length;
    const t = today(), late = todo.filter((i) => i.due_date && i.due_date < t).length;
    const h = el('div', 'mg-hero row', `<div class="mg-hid"><span class="mg-eyebrow">مهام أُرسلت إليك</span><h2>السلة</h2><small>${todo.length} للتنفيذ${late ? ` · <b class="mg-wait">${late} متأخرة</b>` : ''} · ${doneN} منفّذة${outbox.length ? ` · <b class="mg-wait">${outbox.length} بانتظار الإرسال</b>` : ''}${BK.cachedAt ? ' · حُدّث ' + ago(BK.cachedAt) : ''}</small></div><div class="mg-hside"><button class="icon-btn mg-ref${S.loading ? ' spin' : ''}" id="bkRef" aria-label="تحديث">${icon('refresh')}</button></div>`);
    box.appendChild(h);
    h.querySelector('#bkRef').onclick = () => refresh();
    const fl = el('div', 'chips mg-bkf');
    [['todo', 'غير المنجزة (' + todo.length + ')'], ['all', 'الكل (' + BK.items.length + ')'], ['done', 'المنجزة (' + doneN + ')']].forEach(([k, n]) => { const c = el('button', 'chip sm' + (S.bkf === k ? ' on' : ''), esc(n)); c.type = 'button'; c.onclick = () => { S.bkf = k; draw(); }; fl.appendChild(c); });
    box.appendChild(fl);
    const items = BK.items.filter((i) => S.bkf === 'all' ? true : S.bkf === 'done' ? i.status === 'done' : i.status !== 'done');
    if (!items.length) { box.appendChild(el('div', 'mg-empty', `${icon('check')}<b>${S.bkf === 'done' ? 'لا مهام منفّذة بعد' : 'لا مهام معلّقة'}</b><small>تظهر هنا المهام التي يرسلها لك النظام.</small>`)); return; }
    let lastB = null;
    items.forEach((i) => {
      if (i.basket_id !== lastB) { lastB = i.basket_id; box.appendChild(el('div', 'mg-bkh', `<b>${esc(i.basket_title || 'مهام')}</b><small>${i.from ? 'من ' + esc(i.from) : ''}${i.sent_at ? ' · ' + fd(String(i.sent_at).slice(0, 10)) : ''}</small>${i.basket_note ? `<p>${esc(i.basket_note)}</p>` : ''}`)); }
      const overdue = i.due_date && i.due_date < t && i.status !== 'done';
      const c = el('article', 'mg-bk' + (i.pending ? ' wait' : '') + (i.status === 'done' ? ' done' : ''));
      c.style.setProperty('--tc', col(i.status));
      c.innerHTML = `<div class="mg-dtop"><b class="mg-dname">${esc(i.title)}</b>${i.pending ? `<span class="mg-pend">${icon('clock')}بانتظار الإرسال</span>` : ''}</div>
        <div class="mg-facts">${i.subject ? `<span class="mg-fact">${icon('users')}<b>${esc(i.subject)}</b></span>` : ''}${i.due_date ? `<span class="mg-fact${overdue ? ' over' : ''}">${icon('cal')}الاستحقاق <b><bdi>${fd(i.due_date)}</bdi></b>${overdue ? ' · متأخرة' : ''}</span>` : ''}${i.source ? `<span class="mg-fact">${esc(i.source === 'directive' ? 'من توجيه' : i.source === 'manual' ? 'يدوية' : i.source)}</span>` : ''}</div>
        ${i.details ? `<p class="mg-det">${esc(i.details)}</p>` : ''}${i.result_note ? `<p class="mg-note"><b>نتيجة التنفيذ:</b> ${esc(i.result_note)}</p>` : ''}`;
      const sw = el('div', 'mg-sw');
      BKS.forEach((st) => { const b = el('button', i.status === st.k ? 'on' : '', esc(st.label)); b.type = 'button'; b.style.setProperty('--c', col(st.k)); b.onclick = () => { if (i.status !== st.k) basketStatus(i, st.k); }; sw.appendChild(b); });
      c.appendChild(sw); box.appendChild(c);
    });
  }
  // «منفّذ» تطلب ملاحظة نتيجة اختيارية، وغيرها مباشرة
  function basketStatus(i, status) {
    const go = async (note) => {
      const prev = i.status; i.status = status; if (note) i.result_note = note; draw();
      const r = await send('basket_item_status', { id: i.id, status, result_note: note || undefined });
      if (!r.ok) { i.status = prev; toast(r.error || 'تعذّر تحديث الحالة'); draw(); return; }
      closeSheet(); toast(r.queued ? 'حُفظ على الجوال وسيُرسل عند توفر الإنترنت' : 'حُدّثت حالة المهمة'); if (!r.queued) { loadBasket().then(() => { refreshModulesBadge(); draw(); }); }
    };
    if (status !== 'done') { go(''); return; }
    sheet(`<h3 class="mg-sh">إنجاز المهمة<small>${esc(i.title)}</small></h3><form id="bkF" class="mg-form"><label class="hr-f"><span>ملاحظة النتيجة (اختياري)</span><textarea id="bkN" rows="3" placeholder="ما الذي تم؟">${esc(i.result_note || '')}</textarea></label><button class="btn-gold" type="submit" id="bkGo">تأكيد الإنجاز</button></form>`);
    $('bkF').onsubmit = (e) => { e.preventDefault(); $('bkGo').disabled = true; go($('bkN').value.trim()); };
  }
  async function refreshModulesBadge() { const rm = await call('GET', 'a=modules'); if (rm.ok && rm.data && Array.isArray(rm.data.modules)) { M = rm.data.modules; putFile('mgmt_modules', M); } }


  /* ---------- الحقول الإضافية: تُقرأ من مخطط الخادم، فيظهر أي عمود جديد دون تحديث التطبيق ---------- */
  const extraDefs = (kind) => ((D && D.schema && D.schema[kind]) || []).filter((f) => f.extra);
  const exLabel = (f) => f.label || f.k;
  const exFmt = (f, v) => v == null || v === '' ? '' : f.type === 'date' ? fd(String(v).slice(0, 10)) : f.type === 'datetime' ? fd(String(v).slice(0, 10)) + ' ' + String(v).slice(11, 16) : f.type === 'number' ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 }) : String(v);
  function exInputs(kind, vals) {
    const defs = extraDefs(kind); if (!defs.length) return '';
    vals = vals || {};
    return `<div class="hr-sl2">حقول إضافية</div>` + defs.map((f) => {
      const v = vals[f.k] == null ? '' : String(vals[f.k]);
      const id = 'ex_' + kind + '_' + f.k;
      if (f.type === 'text') return `<label class="hr-f"><span>${esc(exLabel(f))}</span><textarea id="${esc(id)}" rows="2">${esc(v)}</textarea></label>`;
      const t = f.type === 'date' ? 'date' : f.type === 'int' || f.type === 'number' ? 'number' : 'text';
      return `<label class="hr-f"><span>${esc(exLabel(f))}</span><input id="${esc(id)}" type="${t}"${t === 'number' ? ' step="any" inputmode="decimal"' : ''} value="${esc(f.type === 'date' ? v.slice(0, 10) : v)}"></label>`;
    }).join('');
  }
  function exCollect(kind) {
    const o = {};
    extraDefs(kind).forEach((f) => { const e = $('ex_' + kind + '_' + f.k); if (e) o[f.k] = e.value.trim(); });
    return o;
  }
  // سطر مختصر لقيم الجلسة الإضافية في رأس البطاقة
  function exLine(kind, vals) {
    return extraDefs(kind).map((f) => { const v = exFmt(f, (vals || {})[f.k]); return v ? ` · ${esc(exLabel(f))}: ${esc(v)}` : ''; }).join('');
  }


  /* ----- ربط التوجيه بملف الموظف في منصة PEF ----- */
  const PST = { present: ['حاضر', 'ok'], late: ['متأخر', 'warn'], absent: ['بلا تسجيل', 'bad'], leave: ['إجازة / مهمة', 'info'], off: ['عطلة', 'mute'], noin: ['بلا دخول', 'warn'] };
  const sysEmp = (d) => { const e = d.employee_id && D.employees ? D.employees.find((x) => x.id === d.employee_id) : null; return { id: d.employee_id || 't:' + d.target_name, name: e ? e.name : d.target_name, nid: e && e.nid ? e.nid : null }; };
  function openPef(d, s) {
    if (!window.HR || !HR.hasSession()) { toast('سجّل الدخول لمنصة PEF من قسم الموارد البشرية أولاً'); return; }
    if (!HR.employees().length) { toast('لم تُزامَن بيانات PEF بعد: افتح الموارد البشرية واضغط مزامنة'); return; }
    const q = sysEmp(d), m = HR.matchEmp(q);
    if (m.emp && m.how !== 'probable') { showPef(d, s, m); return; }
    pickPef(d, s, q, m);
  }
  // لا تطابق مؤكّد: اختيار الموظف الصحيح مرة واحدة ويُحفظ الربط
  function pickPef(d, s, q, m) {
    const all = HR.employees().filter((e) => e.active).sort((a, z) => a.name.localeCompare(z.name, 'ar'));
    const first = m.emp ? [m.emp] : m.cands;
    sheet(`<h3 class="mg-sh">ربط بملف PEF<small>${esc(q.name)}</small></h3>
      <p class="hr-omn" style="margin:0 0 8px">${m.emp ? 'تطابق مرجَّح: تأكد أنه الموظف نفسه ثم اضغط عليه لحفظ الربط.' : m.how === 'ambiguous' ? 'أكثر من موظف بهذا الاسم، اختر الصحيح.' : 'لم يُعثر على تطابق مؤكّد. اختر الموظف من منصة PEF مرة واحدة ويُحفظ الربط.'}</p>
      ${first.length ? `<div class="ag-lbl">${m.emp ? 'المرجَّح' : 'مرشّحون'}</div><div class="mg-pick" id="pfC">${first.map((e) => `<button type="button" class="mg-opt" data-id="${esc(e.id)}"><b>${esc(e.name)}</b><small>${esc([e.dept, e.pos, e.org].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>` : ''}
      <div class="ag-lbl">بحث في موظفي PEF</div><div class="search hr-search">${icon('search')}<input id="pfQ" type="search" placeholder="الاسم أو رقم الهوية" aria-label="بحث"></div><div class="mg-pick" id="pfA"></div>`);
    const link = (id) => { HR.linkEmp(q.id, id); const m2 = HR.matchEmp(q); if (m2.emp) showPef(d, s, m2); };
    const draw2 = () => {
      const v = normAr2($('pfQ').value), list = (v ? all.filter((e) => normAr2(e.name).includes(v) || String(e.nid || '').includes(v)) : []).slice(0, 25);
      $('pfA').innerHTML = list.map((e) => `<button type="button" class="mg-opt" data-id="${esc(e.id)}"><b>${esc(e.name)}</b><small>${esc([e.dept, e.pos, e.org].filter(Boolean).join(' · '))}</small></button>`).join('') || (v ? '<div class="mg-dnone">لا نتائج</div>' : '');
      $('pfA').querySelectorAll('.mg-opt').forEach((b) => b.onclick = () => link(b.dataset.id));
    };
    $('pfQ').oninput = draw2; draw2();
    document.querySelectorAll('#pfC .mg-opt').forEach((b) => b.onclick = () => link(b.dataset.id));
  }
  const normAr2 = (v) => String(v || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();

  function showPef(d, s, m) {
    const e = m.emp, t = Tracker.dayStr(), days = (n) => Math.round((new Date(n + 'T12:00:00Z') - new Date(t + 'T12:00:00Z')) / 864e5);
    const cons = HR.contracts().filter((c) => c.empId === e.id && c.end).sort((a, z) => String(z.end).localeCompare(String(a.end)));
    const con = cons.find((c) => (!c.start || c.start <= t) && c.end >= t) || cons[0];
    const asgs = HR.assignments().filter((a) => a.empId === e.id && (!a.end || a.end >= t)).sort((a, z) => String(a.end || '9').localeCompare(String(z.end || '9')));
    const rowOf = (ds) => HR.dayReport(ds).rows.find((r) => r.e.id === e.id);
    const tr = rowOf(t), wk = { present: 0, late: 0, absent: 0, leave: 0, min: 0 };
    for (let i = 0; i < 7; i++) { const ds = Tracker.addDays(t, -i), rp = HR.dayReport(ds); if (!rp.synced) continue; const r = rp.rows.find((x) => x.e.id === e.id); if (!r) continue; if (r.list.length) wk.present++; if (r.status === 'late') wk.late++; if (r.status === 'absent') wk.absent++; if (r.status === 'leave') wk.leave++; wk.min += r.workMin || 0; }
    const bal = HR.balanceOf(e.id), an = bal && bal.annual;
    const info = window.hrPhone ? window.hrPhone(e.phone) : null;
    const at = actOf(d.action_type), closed = s.status === 'closed';
    const money = (v, c) => { if (v == null || v === '') return '—'; const n = +v; return isFinite(n) ? n.toLocaleString('en', { maximumFractionDigits: 2 }) + ' ' + (c || '') : String(v); };
    const kv = (rows) => `<div class="pf-g">${rows.filter((x) => x[1] != null && x[1] !== '').map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    const how = { nid: 'مطابقة برقم الهوية', name: 'مطابقة بالاسم', manual: 'ربط يدوي محفوظ', probable: 'مطابقة مرجَّحة بالاسم' }[m.how] || '';
    sheet(`<div class="hr-ph"><span class="hr-ava big ok">${esc(String(e.name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(''))}</span><div><b>${esc(e.name)}</b><small>${esc([e.dept, e.pos].filter(Boolean).join(' · '))}</small><div class="hr-tags"><span class="hr-b info">${esc(e.org)}</span><span class="hr-b mute">${e.type === 'field' ? 'ميداني' : 'مكتبي'}</span><span class="hr-b ${e.active ? 'ok' : 'bad'}">${e.active ? 'على رأس العمل' : 'منتهية خدمته'}</span></div></div></div>
      <div class="pf-dir" style="--tc:${TONE[at.tone] || TONE.slate}"><span class="mg-seal">${esc(at.label)}</span><span>${esc(d.details || d.project || '')}</span></div>
      <div class="hr-sec"><span>العقد</span>${con ? `<small>${con.end >= t ? 'ينتهي بعد ' + days(con.end) + ' يوم' : 'منتهٍ منذ ' + (-days(con.end)) + ' يوم'}</small>` : ''}</div>
      ${con ? kv([['البداية', fd(con.start)], ['النهاية', fd(con.end)], ['الراتب', con.salary != null ? money(con.salary, con.cur) : ''], ['المسمى', esc(con.pos || '')]]) : '<div class="hr-none">لا عقد محفوظ لهذا الموظف</div>'}
      <div class="hr-sec"><span>التكليفات الجارية</span><small>${asgs.length}</small></div>
      ${asgs.length ? asgs.slice(0, 4).map((a) => `<div class="pf-r"><b>${esc(a.project || a.code || 'مشروع')}</b><small>${a.pct != null && a.pct !== '' ? esc(a.pct) + '% · ' : ''}${fd(a.start)} ← ${a.end ? fd(a.end) : '—'}</small></div>`).join('') : '<div class="hr-none">لا تكليفات جارية</div>'}
      <div class="hr-sec"><span>الحضور</span></div>
      ${kv([['اليوم', tr ? `<span class="hr-b ${(PST[tr.status] || ['', 'mute'])[1]}">${(PST[tr.status] || [tr.status])[0]}</span>${tr.firstIn ? ' ' + new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: Core.TZ }).format(new Date(tr.firstIn)) : ''}` : '—'], ['آخر 7 أيام', `حضور ${wk.present} · تأخر ${wk.late} · بلا تسجيل ${wk.absent}`], ['ساعات الأسبوع', wk.min ? Math.floor(wk.min / 60) + ':' + String(wk.min % 60).padStart(2, '0') + ' س' : '']])}
      <div class="hr-sec"><span>الأرصدة</span></div>
      ${an ? kv([['السنوية', (an.rem != null ? Number(an.rem).toLocaleString('en', { maximumFractionDigits: 2 }) : '—') + ' يوم'], ['المرضية', bal.sickFull && bal.sickFull.rem != null ? Number(bal.sickFull.rem).toLocaleString('en', { maximumFractionDigits: 2 }) + ' يوم' : '']]) : '<div class="hr-none">لم يُجلب رصيد هذا الموظف بعد (من الموارد البشرية ← التقارير ← الأرصدة)</div>'}
      <div class="hr-sec"><span>تنفيذ التوجيه</span><small>${esc(how)}</small></div>
      <div class="pf-act">
        ${info && info.dial ? `<button type="button" id="pfCall">${icon('phone')}اتصال</button>` : ''}${info && info.wa && info.wa.length ? `<button type="button" id="pfWa">${icon('chat')}واتساب</button>` : ''}<button type="button" id="pfMsg">${icon('note')}راسل</button><button type="button" id="pfFull">${icon('users')}الملف الكامل</button>
      </div>
      ${canEdit() && !closed ? `<div class="pf-st">${D.statuses.map((st) => `<button type="button" class="${d.status === st.k ? 'on' : ''}" data-s="${esc(st.k)}" style="--c:${(STC[st.k] || [0, '#8FA2B2'])[1]}">${esc(st.label)}</button>`).join('')}</div>` : `<p class="hr-omn">حالة التوجيه: ${esc((STC[d.status] || [d.status])[0])}</p>`}
      <button class="btn-outline wide" id="pfUn" type="button">تغيير الربط</button>`);
    if ($('pfCall')) $('pfCall').onclick = () => window.hrDial(info.dial);
    if ($('pfWa')) $('pfWa').onclick = () => window.hrWaOpen(e.id, e.name, e.phone, '');
    $('pfMsg').onclick = () => { closeSheet(); setTimeout(() => window.hrCompose([{ empId: e.id }], at.endOnly ? 'assignment' : 'free'), 250); };
    $('pfFull').onclick = () => { closeSheet(); App.go('hr'); setTimeout(() => window.hrOpenEmp(e.id), 350); };
    $('pfUn').onclick = () => { HR.linkEmp(sysEmp(d).id, null); pickPef(d, s, sysEmp(d), { emp: null, cands: HR.matchEmp(Object.assign({}, sysEmp(d), { id: 'x' })).cands || [] }); };
    document.querySelectorAll('.pf-st button').forEach((b) => b.onclick = () => { if (d.status !== b.dataset.s) { setStatus(d, b.dataset.s); closeSheet(); } });
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
        ${exInputs('session', s && s.extra)}
        <div class="hr-err" id="msErr" hidden></div>
        <button class="btn-gold" type="submit" id="msGo">${s ? 'حفظ التعديلات' : 'إنشاء الجلسة'}</button></form>`);
    $('mgSF').onsubmit = async (e) => {
      e.preventDefault(); const b = $('msGo'); b.disabled = true;
      const r = await send('session_save', { id: s ? s.id : 0, title: $('msT').value.trim(), session_date: $('msD').value, issued_by: $('msB').value.trim(), notes: $('msN').value.trim(), extra: exCollect('session') });
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
        ${exInputs('directive', d && d.extra)}
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
        start_date: eo ? '' : $('mdSD').value, end_date: $('mdED').value, project: $('mdPJ').value.trim(), details: $('mdDT').value.trim(), scale_row_id: F.row, scale_step: F.step, extra: exCollect('directive'), __t: Date.now() };
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
