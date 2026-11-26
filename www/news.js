// الأخبار: منشورات قناة تيليجرام العامة عبر معاينة الويب t.me/s/<القناة> — تُحفظ محلياً (IndexedDB) وتُحدَّث وتُعرض مع الصور.
(function () {
  const { $, store, toast, go, B } = App;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const TZ = (window.Core && Core.TZ) || 'Asia/Hebron';
  const tFmt = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const dFmt = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
  let chan = store.get('newsChan', 'hamza20300'), notify = store.get('newsNotify', false), busy = false, posts = [], info = store.get('newsInfo_' + chan, {}), q = '';
  const DEFAULT = 'hamza20300';

  /* ---------- التخزين: IndexedDB (بديل: الذاكرة) ---------- */
  const mem = {};
  const dbp = new Promise((res) => { try { const r = indexedDB.open('news', 1); r.onupgradeneeded = () => { r.result.createObjectStore('posts', { keyPath: 'k' }); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } });
  async function savePosts(list) {
    const db = await dbp; if (!db) { list.forEach((p) => { mem[p.k] = p; }); return; }
    await new Promise((res) => { const tx = db.transaction('posts', 'readwrite'), os = tx.objectStore('posts'); list.forEach((p) => os.put(p)); tx.oncomplete = res; tx.onerror = res; });
  }
  async function loadPosts() {
    const db = await dbp; let all;
    if (!db) all = Object.values(mem); else all = await new Promise((res) => { const r = db.transaction('posts').objectStore('posts').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
    return all.filter((p) => p.chan === chan).sort((a, b) => b.id - a.id);
  }
  const imgMap = () => store.get('newsImgs', {});

  /* ---------- الجلب ---------- */
  const pending = {};
  window.onNewsGet = (id, ok, body) => { const p = pending[id]; if (p) { delete pending[id]; p({ ok, body }); } };
  window.onNewsImg = (id, ok, path) => { const p = pending[id]; if (p) { delete pending[id]; p({ ok, path }); } };
  const bridge = (fn, url) => new Promise((resolve) => {
    if (!(B && B[fn])) { resolve({ ok: false, body: 'الأخبار تعمل داخل تطبيق الأندرويد' }); return; }
    const id = 'n' + Date.now() + Math.random().toString(36).slice(2, 5); pending[id] = resolve;
    setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({ ok: false, body: 'انتهت المهلة' }); } }, 60000);
    B[fn](id, url);
  });
  const pageUrl = (before) => `https://t.me/s/${chan}${before ? '?before=' + before : ''}`;

  /* ---------- التحليل ---------- */
  function safeHtml(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += esc(n.nodeValue);
      else if (n.nodeType === 1) {
        const t = n.tagName.toLowerCase();
        if (['script', 'style', 'iframe', 'object', 'noscript'].includes(t)) return;
        if (t === 'br') out += '<br>';
        else if (t === 'i' && n.classList.contains('emoji')) out += esc(n.textContent);
        else if (t === 'a') { const h = n.getAttribute('href') || ''; const abs = /^https?:/i.test(h) ? h : (/^\//.test(h) ? 'https://t.me' + h : ''); out += abs ? `<a href="${esc(abs)}" data-x="1">${safeHtml(n)}</a>` : safeHtml(n); }
        else if (['b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre'].includes(t)) out += `<${t}>${safeHtml(n)}</${t}>`;
        else out += safeHtml(n);
      }
    });
    return out;
  }
  const bgUrl = (n) => { const m = /url\(['"]?([^'")]+)['"]?\)/.exec((n && n.getAttribute('style')) || ''); return m ? m[1].replace(/&amp;/g, '&') : ''; };
  function parsePage(html) {
    const d = new DOMParser().parseFromString(html, 'text/html'), out = { posts: [], title: '', desc: '', before: 0, photo: '' };
    out.title = ((d.querySelector('.tgme_channel_info_header_title') || d.querySelector('.tgme_header_title') || {}).textContent || '').trim();
    out.desc = ((d.querySelector('.tgme_channel_info_description') || {}).textContent || '').trim();
    const ph = d.querySelector('.tgme_page_photo_image img, .tgme_channel_info_header .tgme_page_photo_image img'); out.photo = ph ? ph.getAttribute('src') : '';
    const more = d.querySelector('a.tme_messages_more[data-before]'); if (more) out.before = +more.getAttribute('data-before');
    d.querySelectorAll('.tgme_widget_message[data-post]').forEach((m) => {
      const dp = m.getAttribute('data-post') || '', id = +dp.split('/').pop(); if (!id) return;
      const tx = m.querySelector('.tgme_widget_message_text'), time = m.querySelector('.tgme_widget_message_date time'), ts = time ? Date.parse(time.getAttribute('datetime')) : 0;
      const photos = [...m.querySelectorAll('a.tgme_widget_message_photo_wrap')].map(bgUrl).filter(Boolean);
      const vt = m.querySelector('.tgme_widget_message_video_thumb, .tgme_widget_message_roundvideo_thumb'), vd = m.querySelector('.message_video_duration');
      const doc = m.querySelector('.tgme_widget_message_document_title'), lp = m.querySelector('a.tgme_widget_message_link_preview');
      const fw = m.querySelector('.tgme_widget_message_forwarded_from_name'), views = m.querySelector('.tgme_widget_message_views');
      out.posts.push({
        k: chan + '/' + id, chan, id, ts, html: tx ? safeHtml(tx) : '', text: tx ? tx.textContent.trim() : '', photos,
        video: vt ? { thumb: bgUrl(vt), dur: vd ? vd.textContent.trim() : '' } : null, doc: doc ? { title: doc.textContent.trim(), extra: ((m.querySelector('.tgme_widget_message_document_extra') || {}).textContent || '').trim() } : null,
        link: lp ? { url: lp.getAttribute('href') || '', title: ((lp.querySelector('.link_preview_title') || {}).textContent || '').trim(), desc: ((lp.querySelector('.link_preview_description') || {}).textContent || '').trim(), site: ((lp.querySelector('.link_preview_site_name') || {}).textContent || '').trim(), img: bgUrl(lp.querySelector('.link_preview_image, .link_preview_right_image')) } : null,
        fwd: fw ? fw.textContent.trim() : '', views: views ? views.textContent.trim() : '', url: `https://t.me/${chan}/${id}`
      });
    });
    return out;
  }

  /* ---------- مزامنة ---------- */
  async function fetchPage(before) {
    const r = await bridge('newsGet', pageUrl(before));
    if (!r.ok) throw new Error(r.body);
    if (!/tgme_widget_message/.test(r.body)) throw new Error('لا توجد منشورات: القناة غير عامة أو لا تدعم المعاينة (t.me/s)');
    return parsePage(r.body);
  }
  async function refresh(silent) {
    if (busy) return; busy = true; $('nwRefresh').classList.add('spin');
    try {
      const pg = await fetchPage(0);
      if (pg.title) { info = { title: pg.title, desc: pg.desc, photo: pg.photo }; store.set('newsInfo_' + chan, info); }
      await savePosts(pg.posts); store.set('newsAt_' + chan, Date.now());
      if (pg.posts.length && B && B.newsMark) B.newsMark(Math.max(...pg.posts.map((p) => p.id)));
      posts = await loadPosts(); draw(); cacheImages(posts.slice(0, 40));
      if (!silent) toast('تم تحديث الأخبار');
    } catch (e) { toast('✗ ' + e.message); $('nwMsg').textContent = e.message; }
    busy = false; $('nwRefresh').classList.remove('spin');
  }
  async function older(all) {
    if (busy) return; busy = true; const cancelFlag = { stop: false }; let pages = 0, added = 0;
    try {
      do {
        const oldest = posts.length ? posts[posts.length - 1].id : 0; if (!oldest) break;
        $('nwMsg').textContent = all ? `جارٍ حفظ الأرشيف… ${posts.length} منشور (اضغط «تحديث» للإيقاف)` : 'جارٍ تحميل الأقدم…';
        const pg = await fetchPage(oldest); await savePosts(pg.posts); added += pg.posts.length; posts = await loadPosts(); draw(); pages++;
        if (!pg.posts.length || !pg.before) { store.set('newsDone_' + chan, true); break; }
        if (all) await new Promise((r) => setTimeout(r, 700));
      } while (all && pages < 150 && !cancelFlag.stop && busy);
      $('nwMsg').textContent = added ? `تمت إضافة ${added} منشوراً` : 'لا يوجد أقدم';
    } catch (e) { toast('✗ ' + e.message); $('nwMsg').textContent = e.message; }
    busy = false; drawMore(); cacheImages(posts.slice(0, 60));
  }
  // تنزيل الصور محلياً (3 بالتوازي) لتظهر دون إنترنت
  let imgBusy = false;
  async function cacheImages(list) {
    if (imgBusy || !(B && B.newsImg)) return; imgBusy = true;
    const map = imgMap(), urls = [];
    list.forEach((p) => [...p.photos, p.video && p.video.thumb, p.link && p.link.img].filter(Boolean).forEach((u) => { if (!map[u] && !urls.includes(u)) urls.push(u); }));
    let i = 0;
    const worker = async () => { while (i < urls.length) { const u = urls[i++]; const r = await bridge('newsImg', u); if (r.ok && r.path) { map[u] = r.path; } } };
    await Promise.all([worker(), worker(), worker()]);
    store.set('newsImgs', map); imgBusy = false; if (urls.length) draw();
  }
  const imgSrc = (u) => { const p = imgMap()[u]; return p ? 'file://' + p : u; };

  /* ---------- العرض ---------- */
  function draw() {
    const box = $('nwList'); box.innerHTML = '';
    const l = q ? posts.filter((p) => (p.text + ' ' + (p.link ? p.link.title : '')).includes(q)) : posts;
    const at = store.get('newsAt_' + chan, 0);
    $('nwSub').textContent = `${posts.length} منشور محفوظ${at ? ' · آخر تحديث ' + tFmt.format(new Date(at)) : ''}`;
    $('nwHead').innerHTML = info.title ? `<div class="nw-ch">${info.photo ? `<img src="${esc(imgSrc(info.photo))}" alt="">` : '<span>📰</span>'}<div><b>${esc(info.title)}</b><small>${esc((info.desc || '').slice(0, 140))}</small></div></div>` : '';
    if (!l.length) { box.innerHTML = `<div class="mail-empty"><div style="font-size:2rem">📰</div><b>${busy ? 'جارٍ التحميل…' : q ? 'لا نتائج' : 'لا توجد منشورات محفوظة بعد'}</b></div>`; drawMore(); return; }
    let lastDay = '';
    l.forEach((p) => {
      const dk = p.ts ? dayKey(p.ts) : '';
      if (dk !== lastDay) { lastDay = dk; box.appendChild(el('div', 'nw-day', p.ts ? dFmt.format(new Date(p.ts)) : '')); }
      const c = el('div', 'nw-post');
      const imgs = p.photos.map((u) => `<img class="nw-img" src="${esc(imgSrc(u))}" loading="lazy" alt="" onerror="this.style.display='none'">`).join('');
      const vid = p.video ? `<div class="nw-vid">${p.video.thumb ? `<img class="nw-img" src="${esc(imgSrc(p.video.thumb))}" alt="">` : ''}<span>▶ ${esc(p.video.dur)}</span></div>` : '';
      const doc = p.doc ? `<div class="nw-doc">📄 <b>${esc(p.doc.title)}</b> <small>${esc(p.doc.extra)}</small></div>` : '';
      const lp = p.link && (p.link.title || p.link.desc) ? `<a class="nw-lp" data-x="${esc(p.link.url)}">${p.link.img ? `<img src="${esc(imgSrc(p.link.img))}" alt="">` : ''}<div><small>${esc(p.link.site)}</small><b>${esc(p.link.title)}</b><span>${esc((p.link.desc || '').slice(0, 140))}</span></div></a>` : '';
      c.innerHTML = `${p.fwd ? `<small class="nw-fw">↪ من ${esc(p.fwd)}</small>` : ''}${imgs}${vid}${doc}<div class="nw-tx" dir="auto">${p.html || ''}</div>${lp}
        <div class="nw-ft"><small>${p.ts ? tFmt.format(new Date(p.ts)) : ''}${p.views ? ' · 👁 ' + esc(p.views) : ''}</small><span><button data-a="share">مشاركة</button><button data-a="open">فتح في تيليجرام</button></span></div>`;
      c.querySelectorAll('a[data-x]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); const h = a.getAttribute('href') || a.getAttribute('data-x'); if (h && B && B.openExternal) B.openExternal(h); }; });
      c.querySelector('[data-a=open]').onclick = () => { if (B && B.openExternal) B.openExternal(p.url); };
      c.querySelector('[data-a=share]').onclick = () => { const t = (p.text || '') + '\n' + p.url; if (B && B.share) B.share(t); else if (navigator.share) navigator.share({ text: t }); else if (navigator.clipboard) { navigator.clipboard.writeText(t); toast('تم النسخ'); } };
      box.appendChild(c);
    });
    drawMore();
  }
  function drawMore() { $('nwMoreRow').hidden = !posts.length || !!q || !!store.get('newsDone_' + chan, false); $('nwBarTxt'); }

  /* ---------- الإعدادات ---------- */
  function settings() {
    const ov = el('div', 'mail-pick', `<div class="md-scrim"></div><div class="md-box" style="gap:10px"><div class="md-h"><b>إعدادات الأخبار</b></div>
      <small class="hr3-none">اسم القناة العامة (من الرابط t.me/<b>اسم القناة</b>)</small><input id="nwChan" class="hr-in" dir="ltr" value="${esc(chan)}" autocomplete="off">
      <label class="ag-check hr-rem"><input id="nwNot" type="checkbox"${notify ? ' checked' : ''}> إشعار منبثق عند نشر منشور جديد (فحص كل 30 دقيقة)</label>
      <button id="nwSave" class="btn-gold wide" type="button">حفظ</button><button id="nwClr" class="btn-outline wide" type="button">حذف المنشورات المحفوظة والصور</button></div>`);
    document.body.appendChild(ov); ov.querySelector('.md-scrim').onclick = () => ov.remove();
    ov.querySelector('#nwSave').onclick = () => {
      const c = ov.querySelector('#nwChan').value.trim().replace(/^.*t\.me\/(s\/)?/i, '').replace(/[^A-Za-z0-9_]/g, '');
      if (!/^[A-Za-z0-9_]{4,40}$/.test(c)) { toast('اسم القناة غير صالح'); return; }
      const changed = c !== chan; chan = c; notify = ov.querySelector('#nwNot').checked; store.set('newsChan', chan); store.set('newsNotify', notify); if (B && B.newsConfig) B.newsConfig(chan, notify);
      info = store.get('newsInfo_' + chan, {}); ov.remove(); toast('تم الحفظ'); if (changed) { posts = []; draw(); } enter(true);
    };
    ov.querySelector('#nwClr').onclick = async () => { if (!confirm('حذف كل المنشورات المحفوظة لهذه القناة؟')) return; const db = await dbp; if (db) { const all = await loadPosts(); await new Promise((res) => { const tx = db.transaction('posts', 'readwrite'); all.forEach((p) => tx.objectStore('posts').delete(p.k)); tx.oncomplete = res; tx.onerror = res; }); } Object.keys(mem).forEach((k) => { if (mem[k].chan === chan) delete mem[k]; }); store.set('newsDone_' + chan, false); posts = []; draw(); ov.remove(); toast('تم الحذف'); };
  }

  async function enter(force) {
    if (!posts.length || force) posts = await loadPosts();
    draw();
    const at = store.get('newsAt_' + chan, 0);
    if (force || !at || Date.now() - at > 3 * 60e3) refresh(true);
  }
  App.screens.news = () => enter(false);
  $('newsBar').onclick = () => go('news'); $('hubNews') && ($('hubNews').onclick = () => go('news'));
  $('nwRefresh').onclick = () => { if (busy) { busy = false; return; } refresh(false); };
  $('nwOlder').onclick = () => older(false); $('nwAll').onclick = () => { if (confirm('سيُحمَّل كل أرشيف القناة تدريجياً (قد يستغرق دقائق). متابعة؟')) older(true); };
  $('nwSet').onclick = settings;
  $('nwSearchB').onclick = () => { const r = $('nwSearchRow'); r.hidden = !r.hidden; if (!r.hidden) $('nwQ').focus(); else { q = ''; $('nwQ').value = ''; draw(); } };
  $('nwQ').oninput = () => { q = $('nwQ').value.trim(); draw(); };
  window.newsParse = parsePage;   // للاختبار
  // فعّل الإشعار الدوري المحفوظ عند بدء التطبيق
  if (B && B.newsConfig && notify) B.newsConfig(chan, true);
  loadPosts().then((l) => { if (l.length && $('newsBarTxt')) $('newsBarTxt').textContent = l.length + ' منشور محفوظ'; });
})();
