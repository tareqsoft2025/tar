/* التقرير الأسبوعي للمدير: يُحسب محلياً من البيانات المحفوظة ثم يُرسم صورةً للمشاركة (واتساب) أو نصاً */
(function () {
  'use strict';
  const TZ = (window.Core && Core.TZ) || 'Asia/Hebron';
  const nf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, day: 'numeric', month: 'long' });
  const wd = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, weekday: 'short' });
  const noon = (ds) => new Date(ds + 'T12:00:00Z');
  const addDays = (ds, n) => { const d = noon(ds); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayStr = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); return p; };

  // نطاقات جاهزة: الأسبوع الماضي (٧ أيام تنتهي أمس) أو آخر ٧ أيام تنتهي اليوم
  function range(kind) {
    const t = dayStr();
    const to = kind === 'incl' ? t : addDays(t, -1);
    return { from: addDays(to, -6), to };
  }

  function build(r, opt) {
    const ok = (e) => !opt || !opt.filter || opt.filter(e);
    const days = [], late = {}, absent = {}, sites = {};
    let leaveDays = 0, lateMin = 0, lateN = 0, absentN = 0, presentN = 0, unsynced = 0, workDays = 0;
    for (let ds = r.from; ds <= r.to; ds = addDays(ds, 1)) {
      const rep = HR.dayReport(ds);
      if (rep.weekend) continue;
      if (!rep.synced) { unsynced++; days.push({ ds, synced: false }); continue; }
      workDays++;
      const d = { ds, synced: true, present: 0, late: 0, absent: 0, leave: 0 };
      rep.rows.filter((x) => ok(x.e)).forEach((x) => {
        if (x.status === 'present' || x.status === 'noin') { d.present++; presentN++; }
        else if (x.status === 'late') { d.late++; lateN++; lateMin += x.lateMin || 0; (late[x.e.id] = late[x.e.id] || { name: x.e.name, n: 0, min: 0 }); late[x.e.id].n++; late[x.e.id].min += x.lateMin || 0; presentN++; }
        else if (x.status === 'absent') { d.absent++; absentN++; (absent[x.e.id] = absent[x.e.id] || { name: x.e.name, n: 0 }).n++; }
        else if (x.status === 'leave') { d.leave++; leaveDays++; }
        if (x.list && x.list.length) {
          const ins = x.list.filter((y) => y.eventType === 'check_in'), ev = ins[ins.length - 1] || x.list[x.list.length - 1];
          const pl = HR.place(ev); const nm = pl.st === 'matched' ? (pl.name || 'موقع') : pl.st === 'outside' ? 'خارج نطاق المواقع' : null;
          if (nm) sites[nm] = (sites[nm] || 0) + 1;
        }
      });
      days.push(d);
    }
    const top = (o, k) => Object.values(o).sort((a, b) => b[k] - a[k] || a.name.localeCompare(b.name, 'ar')).slice(0, 5);
    const att = presentN + absentN;
    return {
      range: r, group: opt && opt.group || '', days, workDays, unsynced,
      rate: att ? Math.round(presentN * 100 / att) : null,
      presentN, lateN, lateMin, absentN, leaveDays,
      topLate: top(late, 'n'), topAbsent: top(absent, 'n'),
      topSites: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n })),
      pending: (HR.pendingReqs ? HR.pendingReqs().length : 0)
    };
  }

  const fmtD = (ds) => nf.format(noon(ds));
  function toText(D) {
    const L = [];
    L.push(`*التقرير الأسبوعي للموارد البشرية*${D.group ? ' — ' + D.group : ''}`);
    L.push(`${fmtD(D.range.from)} ← ${fmtD(D.range.to)}`);
    L.push('');
    L.push(`نسبة الحضور: *${D.rate == null ? '—' : D.rate + '%'}*`);
    L.push(`• حضور: ${D.presentN} · تأخر: ${D.lateN} (${D.lateMin} دقيقة) · بلا تسجيل: ${D.absentN} · إجازات: ${D.leaveDays}`);
    if (D.pending) L.push(`• طلبات معلّقة: ${D.pending}`);
    if (D.topLate.length) { L.push(''); L.push('*الأكثر تأخراً*'); D.topLate.forEach((x, i) => L.push(`${i + 1}. ${x.name} — ${x.n} مرة (${x.min} د)`)); }
    if (D.topAbsent.length) { L.push(''); L.push('*الأكثر غياباً (بلا تسجيل)*'); D.topAbsent.forEach((x, i) => L.push(`${i + 1}. ${x.name} — ${x.n} يوم`)); }
    if (D.topSites.length) { L.push(''); L.push('*أعلى المواقع حضوراً*'); D.topSites.forEach((x, i) => L.push(`${i + 1}. ${x.name} — ${x.n}`)); }
    if (D.unsynced) { L.push(''); L.push(`ملاحظة: ${D.unsynced} يوم غير مزامن استُبعد.`); }
    return L.join('\n');
  }

  // رسم الصورة (1080 عرضاً) بنمط داكن أنيق
  function toCanvas(D) {
    const W = 1080, pad = 56, sec = (n) => 70 + n * 52;
    const rows = Math.max(D.topLate.length, D.topAbsent.length, D.topSites.length);
    const H = 150 + 220 + 330 + 40 + sec(Math.max(D.topLate.length, D.topAbsent.length, 1)) + (D.topSites.length ? sec(D.topSites.length) : 0) + 120;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.direction = 'rtl'; c.textBaseline = 'alphabetic';
    const FF = (getComputedStyle(document.body).fontFamily || 'sans-serif');
    const font = (w, s) => { c.font = `${w} ${s}px ${FF}`; };
    const BG = '#0e1c20', CARD = '#162a2f', LINE = '#22393f', GOLD = '#d9b56b', TXT = '#eef3f2', MUT = '#8fa7a8', OK = '#4fbf8a', WARN = '#e0a03c', BAD = '#e0645a';
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    const rr = (x, y, w, h, r, fill, stroke) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } };
    const T = (s, x, y, col, w, sz, al) => { font(w || 500, sz || 30); c.fillStyle = col || TXT; c.textAlign = al || 'right'; c.fillText(String(s), x, y); };
    // رأس
    const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#1d3a3f'); g.addColorStop(1, '#2b4a3c'); c.fillStyle = g; c.fillRect(0, 0, W, 150);
    c.fillStyle = GOLD; c.fillRect(0, 146, W, 4);
    T('التقرير الأسبوعي للموارد البشرية', W - pad, 70, TXT, 800, 44);
    T(`${fmtD(D.range.from)} ← ${fmtD(D.range.to)}${D.group ? '  ·  ' + D.group : ''}`, W - pad, 118, GOLD, 600, 28);
    // مؤشرات
    let y = 190;
    const kp = [['نسبة الحضور', D.rate == null ? '—' : D.rate + '%', OK], ['تأخر', String(D.lateN), WARN], ['بلا تسجيل', String(D.absentN), BAD], ['إجازات', String(D.leaveDays), '#6aa7e0']];
    const kw = (W - pad * 2 - 3 * 20) / 4;
    kp.forEach((k, i) => { const x = W - pad - (i + 1) * kw - i * 20; rr(x, y, kw, 150, 22, CARD, LINE); T(k[1], x + kw / 2, y + 80, k[2], 800, 56, 'center'); T(k[0], x + kw / 2, y + 125, MUT, 500, 26, 'center'); });
    y += 190;
    // أعمدة الأيام
    rr(pad, y, W - pad * 2, 300, 22, CARD, LINE);
    T('الحضور اليومي', W - pad - 24, y + 48, TXT, 700, 30);
    [['حضور', OK], ['تأخر', WARN], ['بلا تسجيل', BAD], ['إجازة', '#6aa7e0']].forEach(([n, col], i) => { const lx = pad + 24 + i * 150; c.fillStyle = col; c.fillRect(lx, y + 28, 18, 18); T(n, lx + 28, y + 46, MUT, 500, 22, 'left'); });
    const ds = D.days, n = Math.max(ds.length, 1), bw = Math.min(70, (W - pad * 2 - 80) / n - 16), maxV = Math.max(1, ...ds.map((d) => d.synced ? d.present + d.late + d.absent + d.leave : 0));
    ds.forEach((d, i) => {
      const step = (W - pad * 2 - 120) / Math.max(n - 1, 1), cx = n === 1 ? W / 2 : W - pad - 60 - i * step;
      const base = y + 235, hMax = 130; let top = base;
      if (d.synced) [[d.present, OK], [d.late, WARN], [d.absent, BAD], [d.leave, '#6aa7e0']].forEach(([v, col]) => { if (!v) return; const h = v / maxV * hMax; top -= h; rr(cx - bw / 2, top, bw, h, 6, col); });
      else { T('—', cx, base - 10, MUT, 500, 28, 'center'); }
      T(wd.format(noon(d.ds)), cx, y + 268, MUT, 500, 22, 'center');
    });
    y += 330;
    const lst = (title, items, x, w, fmt, col) => {
      rr(x, y, w, sec(Math.max(items.length, 1)) - 10, 22, CARD, LINE);
      T(title, x + w - 24, y + 48, col, 700, 28);
      if (!items.length) T('لا شيء يُذكر', x + w - 24, y + 100, MUT, 500, 26);
      items.forEach((it, i) => { T(`${i + 1}. ${it.name}`, x + w - 24, y + 100 + i * 52, TXT, 500, 26); T(fmt(it), x + 24, y + 100 + i * 52, MUT, 500, 24, 'left'); });
    };
    const hw = (W - pad * 2 - 20) / 2;
    lst('الأكثر تأخراً', D.topLate, W - pad - hw, hw, (x) => x.n + ' مرة', WARN);
    lst('الأكثر غياباً', D.topAbsent, pad, hw, (x) => x.n + ' يوم', BAD);
    y += sec(Math.max(D.topLate.length, D.topAbsent.length, 1));
    if (D.topSites.length) { lst('أعلى المواقع حضوراً', D.topSites, pad, W - pad * 2, (x) => x.n + ' تسجيل', GOLD); y += sec(D.topSites.length); }
    T(`أُعدّ بتطبيق الموارد البشرية · ${fmtD(dayStr())}${D.unsynced ? ' · ' + D.unsynced + ' يوم غير مزامن مستبعد' : ''}`, W / 2, H - 40, MUT, 500, 22, 'center');
    return cv;
  }

  window.HRReport = { range, build, toText, toCanvas };
})();
