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

  async function load() {
    if (busy || !state.coords) return;
    const { lat, lon } = state.coords;
    const c = store.get('wx', null);
    const fresh = c && Date.now() - c.at < TTL && Core.distKm({ lat, lon }, { lat: c.lat, lon: c.lon }) < 5;
    if (c) paint(c);
    if (fresh) return;
    busy = true;
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 9000);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(to);
      const j = await r.json();
      const w = { at: Date.now(), lat, lon, t: j.current.temperature_2m, code: j.current.weather_code, day: j.current.is_day === 1, hi: j.daily.temperature_2m_max[0], lo: j.daily.temperature_2m_min[0] };
      store.set('wx', w);
      paint(w);
    } catch (e) {
      if (!c) { $('wxDesc').textContent = 'الطقس غير متاح'; }
    }
    busy = false;
  }
  window.renderWeather = load;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 10 * 60000);
  load();
})();
