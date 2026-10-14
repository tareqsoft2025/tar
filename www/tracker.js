// متابعة الصلوات: تسجيل "صليت"، السلسلة المتواصلة، الإحصاء الأسبوعي، وقضاء الفوائت
(function () {
  const store = Core.store, TZ = Core.TZ;
  const KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const dayStr = (d) => dfmt.format(d || new Date());
  const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return dfmt.format(new Date(Date.UTC(y, m - 1, d + n, 12))); };
  const dowOf = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
  const log = () => store.get('plog', {});

  function isLogged(ds, k) { const l = log(); return !!(l[ds] && l[ds][k]); }
  function count(ds) { const l = log()[ds] || {}; return KEYS.filter((k) => l[k]).length; }
  function loggedKeys() {
    const l = log(), out = [], today = dayStr();
    for (let i = 0; i < 3; i++) { const ds = addDays(today, -i); KEYS.forEach((k) => { if (l[ds] && l[ds][k]) out.push(ds + '|' + k); }); }
    return out;
  }
  // يرسل المسجّل للنسخة الأصلية كي لا يصل تذكير "هل صليت؟" لمن سجّل صلاته
  function syncNative() {
    if (window.AndroidBridge && AndroidBridge.setLogged) AndroidBridge.setLogged(JSON.stringify(loggedKeys()));
  }
  function toggle(ds, k) {
    const l = log();
    l[ds] = l[ds] || {};
    l[ds][k] = !l[ds][k];
    if (!l[ds][k]) delete l[ds][k];
    if (!Object.keys(l[ds]).length) delete l[ds];
    store.set('plog', l);
    syncNative();
    return !!(l[ds] && l[ds][k]);
  }
  // آخر 7 أيام (الأقدم أولاً)
  function week(today) {
    today = today || dayStr();
    const out = [];
    for (let i = 6; i >= 0; i--) { const ds = addDays(today, -i); out.push({ ds, n: count(ds), dow: dowOf(ds) }); }
    return out;
  }
  function streaks(today) {
    today = today || dayStr();
    const l = log();
    const full = (ds) => count(ds) === 5;
    // السلسلة الحالية: أيام كاملة متتالية حتى اليوم (واليوم الناقص لا يقطعها)
    let cur = 0, ds = full(today) ? today : addDays(today, -1);
    while (full(ds)) { cur++; ds = addDays(ds, -1); }
    // أفضل سلسلة
    const days = Object.keys(l).filter(full).sort();
    let best = 0, run = 0, prev = null;
    days.forEach((d) => { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; });
    return { current: cur, best: Math.max(best, cur) };
  }
  function totals() {
    const l = log();
    let all = 0; Object.keys(l).forEach((d) => { all += KEYS.filter((k) => l[d][k]).length; });
    return { all, days: Object.keys(l).length };
  }
  // قضاء الصلوات
  const qada = () => store.get('qada', { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 });
  function setQada(k, v) { const q = qada(); q[k] = Math.max(0, Math.min(99999, v | 0)); store.set('qada', q); return q; }

  window.Tracker = { KEYS, dayStr, addDays, dowOf, isLogged, count, toggle, week, streaks, totals, syncNative, qada, setQada };
})();
