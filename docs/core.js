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
      mute: store.get('mute', {}),
      nudge: store.get('nudge', true),               // تذكير لطيف إذا لم تُسجَّل الصلاة
      adhkarRemind: store.get('adhkarRemind', true),  // أذكار الصباح والمساء والنوم
      afterRemind: store.get('afterRemind', false),   // أذكار بعد الصلاة
      fastRemind: store.get('fastRemind', false),     // صيام الاثنين والخميس
      eventsRemind: store.get('eventsRemind', false)  // الأيام البيض والمناسبات
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
  /* ---- التقويم الهجري ---- */
  const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' });
  function hijri(date, adj) {
    const p = hijriFmt.formatToParts(new Date(date.getTime() + (adj || 0) * 864e5));
    const g = (t) => +p.find((x) => x.type === t).value;
    return { d: g('day'), m: g('month'), y: g('year') };
  }
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
  const weekday = (date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdFmt.format(date));
  // مناسبات التقويم الهجري: label + kind (eid | fast | night | white)
  function hijriEvents(h) {
    const out = [];
    const add = (label, kind) => out.push({ label, kind });
    if (h.m === 1 && h.d === 1) add('رأس السنة الهجرية', 'eid');
    if (h.m === 1 && h.d === 9) add('تاسوعاء (يُستحب صيامه)', 'fast');
    if (h.m === 1 && h.d === 10) add('يوم عاشوراء', 'fast');
    if (h.m === 9 && h.d === 1) add('أول أيام رمضان', 'eid');
    if (h.m === 9 && h.d >= 21) add('العشر الأواخر من رمضان (تُلتمس ليلة القدر)', 'night');
    if (h.m === 10 && h.d === 1) add('عيد الفطر المبارك', 'eid');
    if (h.m === 12 && h.d === 9) add('يوم عرفة (يُستحب صيامه لغير الحاج)', 'fast');
    if (h.m === 12 && h.d === 10) add('عيد الأضحى المبارك', 'eid');
    if (h.m === 12 && h.d >= 11 && h.d <= 13) add('أيام التشريق', 'eid');
    if (h.d >= 13 && h.d <= 15 && !(h.m === 12 && h.d === 13) && !(h.m === 9 && false)) add('من الأيام البيض (يُستحب صيامها)', 'white');
    return out;
  }

  // قائمة الإشعارات للأيام السبعة القادمة
  function notifications(state, now) {
    now = now || new Date();
    const nowMs = now.getTime();
    const list = [];
    const remind = +state.remind || 0;
    const dstr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
    const push = (at, title, body, extra) => { if (at > nowMs) list.push(Object.assign({ at, title, body }, extra || {})); };
    for (let d = 0; d < 7; d++) {
      const day = new Date(nowMs + d * 864e5);
      const ds = dstr(day);
      const t = calc(state, day);
      const ms = (k) => t[k].getTime();
      // 1) الصلاة: تذكير قبلها + عند دخول الوقت
      if (state.notify) PRAYERS.forEach((k) => {
        if (state.mute && state.mute[k]) return;
        if (remind > 0) push(ms(k) - remind * 60000, `اقتربت صلاة ${NAMES[k]}`, `تبقّى ${remind} دقائق على أذان ${NAMES[k]}`);
        push(ms(k), 'حان وقت الصلاة', `حان الآن موعد صلاة ${NAMES[k]}`);
      });
      // 2) تذكير لطيف إن لم تُسجَّل الصلاة قبل خروج وقتها
      if (state.nudge) {
        const end = { fajr: ms('sunrise'), dhuhr: ms('asr'), asr: ms('maghrib'), maghrib: ms('isha'), isha: ms('isha') + 120 * 60000 };
        PRAYERS.forEach((k) => {
          const at = end[k] - (k === 'isha' ? 0 : 15 * 60000);
          if (at > ms(k) + 20 * 60000) push(at, `هل صليت ${NAMES[k]}؟`, k === 'isha' ? 'سجّل صلاتك إن أدّيتها' : 'سجّل صلاتك قبل خروج الوقت', { tab: 'stats', chk: ds + '|' + k });
        });
      }
      // 3) تذكير الأذكار
      if (state.adhkarRemind) {
        if (ms('fajr') + 25 * 60000 < ms('sunrise')) push(ms('fajr') + 25 * 60000, 'أذكار الصباح', 'ابدأ يومك بذكر الله', { tab: 'azkar:morning' });
        push(ms('asr') + 20 * 60000, 'أذكار المساء', 'حافظ على أذكار المساء', { tab: 'azkar:evening' });
        push(ms('isha') + 60 * 60000, 'أذكار النوم', 'ختام يومك بذكر الله', { tab: 'azkar:sleep' });
      }
      if (state.afterRemind) PRAYERS.forEach((k) => push(ms(k) + 10 * 60000, 'أذكار بعد الصلاة', `بعد صلاة ${NAMES[k]}`, { tab: 'azkar:after' }));
      // 4) صيام الاثنين والخميس + الأيام البيض والمناسبات: تنبيه مساء اليوم السابق
      const at = ms('isha') + 30 * 60000;
      const tomorrow = new Date(nowMs + (d + 1) * 864e5);
      const wd = weekday(tomorrow);
      if (state.fastRemind && (wd === 1 || wd === 4)) push(at, `غداً ${WEEKDAYS[wd]}`, 'سنّة الصيام: هل تنوي صيام غدٍ؟', { tab: 'calendar' });
      if (state.eventsRemind) {
        const hh = hijri(tomorrow, state.hijriAdj);
        if (hh.d === 13) push(at, 'غداً أول الأيام البيض', 'يُستحب صيام 13 و14 و15 من الشهر الهجري', { tab: 'calendar' });
        hijriEvents(hh).filter((e) => e.kind === 'fast' || (e.kind === 'eid' && (hh.m === 9 || hh.d === 10 || hh.m === 1)))
          .filter((e) => !/الأيام البيض|التشريق/.test(e.label)).slice(0, 1)
          .forEach((e) => push(at, `غداً: ${e.label}`, `${hh.d} ${HIJRI_MONTHS[hh.m - 1]} ${hh.y}`, { tab: 'calendar' }));
      }
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

  window.Core = { NAMES, ORDER, PRAYERS, TZ, GPS, DEFAULT_CITY, store, loadState, cityCoords, coordsOf, distKm, nearestPlace, psDay, calc, notifications, times, hijri, hijriEvents, weekday, HIJRI_MONTHS, WEEKDAYS };
})();
