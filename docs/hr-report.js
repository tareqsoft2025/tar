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


  /* ---------- الصورة اليومية: حالة الدوام + حسب السلم + من بلا تسجيل ---------- */
  // opt = { filter(e), band(e) → اسم السلم، group, syncedAt }
  function daily(ds, opt) {
    opt = opt || {};
    const rep = HR.dayReport(ds), ok = (e) => !opt.filter || opt.filter(e);
    const rows = rep.rows.filter((r) => ok(r.e));
    const c = { total: rows.length, present: 0, late: 0, leave: 0, mission: 0, hwork: 0, unreg: 0, off: 0 };
    const bands = {}, late = [], unreg = [];
    rows.forEach((r) => {
      const band = (opt.band && opt.band(r.e)) || r.e.org || '—';
      const B = bands[band] = bands[band] || { name: band, total: 0, present: 0, late: 0, leave: 0, unreg: 0 };
      const other = (r.reqs || []).filter((q) => q.kind !== 'daily');          // مهمة/مغادرة/عمل إضافي…
      B.total++;
      if (r.status === 'late') { c.late++; B.late++; late.push({ name: r.e.name, min: r.lateMin || 0, at: r.firstIn }); }
      else if (r.status === 'present' || r.status === 'noin') { c.present++; B.present++; }
      else if (r.status === 'hwork') { c.hwork++; }
      else if (r.status === 'leave') { c.leave++; B.leave++; }
      else if (r.status === 'off') { c.off++; }
      else if (r.status === 'absent') {
        if (other.length) { c.mission++; B.leave++; }                              // لديه مهمة أو طلب ذلك اليوم
        else { c.unreg++; B.unreg++; unreg.push({ name: r.e.name, dept: r.e.dept || '', band }); }
      }
    });
    const expected = c.total - c.off - c.hwork;
    const here = c.present + c.late;
    return {
      ds, synced: rep.synced, weekend: !!rep.weekend, group: opt.group || '', syncedAt: opt.syncedAt || null, c,
      rate: expected > 0 ? Math.round(here * 100 / expected) : null,
      bands: Object.values(bands).sort((a, b) => b.total - a.total),
      late: late.sort((a, b) => b.min - a.min), unreg: unreg.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    };
  }
  const dfull = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const tmf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  const dataStamp = (D) => D.syncedAt ? `بيانات حتى ${tmf.format(new Date(D.syncedAt))}` : '';
  function dailyText(D) {
    const c = D.c, L = [];
    L.push(`*حالة الدوام — ${dfull.format(noon(D.ds))}*${D.group ? ' — ' + D.group : ''}`);
    if (dataStamp(D)) L.push(dataStamp(D));
    L.push('');
    L.push(`نسبة الحضور: *${D.rate == null ? '—' : D.rate + '%'}* (${c.present + c.late} من ${c.total - c.off - c.hwork})`);
    L.push(`• حاضر: ${c.present} · متأخر: ${c.late} · إجازة: ${c.leave} · مهام: ${c.mission} · بلا تسجيل: ${c.unreg}${c.hwork ? ' · دوام في عطلة: ' + c.hwork : ''}`);
    if (D.bands.length > 1) { L.push(''); L.push('*حسب السلم*'); D.bands.forEach((b) => L.push(`• ${b.name}: ${b.present + b.late}/${b.total} حضور · ${b.late} متأخر · ${b.unreg} بلا تسجيل`)); }
    if (D.late.length) { L.push(''); L.push('*المتأخرون*'); D.late.slice(0, 10).forEach((x, i) => L.push(`${i + 1}. ${x.name} — ${x.min} د`)); }
    if (D.unreg.length) { L.push(''); L.push('*بلا تسجيل (لا مهام ولا إجازة)*'); D.unreg.slice(0, 20).forEach((x, i) => L.push(`${i + 1}. ${x.name}`)); if (D.unreg.length > 20) L.push(`+${D.unreg.length - 20} آخرون`); }
    return L.join('\n');
  }
  function dailyCanvas(D) {
    const W = 1080, pad = 56, c = D.c;
    const nB = Math.min(D.bands.length, 6), nL = Math.min(D.late.length, 8), nU = Math.min(D.unreg.length, 16);
    const uRows = Math.ceil(nU / 2);
    const H = 150 + 40 + 330 + 30 + (nB ? 90 + nB * 62 + 34 : 0) + (nL ? 90 + nL * 52 + 44 : 0) + 20 + (D.unreg.length ? 90 + uRows * 52 + (D.unreg.length > nU ? 46 : 0) : 90) + 14 + 110;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.direction = 'rtl'; g.textBaseline = 'alphabetic';
    const FF = (getComputedStyle(document.body).fontFamily || 'sans-serif');
    const BG = '#0e1c20', CARD = '#162a2f', LINE = '#22393f', GOLD = '#d9b56b', TXT = '#eef3f2', MUT = '#8fa7a8', OK = '#4fbf8a', WARN = '#e0a03c', BAD = '#e0645a', INFO = '#6aa7e0';
    const font = (w, sz) => { g.font = `${w} ${sz}px ${FF}`; };
    const T = (s, x, y, col, w, sz, al) => { font(w || 500, sz || 28); g.fillStyle = col || TXT; g.textAlign = al || 'right'; g.fillText(String(s), x, y); };
    const rr = (x, y, w, h, r, fill, stroke) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    // رأس
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#1d3a3f'); gr.addColorStop(1, '#2b4a3c'); g.fillStyle = gr; g.fillRect(0, 0, W, 150);
    g.fillStyle = GOLD; g.fillRect(0, 146, W, 4);
    T('حالة الدوام اليومية', W - pad, 66, TXT, 800, 44);
    T(`${dfull.format(noon(D.ds))}${D.group ? '  ·  ' + D.group : ''}`, W - pad, 116, GOLD, 600, 28);
    const stamp = D.synced ? dataStamp(D) : 'حضور هذا اليوم غير مزامَن';
    if (stamp) T(stamp, pad, 116, '#bcd0cf', 500, 24, 'left');
    let y = 190;
    // دائرة نسبة الحضور + مؤشرات
    rr(pad, y, W - pad * 2, 330, 26, CARD, LINE);
    const cx = pad + 180, cy = y + 165, R = 112, rate = D.rate == null ? 0 : D.rate / 100;
    g.lineWidth = 26; g.lineCap = 'round';
    g.strokeStyle = LINE; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    const parts = [[c.present, OK], [c.late, WARN]]; let a0 = -Math.PI / 2; const tot = Math.max(1, c.total - c.off - c.hwork);
    parts.forEach(([v, col]) => { if (!v) return; const a1 = a0 + (v / tot) * Math.PI * 2; g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, R, a0, a1 - 0.02); g.stroke(); a0 = a1; });
    T(D.rate == null ? '—' : D.rate + '%', cx, cy + 14, TXT, 800, 62, 'center'); T('نسبة الحضور', cx, cy + 56, MUT, 500, 24, 'center');
    const kp = [['حاضر', c.present, OK], ['متأخر', c.late, WARN], ['إجازة', c.leave, INFO], ['مهام/طلبات', c.mission, '#b388e0'], ['بلا تسجيل', c.unreg, BAD], ['دوام بعطلة', c.hwork, GOLD]];
    const kx0 = pad + 400, kw = (W - pad - kx0 - 20) / 3 - 14;
    kp.forEach(([n, v, col], i) => { const col_ = i % 3, row_ = Math.floor(i / 3); const x = W - pad - 24 - (col_ + 1) * kw - col_ * 14, yy = y + 36 + row_ * 140; rr(x, yy, kw, 122, 18, 'rgba(255,255,255,.04)', LINE); T(v, x + kw / 2, yy + 66, col, 800, 50, 'center'); T(n, x + kw / 2, yy + 104, MUT, 500, 22, 'center'); });
    y += 360;
    // حسب السلم
    if (nB) {
      rr(pad, y, W - pad * 2, 90 + nB * 62 + 4, 22, CARD, LINE);
      T('حسب السلم', W - pad - 24, y + 52, GOLD, 700, 30);
      D.bands.slice(0, nB).forEach((b, i) => {
        const yy = y + 100 + i * 62, bw = 420, bx = pad + 24 + 300;
        T(b.name.length > 18 ? b.name.slice(0, 17) + '…' : b.name, W - pad - 24, yy + 30, TXT, 600, 26);
        const sc = b.total || 1; let x = bx;
        [[b.present, OK], [b.late, WARN], [b.leave, INFO], [b.unreg, BAD]].forEach(([v, col]) => { if (!v) return; const w = v / sc * bw; rr(x, yy + 6, Math.max(w - 2, 4), 26, 8, col); x += w; });
        T(`${b.present + b.late}/${b.total}`, pad + 24 + 220, yy + 30, TXT, 700, 26, 'left');
        T(b.unreg ? `${b.unreg} بلا تسجيل` : '', pad + 24 + 190, yy + 30, BAD, 600, 22, 'right');
      });
      y += 90 + nB * 62 + 34;
    }
    // المتأخرون
    if (nL) {
      rr(pad, y, W - pad * 2, 90 + nL * 52 + 14, 22, CARD, LINE);
      T(`المتأخرون (${D.late.length})`, W - pad - 24, y + 52, WARN, 700, 30);
      D.late.slice(0, nL).forEach((x, i) => { const yy = y + 90 + i * 52; T(`${i + 1}. ${x.name}`, W - pad - 24, yy + 26, TXT, 500, 26); T(`${x.min} دقيقة${x.at ? '  ·  ' + tmf.format(new Date(x.at)) : ''}`, pad + 24, yy + 26, MUT, 500, 24, 'left'); });
      y += 90 + nL * 52 + 44;
    }
    // بلا تسجيل
    rr(pad, y, W - pad * 2, (D.unreg.length ? 90 + uRows * 52 + (D.unreg.length > nU ? 46 : 0) : 90) + 14, 22, CARD, LINE);
    T(`بلا تسجيل — لا مهام ولا إجازة (${D.unreg.length})`, W - pad - 24, y + 52, BAD, 700, 30);
    if (!D.unreg.length) T('الجميع مسجَّل أو لديه إجازة/مهمة ✔', W - pad - 24, y + 92, OK, 600, 26);
    D.unreg.slice(0, nU).forEach((x, i) => { const colI = i % 2, rowI = Math.floor(i / 2); const colW = (W - pad * 2 - 48) / 2; const xr = W - pad - 24 - colI * colW; T(`${i + 1}. ${x.name}`, xr, y + 108 + rowI * 52, TXT, 500, 25); });
    if (D.unreg.length > nU) T(`+${D.unreg.length - nU} آخرون`, W - pad - 24, y + 100 + uRows * 52 + 20, MUT, 600, 24);
    T(`أُعدّ بتطبيق الموارد البشرية${dataStamp(D) ? ' · ' + dataStamp(D) : ''}`, W / 2, H - 38, MUT, 500, 22, 'center');
    return cv;
  }


  /* ---------- التقرير التفصيلي لجهة واحدة (PEF أو HHO): كل الأسماء ---------- */
  // opt = { exclude:Set, leaveLbl(n), placeName(pl), syncedAt, cfg:{office,field,grace} }
  function detail(ds, org, opt) {
    opt = opt || {};
    const rep = HR.dayReport(ds), ex = opt.exclude || new Set();
    const all = rep.rows.filter((r) => r.e.org === org);
    const rows = all.filter((r) => !ex.has(String(r.e.id)));
    const byName = (a, b) => a.name.localeCompare(b.name, 'ar');
    const att = [], leave = [], mis = [], unreg = [], late = [];
    rows.forEach((r) => {
      const nm = r.e.name, tm = (iso) => (iso ? tmf.format(new Date(iso)) : '');
      if (r.list && r.list.length) {
        const ins = r.list.filter((x) => x.eventType === 'check_in'), outs = r.list.filter((x) => x.eventType === 'check_out');
        const fi = ins[0] || r.list[0], lo = outs[outs.length - 1];
        const pl = HR.place(fi), pn = opt.placeName ? opt.placeName(pl) : (pl.name || '');
        const lpl = lo ? HR.place(lo) : null, lpn = lo && opt.placeName ? opt.placeName(lpl) : '';
        att.push({ name: nm, in: tm(r.firstIn), out: lo ? tm(r.lastOut) : (r.live ? 'مستمر' : ''), place: pn, outPlace: lpn && lpn !== pn ? lpn : '', st: pl.st, late: r.status === 'late' ? r.lateMin : 0, hwork: r.status === 'hwork' });
        if (r.status === 'late') late.push({ name: nm, min: r.lateMin || 0, in: tm(r.firstIn), type: r.e.type });
      }
      if (r.status === 'leave') leave.push({ name: nm, label: opt.leaveLbl ? opt.leaveLbl(r.leave) : 'إجازة' });
      (r.reqs || []).filter((q) => q.kind === 'mission' || q.kind === 'hourly').forEach((q) => {
        const t = q.planned || (q.start && q.end ? q.start + ' ← ' + q.end : q.start || '');
        mis.push({ name: nm, kind: q.kind === 'mission' ? 'مهمة عمل' : 'مغادرة', time: t, what: q.project || q.reason || '' });
      });
      const other = (r.reqs || []).filter((q) => q.kind !== 'daily');
      if (r.status === 'absent' && !other.length) unreg.push({ name: nm, dept: r.e.dept || '' });
    });
    att.sort(byName); leave.sort(byName); mis.sort(byName); unreg.sort(byName); late.sort((a, b) => b.min - a.min);
    return {
      ds, org, synced: rep.synced, weekend: !!rep.weekend, syncedAt: opt.syncedAt || null, cfg: opt.cfg || {},
      total: rows.length, excluded: all.length - rows.length, att, leave, mis, unreg, late
    };
  }
  function detailCanvas(D) {
    const W = 1080, pad = 48, RH = 46;
    const sec = (n) => 84 + Math.max(n, 1) * RH + 18;
    const H = 170 + 120 + sec(D.att.length) + sec(D.leave.length) + sec(D.mis.length) + sec(D.unreg.length) + sec(D.late.length) + 90;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.direction = 'rtl'; g.textBaseline = 'alphabetic';
    const FF = (getComputedStyle(document.body).fontFamily || 'sans-serif');
    const BG = '#0e1c20', CARD = '#162a2f', LINE = '#22393f', GOLD = '#d9b56b', TXT = '#eef3f2', MUT = '#8fa7a8', OK = '#4fbf8a', WARN = '#e0a03c', BAD = '#e0645a', INFO = '#6aa7e0', PUR = '#b388e0';
    const font = (w, sz) => { g.font = `${w} ${sz}px ${FF}`; };
    const fit = (s, maxW, w, sz) => { font(w, sz); s = String(s); if (g.measureText(s).width <= maxW) return s; while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
    const T = (s, x, y, col, w, sz, al, maxW) => { const t = maxW ? fit(s, maxW, w || 500, sz || 24) : String(s); font(w || 500, sz || 24); g.fillStyle = col || TXT; g.textAlign = al || 'right'; g.fillText(t, x, y); };
    const rr = (x, y, w, h, r, fill, stroke) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#1d3a3f'); gr.addColorStop(1, '#2b4a3c'); g.fillStyle = gr; g.fillRect(0, 0, W, 170);
    g.fillStyle = GOLD; g.fillRect(0, 166, W, 4);
    T(`كشف الدوام — ${D.org}`, W - pad, 72, TXT, 800, 46);
    T(dfull.format(noon(D.ds)), W - pad, 122, GOLD, 600, 28);
    const stamp = D.synced ? dataStamp(D) : 'حضور هذا اليوم غير مزامَن';
    if (stamp) T(stamp, pad, 122, '#bcd0cf', 500, 23, 'left');
    // ملخص
    let y = 196;
    const sm = [['الموظفون', D.total, TXT], ['حضور', D.att.length, OK], ['متأخرون', D.late.length, WARN], ['إجازة', D.leave.length, INFO], ['مهام/مغادرات', D.mis.length, PUR], ['بلا تسجيل', D.unreg.length, BAD]];
    const cw = (W - pad * 2 - 5 * 10) / 6;
    sm.forEach(([n, v, col], i) => { const x = W - pad - (i + 1) * cw - i * 10; rr(x, y, cw, 96, 16, CARD, LINE); T(v, x + cw / 2, y + 52, col, 800, 38, 'center'); T(n, x + cw / 2, y + 82, MUT, 500, 19, 'center'); });
    y += 120;
    const section = (title, col, items, draw, emptyMsg) => {
      rr(pad, y, W - pad * 2, sec(items.length) - 18, 20, CARD, LINE);
      g.fillStyle = col; g.fillRect(W - pad - 6, y + 22, 6, 36);
      T(`${title} (${items.length})`, W - pad - 24, y + 52, col, 800, 30);
      if (!items.length) T(emptyMsg || '—', W - pad - 24, y + 84 + 30, MUT, 500, 24);
      items.forEach((it, i) => { const yy = y + 78 + i * RH; if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(pad + 12, yy, W - pad * 2 - 24, RH); } draw(it, yy + 31, i); });
      y += sec(items.length);
    };
    const R = W - pad - 24;   // الحافة اليمنى للنص
    section('الحضور — الوقت والموقع', OK, D.att, (x, yy, i) => {
      T(`${i + 1}. ${x.name}`, R, yy, x.late ? WARN : TXT, 600, 24, 'right', 330);
      T(`${x.in}${x.out ? ' ← ' + x.out : ''}`, R - 360, yy, x.late ? WARN : OK, 700, 23, 'right', 230);
      T(`${x.place || '—'}${x.outPlace ? ' · خروج: ' + x.outPlace : ''}`, pad + 24, yy, x.st === 'outside' ? BAD : MUT, 500, 22, 'left', 380);
    }, 'لا تسجيلات حضور');
    section('الإجازات', INFO, D.leave, (x, yy, i) => { T(`${i + 1}. ${x.name}`, R, yy, TXT, 600, 24, 'right', 520); T(x.label, pad + 24, yy, INFO, 600, 23, 'left'); }, 'لا إجازات');
    section('مهام العمل والمغادرات', PUR, D.mis, (x, yy, i) => {
      T(`${i + 1}. ${x.name}`, R, yy, TXT, 600, 24, 'right', 330);
      T(x.kind, R - 360, yy, PUR, 700, 22, 'right');
      T(`${x.time}${x.what ? ' · ' + x.what : ''}`, pad + 24, yy, MUT, 500, 21, 'left', 400);
    }, 'لا مهام ولا مغادرات');
    section('بلا تسجيل — لا إجازة ولا مهمة ولا حضور', BAD, D.unreg, (x, yy, i) => { T(`${i + 1}. ${x.name}`, R, yy, TXT, 600, 24, 'right', 560); T(x.dept, pad + 24, yy, MUT, 500, 21, 'left', 300); }, 'الجميع مسجَّل أو لديه إجازة/مهمة ✔');
    const c = D.cfg || {};
    section(`كشف المتأخرين${c.office ? ` — الدوام ${c.office} + سماح ${c.grace || 0} د` : ''}`, WARN, D.late, (x, yy, i) => {
      T(`${i + 1}. ${x.name}`, R, yy, TXT, 600, 24, 'right', 440);
      T(`دخل ${x.in}`, R - 480, yy, MUT, 500, 22, 'right');
      T(`${x.min} دقيقة`, pad + 24, yy, WARN, 800, 24, 'left');
    }, 'لا متأخرين ✔');
    T(`أُعدّ بتطبيق الموارد البشرية${dataStamp(D) ? ' · ' + dataStamp(D) : ''}${D.excluded ? ' · استُثني ' + D.excluded + ' من التقرير' : ''}`, W / 2, H - 34, MUT, 500, 21, 'center');
    return cv;
  }

  window.HRReport = { range, build, toText, toCanvas, daily, dailyText, dailyCanvas, detail, detailCanvas };
})();
