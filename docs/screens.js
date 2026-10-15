// الشاشات الإضافية: متابعة الصلاة، القضاء، التقويم الهجري، المساجد، المصحف
(function () {
  const { $, state, store, B, icon, toast, go } = App;
  const TZ = Core.TZ;
  const NAMES = Core.NAMES;
  const KEYS = Tracker.KEYS;
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  /* قائمة اختيار سفلية عامة بدل نوافذ المتصفح */
  function choose(title, items) {
    $('gsTitle').textContent = title;
    const box = $('gsItems'); box.innerHTML = '';
    items.forEach(([label, fn]) => {
      const b = el('button', 'qs-btn', label);
      b.onclick = () => { $('gsheet').hidden = true; fn(); };
      box.appendChild(b);
    });
    $('gsheet').hidden = false;
  }
  $('gsheet').onclick = (e) => { if (e.target.hasAttribute('data-close')) $('gsheet').hidden = true; };

  /* =============== متابعة صلاتي =============== */
  function renderStats() {
    const today = Tracker.dayStr();
    const n = Tracker.count(today);
    $('todayNum').textContent = n + '/5';
    $('todayRing').style.strokeDashoffset = String(276.5 * (1 - n / 5));
    $('todayMsg').textContent = n === 5 ? 'أتممت صلوات اليوم، تقبّل الله منك' : n === 0 ? 'ابدأ بتسجيل صلاتك' : `بقي ${5 - n} من صلوات اليوم`;
    $('todayDate').textContent = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date());
    const pills = $('todayPills');
    pills.innerHTML = '';
    KEYS.forEach((k) => {
      const on = Tracker.isLogged(today, k);
      const b = el('button', 'pill' + (on ? ' on' : ''), `${icon('check')}<span>${NAMES[k]}</span>`);
      b.onclick = () => { Tracker.toggle(today, k); renderStats(); refreshTimes(); };
      pills.appendChild(b);
    });
    const s = Tracker.streaks(today);
    $('stCur').textContent = s.current;
    $('stBest').textContent = s.best;
    $('stAll').textContent = Tracker.totals().all;
    const chart = $('weekChart');
    chart.innerHTML = '';
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    Tracker.week(today).forEach((d) => {
      const col = el('div', 'wk' + (d.ds === today ? ' today' : ''));
      const bar = el('div', 'bar ' + (d.n === 5 ? 'full' : d.n > 0 ? 'part' : ''));
      bar.style.height = Math.max(6, (d.n / 5) * 100) + 'px';
      col.append(el('b', '', d.n), bar, el('small', '', days[d.dow].replace('ال', '')));
      chart.appendChild(col);
    });
  }
  function refreshTimes() { App.refresh(); }
  App.screens.stats = renderStats;

  /* =============== قضاء الصلوات =============== */
  const QADA = [['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء'], ['witr', 'الوتر']];
  function renderQada() {
    const q = Tracker.qada();
    const box = $('qadaList');
    box.innerHTML = '';
    let total = 0;
    QADA.forEach(([k, name]) => {
      total += q[k] || 0;
      const row = el('div', 'qrow');
      const minus = el('button', 'icon-btn', icon('minus')); minus.setAttribute('aria-label', 'قضيتها');
      const plus = el('button', 'icon-btn', icon('plus')); plus.setAttribute('aria-label', 'إضافة فائتة');
      const num = el('div', 'qn', q[k] || 0);
      minus.onclick = () => { Tracker.setQada(k, (q[k] || 0) - 1); if (navigator.vibrate) navigator.vibrate(15); renderQada(); };
      plus.onclick = () => { Tracker.setQada(k, (q[k] || 0) + 1); renderQada(); };
      row.append(el('b', '', name), minus, num, plus);
      box.appendChild(row);
    });
    $('qadaTotal').textContent = total;
  }
  App.screens.qada = renderQada;

  /* =============== التقويم الهجري =============== */
  let calOff = 0; // إزاحة بالأشهر عن الشهر الحالي
  const DAY0 = 864e5;
  const hj = (date) => Core.hijri(date, state.hijriAdj);
  const gDay = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric' }).format(date);
  function firstOfMonth(target) {
    // تقريب ثم ضبط بالأيام
    const now = new Date();
    const h0 = hj(now);
    const diffMonths = (target.y - h0.y) * 12 + (target.m - h0.m);
    let t = new Date(now.getTime() + (diffMonths * 29.53 - (h0.d - 1)) * DAY0);
    for (let i = 0; i < 70; i++) {
      const h = hj(t);
      const cmp = (h.y - target.y) * 12 + (h.m - target.m);
      if (cmp === 0 && h.d === 1) return t;
      if (cmp > 0 || (cmp === 0 && h.d > 1)) t = new Date(t.getTime() - DAY0); else t = new Date(t.getTime() + DAY0);
    }
    return t;
  }
  function renderCalendar() {
    const now = new Date();
    const h0 = hj(now);
    let m = h0.m + calOff, y = h0.y;
    y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    const first = firstOfMonth({ y, m });
    $('calTitle').textContent = `${Core.HIJRI_MONTHS[m - 1]} ${arNum(y)} هـ`;
    const dow = $('calDow'); dow.innerHTML = '';
    ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].forEach((d) => dow.appendChild(el('span', '', d.replace('ال', '').slice(0, 3))));
    const grid = $('calGrid'); grid.innerHTML = '';
    const offset = (Core.weekday(first) + 1) % 7; // السبت = 0
    for (let i = 0; i < offset; i++) grid.appendChild(el('div', 'cd empty'));
    const events = [];
    let last = first;
    for (let i = 0; i < 31; i++) {
      const dt = new Date(first.getTime() + i * DAY0);
      const h = hj(dt);
      if (h.m !== m) break;
      last = dt;
      const evs = Core.hijriEvents(h);
      const hs = (window.HIST && window.HIST[h.m + '-' + h.d]) || [];
      const isFri = Core.weekday(dt) === 5;
      const kinds = evs.map((e) => e.kind);
      const isToday = h.y === h0.y && h.m === h0.m && h.d === h0.d;
      const cls = ['cd', isToday ? 'today' : '', kinds.includes('white') ? 'white' : '', kinds.includes('eid') ? 'eid' : kinds.includes('fast') ? 'fast' : kinds.includes('night') ? 'fast' : '', hs.length ? 'hist' : '', isFri ? 'fri' : ''].join(' ');
      grid.appendChild(el('div', cls, `<b>${h.d}</b><small>${gDay(dt)}</small>`));
      evs.filter((e) => e.kind !== 'white').forEach((e) => events.push({ h, dt, label: e.label }));
      hs.forEach((x) => events.push({ h, dt, label: x.t, desc: x.d, hist: true }));
      if (kinds.includes('white') && h.d === 13) events.push({ h, dt, label: 'الأيام البيض (13 و14 و15)' });
    }
    const f = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { month: 'long', timeZone: TZ });
    const fy = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: TZ });
    $('calSub').textContent = `${f.format(first)} – ${f.format(last)} ${fy.format(last)} م`;
    const box = $('calEvents'); box.innerHTML = '';
    // تجميع أيام العشر الأواخر في سطر واحد
    const seen = {};
    const rows = events.filter((e) => { if (/العشر الأواخر|التشريق/.test(e.label)) { if (seen[e.label]) return false; seen[e.label] = 1; } return true; });
    if (!rows.length) box.appendChild(el('div', 'empty-msg', 'لا مناسبات خاصة في هذا الشهر'));
    rows.forEach((e) => box.appendChild(el('div', 'ev', `<div class="ed">${e.h.d}<small>${Core.HIJRI_MONTHS[e.h.m - 1]}</small></div><div class="et">${e.hist ? '<span class="hdot"></span>' : ''}${e.label}${e.desc ? `<div class="edesc">${e.desc}</div>` : ''}<br><small class="muted">${new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(e.dt)}</small></div>`)));
  }
  $('calPrev').onclick = () => { calOff--; renderCalendar(); };
  $('calNext').onclick = () => { calOff++; renderCalendar(); };
  App.screens.calendar = (o) => { if (!o || !o.back) calOff = 0; renderCalendar(); };

  /* =============== أقرب المساجد =============== */
  let radius = store.get('mqRadius', 3000);
  const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' م' : (m / 1000).toFixed(1) + ' كم');
  function openMap(lat, lon, name) {
    if (B && B.openMap) B.openMap(lat, lon, name);
    else window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, '_blank');
  }
  function renderMosques(list, note) {
    const box = $('mqList');
    box.innerHTML = '';
    if (note) box.appendChild(el('div', 'empty-msg', note));
    list.forEach((m) => {
      const row = el('div', 'mq');
      const info = el('div', 'mi', `<b></b><small>${m.type}</small>`);
      info.querySelector('b').textContent = m.name;
      const d = el('div', 'dist', fmtDist(m.dist));
      const go = el('button', 'icon-btn', icon('nav')); go.setAttribute('aria-label', 'الاتجاهات');
      go.onclick = () => openMap(m.lat, m.lon, m.name);
      row.append(info, d, go);
      box.appendChild(row);
    });
  }
  async function searchMosques() {
    const c = Core.coordsOf(state);
    const where = state.city === Core.GPS && state.gps ? state.gps : c;
    const btn = $('mqSearch');
    btn.disabled = true;
    $('mqList').innerHTML = '<div class="empty-msg">جارٍ البحث…</div>';
    const q = `[out:json][timeout:20];(node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${where.lat},${where.lon});way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${where.lat},${where.lon}););out center 80;`;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      const list = j.elements.map((e) => {
        const lat = e.lat !== undefined ? e.lat : e.center && e.center.lat, lon = e.lon !== undefined ? e.lon : e.center && e.center.lon;
        if (lat === undefined) return null;
        const t = e.tags || {};
        const name = t['name:ar'] || t.name || 'مسجد';
        return { name, lat, lon, dist: Core.distKm(where, { lat, lon }) * 1000, type: t.building === 'mosque' || /مسجد/.test(name) ? 'مسجد' : 'مصلّى / جامع' };
      }).filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 40);
      store.set('mqCache', { at: Date.now(), where, radius, list });
      renderMosques(list, list.length ? '' : 'لم نجد مساجد مسجّلة ضمن هذه المسافة. جرّب مسافة أكبر.');
    } catch (e) {
      const cache = store.get('mqCache', null);
      if (cache && cache.list && cache.list.length) renderMosques(cache.list, 'تعذر الاتصال، هذه نتائج محفوظة من آخر بحث.');
      else $('mqList').innerHTML = '<div class="empty-msg">تعذر الاتصال بالإنترنت. تأكد من الاتصال وحاول مرة أخرى.</div>';
    } finally { btn.disabled = false; }
  }
  document.querySelectorAll('#mqRadius button').forEach((b) => {
    b.classList.toggle('on', +b.dataset.r === radius);
    b.onclick = () => { radius = +b.dataset.r; store.set('mqRadius', radius); document.querySelectorAll('#mqRadius button').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  $('mqSearch').onclick = searchMosques;
  App.screens.mosques = () => {
    $('mqPlace').textContent = 'حول: ' + (state.place || 'موقعك');
    const cache = store.get('mqCache', null);
    if (!$('mqList').children.length && cache && cache.list) renderMosques(cache.list, 'نتائج محفوظة من آخر بحث — اضغط "ابحث" للتحديث.');
  };

  /* =============== القرآن الكريم =============== */
  const Q = window.QURAN;
  const OFFS = []; // الفهرس التراكمي للآيات
  let tot = 0; Q.forEach((s) => { OFFS.push(tot); tot += s[2].length; });
  const TOTAL = tot;
  const absPos = (s, a) => OFFS[s - 1] + a; // s: 1..114 ، a: 1..n
  const fromAbs = (p) => { let s = 1; while (s < 114 && OFFS[s] < p) s++; return { s, a: p - OFFS[s - 1] }; };
  const pad3 = (n) => String(n).padStart(3, '0');
  const surahName = (s) => Q[s - 1][0];
  const lastPos = () => store.get('qlast', null);

  function wirdInfo() {
    const w = store.get('qwird', null);
    if (!w) return null;
    const today = Tracker.dayStr();
    const lp = lastPos();
    const cur = lp ? absPos(lp.s, lp.a) : 0;
    if (w.date !== today) { w.date = today; w.start = cur; store.set('qwird', w); }
    const done = Math.max(0, cur - w.start);
    return { perDay: w.perDay, done, pct: Math.min(1, done / w.perDay), w };
  }
  const WIRD_OPTS = [['ختمة في 30 يوماً', Math.ceil(TOTAL / 30)], ['ختمة في 60 يوماً', Math.ceil(TOTAL / 60)], ['ختمة في 90 يوماً', Math.ceil(TOTAL / 90)], ['20 آية يومياً', 20], ['10 آيات يومياً', 10], ['5 آيات يومياً', 5]];

  function renderQuranHome() {
    const lp = lastPos();
    const c = $('qContinue'); c.innerHTML = '';
    const s = lp ? lp.s : 1, a = lp ? lp.a : 1;
    const card = el('button', 'qcard', `<span class="hub-ic">${icon('quran')}</span><span class="qt"><small>${lp ? 'تابع القراءة' : 'ابدأ القراءة'}</small><b>سورة ${surahName(s)}</b><small>الآية ${arNum(a)}</small></span>${icon('chev', 'chev')}`);
    card.onclick = () => openReader(s, a);
    c.appendChild(card);

    const wBox = $('qWird'); wBox.innerHTML = '';
    const wi = wirdInfo();
    if (wi) {
      const d = el('div', 'wird', `<div class="wh"><b>وردي اليوم</b><span class="muted small">${wi.done} / ${wi.perDay} آية</span></div><div class="progress"><i style="width:${wi.pct * 100}%"></i></div>`);
      const edit = el('button', 'btn-outline wide', 'تغيير الورد'); edit.onclick = chooseWird;
      d.appendChild(edit);
      if (wi.pct >= 1) d.insertBefore(el('div', 'muted small', 'أتممت وردك لهذا اليوم، بارك الله فيك'), d.children[2]);
      wBox.appendChild(d);
    } else {
      const b = el('button', 'link-card', `${icon('check', 'ic gold')}<span>اضبط وردك اليومي من القرآن</span>${icon('chev', 'chev')}`);
      b.onclick = chooseWird;
      b.style.marginTop = '0'; b.style.marginBottom = '12px';
      wBox.appendChild(b);
    }

    const books = store.get('qbook', []);
    const bBox = $('qBooks'); bBox.innerHTML = '';
    if (books.length) {
      bBox.appendChild(el('div', 'sec', 'علاماتي المرجعية'));
      const row = el('div', 'books');
      books.forEach((b, i) => {
        const chip = el('button', 'bk', `${icon('bookmark')}<span>${surahName(b.s)} · ${arNum(b.a)}</span>`);
        let timer, longp = false;
        chip.onclick = () => { if (!longp) openReader(b.s, b.a); longp = false; };
        chip.ontouchstart = () => { longp = false; timer = setTimeout(() => { longp = true; choose(`${surahName(b.s)} · ${arNum(b.a)}`, [['حذف العلامة المرجعية', () => { books.splice(i, 1); store.set('qbook', books); renderQuranHome(); }]]); }, 600); };
        chip.ontouchend = chip.ontouchmove = () => clearTimeout(timer);
        row.appendChild(chip);
      });
      bBox.appendChild(row);
      bBox.appendChild(el('div', 'hint', 'اضغط مطوّلاً على العلامة لحذفها'));
    }
    renderSurahList();
  }
  function renderSurahList() {
    const term = $('qSearch').value.trim();
    const box = $('qList'); box.innerHTML = '';
    let n = 0;
    Q.forEach((s, i) => {
      const num = i + 1;
      if (term && !(s[0].replace(/[ًٌٍَُِّْٰ]/g, '').includes(term.replace(/[ًٌٍَُِّْٰ]/g, '')) || String(num) === term)) return;
      n++;
      const r = el('button', 'sr', `<span class="num">${num}</span><span class="nm"><b>${s[0]}</b><small>${s[1] === 'م' ? 'مكية' : 'مدنية'} · ${arNum(s[2].length)} آية</small></span>${icon('chev', 'chev')}`);
      r.onclick = () => openReader(num, 1);
      box.appendChild(r);
    });
    if (!n) box.appendChild(el('div', 'empty-msg', 'لا نتائج'));
  }
  $('qSearch').oninput = renderSurahList;
  App.screens.quran = () => { renderQuranHome(); renderReciter(); };

  function chooseWird() {
    const items = WIRD_OPTS.map(([t, n]) => [`${t} (${n} آية)`, () => {
      const lp = lastPos();
      store.set('qwird', { perDay: n, date: Tracker.dayStr(), start: lp ? absPos(lp.s, lp.a) : 0 });
      renderQuranHome(); toast('تم ضبط وردك اليومي');
    }]);
    if (store.get('qwird', null)) items.push(['إلغاء الورد اليومي', () => { store.set('qwird', null); renderQuranHome(); }]);
    choose('الورد اليومي من القرآن', items);
  }

  /* ----- القارئ ----- */
  let rs = 1; // السورة المفتوحة
  let fontScale = store.get('qfs', 1.75);
  let observer = null;
  function setFont() { $('rBody').style.setProperty('--qfs', fontScale + 'rem'); }
  $('rFontUp').onclick = () => { fontScale = Math.min(2.6, fontScale + 0.15); store.set('qfs', fontScale); setFont(); };
  $('rFontDn').onclick = () => { fontScale = Math.max(1.2, fontScale - 0.15); store.set('qfs', fontScale); setFont(); };

  function openReader(s, a) {
    go('reader', { push: true, surah: s, ayah: a });
  }
  App.openSurah = (n) => openReader(n, 1);
  function renderReader(opts) {
    opts = opts || {};
    if (opts.back && !opts.surah) return;
    if (opts.surah) rs = opts.surah;
    const s = Q[rs - 1];
    $('rTitle').textContent = 'سورة ' + s[0];
    $('rMeta').textContent = `${s[1] === 'م' ? 'مكية' : 'مدنية'} · ${arNum(s[2].length)} آية`;
    const body = $('rBody');
    body.innerHTML = '';
    if (rs !== 1 && rs !== 9) body.appendChild(el('div', 'basmala', 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ'));
    const books = store.get('qbook', []);
    const frag = document.createDocumentFragment();
    s[2].forEach((t, i) => {
      const n = i + 1;
      const sp = el('span', 'ay' + (books.some((b) => b.s === rs && b.a === n) ? ' bm' : ''));
      sp.dataset.a = n;
      sp.innerHTML = t + ` <span class="an">${arNum(n)}</span> `;
      frag.appendChild(sp);
    });
    body.appendChild(frag);
    setFont();
    $('rPrev').style.visibility = rs > 1 ? 'visible' : 'hidden';
    $('rNext').style.visibility = rs < 114 ? 'visible' : 'hidden';
    watchPosition();
    const target = opts.ayah || 1;
    if (target > 1) { const e = body.querySelector(`.ay[data-a="${target}"]`); if (e) setTimeout(() => e.scrollIntoView({ block: 'start' }), 60); }
    else window.scrollTo(0, 0);
    if (playing && playing.s === rs) markPlaying();
  }
  App.screens.reader = renderReader;
  $('rPrev').onclick = () => { if (rs > 1) renderReader({ surah: rs - 1 }); };
  $('rNext').onclick = () => { if (rs < 114) renderReader({ surah: rs + 1 }); };

  // يحفظ موضع القراءة تلقائياً (أول آية ظاهرة أسفل الشريط العلوي)
  function watchPosition() {
    if (observer) observer.disconnect();
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && App.isActive('reader')) store.set('qlast', { s: rs, a: +en.target.dataset.a });
      });
    }, { rootMargin: '-70px 0px -80% 0px', threshold: 0 });
    $('rBody').querySelectorAll('.ay').forEach((n) => observer.observe(n));
  }

  /* ----- قائمة إجراءات الآية ----- */
  let sel = null;
  $('rBody').onclick = (e) => {
    const ay = e.target.closest('.ay');
    if (!ay) return;
    sel = { s: rs, a: +ay.dataset.a };
    $('qsTitle').textContent = `سورة ${surahName(rs)} · الآية ${arNum(sel.a)}`;
    $('qsheet').hidden = false;
  };
  $('qsheet').onclick = (e) => {
    if (e.target.hasAttribute('data-close')) { $('qsheet').hidden = true; return; }
    const b = e.target.closest('[data-act]');
    if (!b || !sel) return;
    $('qsheet').hidden = true;
    const act = b.dataset.act;
    if (act === 'book') {
      const books = store.get('qbook', []);
      const i = books.findIndex((x) => x.s === sel.s && x.a === sel.a);
      if (i >= 0) { books.splice(i, 1); toast('أُزيلت العلامة'); } else { books.unshift({ s: sel.s, a: sel.a }); if (books.length > 20) books.pop(); toast('تمت إضافة العلامة المرجعية'); }
      store.set('qbook', books);
      const node = $('rBody').querySelector(`.ay[data-a="${sel.a}"]`);
      if (node) node.classList.toggle('bm', i < 0);
    } else if (act === 'here') {
      store.set('qlast', { s: sel.s, a: sel.a });
      toast('سُجّل موضع وصولك للورد اليومي');
    } else if (act === 'reciter') {
      chooseReciter();
    } else if (act === 'play') {
      play(sel.s, sel.a);
    } else if (act === 'copy') {
      const t = Q[sel.s - 1][2][sel.a - 1] + ` ﴿${arNum(sel.a)}﴾ — سورة ${surahName(sel.s)}`;
      if (App.copyText) App.copyText(t, 'نُسخت الآية'); else toast('النسخ غير متاح');
    }
  };

  /* ----- التلاوة الصوتية (تحتاج إنترنت) ----- */
  const audio = $('qaudio');
  let playing = null;
  // القرّاء المتاحون من خدمة everyayah.com (مجلد الصوت، الاسم)
  const RECITERS = [
    ['Alafasy_128kbps', 'مشاري العفاسي'],
    ['Abdul_Basit_Murattal_192kbps', 'عبد الباسط عبد الصمد (مرتّل)'],
    ['Husary_128kbps', 'محمود خليل الحصري'],
    ['Minshawy_Murattal_128kbps', 'محمد صديق المنشاوي (مرتّل)'],
    ['Abdurrahmaan_As-Sudais_192kbps', 'عبد الرحمن السديس'],
    ['Saood_ash-Shuraym_128kbps', 'سعود الشريم'],
    ['Maher_AlMuaiqly_64kbps', 'ماهر المعيقلي'],
    ['Ghamadi_40kbps', 'سعد الغامدي'],
    ['Hudhaify_128kbps', 'علي الحذيفي'],
    ['Abu_Bakr_Ash-Shaatree_128kbps', 'أبو بكر الشاطري'],
    ['Muhammad_Ayyoub_128kbps', 'محمد أيوب'],
    ['Yasser_Ad-Dussary_128kbps', 'ياسر الدوسري'],
    ['Nasser_Alqatami_128kbps', 'ناصر القطامي'],
    ['Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', 'أحمد العجمي']
  ];
  const reciterId = () => { const r = store.get('qreciter', RECITERS[0][0]); return RECITERS.some((x) => x[0] === r) ? r : RECITERS[0][0]; };
  const reciterName = () => RECITERS.find((x) => x[0] === reciterId())[1];
  function chooseReciter() {
    choose('اختر القارئ', RECITERS.map(([id, name]) => [(id === reciterId() ? '● ' : '') + name, () => {
      store.set('qreciter', id);
      renderReciter();
      toast('القارئ: ' + name);
      if (playing) play(playing.s, playing.a); // يعيد الآية الحالية بصوت القارئ الجديد
    }]));
  }
  function renderReciter() {
    $('qReciter').innerHTML = `${icon('quran', 'ic gold')}<span>القارئ: ${reciterName()}</span>${icon('chev', 'chev')}`;
    $('mpReciter').textContent = reciterName();
  }
  $('qReciter').onclick = chooseReciter;
  $('mpReciter').onclick = chooseReciter;
  function markPlaying() {
    document.querySelectorAll('.ay.playing').forEach((n) => n.classList.remove('playing'));
    if (!playing || playing.s !== rs) return;
    const n = $('rBody').querySelector(`.ay[data-a="${playing.a}"]`);
    if (n) { n.classList.add('playing'); n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function updateMini() {
    $('miniPlayer').hidden = !playing;
    if (playing) {
      $('mpTitle').textContent = `${surahName(playing.s)} · ${arNum(playing.a)}`;
      $('mpToggle').innerHTML = icon(audio.paused ? 'play' : 'pause');
    }
  }
  function play(s, a) {
    playing = { s, a };
    audio.src = `https://everyayah.com/data/${reciterId()}/${pad3(s)}${pad3(a)}.mp3`;
    audio.play().then(updateMini, () => { toast('تعذر تشغيل التلاوة — تحقق من الإنترنت أو جرّب قارئاً آخر'); stop(); });
    markPlaying(); updateMini();
  }
  function stop() { audio.pause(); playing = null; document.querySelectorAll('.ay.playing').forEach((n) => n.classList.remove('playing')); updateMini(); }
  audio.onended = () => {
    if (!playing) return;
    const total = Q[playing.s - 1][2].length;
    if (playing.a < total) play(playing.s, playing.a + 1); else stop();
  };
  audio.onerror = () => { if (playing) { toast('تعذر تشغيل التلاوة — تحقق من الإنترنت أو جرّب قارئاً آخر'); stop(); } };
  audio.onplay = audio.onpause = updateMini;
  $('mpToggle').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
  $('mpClose').onclick = stop;
  renderReciter();
})();
