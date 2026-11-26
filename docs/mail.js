// البريد الإلكتروني داخل التطبيق (محاكاة Outlook): مجلدات، قائمة وبحث وفلاتر، قراءة، رد/رد على الكل/توجيه، إنشاء بمرفقات، حذف/نقل/أعلام، مسودات.
(function () {
  const { $, store, toast, go, B } = App;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const TZ = (window.Core && Core.TZ) || 'Asia/Hebron';
  const dFmt = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, day: 'numeric', month: 'numeric' }), tFmt = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const fullFmt = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
  const shortDate = (t) => (!t ? '' : dayKey(t) === dayKey(Date.now()) ? tFmt.format(new Date(t)) : dFmt.format(new Date(t)));
  const initial = (n) => (String(n || '?').replace(/[<>"]/g, '').trim()[0] || '?').toUpperCase();
  const colorOf = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 45% 45%)`; };
  const ICONS = { inbox: '📥', sent: '📤', drafts: '📝', trash: '🗑', junk: '🚫', archive: '🗃', '': '📁' };
  const ROLE_AR = { inbox: 'الوارد', sent: 'المرسلة', drafts: 'المسودات', trash: 'المحذوفة', junk: 'البريد العشوائي', archive: 'الأرشيف' };

  /* ---------- جسر العمليات ---------- */
  const pending = {};
  window.onMailOp = (id, res) => { const p = pending[id]; if (!p) return; delete pending[id]; try { p(JSON.parse(res)); } catch (e) { p({ ok: false, err: 'رد غير صالح' }); } };
  const op = (o) => new Promise((resolve) => {
    if (!(B && B.mailOp)) { resolve({ ok: false, err: 'البريد يعمل داخل تطبيق الأندرويد فقط' }); return; }
    const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6); pending[id] = resolve;
    setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({ ok: false, err: 'انتهت مهلة الاتصال بالخادم' }); } }, 90000);
    B.mailOp(id, JSON.stringify(o));
  });
  const cfg = () => { try { return JSON.parse((B && B.mailGet ? B.mailGet() : localStorage.getItem('hrMailCfg')) || '{}'); } catch (e) { return {}; } };

  /* ---------- الحالة ---------- */
  let folders = [], cur = store.get('mailFolder', 'INBOX'), items = [], total = 0, offset = 0, loading = false, filter = 'all', query = '', sel = new Set();
  const PAGE = 30;
  const roleF = (r) => folders.find((f) => f.role === r);
  const curF = () => folders.find((f) => f.name === cur) || { name: cur, disp: cur, role: cur === 'INBOX' ? 'inbox' : '' };
  const nameOf = (f) => ROLE_AR[f.role] || f.disp;
  const cacheKey = () => 'mailC_' + cur;

  function configured() { const c = cfg(); return !!(c.user && c.imapHost && c.hasPass); }
  function needSetup() {
    $('mlList').innerHTML = `<div class="mail-empty"><div style="font-size:2.4rem">✉️</div><b>اضبط حساب البريد أولاً</b><small>أدخل البريد وكلمة المرور وخوادم الوارد والصادر (قالب Mynet جاهز).</small><button type="button" class="btn-gold" id="mlGoSet">إعدادات الحساب</button></div>`;
    $('mlGoSet').onclick = () => window.openMailSettings && window.openMailSettings(null);
    $('mlMore').hidden = true; $('mlTitle').textContent = 'البريد'; $('mlSub').textContent = '';
  }

  /* ---------- المجلدات ---------- */
  async function loadFolders() {
    const r = await op({ op: 'folders' });
    if (r.ok) { folders = r.folders; store.set('mailFoldersC', folders); drawFolders(); head(); }
    else if (!folders.length) folders = store.get('mailFoldersC', []);
    return r;
  }
  function drawFolders() {
    const box = $('mlFolders'); box.innerHTML = '';
    const order = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'];
    const sorted = folders.slice().sort((a, b) => { const x = order.indexOf(a.role), y = order.indexOf(b.role); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.disp.localeCompare(b.disp, 'ar'); });
    sorted.forEach((f) => {
      const b = el('button', 'md-f' + (f.name === cur ? ' on' : ''), `<span>${ICONS[f.role] || ICONS['']}</span><b>${esc(nameOf(f))}</b>${f.unseen ? `<em>${f.unseen}</em>` : ''}`);
      b.type = 'button'; b.onclick = () => { cur = f.name; store.set('mailFolder', cur); $('mlDrawer').hidden = true; sel.clear(); query = ''; $('mlQ').value = ''; filter = 'all'; syncChips(); load(true); };
      box.appendChild(b);
      if (f.role === 'trash' || f.role === 'junk') { const e = el('button', 'md-empty', 'إفراغ ' + nameOf(f)); e.type = 'button'; e.onclick = async () => { if (!confirm('حذف كل رسائل ' + nameOf(f) + ' نهائياً؟')) return; toast('جارٍ الإفراغ…'); const r = await op({ op: 'empty', folder: f.name }); toast(r.ok ? 'تم الإفراغ' : r.err); loadFolders(); if (f.name === cur) load(true); }; box.appendChild(e); }
    });
  }
  function head() {
    const f = curF(); $('mlTitle').textContent = nameOf(f); $('mlSub').textContent = f.unseen ? f.unseen + ' غير مقروءة' : (total ? total + ' رسالة' : '');
  }
  $('mlMenu').onclick = () => { $('mlDrawer').hidden = false; drawFolders(); };
  $('mlDrawer').querySelectorAll('[data-close]').forEach((x) => { x.onclick = () => { $('mlDrawer').hidden = true; }; });
  $('mlNewFolder').onclick = async () => { const n = (prompt('اسم المجلد الجديد') || '').trim(); if (!n) return; const r = await op({ op: 'create', name: n }); toast(r.ok ? 'تم إنشاء المجلد' : r.err); if (r.ok) loadFolders(); };

  /* ---------- قائمة الرسائل ---------- */
  const visible = () => items.filter((m) => (filter === 'flag' ? m.flag : filter === 'att' ? m.att : true));
  function drawList() {
    const box = $('mlList'); box.innerHTML = '';
    const l = visible();
    if (!l.length) { box.innerHTML = `<div class="mail-empty"><div style="font-size:2rem">📭</div><b>${loading ? 'جارٍ التحميل…' : query ? 'لا نتائج للبحث' : 'لا توجد رسائل'}</b></div>`; }
    const sentLike = ['sent', 'drafts'].includes(curF().role);
    l.forEach((m) => {
      const who = sentLike ? ('إلى: ' + (m.to || '').replace(/<[^>]*>/g, '').trim()) : m.from;
      const row = el('div', 'mail-row' + (m.seen ? '' : ' unread') + (sel.has(m.uid) ? ' sel' : ''), `<span class="mail-av" style="background:${colorOf(m.fromAddr || m.from)}">${sel.has(m.uid) ? '✓' : esc(initial(m.from))}</span>
        <div class="mail-mid"><div class="mail-l1"><b>${esc(who)}</b><small>${esc(shortDate(m.ts))}</small></div><div class="mail-l2">${m.answered ? '↩ ' : ''}${esc(m.subject || '(بلا موضوع)')}</div></div>
        <div class="mail-ic">${m.flag ? '<span class="fl">⚑</span>' : ''}${m.att ? '<span>📎</span>' : ''}</div>`);
      let timer = null, long = false;
      row.addEventListener('touchstart', () => { long = false; timer = setTimeout(() => { long = true; toggleSel(m.uid); }, 450); }, { passive: true });
      row.addEventListener('touchend', () => clearTimeout(timer)); row.addEventListener('touchmove', () => clearTimeout(timer), { passive: true });
      row.querySelector('.mail-av').onclick = (ev) => { ev.stopPropagation(); toggleSel(m.uid); };
      row.onclick = () => { if (long) { long = false; return; } if (sel.size) toggleSel(m.uid); else openMsg(m); };
      box.appendChild(row);
    });
    $('mlMore').hidden = !(items.length < total && !query && filter === 'all') && !(query && items.length < total);
    drawSel(); head();
  }
  function toggleSel(uid) { if (sel.has(uid)) sel.delete(uid); else sel.add(uid); drawList(); }
  function drawSel() {
    const bar = $('mlSel'); bar.hidden = !sel.size; if (!sel.size) return;
    const f = curF(), trash = f.role === 'trash';
    bar.innerHTML = `<b>${sel.size} محدد</b><button data-a="del">🗑 ${trash ? 'حذف نهائي' : 'حذف'}</button><button data-a="read">✔ مقروءة</button><button data-a="unread">● غير مقروءة</button><button data-a="flag">⚑ مهمة</button><button data-a="move">📁 نقل</button><button data-a="all">الكل</button><button data-a="x">✕</button>`;
    bar.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => bulk(b.dataset.a); });
  }
  async function bulk(a) {
    const uids = [...sel];
    if (a === 'x') { sel.clear(); drawList(); return; }
    if (a === 'all') { visible().forEach((m) => sel.add(m.uid)); drawList(); return; }
    if (a === 'move') { const d = await pickFolder(); if (!d) return; await run(await op({ op: 'move', folder: cur, uids, dest: d }), 'تم النقل'); return; }
    if (a === 'del') { if (curF().role === 'trash' && !confirm('حذف نهائي؟')) return; await run(await op({ op: 'delete', folder: cur, uids, trash: (roleF('trash') || {}).name || '', permanent: curF().role === 'trash' }), 'تم الحذف'); return; }
    const m = { read: ['\\Seen', true], unread: ['\\Seen', false], flag: ['\\Flagged', true] }[a];
    uids.forEach((u) => { const it = items.find((x) => x.uid === u); if (it) { if (a === 'flag') it.flag = true; else it.seen = a === 'read'; } });
    sel.clear(); drawList(); const r = await op({ op: 'flag', folder: cur, uids, add: m[1], flag: m[0] }); if (!r.ok) toast(r.err); loadFolders();
  }
  async function run(r, okMsg) { if (r.ok) { toast(okMsg); sel.clear(); await load(true); loadFolders(); } else toast('✗ ' + r.err); }
  function pickFolder() {
    return new Promise((resolve) => {
      const ov = el('div', 'mail-pick', `<div class="md-scrim"></div><div class="md-box"><div class="md-h"><b>نقل إلى</b></div><div id="mpL"></div></div>`); document.body.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); };
      ov.querySelector('.md-scrim').onclick = () => done(null);
      folders.filter((f) => f.name !== cur).forEach((f) => { const b = el('button', 'md-f', `<span>${ICONS[f.role] || ICONS['']}</span><b>${esc(nameOf(f))}</b>`); b.type = 'button'; b.onclick = () => done(f.name); ov.querySelector('#mpL').appendChild(b); });
    });
  }

  async function load(reset) {
    if (!configured()) { needSetup(); return; }
    if (loading) return; loading = true;
    if (reset) { offset = 0; const c = store.get(cacheKey(), null); if (c && !query) { items = c.items; total = c.total; } else { items = []; total = 0; } drawList(); }
    $('mlRefresh').classList.add('spin');
    if (!folders.length) { folders = store.get('mailFoldersC', []); }
    const r = await op({ op: 'list', folder: cur, offset, size: PAGE, q: query, unseen: filter === 'unseen' });
    $('mlRefresh').classList.remove('spin'); loading = false;
    if (!r.ok) { toast('✗ ' + r.err); drawList(); return; }
    total = r.total; items = reset || offset === 0 ? r.items : items.concat(r.items.filter((x) => !items.some((y) => y.uid === x.uid)));
    if (!query && filter === 'all' && offset === 0) store.set(cacheKey(), { items: items.slice(0, PAGE), total });
    drawList();
    if (reset && !folders.length) loadFolders();
  }
  $('mlMore').onclick = () => { offset = items.length; load(false); };
  $('mlRefresh').onclick = () => { loadFolders(); load(true); };
  $('mlSet').onclick = () => window.openMailSettings && window.openMailSettings(null);
  $('mlSearchB').onclick = () => { const r = $('mlSearchRow'); r.hidden = !r.hidden; if (!r.hidden) $('mlQ').focus(); else { query = ''; $('mlQ').value = ''; load(true); } };
  let qt; $('mlQ').oninput = () => { clearTimeout(qt); qt = setTimeout(() => { query = $('mlQ').value.trim(); load(true); }, 500); };
  const syncChips = () => $('mlChips').querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
  $('mlChips').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { filter = b.dataset.f; syncChips(); if (filter === 'unseen') load(true); else drawList(); }; });
  $('mlCompose').onclick = () => compose({});

  /* ---------- قراءة رسالة ---------- */
  const ADDR = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
  const emailsOf = (s) => (String(s || '').match(ADDR) || []);
  function htmlToText(h) { const d = new DOMParser().parseFromString(h, 'text/html'); d.querySelectorAll('script,style,head').forEach((x) => x.remove()); d.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); d.querySelectorAll('p,div,li,tr,h1,h2,h3,blockquote').forEach((b) => b.append('\n')); return (d.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim(); }
  function sanitize(html, allowImg) {
    const d = new DOMParser().parseFromString(html, 'text/html'); let blocked = 0;
    d.querySelectorAll('script,iframe,object,embed,form,meta,link,base,applet,frame,frameset,noscript').forEach((x) => x.remove());
    d.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => { const k = a.name.toLowerCase(), v = a.value.trim().toLowerCase(); if (k.startsWith('on') || (['href', 'src', 'action', 'xlink:href', 'background'].includes(k) && v.startsWith('javascript:'))) n.removeAttribute(a.name); });
      if (n.tagName === 'IMG') { const src = n.getAttribute('src') || ''; if (!/^data:/i.test(src) && !allowImg) { blocked++; n.setAttribute('data-src', src); n.removeAttribute('src'); n.removeAttribute('srcset'); n.setAttribute('alt', n.getAttribute('alt') || '[صورة محجوبة]'); } }
      const st = n.getAttribute('style'); if (st && !allowImg && /url\(/i.test(st)) n.setAttribute('style', st.replace(/url\([^)]*\)/gi, 'none'));
    });
    return { html: d.body.innerHTML, blocked };
  }
  let msg = null, msgRef = null, allowImg = false;
  async function openMsg(m) {
    const ov = $('mlRead') || (() => { const o = el('div', 'mail-read'); o.id = 'mlRead'; document.body.appendChild(o); return o; })();
    ov.hidden = false; ov.innerHTML = `<div class="mr-top"><button class="icon-btn" id="mrBack" type="button"><svg class="ic"><use href="#i-back"/></svg></button><b>جارٍ فتح الرسالة…</b></div>`;
    $('mrBack').onclick = () => { ov.hidden = true; };
    const r = await op({ op: 'get', folder: cur, uid: m.uid });
    if (!r.ok) { ov.querySelector('b').textContent = '✗ ' + r.err; return; }
    msg = r; msgRef = m; allowImg = false; renderRead(ov);
    if (!m.seen) { m.seen = true; drawList(); op({ op: 'flag', folder: cur, uids: [m.uid], add: true, flag: '\\Seen' }).then(() => loadFolders()); }
  }
  function renderRead(ov) {
    const m = msg, f = curF(), body = m.html ? sanitize(m.html, allowImg) : { html: `<div style="white-space:pre-wrap;direction:auto">${esc(m.text)}</div>`, blocked: 0 };
    const to = m.to ? `<div class="mr-meta"><small>إلى:</small> ${esc(m.to)}</div>` : '', cc = m.cc ? `<div class="mr-meta"><small>نسخة:</small> ${esc(m.cc)}</div>` : '';
    ov.innerHTML = `<div class="mr-top"><button class="icon-btn" id="mrBack" type="button"><svg class="ic"><use href="#i-back"/></svg></button><div class="mr-acts">
        <button data-a="reply" title="رد">↩</button><button data-a="replyall" title="رد على الكل">↩↩</button><button data-a="fwd" title="توجيه">➡</button><button data-a="del" title="حذف">🗑</button><button data-a="more" title="المزيد">⋯</button></div></div>
      <div class="mr-body"><h2>${esc(m.subject || '(بلا موضوع)')}</h2>
      <div class="mr-from"><span class="mail-av" style="background:${colorOf(m.from)}">${esc(initial(m.from))}</span><div><b>${esc(m.from.replace(/<[^>]*>/g, '').replace(/"/g, ''))}</b><small>${esc(emailsOf(m.from)[0] || '')}</small><small>${esc(m.ts ? fullFmt.format(new Date(m.ts)) : '')}</small></div></div>${to}${cc}
      ${m.atts.length ? `<div class="mr-atts">${m.atts.map((a) => `<button type="button" data-att="${a.idx}">📎 ${esc(a.name)} <small>${Math.max(1, Math.round(a.size / 1024))} ك.ب</small></button>`).join('')}</div>` : ''}
      ${body.blocked ? `<div class="mr-warn">تم حجب ${body.blocked} صورة خارجية لحمايتك. <button type="button" id="mrImg">عرض الصور</button></div>` : ''}
      <iframe id="mrFrame" class="mr-frame" sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe></div>`;
    $('mrBack').onclick = () => { ov.hidden = true; };
    const fr = $('mrFrame'), dark = document.documentElement.getAttribute('data-theme') !== 'eco' && document.documentElement.getAttribute('data-theme') !== 'light';
    fr.srcdoc = `<!doctype html><html dir="auto"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:6px;font:15px/1.7 sans-serif;word-break:break-word;color:${dark ? '#eee' : '#14211C'};background:transparent}img{max-width:100%;height:auto}table{max-width:100%}a{color:#4F8EF7}blockquote{margin:6px 0;padding-inline-start:10px;border-inline-start:3px solid #999}pre{white-space:pre-wrap}</style><body>${body.html}</body></html>`;
    fr.onload = () => {
      try {
        const d = fr.contentDocument; fr.style.height = Math.min(d.documentElement.scrollHeight + 8, 6000) + 'px';
        d.addEventListener('click', (ev) => { const a = ev.target.closest('a[href]'); if (!a) return; ev.preventDefault(); const h = a.getAttribute('href'); if (/^mailto:/i.test(h)) compose({ to: [h.replace(/^mailto:/i, '').split('?')[0]] }); else if (/^(https?:|tel:)/i.test(h)) { if (B && B.openExternal) B.openExternal(h); } });
      } catch (e) { /* ignore */ }
    };
    if ($('mrImg')) $('mrImg').onclick = () => { allowImg = true; renderRead(ov); };
    ov.querySelectorAll('[data-att]').forEach((b) => { b.onclick = async () => { toast('جارٍ تنزيل المرفق…'); const r = await op({ op: 'att', folder: cur, uid: m.uid, idx: +b.dataset.att }); if (!r.ok) { toast('✗ ' + r.err); return; } if (B && B.shareFile) B.shareFile(r.b64, r.name, r.type); else toast('الفتح يعمل داخل تطبيق الأندرويد'); }; });
    ov.querySelectorAll('.mr-acts [data-a]').forEach((b) => { b.onclick = () => readAct(b.dataset.a, ov); });
  }
  async function readAct(a, ov) {
    const m = msg, me = (cfg().user || '').toLowerCase();
    if (a === 'reply' || a === 'replyall') {
      const to = emailsOf(m.replyTo || m.from).slice(0, 1), cc = a === 'replyall' ? [...emailsOf(m.to), ...emailsOf(m.cc)].filter((x, i, arr) => x.toLowerCase() !== me && !to.map((t) => t.toLowerCase()).includes(x.toLowerCase()) && arr.indexOf(x) === i) : [];
      compose({ to, cc, subject: /^(re|رد)\s*:/i.test(m.subject) ? m.subject : 'رد: ' + m.subject, quote: quoteOf(m, 'reply'), inReplyTo: m.msgId, refs: ((m.refs || '') + ' ' + (m.msgId || '')).trim(), answeredUid: m.uid });
    } else if (a === 'fwd') {
      const atts = [];
      if (m.atts.length) { toast('جارٍ تجهيز المرفقات للتوجيه…'); let sz = 0; for (const t of m.atts) { const r = await op({ op: 'att', folder: cur, uid: m.uid, idx: t.idx }); if (r.ok) { sz += r.b64.length; if (sz < 11e6) atts.push({ name: r.name, type: r.type, b64: r.b64 }); } } }
      compose({ subject: /^(fwd|fw|توجيه|إعادة توجيه)\s*:/i.test(m.subject) ? m.subject : 'إعادة توجيه: ' + m.subject, quote: quoteOf(m, 'fwd'), atts });
    } else if (a === 'del') {
      if (f_isTrash() && !confirm('حذف نهائي؟')) return; ov.hidden = true;
      await run(await op({ op: 'delete', folder: cur, uids: [m.uid], trash: (roleF('trash') || {}).name || '', permanent: f_isTrash() }), 'تم الحذف');
    } else if (a === 'more') {
      const choice = await menu([['unread', '● تعليم كغير مقروءة'], [m.flag ? 'unflag' : 'flag', m.flag ? '⚑ إزالة العلامة' : '⚑ تعليم كمهمة'], ['move', '📁 نقل إلى مجلد…'], ...(roleF('junk') ? [['junk', '🚫 نقل إلى البريد العشوائي']] : []), ...(roleF('archive') ? [['archive', '🗃 أرشفة']] : []), ['print', '📄 مشاركة كنص']]);
      if (!choice) return;
      if (choice === 'unread') { await op({ op: 'flag', folder: cur, uids: [m.uid], add: false, flag: '\\Seen' }); if (msgRef) msgRef.seen = false; ov.hidden = true; drawList(); loadFolders(); toast('تم'); }
      else if (choice === 'flag' || choice === 'unflag') { await op({ op: 'flag', folder: cur, uids: [m.uid], add: choice === 'flag', flag: '\\Flagged' }); m.flag = choice === 'flag'; if (msgRef) msgRef.flag = m.flag; drawList(); toast(choice === 'flag' ? 'تم تعليمها مهمة' : 'أُزيلت العلامة'); }
      else if (choice === 'move') { const d = await pickFolder(); if (d) { ov.hidden = true; await run(await op({ op: 'move', folder: cur, uids: [m.uid], dest: d }), 'تم النقل'); } }
      else if (choice === 'junk' || choice === 'archive') { ov.hidden = true; await run(await op({ op: 'move', folder: cur, uids: [m.uid], dest: roleF(choice).name }), 'تم النقل'); }
      else if (choice === 'print') { const t = `${m.subject}\n${m.from}\n${m.ts ? fullFmt.format(new Date(m.ts)) : ''}\n\n${m.text || htmlToText(m.html || '')}`; if (B && B.share) B.share(t); else if (navigator.share) navigator.share({ text: t }); }
    }
  }
  const f_isTrash = () => curF().role === 'trash';
  function menu(opts) {
    return new Promise((resolve) => {
      const ov = el('div', 'mail-pick', `<div class="md-scrim"></div><div class="md-box"><div id="mmL"></div></div>`); document.body.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); }; ov.querySelector('.md-scrim').onclick = () => done(null);
      opts.forEach(([k, n]) => { const b = el('button', 'md-f', `<b>${n}</b>`); b.type = 'button'; b.onclick = () => done(k); ov.querySelector('#mmL').appendChild(b); });
    });
  }
  function quoteOf(m, kind) {
    const t = m.text || htmlToText(m.html || ''), when = m.ts ? fullFmt.format(new Date(m.ts)) : '', from = m.from.replace(/"/g, '');
    if (kind === 'fwd') return `\n\n---------- رسالة موجَّهة ----------\nمن: ${from}\nالتاريخ: ${when}\nالموضوع: ${m.subject}\nإلى: ${m.to}\n\n${t}`;
    return `\n\nفي ${when}، كتب ${from}:\n` + t.split('\n').map((l) => '> ' + l).join('\n');
  }

  /* ---------- إنشاء رسالة ---------- */
  const contacts = () => store.get('mailContacts', []);
  function rememberContacts(l) { const c = contacts(); l.forEach((a) => { const i = c.indexOf(a); if (i >= 0) c.splice(i, 1); c.unshift(a); }); store.set('mailContacts', c.slice(0, 60)); }
  function compose(o) {
    const ov = $('mlComp') || (() => { const x = el('div', 'mail-comp'); x.id = 'mlComp'; document.body.appendChild(x); return x; })();
    const st = { atts: (o.atts || []).slice(), dirty: false }, sig = store.get('mailSig', '');
    ov.hidden = false;
    ov.innerHTML = `<div class="mc-top"><button class="icon-btn" id="mcX" type="button">✕</button><b>${o.subject && /^(رد|re)/i.test(o.subject) ? 'رد' : 'رسالة جديدة'}</b><button id="mcSave" class="mc-b" type="button">حفظ مسودة</button><button id="mcSend" class="mc-send" type="button">إرسال ➤</button></div>
      <div class="mc-form"><datalist id="mcDl">${contacts().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <label><small>إلى</small><input id="mcTo" list="mcDl" type="email" multiple dir="ltr" autocomplete="off" value="${esc((o.to || []).join(', '))}" placeholder="name@example.org"><button type="button" id="mcCcB" class="mc-lnk">نسخة</button></label>
        <label id="mcCcR" ${o.cc && o.cc.length ? '' : 'hidden'}><small>نسخة</small><input id="mcCc" list="mcDl" dir="ltr" value="${esc((o.cc || []).join(', '))}"></label>
        <label id="mcBccR" hidden><small>مخفية</small><input id="mcBcc" list="mcDl" dir="ltr"></label>
        <label><small>الموضوع</small><input id="mcSub" value="${esc(o.subject || '')}"></label>
        <textarea id="mcBody" placeholder="اكتب رسالتك…">${esc((o.body || '') + (o.quote || '') + (sig ? '\n\n-- \n' + sig : ''))}</textarea>
        <div id="mcAtts" class="mr-atts"></div>
        <button type="button" id="mcAtt" class="btn-outline">📎 إرفاق ملف</button><small class="hr3-none">حتى 8 م.ب للملف الواحد · ${esc(cfg().user || '')}</small></div>`;
    const drawAtts = () => { $('mcAtts').innerHTML = st.atts.map((a, i) => `<button type="button" data-rm="${i}">📎 ${esc(a.name)} <small>${Math.max(1, Math.round(a.b64.length * 0.75 / 1024))} ك.ب ✕</small></button>`).join(''); $('mcAtts').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { st.atts.splice(+b.dataset.rm, 1); st.dirty = true; drawAtts(); }; }); };
    drawAtts();
    ov.querySelectorAll('input,textarea').forEach((x) => x.addEventListener('input', () => { st.dirty = true; }));
    $('mcCcB').onclick = () => { $('mcCcR').hidden = false; $('mcBccR').hidden = false; $('mcCcB').hidden = true; };
    if (o.cc && o.cc.length) { $('mcCcR').hidden = false; $('mcBccR').hidden = false; $('mcCcB').hidden = true; }
    $('mcAtt').onclick = () => {
      if (!(B && B.pickFile)) { toast('الإرفاق يعمل داخل تطبيق الأندرويد'); return; }
      const id = 'f' + Date.now();
      window.onFilePicked = (rid, name, mime, b64) => { if (rid !== id) return; if (b64 === 'TOOBIG') { toast('الملف أكبر من 8 م.ب'); return; } if (!name) return; st.atts.push({ name, type: mime, b64 }); st.dirty = true; drawAtts(); };
      B.pickFile(id);
    };
    const gather = () => ({ to: emailsOf($('mcTo').value), cc: emailsOf($('mcCc').value), bcc: emailsOf($('mcBcc').value), subject: $('mcSub').value.trim(), text: $('mcBody').value });
    const close = () => { if (st.dirty && !confirm('تجاهل هذه الرسالة؟')) return; ov.hidden = true; };
    $('mcX').onclick = close;
    $('mcSave').onclick = async () => { const g = gather(); toast('جارٍ حفظ المسودة…'); const r = await op({ op: 'draft', draftsFolder: (roleF('drafts') || {}).name || '', to: g.to, cc: g.cc, subject: g.subject, text: g.text, html: '', atts: st.atts }); toast(r.ok ? 'تم حفظ المسودة' : '✗ ' + r.err); if (r.ok) { st.dirty = false; loadFolders(); } };
    $('mcSend').onclick = async () => {
      const g = gather();
      if (!g.to.length && !g.cc.length && !g.bcc.length) { toast('أضف مستلماً واحداً على الأقل'); return; }
      if (!g.subject && !confirm('إرسال بلا موضوع؟')) return;
      $('mcSend').disabled = true; toast('جارٍ الإرسال…');
      const html = `<div dir="auto" style="white-space:pre-wrap;font-family:sans-serif">${esc(g.text)}</div>`;
      const r = await op({ op: 'send', to: g.to, cc: g.cc, bcc: g.bcc, subject: g.subject, text: g.text, html, atts: st.atts, inReplyTo: o.inReplyTo || '', refs: o.refs || '', sentFolder: (roleF('sent') || {}).name || '' });
      $('mcSend').disabled = false;
      if (!r.ok) { toast('✗ ' + r.err); return; }
      toast(r.warn ? r.warn : '✓ تم إرسال الرسالة'); rememberContacts([...g.to, ...g.cc]);
      if (o.answeredUid) op({ op: 'flag', folder: cur, uids: [o.answeredUid], add: true, flag: '\\Answered' });
      st.dirty = false; ov.hidden = true; if (curF().role === 'sent' || curF().role === 'drafts') load(true); loadFolders();
    };
    setTimeout(() => (o.to && o.to.length ? $('mcBody') : $('mcTo')).focus(), 150);
  }
  window.mailCompose = compose;

  /* ---------- الدخول للشاشة ---------- */
  function enter() { syncChips(); if (!folders.length) folders = store.get('mailFoldersC', []); load(true); if (configured()) loadFolders(); }
  App.screens.mail = () => enter();
  $('mailBar') && ($('mailBar').onclick = () => go('mail'));
  $('hubMail') && ($('hubMail').onclick = () => go('mail'));
})();
