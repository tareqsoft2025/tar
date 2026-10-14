(function () {
  const $ = (id) => document.getElementById(id);
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  const NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const state = {
    city: store.get('city', 'القدس (المسجد الأقصى)'),
    gps: store.get('gps', null),
    adj: store.get('adj', { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }),
    hijriAdj: store.get('hijriAdj', 0),
    coords: null,
    method: store.get('method', 'Egyptian'),
    madhab: store.get('madhab', 'Shafi'),
    notify: store.get('notify', false),
    place: store.get('place', '')
  };

  const TZ = 'Asia/Hebron';
  const fmt = new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ });
  const GPS = 'الموقع الحالي (GPS)';

  function cityCoords(name) {
    for (const g of window.PLACES) for (const it of g.items) if (it[0] === name) return { lat: it[1], lon: it[2] };
    return null;
  }
  function resolveCoords() {
    if (state.city === GPS && state.gps) { state.coords = state.gps; state.place = 'موقعك الحالي'; }
    else {
      if (state.city === GPS) state.city = 'القدس (المسجد الأقصى)';
      state.coords = cityCoords(state.city);
      state.place = state.city + ' - فلسطين';
    }
  }
  // تاريخ اليوم بتقويم فلسطين (حتى لو كان توقيت الجهاز مختلفاً)
  function psDay(date) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
  }
  const pad = (n) => String(n).padStart(2, '0');

  function calc(date) {
    const c = new adhan.Coordinates(state.coords.lat, state.coords.lon);
    const p = adhan.CalculationMethod[state.method]();
    p.madhab = adhan.Madhab[state.madhab];
    ORDER.forEach((k) => { p.adjustments[k] = (p.adjustments[k] || 0) + (+state.adj[k] || 0); });
    return new adhan.PrayerTimes(c, psDay(date), p);
  }

  function renderDates() {
    const now = new Date();
    try { $('hijri').textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'full', timeZone: TZ }).format(new Date(now.getTime() + state.hijriAdj * 864e5)); } catch (e) {}
    $('gregorian').textContent = new Intl.DateTimeFormat('ar', { dateStyle: 'full', timeZone: TZ }).format(now);
    $('place').textContent = state.place;
  }

  function nextPrayer(now) {
    const today = calc(now);
    for (const k of ORDER) if (today[k] > now) return { key: k, time: today[k] };
    const tomorrow = calc(new Date(now.getTime() + 864e5));
    return { key: 'fajr', time: tomorrow.fajr };
  }

  function renderTimes() {
    if (!state.coords) return;
    const now = new Date();
    const t = calc(now);
    const nxt = nextPrayer(now);
    const ul = $('list');
    ul.innerHTML = '';
    ORDER.forEach((k) => {
      const li = document.createElement('li');
      if (k === nxt.key) li.className = 'current';
      li.innerHTML = `<span>${NAMES[k]}</span><span class="t">${fmt.format(t[k])}</span>`;
      ul.appendChild(li);
    });
    $('nextName').textContent = NAMES[nxt.key];
    tick(nxt.time);
    state.nextTime = nxt.time;
  }

  function tick(target) {
    const ms = Math.max(0, target - new Date());
    const s = Math.floor(ms / 1000);
    $('countdown').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  setInterval(() => {
    if (!state.nextTime) return;
    if (state.nextTime <= new Date()) renderTimes(); else tick(state.nextTime);
  }, 1000);

  function scheduleNative() {
    const B = window.AndroidBridge;
    if (!state.notify || !state.coords) { B.cancel(); return; }
    const list = [];
    for (let d = 0; d < 7; d++) {
      const t = calc(new Date(Date.now() + d * 864e5));
      PRAYERS.forEach((k) => {
        if (t[k] > new Date()) list.push({ at: t[k].getTime(), title: 'حان وقت الصلاة', body: `حان الآن موعد صلاة ${NAMES[k]}` });
      });
    }
    B.schedule(JSON.stringify(list));
  }

  async function scheduleNotifications() {
    if (window.AndroidBridge) return scheduleNative();
    const LN = P.LocalNotifications;
    if (!LN) return;
    try {
      const pending = await LN.getPending();
      if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications });
      if (!state.notify || !state.coords) return;
      const perm = await LN.requestPermissions();
      if (perm.display !== 'granted') { state.notify = false; store.set('notify', false); $('notify').checked = false; return; }
      const list = [];
      let id = 1;
      for (let d = 0; d < 7; d++) {
        const day = new Date(Date.now() + d * 864e5);
        const t = calc(day);
        PRAYERS.forEach((k) => {
          if (t[k] > new Date()) list.push({ id: id++, title: 'حان وقت الصلاة', body: `حان الآن موعد صلاة ${NAMES[k]}`, schedule: { at: t[k], allowWhileIdle: true } });
        });
      }
      if (list.length) await LN.schedule({ notifications: list });
    } catch (e) { console.warn(e); }
  }

  async function locate() {
    $('place').textContent = 'جارٍ تحديد الموقع…';
    try {
      let lat, lon;
      if (P.Geolocation) {
        await P.Geolocation.requestPermissions();
        const pos = await P.Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
        lat = pos.coords.latitude; lon = pos.coords.longitude;
      } else {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000 }));
        lat = pos.coords.latitude; lon = pos.coords.longitude;
      }
      state.gps = { lat, lon };
      store.set('gps', state.gps);
      state.city = GPS;
      store.set('city', GPS);
      $('city').value = GPS;
    } catch (e) {
      alert('تعذر تحديد الموقع. فعّل GPS أو اختر مدينتك من القائمة.');
    }
    refresh();
  }

  function refresh() {
    resolveCoords();
    renderDates();
    renderTimes();
    renderQibla();
    scheduleNotifications();
  }

  // Qibla
  let heading = 0;
  function renderQibla() {
    if (!state.coords) return;
    const q = adhan.Qibla(new adhan.Coordinates(state.coords.lat, state.coords.lon));
    state.qibla = q;
    $('qiblaInfo').textContent = `اتجاه القبلة: ${Math.round(q)}° من الشمال`;
    $('needle').style.transform = `rotate(${q - heading}deg)`;
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha !== null) h = (360 - e.alpha) % 360;
    if (h === null) return;
    heading = h;
    if (state.qibla !== undefined) $('needle').style.transform = `rotate(${state.qibla - heading}deg)`;
  }
  window.addEventListener('deviceorientationabsolute', onOrient, true);
  window.addEventListener('deviceorientation', onOrient, true);

  // Tasbih
  const ZIKR = ['سبحان الله', 'الحمد لله', 'الله أكبر', 'لا إله إلا الله', 'أستغفر الله'];
  let zi = store.get('zi', 0), count = store.get('count', 0);
  function renderTasbih() { $('zikr').textContent = ZIKR[zi]; $('tasbihBtn').textContent = count; }
  $('tasbihBtn').onclick = () => { count++; store.set('count', count); renderTasbih(); if (navigator.vibrate) navigator.vibrate(count % 33 === 0 ? 200 : 20); };
  $('tasbihReset').onclick = () => { count = 0; store.set('count', 0); renderTasbih(); };
  $('zikrNext').onclick = () => { zi = (zi + 1) % ZIKR.length; count = 0; store.set('zi', zi); store.set('count', 0); renderTasbih(); };

  // Settings
  $('method').value = state.method;
  $('madhab').value = state.madhab;
  $('notify').checked = state.notify;
  $('method').onchange = (e) => { state.method = e.target.value; store.set('method', state.method); refresh(); };
  $('madhab').onchange = (e) => { state.madhab = e.target.value; store.set('madhab', state.madhab); refresh(); };
  $('notify').onchange = (e) => { state.notify = e.target.checked; store.set('notify', state.notify); scheduleNotifications(); };
  $('relocate').onclick = locate;

  const citySel = $('city');
  const og0 = document.createElement('optgroup'); og0.label = 'تلقائي';
  og0.innerHTML = `<option value="${GPS}">${GPS}</option>`;
  citySel.appendChild(og0);
  window.PLACES.forEach((g) => {
    const og = document.createElement('optgroup'); og.label = g.group;
    g.items.forEach((it) => { const o = document.createElement('option'); o.value = it[0]; o.textContent = it[0]; og.appendChild(o); });
    citySel.appendChild(og);
  });
  if (state.city === GPS && !state.gps) state.city = 'القدس (المسجد الأقصى)';
  citySel.value = state.city;
  citySel.onchange = (e) => {
    state.city = e.target.value; store.set('city', state.city);
    if (state.city === GPS && !state.gps) locate(); else refresh();
  };

  const adjBox = $('adj');
  ORDER.forEach((k) => {
    const d = document.createElement('div');
    d.innerHTML = `${NAMES[k]}<input type="number" inputmode="numeric" step="1" min="-30" max="30" value="${state.adj[k] || 0}">`;
    d.querySelector('input').onchange = (e) => {
      state.adj[k] = Math.max(-30, Math.min(30, parseInt(e.target.value, 10) || 0));
      e.target.value = state.adj[k]; store.set('adj', state.adj); refresh();
    };
    adjBox.appendChild(d);
  });
  $('hijriAdj').value = String(state.hijriAdj);
  $('hijriAdj').onchange = (e) => { state.hijriAdj = +e.target.value; store.set('hijriAdj', state.hijriAdj); renderDates(); };

  // Tabs
  document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  });

  renderTasbih();
  refresh();
})();
