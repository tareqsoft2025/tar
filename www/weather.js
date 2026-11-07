// الحالة الجوية حسب الموقع (Open-Meteo، بدون مفتاح) مع حفظ آخر نتيجة للعمل دون اتصال
(function () {
  const { $, state, store } = App;
  const TTL = 30 * 60000;
  const MAP = (c, day) => {
    if (c === 0 || c === 1) return day ? ['sun', c === 0 ? 'صافٍ' : 'غالباً صافٍ'] : ['moon', 'صافٍ'];
    if (c === 2) return ['partly', 'غائم جزئياً'];
    if (c === 3) return ['cloud', 'غائم'];
    if (c === 45 || c === 48) return ['fog', 'ضباب'];
    if (c >= 51 && c <= 57) return ['rain', 'رذاذ'];
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ['rain', 'أمطار'];
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['snow', 'ثلوج'];
    if (c >= 95) return ['bolt', 'عاصفة رعدية'];
    return ['cloud', 'غائم'];
  };
  const deg = (v) => (v == null || isNaN(v) ? '--°' : Math.round(v) + '°');
  let busy = false;

  function paint(w) {
    if (!w) return;
    const [ic, txt] = MAP(w.code, w.day);
    $('wxIc').innerHTML = `<svg class="ic"><use href="#i-${ic}"/></svg>`;
    $('wxTemp').textContent = deg(w.t);
    $('wxDesc').textContent = txt;
    $('wxHi').textContent = deg(w.hi);
    $('wxLo').textContent = deg(w.lo);
  }

  async function load(force) {
    if (busy || !state.coords) return;
    const { lat, lon } = state.coords;
    const c = store.get('wx', null);
    const fresh = c && c.days && Date.now() - c.at < TTL && Core.distKm({ lat, lon }, { lat: c.lat, lon: c.lon }) < 5;
    if (c) paint(c);
    if (fresh && force !== true) return;
    busy = true;
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 9000);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(to);
      const j = await r.json();
      const w = { at: Date.now(), lat, lon, t: j.current.temperature_2m, code: j.current.weather_code, day: j.current.is_day === 1, hi: j.daily.temperature_2m_max[0], lo: j.daily.temperature_2m_min[0],
        feels: j.current.apparent_temperature, hum: j.current.relative_humidity_2m, wind: j.current.wind_speed_10m,
        days: j.daily.time.map((d, i) => ({ d, code: j.daily.weather_code[i], hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i], pp: (j.daily.precipitation_probability_max || [])[i] })) };
      store.set('wx', w);
      paint(w);
      if (!$('wxSheet').hidden) renderSheet();
    } catch (e) {
      if (!c) { $('wxDesc').textContent = 'الطقس غير متاح'; }
    }
    busy = false;
  }
  /* ----- نافذة توقعات الأسبوع ----- */
  const wdf = new Intl.DateTimeFormat('ar-PS', { weekday: 'long', timeZone: 'UTC' });
  const dmf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (n) => String(n).replace(/\d/g, (d) => AR[d]);
  function renderSheet() {
    const c = store.get('wx', null);
    const box = $('wxBody');
    if (!c) { box.innerHTML = '<div class="empty-msg">جارٍ تحميل التوقعات لموقعك…</div>'; return; }
    const [ic, txt] = MAP(c.code, c.day);
    const t = new Date(c.at).toLocaleTimeString('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
    let h = `<div class="wxs-hero"><div class="wxs-place"><svg class="ic"><use href="#i-pin"/></svg><b>${state.place || 'موقعك'}</b></div>
      <div class="wxs-now"><span class="wxs-ic"><svg class="ic"><use href="#i-${ic}"/></svg></span><span class="wxs-t">${deg(c.t)}</span><span class="wxs-d">${txt}</span></div>
      <div class="wxs-stats"><span><small>الإحساس</small><b>${deg(c.feels)}</b></span><span><small>الرطوبة</small><b>${c.hum == null ? '--' : Math.round(c.hum) + '%'}</b></span><span><small>الرياح</small><b>${c.wind == null ? '--' : Math.round(c.wind) + ' كم/س'}</b></span></div></div>`;
    if (c.days) {
      const lo = Math.min(...c.days.map((x) => x.lo)), hi = Math.max(...c.days.map((x) => x.hi)), span = Math.max(1, hi - lo);
      h += '<div class="wxs-sec">الأيام السبعة القادمة</div><div class="wxs-days">';
      c.days.forEach((x, i) => {
        const dt = new Date(x.d + 'T12:00:00Z');
        const name = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : wdf.format(dt);
        const [ic2, tx2] = MAP(x.code, true);
        const l = ((x.lo - lo) / span) * 100, w = Math.max(8, ((x.hi - x.lo) / span) * 100);
        h += `<div class="wxs-day${i === 0 ? ' today' : ''}"><div class="wxs-dn"><b>${name}</b><small>${dmf.format(dt)}</small></div>
          <div class="wxs-di"><svg class="ic"><use href="#i-${ic2}"/></svg><small>${x.pp > 0 ? x.pp + '%' : ''}</small></div>
          <div class="wxs-range"><em>${deg(x.lo)}</em><span class="bar"><i style="inset-inline-start:${l}%;width:${w}%"></i></span><em>${deg(x.hi)}</em></div></div>`;
      });
      h += '</div>';
    }
    h += `<div class="wxs-foot">آخر تحديث ${t} · المصدر Open-Meteo</div>`;
    box.innerHTML = h;
  }
  const openSheet = () => { $('wxSheet').hidden = false; renderSheet(); load(true); };
  const closeSheet = () => { $('wxSheet').hidden = true; };
  $('weatherCard').onclick = openSheet;
  $('wxSheet').onclick = (e) => { if (e.target.hasAttribute('data-close')) closeSheet(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  window.renderWeather = load;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 10 * 60000);
  load();
})();
