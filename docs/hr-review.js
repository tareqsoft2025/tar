/* المراجعة الشهرية: تجميع حضور كل موظف على مدار الشهر (غياب، تأخر، ساعات، مغادرات شخصية، مهام، عمل بعطلة)
   يُحسب محلياً من البيانات المحفوظة فقط، بلا أي طلب للنظام. */
(function () {
  'use strict';
  const TZ = (window.Core && Core.TZ) || 'Asia/Hebron';
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const todayS = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const hmMin = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
  // مدة الطلب بالدقائق: من الساعات المسجّلة أو من الفرق بين وقتي المغادرة والعودة
  function durMin(q) {
    if (q.hours != null && q.hours !== '' && isFinite(+q.hours)) return Math.round(+q.hours * 60);
    let a = hmMin(q.start), b = hmMin(q.end);
    if ((a == null || b == null) && q.planned) { const m = /(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/.exec(q.planned); if (m) { a = hmMin(m[1]); b = hmMin(m[2]); } }
    return a != null && b != null && b > a ? b - a : 0;
  }

  function month(ym, ok) {
    const first = ym + '-01', t = todayS();
    let last = first; for (let d = first; d.slice(0, 7) === ym; d = addDays(d, 1)) last = d;
    const upto = last > t ? t : last, emps = {}, unsynced = [], days = [];
    for (let ds = first; ds <= upto; ds = addDays(ds, 1)) {
      const rep = HR.dayReport(ds);
      days.push({ ds, weekend: !!rep.weekend, synced: !!rep.synced });
      if (!rep.synced) { if (!rep.weekend) unsynced.push(ds); continue; }
      rep.rows.forEach((r) => {
        if (ok && !ok(r.e)) return;
        const E = emps[r.e.id] = emps[r.e.id] || { e: r.e, d: {}, c: { absent: 0, late: 0, lateMin: 0, present: 0, leave: 0, personalN: 0, personalMin: 0, missionN: 0, holidayN: 0, otN: 0, workMin: 0, noOut: 0 } };
        const c = E.c, reqs = r.reqs || [];
        const personal = reqs.filter((q) => q.kind === 'hourly'), mission = reqs.filter((q) => q.kind === 'mission'), ot = reqs.filter((q) => q.kind === 'overtime'), hol = reqs.filter((q) => q.kind === 'holiday');
        const worked = !!(r.list && r.list.length);
        const holidayWork = (rep.weekend && worked) || hol.length > 0;
        const rec = { ds, weekend: !!rep.weekend, status: r.status, firstIn: r.firstIn, lastOut: r.lastOut, workMin: r.workMin || 0, lateMin: r.lateMin || 0, live: !!r.live, personal, mission, ot, hol, leave: r.leave || null, holidayWork, outside: !!r.outside, n: worked ? r.list.length : 0 };
        E.d[ds] = rec;
        if (holidayWork) { c.holidayN++; c.workMin += rec.workMin; return; }
        if (rep.weekend) return;
        if (r.status === 'absent') c.absent++;
        else if (r.status === 'leave') c.leave++;
        else if (r.status === 'late') { c.late++; c.lateMin += rec.lateMin; c.present++; }
        else if (r.status === 'present' || r.status === 'noin') c.present++;
        if (worked && !r.lastOut && !r.live && ds !== t) c.noOut++;
        c.workMin += rec.workMin;
        c.personalN += personal.length; c.personalMin += personal.reduce((s, q) => s + durMin(q), 0);
        c.missionN += mission.length; c.otN += ot.length;
      });
    }
    const list = Object.values(emps).map((E) => {
      const c = E.c, flags = [];
      if (c.absent) flags.push('abs'); if (c.late >= 3 || c.lateMin >= 60) flags.push('late'); if (c.personalMin >= 240) flags.push('per'); if (c.holidayN) flags.push('hol'); if (c.noOut >= 2) flags.push('noout');
      c.need = c.absent > 0 || c.late >= 3 || c.lateMin >= 60 || c.noOut >= 3;
      c.score = c.absent * 6 + c.late * 2 + c.lateMin / 30 + c.personalMin / 120 + c.noOut;
      E.flags = flags; return E;
    }).sort((a, b) => b.c.score - a.c.score || a.e.name.localeCompare(b.e.name, 'ar'));
    const tot = list.reduce((s, E) => { s.absent += E.c.absent; s.late += E.c.late; s.lateMin += E.c.lateMin; s.holiday += E.c.holidayN; s.need += E.c.need ? 1 : 0; s.personalMin += E.c.personalMin; s.mission += E.c.missionN; return s; }, { absent: 0, late: 0, lateMin: 0, holiday: 0, need: 0, personalMin: 0, mission: 0 });
    return { ym, first, last: upto, days, unsynced, list, tot, workDays: days.filter((d) => d.synced && !d.weekend).length };
  }
  window.HRReview = { month, durMin };
})();
