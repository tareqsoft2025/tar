// منطق مشترك بين الواجهة والتحديث الخلفي: حساب المواقيت وبناء الإشعارات
(function () {
  const NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  const ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const TZ = 'Asia/Hebron';
  const GPS = 'الموقع الحالي (GPS)';
  const DEFAULT_CITY = 'القدس (المسجد الأقصى)';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  function loadState() {
    return {
      city: store.get('city', GPS), // الوضع الافتراضي: تحديد تلقائي بالموقع
      gps: store.get('gps', null),
      adj: store.get('adj', { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }),
      hijriAdj: store.get('hijriAdj', 0),
      method: store.get('method', 'Egyptian'),
      madhab: store.get('madhab', 'Shafi'),
      notify: store.get('notify', true),
      remind: store.get('remind', 5),
      mute: store.get('mute', {})
    };
  }

  function cityCoords(name) {
    for (const g of window.PLACES) for (const it of g.items) if (it[0] === name) return { lat: it[1], lon: it[2] };
    return null;
  }
  function coordsOf(state) {
    if (state.city === GPS && state.gps) return state.gps;
    if (state.city !== GPS) { const c = cityCoords(state.city); if (c) return c; }
    return cityCoords(DEFAULT_CITY);
  }
  function distKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // أقرب مدينة فلسطينية (للعرض فقط)
  function nearestPlace(c) {
    let best = null, bd = 1e9;
    for (const g of window.PLACES) for (const it of g.items) {
      const d = distKm(c, { lat: it[1], lon: it[2] });
      if (d < bd) { bd = d; best = it[0]; }
    }
    return bd <= 25 ? best.replace(/ \(.*\)/, '') : null;
  }
  // تاريخ اليوم بتقويم فلسطين حتى لو كان توقيت الجهاز مختلفاً
  function psDay(date) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
  }
  function calc(state, date) {
    const c = coordsOf(state);
    const p = adhan.CalculationMethod[state.method]();
    p.madhab = adhan.Madhab[state.madhab];
    ORDER.forEach((k) => { p.adjustments[k] = (p.adjustments[k] || 0) + (+state.adj[k] || 0); });
    return new adhan.PrayerTimes(new adhan.Coordinates(c.lat, c.lon), psDay(date), p);
  }
  // قائمة الإشعارات للأيام السبعة القادمة: تذكير قبل الصلاة + عند دخول الوقت
  function notifications(state, now) {
    now = now || new Date();
    const list = [];
    if (!state.notify) return list;
    const remind = +state.remind || 0;
    for (let d = 0; d < 7; d++) {
      const t = calc(state, new Date(now.getTime() + d * 864e5));
      PRAYERS.forEach((k) => {
        if (state.mute && state.mute[k]) return;
        const at = t[k].getTime();
        if (remind > 0 && at - remind * 60000 > now.getTime())
          list.push({ at: at - remind * 60000, title: `اقتربت صلاة ${NAMES[k]}`, body: `تبقّى ${remind} دقائق على أذان ${NAMES[k]}` });
        if (at > now.getTime())
          list.push({ at, title: 'حان وقت الصلاة', body: `حان الآن موعد صلاة ${NAMES[k]}` });
      });
    }
    list.sort((a, b) => a.at - b.at);
    return list;
  }

  // كل المواقيت للأيام القادمة (للودجت على الشاشة الرئيسية)
  function times(state, now) {
    now = now || new Date();
    const df = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
    const out = [];
    for (let d = -1; d <= 3; d++) {
      const dt = new Date(now.getTime() + d * 864e5);
      const t = calc(state, dt);
      const ds = df.format(dt);
      ORDER.forEach((k) => out.push({ k, n: NAMES[k], at: t[k].getTime(), d: ds }));
    }
    return out;
  }

  window.Core = { NAMES, ORDER, PRAYERS, TZ, GPS, DEFAULT_CITY, store, loadState, cityCoords, coordsOf, distKm, nearestPlace, psDay, calc, notifications, times };
})();
