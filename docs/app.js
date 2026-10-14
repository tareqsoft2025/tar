(function () {
  const $ = (id) => document.getElementById(id);
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  const { NAMES, ORDER, PRAYERS, TZ, GPS, DEFAULT_CITY, store } = Core;
  const ICONS = { fajr: 'sunrise', sunrise: 'sun-dim', dhuhr: 'sun', asr: 'sun-dim', maghrib: 'sunset', isha: 'moon' };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const B = window.AndroidBridge || null;
  const icon = (name, cls) => `<svg class="ic ${cls || ''}"><use href="#i-${name}"/></svg>`;

  const state = Object.assign(Core.loadState(), { coords: null, place: '', next: null });
  if (state.city !== GPS && !Core.cityCoords(state.city)) state.city = GPS;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('show'), 4500);
  }

  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ });
  const timeParts = (d) => {
    const p = tf.formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
    return { hm: `${g('hour')}:${g('minute')}`, ap: g('dayPeriod') };
  };
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- الحساب ---------- */
  function resolveCoords() {
    state.coords = Core.coordsOf(state);
    if (state.city === GPS) {
      state.place = state.gps ? (Core.nearestPlace(state.gps) || 'موقعك الحالي') : 'جارٍ تحديد الموقع…';
    } else {
      state.place = state.city.replace(/ \(.*\)/, '');
    }
  }
  const calc = (date) => Core.calc(state, date);
  function timeline(now) {
    const out = [];
    [-1, 0, 1].forEach((d) => {
      const t = calc(new Date(now.getTime() + d * 864e5));
      ORDER.forEach((k) => out.push({ key: k, time: t[k], day: d }));
    });
    return out;
  }

  /* ---------- المواقيت ---------- */
  const RING = 616;
  function renderDates() {
    const now = new Date();
    try {
      $('hijri').textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { dateStyle: 'long', timeZone: TZ }).format(new Date(now.getTime() + state.hijriAdj * 864e5));
    } catch (e) { $('hijri').textContent = ''; }
    $('gregorian').textContent = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(now);
    $('place').textContent = state.place;
  }
  function renderTimes() {
    if (!state.coords) return;
    const now = new Date();
    const tl = timeline(now);
    let ni = tl.findIndex((e) => e.time > now);
    if (ni < 1) ni = Math.max(ni, 1);
    const next = tl[ni], prev = tl[ni - 1];
    state.next = next;
    state.prev = prev;
    $('nextName').textContent = NAMES[next.key];
    const tp = timeParts(next.time);
    $('nextAt').textContent = `عند ${tp.hm} ${tp.ap}`;

    const today = tl.filter((e) => e.day === 0);
    const ul = $('list');
    ul.innerHTML = '';
    today.forEach((e) => {
      const li = document.createElement('li');
      const isNext = e.key === next.key && e.day === next.day;
      const isPrev = e.key === prev.key && e.day === prev.day && e.key !== 'sunrise';
      li.className = isNext ? 'next' : isPrev ? 'now' : e.time < now ? 'past' : '';
      const t = timeParts(e.time);
      const tag = isNext ? '<span class="tag">القادمة</span>' : isPrev ? '<span class="tag">الحالية</span>' : e.time < now ? icon('check', '') : '';
      li.innerHTML = `<div class="pi">${icon(ICONS[e.key])}</div><div class="pn">${NAMES[e.key]}</div>${tag}<div class="pt">${t.hm}<small>${t.ap}</small></div>`;
      ul.appendChild(li);
    });
    tick();
  }
  function tick() {
    if (!state.next) return;
    const now = new Date();
    if (state.next.time <= now) { renderTimes(); return; }
    const s = Math.floor((state.next.time - now) / 1000);
    $('countdown').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    const span = state.next.time - state.prev.time;
    const frac = span > 0 ? Math.min(1, Math.max(0, (now - state.prev.time) / span)) : 0;
    $('ringFg').style.strokeDashoffset = String(RING * (1 - frac));
  }
  setInterval(tick, 1000);

  /* ---------- الإشعارات ---------- */
  function scheduleNotifications() {
    if (!B) return;
    B.schedule(JSON.stringify(Core.notifications(state)));
  }
  // إشعار تجريبي مرة واحدة عند أول تثبيت (بعد منح الإذن)
  function maybeTestNotification() {
    if (!B || store.get('testSent', false)) return;
    if (B.notificationsAllowed()) { B.testNotification(); store.set('testSent', true); }
  }

  /* ---------- الموقع ---------- */
  const MOVE_KM = 1.5;
  let locating = false;
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 });
    });
  }
  // يحدّث الموقع تلقائياً: أول مرة يحفظه، وبعدها عند أي انتقال يغيّر الشاشة والمواقيت
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
        $('city').value = GPS;
        refresh();
        if (!first) toast('تم تحديث موقعك وأوقات الصلاة: ' + state.place);
      }
      if (manual && !moved) toast('موقعك لم يتغيّر: ' + state.place);
    } catch (e) {
      if (manual) toast('تعذر تحديد الموقع. فعّل GPS أو اختر مدينتك من القائمة.');
      else if (!state.gps && !store.get('locHint', false)) { store.set('locHint', true); toast('تعذر تحديد الموقع، نعرض أوقات القدس. فعّل GPS ليتحدّث تلقائياً.'); }
    } finally { locating = false; }
  }
  // تستدعيها النسخة الأصلية بعد منح/رفض الأذونات
  window.nativePermsChanged = () => { autoLocate(false); scheduleNotifications(); maybeTestNotification(); };

  /* ---------- القبلة ---------- */
  let heading = null;
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
    el('circle', { cx: 160, cy: 160, r: 150, fill: 'none', stroke: 'rgba(255,255,255,.12)', 'stroke-width': 1 }, g);
    for (let a = 0; a < 360; a += 5) {
      const major = a % 90 === 0, mid = a % 30 === 0;
      const r1 = 150, r2 = major ? 130 : mid ? 138 : 144;
      const rad = (a - 90) * Math.PI / 180;
      el('line', { x1: 160 + r1 * Math.cos(rad), y1: 160 + r1 * Math.sin(rad), x2: 160 + r2 * Math.cos(rad), y2: 160 + r2 * Math.sin(rad),
        stroke: major ? '#E2BC6A' : 'rgba(255,255,255,.35)', 'stroke-width': major ? 2.5 : 1 }, g);
    }
    [['ش', 0], ['شرق', 90], ['ج', 180], ['غرب', 270]].forEach(([t, a]) => {
      const rad = (a - 90) * Math.PI / 180;
      const x = 160 + 112 * Math.cos(rad), y = 160 + 112 * Math.sin(rad);
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a];
      const tx = el('text', { x, y: y + 5, 'text-anchor': 'middle', fill: a === 0 ? '#F4D58A' : 'rgba(243,239,227,.7)', 'font-size': 16, 'font-weight': 700, 'font-family': 'Tajawal' }, g);
      tx.textContent = label;
    });
    // علامة الكعبة
    const k = el('g', { id: 'kaaba' }, g);
    el('line', { x1: 160, y1: 160, x2: 160, y2: 58, stroke: 'rgba(226,188,106,.55)', 'stroke-width': 2, 'stroke-dasharray': '3 5' }, k);
    const ki = el('g', { id: 'kaabaIcon' }, k);
    el('rect', { x: 142, y: 34, width: 36, height: 36, rx: 6, fill: '#E2BC6A' }, ki);
    el('rect', { x: 146, y: 38, width: 28, height: 28, rx: 4, fill: '#1b1405' }, ki);
    el('rect', { x: 146, y: 46, width: 28, height: 4, fill: '#E2BC6A' }, ki);
    el('rect', { x: 156, y: 54, width: 8, height: 12, rx: 2, fill: '#E2BC6A' }, ki);
    el('circle', { cx: 160, cy: 160, r: 6, fill: '#E2BC6A' }, g);
  }
  function renderQibla() {
    if (!state.coords) return;
    state.qibla = adhan.Qibla(new adhan.Coordinates(state.coords.lat, state.coords.lon));
    $('qiblaDeg').textContent = Math.round(state.qibla) + '°';
    paintCompass();
  }
  function paintCompass() {
    if (state.qibla === undefined) return;
    const h = heading === null ? 0 : heading;
    dial.style.transform = `rotate(${-h}deg)`;
    const k = document.getElementById('kaaba');
    if (k) k.setAttribute('transform', `rotate(${state.qibla} 160 160)`);
    const ki = document.getElementById('kaabaIcon');
    if (ki) ki.setAttribute('transform', `rotate(${h - state.qibla} 160 52)`); // تبقى الكعبة منتصبة
    $('headDeg').textContent = heading === null ? '--°' : Math.round(heading) + '°';
    let diff = Math.abs(((state.qibla - h) % 360 + 540) % 360 - 180);
    const aligned = heading !== null && diff < 4;
    const wrap = document.querySelector('.compass-wrap');
    if (aligned && !wrap.classList.contains('aligned') && navigator.vibrate) navigator.vibrate(40);
    wrap.classList.toggle('aligned', aligned);
    $('qiblaBadge').classList.toggle('ok', aligned);
    $('qiblaBadge').textContent = heading === null ? 'حرّك الجوال لمعايرة البوصلة' : aligned ? 'أنت باتجاه القبلة' : 'دُر نحو الكعبة';
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha !== null) h = (360 - e.alpha) % 360;
    if (h === null) return;
    heading = heading === null ? h : heading + ((((h - heading) % 360) + 540) % 360 - 180) * 0.35; // تنعيم
    heading = (heading + 360) % 360;
    paintCompass();
  }
  window.addEventListener('deviceorientationabsolute', onOrient, true);
  window.addEventListener('deviceorientation', onOrient, true);

  /* ---------- الأذكار ---------- */
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

  /* ---------- المسبحة ---------- */
  const ZIKR = ['سبحان الله', 'الحمد لله', 'الله أكبر', 'لا إله إلا الله', 'أستغفر الله'];
  const ROUND = 33, TRING = 729;
  let zi = store.get('zi', 0), count = store.get('count', 0), total = store.get('total', 0);
  function renderTasbih() {
    $('zikr').textContent = ZIKR[zi];
    $('tasbihBtn').textContent = count;
    $('tasbihRing').style.strokeDashoffset = String(TRING * (1 - (count % ROUND) / ROUND));
    $('tasbihTotal').textContent = `إجمالي التسبيحات: ${total}`;
  }
  $('tasbihBtn').onclick = () => {
    count++; total++; store.set('count', count); store.set('total', total);
    const full = count % ROUND === 0;
    if (navigator.vibrate) navigator.vibrate(full ? 200 : 15);
    const b = $('tasbihBtn');
    if (full) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
    renderTasbih();
  };
  $('tasbihReset').onclick = () => { count = 0; store.set('count', 0); renderTasbih(); };
  $('zikrNext').onclick = () => { zi = (zi + 1) % ZIKR.length; count = 0; store.set('zi', zi); store.set('count', 0); renderTasbih(); };

  /* ---------- الإعدادات ---------- */
  $('method').value = state.method;
  $('madhab').value = state.madhab;
  $('notify').checked = state.notify;
  $('method').onchange = (e) => { state.method = e.target.value; store.set('method', state.method); refresh(); };
  $('madhab').onchange = (e) => { state.madhab = e.target.value; store.set('madhab', state.madhab); refresh(); };
  $('notify').onchange = (e) => { state.notify = e.target.checked; store.set('notify', state.notify); scheduleNotifications(); };
  $('remind').value = String(state.remind);
  $('remind').onchange = (e) => { state.remind = +e.target.value; store.set('remind', state.remind); scheduleNotifications(); };
  $('testNotif').onclick = () => {
    if (B && B.notificationsAllowed()) B.testNotification();
    else toast(B ? 'التنبيهات غير مفعّلة. فعّلها من إعدادات النظام للتطبيق.' : 'التنبيهات متاحة في تطبيق أندرويد فقط.');
  };
  $('relocate').onclick = () => autoLocate(true);
  $('placeChip').onclick = () => showTab('settings');

  const citySel = $('city');
  const og0 = document.createElement('optgroup'); og0.label = 'تلقائي';
  og0.innerHTML = `<option value="${GPS}">${GPS}</option>`;
  citySel.appendChild(og0);
  window.PLACES.forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g.group;
    g.items.forEach((it) => { const o = document.createElement('option'); o.value = it[0]; o.textContent = it[0]; og.appendChild(o); });
    citySel.appendChild(og);
  });
  citySel.value = state.city;
  citySel.onchange = (e) => {
    state.city = e.target.value; store.set('city', state.city);
    refresh();
    if (state.city === GPS) autoLocate(true);
  };
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
  $('hijriAdj').onchange = (e) => { state.hijriAdj = +e.target.value; store.set('hijriAdj', state.hijriAdj); renderDates(); };

  /* ---------- التنقل ---------- */
  function showTab(name) {
    document.querySelectorAll('.dock button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.dock button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));

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
    scheduleNotifications();
  }
  buildDial();
  renderTasbih();
  renderAzkar();
  refresh();
  autoLocate(false);
  maybeTestNotification();
  setInterval(() => { if (!document.hidden) autoLocate(false); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderDates(); renderTimes(); renderAzkar(); autoLocate(false); } });
  if (window.AndroidBridge) $('appVer').textContent = 'رقم الإصدار ' + window.AndroidBridge.versionCode();

  // تطبيق ويب قابل للتثبيت (PWA)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
