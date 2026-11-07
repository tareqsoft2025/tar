// مساعدات التاريخ وقضاء الفوائت
(function () {
  const store = Core.store, TZ = Core.TZ;
  const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const dayStr = (d) => dfmt.format(d || new Date());
  const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return dfmt.format(new Date(Date.UTC(y, m - 1, d + n, 12))); };
  const dowOf = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
  // قضاء الصلوات
  const qada = () => store.get('qada', { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 });
  function setQada(k, v) { const q = qada(); q[k] = Math.max(0, Math.min(99999, v | 0)); store.set('qada', q); return q; }

  window.Tracker = { dayStr, addDays, dowOf, qada, setQada };
})();
