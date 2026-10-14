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
    coords: store.get('coords', null),
    method: store.get('method', 'UmmAlQura'),
    madhab: store.get('madhab', 'Shafi'),
    notify: store.get('notify', false),
    place: store.get('place', '')
  };

  const fmt = new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', hour12: true });
  const pad = (n) => String(n).padStart(2, '0');

  function calc(date) {
    const c = new adhan.Coordinates(state.coords.lat, state.coords.lon);
    const p = adhan.CalculationMethod[state.method]();
    p.madhab = adhan.Madhab[state.madhab];
    return new adhan.PrayerTimes(c, date, p);
  }

  function renderDates() {
    const now = new Date();
    try { $('hijri').textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'full' }).format(now); } catch (e) {}
    $('gregorian').textContent = new Intl.DateTimeFormat('ar', { dateStyle: 'full' }).format(now);
    $('place').textContent = state.place || (state.coords ? `${state.coords.lat.toFixed(2)}, ${state.coords.lon.toFixed(2)}` : 'الموقع غير محدد');
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

  async function scheduleNotifications() {
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
        const pos = await P.Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 20000 });
        lat = pos.coords.latitude; lon = pos.coords.longitude;
      } else {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 20000 }));
        lat = pos.coords.latitude; lon = pos.coords.longitude;
      }
      state.coords = { lat, lon };
      state.place = '';
      store.set('coords', state.coords);
      store.set('place', '');
    } catch (e) {
      if (!state.coords) {
        $('place').textContent = 'تعذر تحديد الموقع. فعّل GPS ثم اضغط "تحديث الموقع" في الإعدادات.';
        return;
      }
    }
    refresh();
  }

  function refresh() {
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

  // Tabs
  document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  });

  renderTasbih();
  if (state.coords) refresh();
  locate();
})();
