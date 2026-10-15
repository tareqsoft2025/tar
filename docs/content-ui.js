// واجهات: الأحاديث، السيرة النبوية، المواقف والعبر
(function () {
  const { $, store, B, icon, toast, go } = App;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const H = window.HADITH, S = window.SEERAH, L = window.LESSONS;
  const dayIndex = () => { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5); };
  const CAT = { نية: 'النية والإخلاص', أخلاق: 'الأخلاق', عبادة: 'العبادات', علم: 'العلم', صدقة: 'الصدقة', مجتمع: 'الأسرة والمجتمع', حياة: 'الحياة والدنيا', ذكر: 'الذكر', دين: 'الدين', أقصى: 'المسجد الأقصى', جمعة: 'يوم الجمعة' };

  function copyText(t, okMsg) {
    if (B && B.copy) { B.copy(t); toast(okMsg || 'تم النسخ'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast(okMsg || 'تم النسخ'), () => toast('تعذر النسخ'));
    else toast('النسخ غير متاح');
  }
  function shareText(t) {
    if (B && B.share) B.share(t);
    else if (navigator.share) navigator.share({ text: t }).catch(() => {});
    else copyText(t, 'تم نسخ النص');
  }
  window.App.copyText = copyText;

  /* =============== الأحاديث =============== */
  let cat = 'الكل';
  const favs = () => store.get('hfav', []);
  const hText = (h) => `«${h.t}»\nرواه ${h.r} (${h.s})`;
  function renderCats() {
    const box = $('hCats'); box.innerHTML = '';
    const cats = ['الكل', 'المفضلة'].concat(Object.keys(CAT).filter((k) => H.some((h) => h.c === k)));
    cats.forEach((k) => {
      const label = CAT[k] || k;
      const b = el('button', 'chip' + (k === cat ? ' on' : ''), label);
      b.onclick = () => { cat = k; renderHadith(); };
      box.appendChild(b);
    });
  }
  function renderHadith(opts) {
    renderCats();
    const q = $('hSearch').value.trim();
    const f = favs();
    const box = $('hList'); box.innerHTML = '';
    let shown = 0, focusEl = null;
    H.forEach((h, i) => {
      if (cat === 'المفضلة' && !f.includes(i)) return;
      if (cat !== 'الكل' && cat !== 'المفضلة' && h.c !== cat) return;
      if (q && !(h.t + h.r + h.b).includes(q)) return;
      shown++;
      const isFav = f.includes(i);
      const d = el('div', 'hd', `<div class="ht"></div><div class="hr">رواه ${h.r} · ${h.s}</div><div class="hb">${h.b}</div>`);
      d.querySelector('.ht').textContent = h.t;
      const act = el('div', 'hact');
      const fav = el('button', 'fav' + (isFav ? ' on' : ''), `${icon('heart')}<span>${isFav ? 'في المفضلة' : 'حفظ'}</span>`);
      fav.onclick = () => { const l = favs(); const j = l.indexOf(i); if (j >= 0) l.splice(j, 1); else l.push(i); store.set('hfav', l); renderHadith(); };
      const cp = el('button', '', `${icon('copy')}<span>نسخ</span>`); cp.onclick = () => copyText(hText(h));
      const sh = el('button', '', `${icon('share')}<span>مشاركة</span>`); sh.onclick = () => shareText(hText(h) + '\n— تطبيق مواقيت الصلاة');
      act.append(fav, cp, sh);
      d.appendChild(act);
      box.appendChild(d);
      if (opts && opts.focus === i) focusEl = d;
    });
    if (!shown) box.appendChild(el('div', 'empty-msg', cat === 'المفضلة' ? 'لم تحفظ أحاديث بعد. اضغط "حفظ" تحت أي حديث.' : 'لا نتائج'));
    if (focusEl) setTimeout(() => focusEl.scrollIntoView({ block: 'center' }), 60);
  }
  $('hSearch').oninput = () => renderHadith();
  App.screens.hadith = (o) => { if (o && (o.focus !== undefined || o.cat)) { cat = o.cat || 'الكل'; $('hSearch').value = ''; } renderHadith(o); };

  // حديث اليوم في الشاشة الرئيسية
  function renderDaily() {
    const i = dayIndex() % H.length, h = H[i];
    const b = $('dailyHadith');
    b.innerHTML = `<small>${icon('quote')}حديث اليوم</small><div class="ht"></div><div class="hs">رواه ${h.r} · ${h.s}</div>`;
    b.querySelector('.ht').textContent = h.t;
    b.onclick = () => go('hadith', { focus: i });
  }
  renderDaily();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderDaily(); });

  /* =============== الصفحة المشتركة للقصص =============== */
  let story = { kind: 'seerah', i: 0 };
  function openStory(kind, i) { go('story', { kind, i }); }
  function renderStory(o) {
    if (o && o.kind) story = { kind: o.kind, i: o.i };
    const list = story.kind === 'seerah' ? S : L, it = list[story.i];
    $('stKind').textContent = story.kind === 'seerah' ? 'السيرة النبوية' : 'مواقف وعِبر';
    $('stCount').textContent = `${story.i + 1} من ${list.length}`;
    $('stChip').textContent = story.kind === 'seerah' ? it.e : it.i;
    $('stWhen').textContent = story.kind === 'seerah' ? `${it.y} · ${it.p}` : '';
    $('stTitle').textContent = it.t;
    const body = $('stBody'); body.innerHTML = '';
    it.b.forEach((p) => { const e = el('p'); e.textContent = p; body.appendChild(e); });
    $('stLesson').textContent = it.l;
    $('stSource').textContent = it.s ? 'المصدر: ' + it.s : '';
    $('stPrev').style.visibility = story.i > 0 ? 'visible' : 'hidden';
    $('stNext').style.visibility = story.i < list.length - 1 ? 'visible' : 'hidden';
    if (story.kind === 'seerah') { const r = store.get('sread', []); if (!r.includes(story.i)) { r.push(story.i); store.set('sread', r); } }
    window.scrollTo(0, 0);
  }
  $('stPrev').onclick = () => renderStory({ kind: story.kind, i: story.i - 1 });
  $('stNext').onclick = () => renderStory({ kind: story.kind, i: story.i + 1 });
  App.screens.story = renderStory;

  /* =============== السيرة النبوية =============== */
  function renderSeerah() {
    const read = store.get('sread', []);
    $('siraProg').textContent = `أنجزت ${read.length} من ${S.length} محطة`;
    $('siraBar').style.width = (read.length / S.length * 100) + '%';
    const nextIdx = S.findIndex((_, i) => !read.includes(i));
    const nb = $('siraNext');
    nb.textContent = read.length === 0 ? 'ابدأ الرحلة' : nextIdx < 0 ? 'أعد قراءة السيرة من البداية' : `تابع: ${S[nextIdx].t}`;
    nb.onclick = () => openStory('seerah', nextIdx < 0 ? 0 : nextIdx);
    const box = $('siraList'); box.innerHTML = '';
    let era = '';
    S.forEach((it, i) => {
      if (it.e !== era) { era = it.e; box.appendChild(el('div', 'era', era)); }
      const row = el('div', 'tl' + (read.includes(i) ? ' read' : ''));
      row.append(el('div', 'dot', read.includes(i) ? icon('check') : i + 1));
      const card = el('button', 'tc', `<small>${it.y}</small><b>${it.t}</b><span>${it.k}</span>`);
      card.onclick = () => openStory('seerah', i);
      row.appendChild(card);
      box.appendChild(row);
    });
  }
  App.screens.seerah = renderSeerah;

  /* =============== مواقف وعبر =============== */
  function renderLessons() {
    const ti = dayIndex() % L.length;
    const t = $('lessonToday');
    t.innerHTML = `<span class="hub-ic">${icon('heart')}</span><span class="qt"><small>موقف اليوم</small><b style="font-family:inherit;font-size:1.125rem">${L[ti].t}</b></span>${icon('chev', 'chev')}`;
    t.onclick = () => openStory('lesson', ti);
    const box = $('lessonList'); box.innerHTML = '<div class="sec">كل المواقف</div>';
    L.forEach((it, i) => {
      const b = el('button', 'les', `<span class="lt"><small>${it.i}</small><b>${it.t}</b></span>${icon('chev', 'chev')}`);
      b.onclick = () => openStory('lesson', i);
      box.appendChild(b);
    });
  }
  App.screens.lessons = renderLessons;
})();
