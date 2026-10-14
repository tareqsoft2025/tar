(function () {
  const $ = (id) => document.getElementById(id);
  const { NAMES, ORDER, TZ, GPS, DEFAULT_CITY, store } = Core;
  const B = window.AndroidBridge || null;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const icon = (name, cls) => `<svg class="ic ${cls || ''}"><use href="#i-${name}"/></svg>`;

  const state = Object.assign(Core.loadState(), { coords: null, place: '', next: null, prev: null });
  if (state.city !== GPS && !Core.cityCoords(state.city)) state.city = GPS;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('show'), 4500);
  }
  window.toast = toast;

  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  const timeParts = (d) => {
    const p = tf.formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
    return { hm: `${g('hour')}:${g('minute')}`, ap: g('dayPeriod') };
  };
  const pad = (n) => String(n).padStart(2, '0');
  const calc = (date) => Core.calc(state, date);

  /* ---------- الموقع والمكان ---------- */
  function resolveCoords() {
    state.coords = Core.coordsOf(state);
    if (state.city === GPS) {
      state.place = state.gps ? (Core.nearestPlace(state.gps) || 'موقعك الحالي') : 'جارٍ تحديد الموقع…';
    } else {
      state.place = state.city.replace(/ \(.*\)/, '');
    }
  }
  const placeLabel = () => (state.city === GPS && !state.gps ? 'جارٍ تحديد الموقع…' : state.place + '، فلسطين');

  /* ---------- المواقيت ---------- */
  function renderDates() {
    const now = new Date();
    $('gregorian').textContent = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(now);
    try {
      $('hijri').textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
        .format(new Date(now.getTime() + state.hijriAdj * 864e5));
    } catch (e) { $('hijri').textContent = ''; }
    $('place').textContent = placeLabel();
  }
  function timeline(now) {
    const out = [];
    [-1, 0, 1].forEach((d) => {
      const t = calc(new Date(now.getTime() + d * 864e5));
      ORDER.forEach((k) => out.push({ key: k, time: t[k], day: d }));
    });
    return out;
  }
  function renderTimes() {
    if (!state.coords) return;
    const now = new Date();
    const tl = timeline(now);
    let ni = tl.findIndex((e) => e.time > now);
    if (ni < 1) ni = 1;
    const next = tl[ni];
    state.next = next;
    $('nextName').textContent = NAMES[next.key];
    const np = timeParts(next.time);
    $('nextAt').textContent = `${np.hm} ${np.ap}`;
    const ul = $('list');
    ul.innerHTML = '';
    tl.filter((e) => e.day === 0).forEach((e) => {
      const isNext = e.key === next.key && e.day === next.day;
      const li = document.createElement('li');
      li.className = isNext ? 'next' : e.time < now ? 'past' : 'upcoming';
      const t = timeParts(e.time);
      const noBell = e.key === 'sunrise';
      const muted = noBell || state.mute[e.key] || !state.notify;
      li.innerHTML = `<span class="pn">${NAMES[e.key]}</span><span class="pt">${t.hm} ${t.ap}</span>` +
        `<button class="bell ${muted ? 'off' : ''}" ${noBell ? 'disabled' : ''} aria-label="تنبيه ${NAMES[e.key]}">${icon(muted ? 'bell-off' : 'bell')}</button>`;
      if (!noBell) li.querySelector('.bell').onclick = () => {
        if (!state.notify) { toast('فعّل تنبيهات الصلاة أولاً'); return; }
        state.mute[e.key] = !state.mute[e.key];
        store.set('mute', state.mute);
        toast(state.mute[e.key] ? `تم إيقاف تنبيه صلاة ${NAMES[e.key]}` : `تم تفعيل تنبيه صلاة ${NAMES[e.key]}`);
        renderTimes(); scheduleNotifications();
      };
      ul.appendChild(li);
    });
    updateBell();
    tick();
  }
  function tick() {
    if (!state.next) return;
    const now = new Date();
    if (state.next.time <= now) { renderTimes(); return; }
    const s = Math.floor((state.next.time - now) / 1000);
    $('countdown').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  setInterval(tick, 1000);
  function updateBell() {
    $('bellBtn').innerHTML = icon(state.notify ? 'bell' : 'bell-off');
    $('bellBtn').style.color = state.notify ? 'var(--gold)' : 'var(--muted)';
  }

  /* ---------- الإشعارات ---------- */
  function scheduleNotifications() {
    if (!B) return;
    B.schedule(JSON.stringify(Core.notifications(state)));
    if (B.saveTimes) B.saveTimes(JSON.stringify(Core.times(state)));
  }

  /* ---------- تحديد الموقع تلقائياً ---------- */
  const MOVE_KM = 1.5;
  let locating = false;
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 });
    });
  }
  async function autoLocate(manual) {
    if (locating) return;
    if (state.city !== GPS && !manual) return;
    locating = true;
    try {
      const pos = await getPosition();
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const first = !state.gps;
      const moved = !state.gps || Core.distKm(state.gps, here) >= MOVE_KM;
      if (moved || state.city !== GPS) {
        state.gps = here;
        store.set('gps', here);
        state.city = GPS; store.set('city', GPS);
        refresh();
        if (!first) toast('تم تحديث موقعك وأوقات الصلاة: ' + state.place);
      }
      if (manual && !moved) toast('موقعك لم يتغيّر: ' + state.place);
    } catch (e) {
      if (manual) toast('تعذر تحديد الموقع. فعّل GPS أو اختر مدينتك يدوياً.');
      else if (!state.gps && !store.get('locHint', false)) { store.set('locHint', true); toast('تعذر تحديد الموقع، نعرض أوقات القدس. فعّل GPS ليتحدّث تلقائياً.'); }
    } finally { locating = false; }
  }
  window.nativePermsChanged = () => { autoLocate(false); scheduleNotifications(); };

  /* ---------- القبلة ---------- */
  const KAABA = { lat: 21.4225, lon: 39.8262 };
  const DIRS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
  let heading = null;
  const hist = [];
  const dial = $('dial');
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(n);
    return n;
  }
  function buildDial() {
    dial.innerHTML = '';
    const g = el('g', { id: 'dialG' }, dial);
    el('circle', { cx: 160, cy: 160, r: 118, class: 'dots' }, g);
    for (let a = 0; a < 360; a += 30) {
      if (a % 90 === 0) continue;
      const rad = (a - 90) * Math.PI / 180;
      el('line', { x1: 160 + 142 * Math.cos(rad), y1: 160 + 142 * Math.sin(rad), x2: 160 + 154 * Math.cos(rad), y2: 160 + 154 * Math.sin(rad), class: 'tick' }, g);
    }
    [['ش', 0, 'lbl'], ['شر', 90, 'lbl dim'], ['ج', 180, 'lbl dim'], ['غ', 270, 'lbl dim']].forEach(([label, a, cls]) => {
      const rad = (a - 90) * Math.PI / 180;
      const tx = el('text', { x: 160 + 116 * Math.cos(rad), y: 160 + 116 * Math.sin(rad) + 7, 'text-anchor': 'middle', class: cls }, g);
      tx.textContent = label;
    });
    const k = el('g', { id: 'kaaba' }, g);
    el('line', { x1: 160, y1: 160, x2: 160, y2: 78, class: 'needle' }, k);
    const ki = el('g', { transform: 'rotate(0 160 62)' }, k);
    el('rect', { x: 144, y: 46, width: 32, height: 32, rx: 5, class: 'kaaba' }, ki);
    el('line', { x1: 144, y1: 55, x2: 176, y2: 55, class: 'kband' }, ki);
    el('circle', { cx: 160, cy: 160, r: 8, class: 'hub' }, g);
  }
  function renderQibla() {
    if (!state.coords) return;
    state.qibla = adhan.Qibla(new adhan.Coordinates(state.coords.lat, state.coords.lon));
    const q = state.qibla;
    $('qiblaSub').textContent = 'من موقعك الحالي: ' + state.place;
    $('qiblaDeg').textContent = Math.round(q) + '°';
    $('qiblaDir').textContent = `${DIRS[Math.round(q / 45) % 8]} · من الشمال الحقيقي`;
    const km = Math.round(Core.distKm(state.coords, KAABA));
    $('qiblaDist').textContent = '≈ ' + km.toLocaleString('en-US') + ' كم';
    paintCompass();
  }
  function accuracy() {
    if (hist.length < 6) return null;
    const m = hist.reduce((s, h) => s + h, 0) / hist.length; // القيم متقاربة بعد التنعيم
    const sd = Math.sqrt(hist.reduce((s, h) => s + Math.pow(((h - m + 540) % 360) - 180, 2), 0) / hist.length);
    return sd < 3 ? ['عالية', 'ok'] : sd < 8 ? ['متوسطة', 'mid'] : ['منخفضة', 'low'];
  }
  function paintCompass() {
    if (state.qibla === undefined) return;
    const h = heading === null ? 0 : heading;
    dial.style.transform = `rotate(${-h}deg)`;
    const k = document.getElementById('kaaba');
    if (k) {
      k.setAttribute('transform', `rotate(${state.qibla} 160 160)`);
      k.querySelector('g').setAttribute('transform', 'rotate(0 160 62)');
    }
    let diff = Math.abs(((state.qibla - h) % 360 + 540) % 360 - 180);
    diff = 180 - diff;
    const aligned = heading !== null && diff < 4;
    const wrap = document.querySelector('.compass-wrap');
    if (aligned && !wrap.classList.contains('aligned') && navigator.vibrate) navigator.vibrate(40);
    wrap.classList.toggle('aligned', aligned);
    const st = $('qiblaStatus');
    st.classList.toggle('ok', aligned);
    st.textContent = heading === null ? 'حرّك الجوال لمعايرة البوصلة' : aligned ? 'أنت باتجاه القبلة' : `دُر نحو الكعبة · ${Math.round(diff)}°`;
    const acc = accuracy();
    const a = $('qiblaAcc');
    a.textContent = acc ? acc[0] : '—';
    a.className = 'stat-v ' + (acc ? acc[1] : '');
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha !== null) h = (360 - e.alpha) % 360;
    if (h === null) return;
    heading = heading === null ? h : heading + ((((h - heading) % 360) + 540) % 360 - 180) * 0.35;
    heading = (heading + 360) % 360;
    hist.push(h); if (hist.length > 12) hist.shift();
    paintCompass();
  }
  window.addEventListener('deviceorientationabsolute', onOrient, true);
  window.addEventListener('deviceorientation', onOrient, true);

  /* ---------- أذكار الصباح والمساء ---------- */
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const hourNow = () => +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(new Date());
  let mode = hourNow() < 14 ? 'morning' : 'evening';
  function azState() {
    const s = store.get('azkar', null);
    return s && s.day === today() ? s : { day: today(), morning: {}, evening: {} };
  }
  function renderAzkar() {
    const st = azState();
    const list = window.AZKAR[mode];
    $('segMorning').classList.toggle('on', mode === 'morning');
    $('segEvening').classList.toggle('on', mode === 'evening');
    const box = $('azkarList');
    box.innerHTML = '';
    let done = 0;
    list.forEach((z, i) => {
      const left = st[mode][i] === undefined ? z.c : st[mode][i];
      if (left === 0) done++;
      const d = document.createElement('div');
      d.className = 'zk' + (left === 0 ? ' done' : '');
      const txt = document.createElement('div'); txt.className = 'zt'; txt.textContent = z.t;
      const foot = document.createElement('div'); foot.className = 'zf';
      foot.innerHTML = left === 0
        ? `<span class="cnt">${icon('check')}تم</span><span class="tap"></span>`
        : `<span class="cnt">${left} / ${z.c}</span><span class="tap">اضغط للعدّ</span>`;
      d.appendChild(txt); d.appendChild(foot);
      d.onclick = () => {
        const cur = azState();
        const l = cur[mode][i] === undefined ? z.c : cur[mode][i];
        if (l > 0) { cur[mode][i] = l - 1; store.set('azkar', cur); if (navigator.vibrate) navigator.vibrate(l === 1 ? 40 : 12); renderAzkar(); }
      };
      box.appendChild(d);
    });
    $('azBar').style.width = (done / list.length * 100) + '%';
    $('azkarProgress').textContent = `أنجزت ${done} من ${list.length}`;
  }
  $('segMorning').onclick = () => { mode = 'morning'; renderAzkar(); };
  $('segEvening').onclick = () => { mode = 'evening'; renderAzkar(); };
  $('azkarReset').onclick = () => { const cur = azState(); cur[mode] = {}; store.set('azkar', cur); renderAzkar(); };

  /* ---------- التسبيح ---------- */
  const ZIKR = ['سبحان الله', 'الحمد لله', 'الله أكبر', 'لا إله إلا الله', 'أستغفر الله'];
  const ROUND = 33, TRING = 754;
  let zi = store.get('zi', 0), count = store.get('count', 0), rounds = store.get('rounds', 0);
  ZIKR.forEach((z, i) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = z; b.dataset.i = i;
    b.onclick = () => { zi = i; count = 0; store.set('zi', zi); store.set('count', 0); renderTasbih(); };
    $('chips').appendChild(b);
  });
  function renderTasbih() {
    $('zikr').textContent = ZIKR[zi];
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', +c.dataset.i === zi));
    $('tasbihNum').textContent = count % ROUND === 0 && count > 0 ? ROUND : count % ROUND;
    $('tasbihOf').textContent = `من ${ROUND}`;
    $('tasbihRing').style.strokeDashoffset = String(TRING * (1 - (count % ROUND === 0 && count > 0 ? 1 : (count % ROUND) / ROUND)));
    $('rounds').textContent = rounds;
  }
  $('tasbihBtn').onclick = () => {
    count++;
    const full = count % ROUND === 0;
    if (full) { rounds++; store.set('rounds', rounds); }
    store.set('count', count);
    if (navigator.vibrate) navigator.vibrate(full ? 200 : 15);
    const b = $('tasbihBtn');
    if (full) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
    renderTasbih();
    if (full) setTimeout(() => { count = 0; store.set('count', 0); renderTasbih(); }, 700);
  };
  $('tasbihReset').onclick = () => { count = 0; rounds = 0; store.set('count', 0); store.set('rounds', 0); renderTasbih(); };

  /* ---------- الثيمات ---------- */
  const THEMES = [
    { id: 'navy', name: 'ليلي كلاسيكي', bg: '#0b1620', nav: '#101e2b', light: false, sw: 'linear-gradient(135deg,#132433 50%,#D8B36A 50%)' },
    { id: 'emerald', name: 'زمرد وذهب', bg: '#06231a', nav: '#082b20', light: false, sw: 'linear-gradient(135deg,#0d3325 50%,#E2BC6A 50%)' },
    { id: 'midnight', name: 'ليل أزرق', bg: '#07122B', nav: '#0a1836', light: false, sw: 'linear-gradient(135deg,#102349 50%,#7CB7FF 50%)' },
    { id: 'sand', name: 'رمل القدس', bg: '#1E1409', nav: '#26180c', light: false, sw: 'linear-gradient(135deg,#33210F 50%,#F0A64B 50%)' },
    { id: 'royal', name: 'بنفسجي', bg: '#170D2B', nav: '#1d1136', light: false, sw: 'linear-gradient(135deg,#26164a 50%,#C9A7FF 50%)' },
    { id: 'palestine', name: 'علم فلسطين', bg: '#080A09', nav: '#0c0f0d', light: false, sw: 'linear-gradient(135deg,#0b0b0b 34%,#fff 34% 50%,#2FBF71 50% 72%,#E4312B 72%)' },
    { id: 'light', name: 'نهاري', bg: '#F4F1E8', nav: '#ffffff', light: true, sw: 'linear-gradient(135deg,#F4F1E8 50%,#0B6B3A 50%)' }
  ];
  function applyTheme(id, save) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    document.documentElement.setAttribute('data-theme', t.id);
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', t.bg);
    if (save) store.set('theme', t.id);
    document.querySelectorAll('.theme-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === t.id)));
    if (B && B.setTheme) B.setTheme(t.bg, t.nav, t.light);
  }
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'theme-btn'; b.dataset.id = t.id;
    b.innerHTML = `<span class="sw" style="background:${t.sw}"></span><span>${t.name}</span>`;
    b.onclick = () => applyTheme(t.id, true);
    $('themes').appendChild(b);
  });
  applyTheme(store.get('theme', 'navy'), false);

  /* ---------- الإعدادات ---------- */
  const optText = (sel) => { const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ''; };
  function syncSettingsText() {
    $('methodSub').textContent = optText($('method'));
    $('hijriSub').textContent = optText($('hijriAdj'));
    $('remindSub').textContent = optText($('remind'));
    const auto = state.city === GPS;
    $('autoLoc').checked = auto;
    $('autoSub').textContent = auto ? placeLabel() : 'متوقف · المدينة تُختار يدوياً';
    $('cityRow').hidden = auto;
    $('relocate').hidden = !auto;
    $('citySub').textContent = auto ? '' : state.city;
    document.querySelectorAll('#madhabSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.madhab));
    $('notify').checked = state.notify;
  }

  const citySel = $('city');
  window.PLACES.forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g.group;
    g.items.forEach((it) => { const o = document.createElement('option'); o.value = it[0]; o.textContent = it[0]; og.appendChild(o); });
    citySel.appendChild(og);
  });
  citySel.value = Core.cityCoords(state.city) ? state.city : DEFAULT_CITY;
  citySel.onchange = (e) => {
    state.city = e.target.value; store.set('city', state.city);
    refresh();
  };
  $('autoLoc').onchange = (e) => {
    if (e.target.checked) {
      state.city = GPS; store.set('city', GPS);
      refresh(); autoLocate(true);
    } else {
      const near = state.gps ? Core.nearestPlace(state.gps) : null;
      const full = near && window.PLACES.flatMap((g) => g.items.map((i) => i[0])).find((n) => n.replace(/ \(.*\)/, '') === near);
      state.city = full || DEFAULT_CITY; store.set('city', state.city);
      citySel.value = state.city;
      refresh();
    }
  };
  $('relocate').onclick = () => autoLocate(true);
  $('placeChip').onclick = () => showTab('settings');

  $('method').value = state.method;
  $('method').onchange = (e) => { state.method = e.target.value; store.set('method', state.method); refresh(); };
  document.querySelectorAll('#madhabSeg button').forEach((b) => b.onclick = () => {
    state.madhab = b.dataset.v; store.set('madhab', state.madhab); refresh();
  });
  ORDER.forEach((k) => {
    const d = document.createElement('div');
    d.innerHTML = `${NAMES[k]}<input type="number" inputmode="numeric" step="1" min="-30" max="30" value="${state.adj[k] || 0}" aria-label="تعديل ${NAMES[k]}">`;
    d.querySelector('input').onchange = (e) => {
      state.adj[k] = Math.max(-30, Math.min(30, parseInt(e.target.value, 10) || 0));
      e.target.value = state.adj[k]; store.set('adj', state.adj); refresh();
    };
    $('adj').appendChild(d);
  });
  $('hijriAdj').value = String(state.hijriAdj);
  $('hijriAdj').onchange = (e) => { state.hijriAdj = +e.target.value; store.set('hijriAdj', state.hijriAdj); renderDates(); syncSettingsText(); };
  $('notify').onchange = (e) => { state.notify = e.target.checked; store.set('notify', state.notify); scheduleNotifications(); updateBell(); renderTimes(); };
  $('bellBtn').onclick = () => {
    state.notify = !state.notify; store.set('notify', state.notify);
    scheduleNotifications(); syncSettingsText(); renderTimes();
    toast(state.notify ? 'تم تفعيل تنبيهات الصلاة' : 'تم إيقاف تنبيهات الصلاة');
  };
  $('remind').value = String(state.remind);
  $('remind').onchange = (e) => { state.remind = +e.target.value; store.set('remind', state.remind); scheduleNotifications(); syncSettingsText(); };
  $('testNotif').onclick = () => {
    if (B && B.notificationsAllowed()) B.testNotification();
    else toast(B ? 'التنبيهات غير مفعّلة. فعّلها من إعدادات النظام للتطبيق.' : 'التنبيهات متاحة في تطبيق أندرويد فقط.');
  };
  ['method', 'hijriAdj', 'remind'].forEach((id) => $(id).addEventListener('change', syncSettingsText));

  /* ---------- الشاشة الرئيسية: ودجت / اختصار / تثبيت PWA ---------- */
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  let deferredPrompt = null;
  if (B && B.pinWidget) {
    $('pinWidget').hidden = false;
    $('pinShortcut').hidden = false;
    $('pinWidget').onclick = () => {
      let ok = false;
      try { ok = B.pinWidget(); } catch (e) { /* ignore */ }
      toast(ok ? 'اتبع نافذة النظام لإضافة الودجت إلى شاشتك' : 'أضفه يدوياً: اضغط مطوّلاً على الشاشة الرئيسية ← الودجات ← مواقيت الصلاة');
    };
    $('pinShortcut').onclick = () => {
      let ok = false;
      try { ok = B.pinShortcut(); } catch (e) { /* ignore */ }
      toast(ok ? 'اتبع نافذة النظام لإضافة الاختصار' : 'أضفه يدوياً: اضغط مطوّلاً على أيقونة التطبيق ← إضافة إلى الشاشة الرئيسية');
    };
  } else if (!standalone) {
    $('installPwa').hidden = false;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
    $('installPwa').onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
        deferredPrompt = null;
      } else {
        toast('من قائمة المتصفح اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"');
      }
    };
  } else {
    $('homeGroup').previousElementSibling.hidden = true;
    $('homeGroup').hidden = true;
  }

  /* ---------- التنقل ---------- */
  function showTab(name) {
    const navTab = name === 'azkar' ? 'tasbih' : name;
    document.querySelectorAll('.dock button').forEach((x) => x.classList.toggle('on', x.dataset.tab === navTab));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.dock button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
  $('openAzkar').onclick = () => showTab('azkar');
  $('azBack').onclick = () => showTab('tasbih');

  /* ---------- التحديث الإجباري ---------- */
  window.showUpdate = (info) => {
    $('update').hidden = false;
    $('updVer').textContent = `الإصدار ${info.versionName} متاح، ولا يمكن متابعة الاستخدام قبل التحديث.`;
    $('updNotes').textContent = info.notes || '';
    $('updBtn').onclick = () => {
      $('updBtn').disabled = true;
      $('updBar').style.display = 'block';
      $('updMsg').textContent = 'جارٍ تنزيل التحديث…';
      window.AndroidBridge.startUpdate(info.apk);
    };
  };
  window.updateProgress = (pct) => {
    $('updBar').firstElementChild.style.width = pct + '%';
    $('updMsg').textContent = pct >= 100 ? 'اضغط "تثبيت" في النافذة التي ظهرت' : `جارٍ التنزيل ${pct}%`;
    if (pct >= 100) $('updBtn').disabled = false;
  };
  window.updateError = (msg) => { $('updMsg').textContent = msg; $('updBtn').disabled = false; };

  /* ---------- تشغيل ---------- */
  function refresh() {
    resolveCoords();
    renderDates();
    renderTimes();
    renderQibla();
    syncSettingsText();
    scheduleNotifications();
  }
  buildDial();
  renderTasbih();
  renderAzkar();
  refresh();
  autoLocate(false);
  setInterval(() => { if (!document.hidden) autoLocate(false); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderDates(); renderTimes(); renderAzkar(); autoLocate(false); } });
  if (B) $('appVer').textContent = 'رقم الإصدار ' + B.versionCode();

  // تطبيق ويب قابل للتثبيت (PWA)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
