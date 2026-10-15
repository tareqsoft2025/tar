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

  // when: 'a:N' بعد الصلاة بـN دقيقة، 's:N' قبل الشروق بـN، 'm:N' قبل المغرب بـN، 'f' وقت ثابت
  const ADHKAR_DEFAULT = {
    morning: { on: true, when: 'a:25', fixed: '06:00' },
    evening: { on: true, when: 'a:20', fixed: '17:00' },
    sleep: { on: true, when: 'a:60', fixed: '22:00' }
  };
  // تذكيرات الجمعة: when: 'a:N' بعد الصلاة المرتبطة، 'b:N' قبلها، 'f' وقت ثابت
  const JUMAH_DEFAULT = {
    kahf: { on: true, when: 'a:30', fixed: '07:00' },     // سورة الكهف: بعد الفجر
    salawat: { on: true, when: 'f', fixed: '10:00' },      // الصلاة على النبي ﷺ
    prep: { on: true, when: 'b:90', fixed: '10:30' },      // الاستعداد للجمعة: غسل وطيب وتبكير
    hour: { on: true, when: 'a:5', fixed: '16:00' }        // ساعة الإجابة: آخر ساعة بعد العصر
  };
  function loadJumahCfg() {
    const saved = store.get('jumahCfg', null);
    const cfg = JSON.parse(JSON.stringify(JUMAH_DEFAULT));
    if (saved) Object.keys(cfg).forEach((k) => { if (saved[k]) Object.assign(cfg[k], saved[k]); });
    return cfg;
  }
  function loadAdhkarCfg() {
    const saved = store.get('adhkarCfg', null);
    const cfg = JSON.parse(JSON.stringify(ADHKAR_DEFAULT));
    if (saved) Object.keys(cfg).forEach((k) => { if (saved[k]) Object.assign(cfg[k], saved[k]); });
    else if (store.get('adhkarRemind', true) === false) Object.keys(cfg).forEach((k) => { cfg[k].on = false; });
    return cfg;
  }

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
      adhkarCfg: loadAdhkarCfg(),
      jumahCfg: loadJumahCfg(),                         // تذكيرات يوم الجمعة
      fridayLabel: store.get('fridayLabel', true),        // تسمية الظهر "الجمعة" يوم الجمعة                       // تذكير الأذكار: لكل نوع تشغيل + وقت
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

  // وقت جداري بتوقيت فلسطين -> لحظة زمنية
  function tzOffsetMs(ms) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms));
    const g = (t) => +p.find((x) => x.type === t).value;
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
  }
  function clockToEpoch(ds, hhmm) {
    const [y, m, d] = ds.split('-').map(Number);
    const [h, mi] = String(hhmm || '06:00').split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, h || 0, mi || 0);
    let t = wall - tzOffsetMs(wall);
    t = wall - tzOffsetMs(t);
    return t;
  }
  // وقت تذكير الأذكار لنوع معيّن في يوم معيّن
  function adhkarTime(type, cfg, t, ds) {
    const anchor = { morning: 'fajr', evening: 'asr', sleep: 'isha', kahf: 'fajr', salawat: 'dhuhr', prep: 'dhuhr', hour: 'asr' }[type];
    const w = cfg.when || 'a:0';
    if (w === 'f') return clockToEpoch(ds, cfg.fixed);
    const [kind, n] = w.split(':');
    const mins = (+n || 0) * 60000;
    if (kind === 'b') return t[anchor].getTime() - mins;
    if (kind === 's') return t.sunrise.getTime() - mins;
    if (kind === 'm') return t.maghrib.getTime() - mins;
    return t[anchor].getTime() + mins;
  }

  // اسم الصلاة: يوم الجمعة يصير الظهر «الجمعة»
  function nameFor(state, key, date) {
    if (key === 'dhuhr' && state.fridayLabel !== false && date && weekday(date) === 5) return 'الجمعة';
    return NAMES[key];
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
        const nm = nameFor(state, k, t[k]);
        const jum = nm === 'الجمعة';
        if (remind > 0) push(ms(k) - remind * 60000, jum ? 'اقتربت صلاة الجمعة' : `اقتربت صلاة ${nm}`, jum ? `تبقّى ${remind} دقائق على أذان الجمعة، بادر إلى المسجد` : `تبقّى ${remind} دقائق على أذان ${nm}`, jum ? { tab: 'jumah' } : null);
        push(ms(k), jum ? 'حان وقت صلاة الجمعة' : 'حان وقت الصلاة', jum ? 'حان الآن موعد صلاة الجمعة، لا تنسَ الإنصات للخطبة' : `حان الآن موعد صلاة ${nm}`, jum ? { tab: 'jumah' } : null);
      });
      // 2) تذكير لطيف إن لم تُسجَّل الصلاة قبل خروج وقتها
      if (state.nudge) {
        const end = { fajr: ms('sunrise'), dhuhr: ms('asr'), asr: ms('maghrib'), maghrib: ms('isha'), isha: ms('isha') + 120 * 60000 };
        PRAYERS.forEach((k) => {
          const at = end[k] - (k === 'isha' ? 0 : 15 * 60000);
          if (at > ms(k) + 20 * 60000) push(at, `هل صليت ${nameFor(state, k, t[k])}؟`, k === 'isha' ? 'سجّل صلاتك إن أدّيتها' : 'سجّل صلاتك قبل خروج الوقت', { tab: 'stats', chk: ds + '|' + k });
        });
      }
      // 3) تذكير الأذكار
      const cfg = state.adhkarCfg || ADHKAR_DEFAULT;
      if (cfg.morning.on) push(adhkarTime('morning', cfg.morning, t, ds), 'أذكار الصباح', 'ابدأ يومك بذكر الله', { tab: 'azkar:morning' });
      if (cfg.evening.on) push(adhkarTime('evening', cfg.evening, t, ds), 'أذكار المساء', 'حافظ على أذكار المساء', { tab: 'azkar:evening' });
      if (cfg.sleep.on) push(adhkarTime('sleep', cfg.sleep, t, ds), 'أذكار النوم', 'ختام يومك بذكر الله', { tab: 'azkar:sleep' });
      if (state.afterRemind) PRAYERS.forEach((k) => push(ms(k) + 10 * 60000, 'أذكار بعد الصلاة', `بعد صلاة ${NAMES[k]}`, { tab: 'azkar:after' }));
      // 3ب) يوم الجمعة: الكهف والصلاة على النبي والاستعداد وساعة الإجابة
      if (weekday(day) === 5 && state.jumahCfg) {
        const jc = state.jumahCfg;
        if (jc.prep.on) push(adhkarTime('prep', jc.prep, t, ds), 'استعد للجمعة', 'الغسل والطيب ولبس أحسن الثياب والتبكير إلى المسجد', { tab: 'jumah' });
        if (jc.kahf.on) push(adhkarTime('kahf', jc.kahf, t, ds), 'سورة الكهف', 'من قرأها يوم الجمعة أضاء له من النور ما بين الجمعتين', { tab: 'jumah' });
        if (jc.salawat.on) push(adhkarTime('salawat', jc.salawat, t, ds), 'أكثروا من الصلاة على النبي ﷺ', 'اللهم صل وسلم على نبينا محمد', { tab: 'jumah' });
        if (jc.hour.on) push(adhkarTime('hour', jc.hour, t, ds), 'ساعة الإجابة', 'آخر ساعة من يوم الجمعة: أكثر من الدعاء حتى المغرب', { tab: 'jumah' });
      }
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
      ORDER.forEach((k) => out.push({ k, n: nameFor(state, k, t[k]), at: t[k].getTime(), d: ds }));
    }
    return out;
  }

  window.Core = { NAMES, ORDER, PRAYERS, TZ, GPS, DEFAULT_CITY, store, loadState, cityCoords, coordsOf, distKm, nearestPlace, psDay, calc, notifications, times, hijri, hijriEvents, weekday, HIJRI_MONTHS, WEEKDAYS, nameFor };
})();
