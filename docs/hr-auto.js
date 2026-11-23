/* التقرير التلقائي: يبني ملف Excel دون واجهة (تُشغّله خدمة الخلفية في الأندرويد في الوقت المحدد، والتطبيق مغلق).
   الإعدادات: { scope:'both'|'PEF'|'HHO'|'all', keys:[مفاتيح الأوراق], day:'today'|'yesterday' } */
(function () {
  'use strict';
  const LEAVE = { annual: 'سنوية', sick: 'مرضية', mission: 'مهمة عمل', task: 'مهمة', official: 'رسمية', unpaid: 'بدون راتب', leave: 'إجازة', holiday: 'عطلة', compensatory: 'تعويضية', maternity: 'أمومة', emergency: 'طارئة', marriage: 'زواج', study_leave: 'دراسية', official_duty: 'مهمة رسمية', work_mission: 'مهمة عمل', personal_hourly: 'مغادرة شخصية', hajj: 'حج', bereavement: 'وفاة', paternity: 'أبوة' };
  const leaveLbl = (n) => LEAVE[String(n || '').toLowerCase()] || n || 'إجازة';
  const PLACE = { matched: 'داخل موقع العمل', outside: 'خارج نطاق الموقع', unknown: 'بلا موقع جغرافي' };
  const plName = (pl) => pl.name || (pl.st === 'outside' && pl.near ? 'أقرب موقع: ' + pl.near : PLACE[pl.st] || '');
  const RQS = { draft: 'مسودة', submitted: 'مُرسل', pending: 'قيد الاعتماد', manager_approved: 'معتمد من المدير', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى', canceled: 'ملغى' };
  const rqStatus = (st) => (st ? [RQS[st] || st, 'mute'] : null);
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  async function build(cfg) {
    cfg = cfg || {};
    const today = Tracker.dayStr(), ds = cfg.date || (cfg.day === 'yesterday' ? addDays(today, -1) : today);
    const keys = (cfg.keys && cfg.keys.length ? cfg.keys : HRReport.SHEET_KEYS.map((x) => x[0]));
    const has = (...ks) => ks.some((k) => keys.includes(k));
    // بيانات حديثة: اليوم (مزامنة سريعة) أو يوم محدد، والشهر كاملاً إن طُلبت ورقة التأخر الشهري
    if (!cfg.noSync) { try { await HR.sync(null, ds !== today ? { from: ds, requests: true, background: !!cfg.background } : { requests: true, background: !!cfg.background }); } catch (e) { /* نكمل بالمحفوظ */ } }
    const ym = today.slice(0, 7), ex = new Set((HR.db.get('repExcl', []) || []).map(String));
    if (!cfg.noSync && has('lm') && window.HRReview && HRReport.lateMonth(ym, { exclude: ex }).unsynced.length) { try { await HR.sync(null, { from: ym + '-01', background: !!cfg.background }); } catch (e) { /* ignore */ } }
    const stamp = HR.meta().lastSync, exList = HR.employees().filter((e) => ex.has(String(e.id))).map((e) => ({ name: e.name, dept: e.dept || '', pos: e.pos || '', org: e.org }));
    const orgs = cfg.scope === 'PEF' ? ['PEF'] : cfg.scope === 'HHO' ? ['HHO'] : cfg.scope === 'all' ? [null] : ['PEF', 'HHO'];
    let sheets = [];
    orgs.forEach((v) => {
      const f = v ? (e) => e.org === v : (e) => !ex.has(String(e.id)), pre = v || '';
      if (v) sheets = sheets.concat(HRReport.sheetsDetail(HRReport.detail(ds, v, { exclude: ex, leaveLbl, placeName: plName, syncedAt: stamp, cfg: HR.settings() }), pre));
      else sheets = sheets.concat(HRReport.sheetsSummary(HRReport.daily(ds, { filter: f, band: (e) => e.org, syncedAt: stamp, placeName: plName, exList })));
      if (has('lm')) sheets = sheets.concat(HRReport.sheetsLateMonth(HRReport.lateMonth(ym, { filter: f, exclude: ex }), { pre, org: pre }));
      if (has('rqT', 'rqM')) sheets = sheets.concat(HRReport.sheetsRequests(HRReport.requestsOf({ filter: f, exclude: ex, leaveLbl, rqStatus }), { pre, org: pre }));
      if (has('wkC', 'wkP')) ['cur', 'prev'].forEach((k) => { sheets.push(HRReport.sheetsWeekHours(HRReport.weekHours(k, { filter: f, exclude: ex, band: (e) => e.org }), { pre })); });
    });
    const meta = { title: 'كشف الدوام — ' + ds };
    const picked = HRReport.pickSheets(sheets, keys), u8 = HRReport.xlsxOf(picked, meta);
    const tag = cfg.scope === 'both' || !cfg.scope ? 'pef-hho' : cfg.scope === 'all' ? 'daily' : cfg.scope.toLowerCase();
    return { u8, ds, name: `hr-${tag}-${ds}.xlsx`, sheets: picked.length, stamp: stamp || 0 };
  }
  window.HRAuto = { build };
})();
