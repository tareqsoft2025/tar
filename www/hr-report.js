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
    const days = [], late = {}, absent = {}, sites = {}, attRows = [], lateRows = [];
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
          const i0 = x.list.filter((y) => y.eventType === 'check_in'), o0 = x.list.filter((y) => y.eventType === 'check_out'), f0 = i0[0] || x.list[0], pl0 = HR.place(f0);
          attRows.push({ ds, name: x.e.name, org: x.e.org, in: x.firstIn ? tmf.format(new Date(x.firstIn)) : '', out: o0.length ? tmf.format(new Date(x.lastOut)) : '', place: opt && opt.placeName ? opt.placeName(pl0) : (pl0.name || ''), late: x.status === 'late' ? x.lateMin : 0 });
          if (x.status === 'late') lateRows.push({ ds, name: x.e.name, org: x.e.org, in: x.firstIn ? tmf.format(new Date(x.firstIn)) : '', min: x.lateMin });
        }
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
      range: r, group: opt && opt.group || '', days, attRows, lateRows, exList: (opt && opt.exList) || [], workDays, unsynced,
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
    const bands = {}, late = [], unreg = [], att = [], exList = [];
    rows.forEach((r) => {
      const band = (opt.band && opt.band(r.e)) || r.e.org || '—';
      const B = bands[band] = bands[band] || { name: band, total: 0, present: 0, late: 0, leave: 0, unreg: 0 };
      const other = (r.reqs || []).filter((q) => q.kind !== 'daily');          // مهمة/مغادرة/عمل إضافي…
      if (r.list && r.list.length) {
        const ins = r.list.filter((x) => x.eventType === 'check_in'), outs = r.list.filter((x) => x.eventType === 'check_out'), fi = ins[0] || r.list[0], lo = outs[outs.length - 1];
        const pl = HR.place(fi);
        att.push({ name: r.e.name, org: r.e.org, band, in: r.firstIn ? tmf.format(new Date(r.firstIn)) : '', out: lo ? tmf.format(new Date(r.lastOut)) : '', place: opt.placeName ? opt.placeName(pl) : (pl.name || ''), late: r.status === 'late' ? r.lateMin : 0 });
      }
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
      late: late.sort((a, b) => b.min - a.min), unreg: unreg.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      att: att.sort((a, b) => a.name.localeCompare(b.name, 'ar')), exList: (opt.exList || [])
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
    const exList = all.filter((r) => ex.has(String(r.e.id))).map((r) => ({ name: r.e.name, dept: r.e.dept || '', org: r.e.org })).sort(byName);
    att.sort(byName); leave.sort(byName); mis.sort(byName); unreg.sort(byName); late.sort((a, b) => b.min - a.min);
    return {
      ds, org, synced: rep.synced, weekend: !!rep.weekend, syncedAt: opt.syncedAt || null, cfg: opt.cfg || {},
      total: rows.length, excluded: all.length - rows.length, exList, att, leave, mis, unreg, late
    };
  }
  // يقسّم الكشف إلى صفحات (صور) بحجم ثابت 1080×1620 وتُرسم بدقة 4/3 لتبقى القراءة واضحة عند المشاركة
  function detailPages(D, opt) {
    const light = !!(opt && opt.light);
    const PW = 1080, PH = 1527, SC = 4 / 3, pad = 44;
    const LHd = opt && opt.letterhead;   // ترويسة وتذييل المؤسسة (صورتان)
    const LH = LHd ? Math.round(PW * LHd.head.naturalHeight / LHd.head.naturalWidth) : 0, FH = LHd ? Math.round(PW * LHd.foot.naturalHeight / LHd.foot.naturalWidth) : 0;
    const FOOT = LHd ? FH + 50 : 78, FIRST = LHd ? LH + 262 : 330, NEXT = LHd ? LH + 84 : 142;
    const FF = (getComputedStyle(document.body).fontFamily || 'sans-serif');
    const P_ = light
      ? { BG: '#ffffff', CARD: '#f5f8f8', LINE: '#d3dddd', GOLD: '#8f6b1c', TXT: '#12262a', MUT: '#56696c', OK: '#17835a', WARN: '#b4690e', BAD: '#c0392b', INFO: '#2a68ad', PUR: '#7446a8', H1: '#e4efed', H2: '#dcebe3', HT: '#12262a', ST: 'rgba(0,0,0,.04)', FT: '#56696c' }
      : { BG: '#0e1c20', CARD: '#162a2f', LINE: '#22393f', GOLD: '#d9b56b', TXT: '#eef3f2', MUT: '#9bb2b3', OK: '#4fbf8a', WARN: '#e0a03c', BAD: '#e0645a', INFO: '#6aa7e0', PUR: '#b388e0', H1: '#1d3a3f', H2: '#2b4a3c', HT: '#eef3f2', ST: 'rgba(255,255,255,.035)', FT: '#9bb2b3' };
    const BG = P_.BG, CARD = P_.CARD, LINE = P_.LINE, GOLD = P_.GOLD, TXT = P_.TXT, MUT = P_.MUT, OK = P_.OK, WARN = P_.WARN, BAD = P_.BAD, INFO = P_.INFO, PUR = P_.PUR;
    const mc = document.createElement('canvas').getContext('2d');
    const fnt = (w, sz) => `${w} ${sz}px ${FF}`;
    const fit = (str, maxW, w, sz) => { mc.font = fnt(w, sz); str = String(str); if (mc.measureText(str).width <= maxW) return str; while (str.length > 1 && mc.measureText(str + '…').width > maxW) str = str.slice(0, -1); return str + '…'; };
    const R = PW - pad - 26, Lx = pad + 26;
    const c = D.cfg || {};
    const blocks = [
      { id: 'att', title: 'الحضور — الوقت والموقع', col: OK, items: D.att, rh: 76, cols: 1, two: true, empty: 'لا تسجيلات حضور',
        row: (g, x, y, i) => { g.T(`${i + 1}. ${x.name}`, R, y - 14, x.late ? WARN : TXT, 700, 28, 'right', 640); g.T(`${x.in}${x.out ? ' ← ' + x.out : ''}`, Lx, y - 14, x.late ? WARN : OK, 800, 27, 'left', 300); g.T(`${x.place || '—'}${x.outPlace ? ' · خروج: ' + x.outPlace : ''}${x.late ? ' · متأخر ' + x.late + ' د' : ''}`, R, y + 20, x.st === 'outside' ? BAD : MUT, 600, 22, 'right', PW - pad * 2 - 60); } },
      { id: 'leave', title: 'الإجازات', col: INFO, items: D.leave, rh: 56, cols: 1, empty: 'لا إجازات',
        row: (g, x, y, i) => { g.T(`${i + 1}. ${x.name}`, R, y, TXT, 700, 28, 'right', 600); g.T(x.label, Lx, y, INFO, 700, 26, 'left', 300); } },
      { id: 'mis', title: 'مهام العمل والمغادرات', col: PUR, items: D.mis, rh: 76, cols: 1, two: true, empty: 'لا مهام ولا مغادرات',
        row: (g, x, y, i) => { g.T(`${i + 1}. ${x.name}`, R, y - 14, TXT, 700, 28, 'right', 640); g.T(x.kind, Lx, y - 14, PUR, 800, 26, 'left'); g.T(`${x.time}${x.what ? ' · ' + x.what : ''}`, R, y + 20, MUT, 600, 22, 'right', PW - pad * 2 - 60); } },
      { id: 'unreg', title: 'بلا تسجيل — لا إجازة ولا مهمة ولا حضور', col: BAD, items: D.unreg, rh: 52, cols: 2, empty: 'الجميع مسجَّل أو لديه إجازة/مهمة ✔',
        row: (g, x, y, i, slot) => { const colW = (PW - pad * 2 - 52) / 2, xr = R - slot * colW; g.T(`${i + 1}. ${x.name}`, xr, y, TXT, 600, 25, 'right', colW - 18); } },
      { id: 'late', title: `كشف المتأخرين${c.office ? ` — الدوام ${c.office} + سماح ${c.grace || 0} د` : ''}`, col: WARN, items: D.late, rh: 56, cols: 1, empty: 'لا متأخرين ✔',
        row: (g, x, y, i) => { g.T(`${i + 1}. ${x.name}`, R, y, TXT, 700, 28, 'right', 470); g.T(`دخل ${x.in}`, R - 510, y, MUT, 600, 25, 'right'); g.T(`${x.min} دقيقة`, Lx, y, WARN, 800, 27, 'left'); } }
    ];
    // ---- التخطيط: لكل صفحة مصفوفة عمليات ----
    const pages = [{ ops: [], cards: [] }];
    let pg = pages[0], y = FIRST; const bottom = PH - FOOT;
    const newPage = () => { pg = { ops: [], cards: [] }; pages.push(pg); y = NEXT; };
    const SEC = 84, SECC = 70;
    blocks.forEach((b) => {
      const groups = Math.ceil(b.items.length / b.cols), first = b.items.length ? b.rh : 62;
      const full = SEC + (groups ? groups * b.rh : 62);
      if (y + SEC + first > bottom || (y + full > bottom && full <= bottom - NEXT && groups <= 8)) newPage();
      let cardTop = y, cont = false;
      const head = () => { pg.ops.push({ k: 'sec', y, b, cont }); y += cont ? SECC : SEC; };
      head();
      if (!b.items.length) { pg.ops.push({ k: 'empty', y: y + 4, b }); y += 62; }
      for (let gi = 0; gi < groups; gi++) {
        if (y + b.rh > bottom) { pg.cards.push({ y1: cardTop, y2: y + 6, col: b.col }); newPage(); cardTop = y; cont = true; head(); }
        pg.ops.push({ k: 'row', y, b, gi });
        y += b.rh;
      }
      pg.cards.push({ y1: cardTop, y2: y + 10, col: b.col }); y += 26;
    });
    const N = pages.length, out = [];
    pages.forEach((P, pi) => {
      const cv = document.createElement('canvas'); cv.width = Math.round(PW * SC); cv.height = Math.round(PH * SC);
      const g = cv.getContext('2d'); g.scale(SC, SC); g.direction = 'rtl'; g.textBaseline = 'alphabetic';
      g.T = (str, x, yy, col, w, sz, al, maxW) => { const t = maxW ? fit(str, maxW, w || 500, sz || 24) : String(str); g.font = fnt(w || 500, sz || 24); g.fillStyle = col || TXT; g.textAlign = al || 'right'; g.fillText(t, x, yy); };
      const rr = (x, yy, w, h, r, fill, stroke) => { g.beginPath(); g.roundRect ? g.roundRect(x, yy, w, h, r) : g.rect(x, yy, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
      g.fillStyle = BG; g.fillRect(0, 0, PW, PH);
      // الرأس
      if (LHd) {
        g.drawImage(LHd.head, 0, 0, PW, LH); g.drawImage(LHd.foot, 0, PH - FH, PW, FH);
        if (pi === 0) {
          g.T(`كشف الدوام — ${D.org}`, PW - pad, LH + 62, P_.HT, 800, 44); g.T(dfull.format(noon(D.ds)), PW - pad, LH + 106, GOLD, 700, 28);
          const st0 = D.synced ? dataStamp(D) : 'حضور هذا اليوم غير مزامَن'; if (st0) g.T(st0, pad, LH + 106, '#3e5558', 600, 23, 'left');
          const sm0 = [['الموظفون', D.total, TXT], ['حضور', D.att.length, OK], ['متأخرون', D.late.length, WARN], ['إجازة', D.leave.length, INFO], ['مهام/مغادرات', D.mis.length, PUR], ['بلا تسجيل', D.unreg.length, BAD]];
          const cw0 = (PW - pad * 2 - 5 * 10) / 6;
          sm0.forEach(([n, v, col], i) => { const x = PW - pad - (i + 1) * cw0 - i * 10; rr(x, LH + 128, cw0, 108, 18, CARD, LINE); g.T(v, x + cw0 / 2, LH + 184, col, 800, 42, 'center'); g.T(n, x + cw0 / 2, LH + 220, MUT, 600, 20, 'center'); });
        } else {
          g.T(`كشف الدوام — ${D.org}  ·  تابع`, PW - pad, LH + 50, P_.HT, 800, 30); g.T(dfull.format(noon(D.ds)), pad, LH + 50, GOLD, 700, 22, 'left');
        }
        g.fillStyle = LINE; g.fillRect(pad, PH - FH - 34, PW - pad * 2, 2);
        g.T(`صفحة ${pi + 1} من ${N}${dataStamp(D) ? '  ·  ' + dataStamp(D) : ''}${D.excluded ? '  ·  استُثني ' + D.excluded + ' من التقرير' : ''}`, PW / 2, PH - FH - 10, MUT, 600, 21, 'center');
      } else {
      const gr = g.createLinearGradient(0, 0, PW, 0); gr.addColorStop(0, P_.H1); gr.addColorStop(1, P_.H2); g.fillStyle = gr; g.fillRect(0, 0, PW, pi === 0 ? 170 : 112);
      g.fillStyle = GOLD; g.fillRect(0, pi === 0 ? 166 : 108, PW, 4);
      if (pi === 0) {
        g.T(`كشف الدوام — ${D.org}`, PW - pad, 74, P_.HT, 800, 48); g.T(dfull.format(noon(D.ds)), PW - pad, 126, GOLD, 700, 30);
        const stamp = D.synced ? dataStamp(D) : 'حضور هذا اليوم غير مزامَن'; if (stamp) g.T(stamp, pad, 126, light ? '#3e5558' : '#c4d6d5', 600, 24, 'left');
        const sm = [['الموظفون', D.total, TXT], ['حضور', D.att.length, OK], ['متأخرون', D.late.length, WARN], ['إجازة', D.leave.length, INFO], ['مهام/مغادرات', D.mis.length, PUR], ['بلا تسجيل', D.unreg.length, BAD]];
        const cw = (PW - pad * 2 - 5 * 10) / 6;
        sm.forEach(([n, v, col], i) => { const x = PW - pad - (i + 1) * cw - i * 10; rr(x, 194, cw, 112, 18, CARD, LINE); g.T(v, x + cw / 2, 252, col, 800, 44, 'center'); g.T(n, x + cw / 2, 290, MUT, 600, 21, 'center'); });
      } else {
        g.T(`كشف الدوام — ${D.org}`, PW - pad, 56, P_.HT, 800, 38); g.T(`${dfull.format(noon(D.ds))}  ·  تابع`, PW - pad, 94, GOLD, 600, 23);
      }
      g.T(`صفحة ${pi + 1} من ${N}`, pad, pi === 0 ? 74 : 62, light ? '#3e5558' : '#c4d6d5', 800, 26, 'left');
      }
      // البطاقات
      P.cards.forEach((cd) => { rr(pad, cd.y1, PW - pad * 2, cd.y2 - cd.y1, 22, CARD, LINE); g.fillStyle = cd.col; g.fillRect(PW - pad - 7, cd.y1 + 20, 7, 40); });
      P.ops.forEach((op) => {
        const b = op.b;
        if (op.k === 'sec') g.T(`${b.title}${op.cont ? ' (تابع)' : ` (${b.items.length})`}`, PW - pad - 26, op.y + (op.cont ? 46 : 56), b.col, 800, op.cont ? 28 : 32, 'right', PW - pad * 2 - 60);
        else if (op.k === 'empty') g.T(b.empty, PW - pad - 26, op.y + 36, MUT, 600, 26);
        else {
          const base = op.y + b.rh * 0.64;
          if (op.gi % 2 === 0) { g.fillStyle = P_.ST; g.fillRect(pad + 12, op.y, PW - pad * 2 - 24, b.rh); }
          for (let sl = 0; sl < b.cols; sl++) { const idx = op.gi * b.cols + sl; if (idx < b.items.length) b.row(g, b.items[idx], base, idx, sl); }
        }
      });
      // التذييل
      if (!LHd) { g.fillStyle = LINE; g.fillRect(pad, PH - FOOT + 12, PW - pad * 2, 2); }
      if (!LHd) g.T(`أُعدّ بتطبيق الموارد البشرية${dataStamp(D) ? ' · ' + dataStamp(D) : ''}${D.excluded ? ' · استُثني ' + D.excluded + ' من التقرير' : ''}`, PW / 2, PH - 30, MUT, 600, 22, 'center');
      out.push(cv);
    });
    return out;
  }


  // يحمّل صورتي ترويسة وتذييل المؤسسة من ملفات التطبيق (مرة واحدة)
  let LHp = null;
  function loadLetterhead() {
    if (!LHp) {
      const ld = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img ' + src)); im.src = src; });
      LHp = Promise.all([ld('img/pdf-head.jpg'), ld('img/pdf-foot.jpg')]).then(([head, foot]) => ({ head, foot })).catch(() => null);
    }
    return LHp;
  }
  /* ---------- PDF: كل صفحة صورة JPEG بحجم A4 (يحفظ تنسيق العربية كما هو، ولا يحتاج خطوطاً) ---------- */
  function pdfOf(canvases) {
    const enc = new TextEncoder(), chunks = [], offs = [];
    let len = 0;
    const put = (u8) => { chunks.push(u8); len += u8.length; };
    const txt = (t) => put(enc.encode(t));
    const N = canvases.length, W = 595.28, H = 841.89;
    put(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));   // %PDF-1.4 + تعليق ثنائي
    const obj = (id, body) => { offs[id] = len; txt(`${id} 0 obj\n${body}\nendobj\n`); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${N} /Kids [${canvases.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
    canvases.forEach((cv, i) => {
      const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
      const bin = atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]), jpg = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
      obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
      const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(cid, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      offs[iid] = len;
      txt(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      put(jpg); txt('\nendstream\nendobj\n');
    });
    const total = 3 + N * 3, xr = len;
    txt(`xref\n0 ${total}\n0000000000 65535 f \n` + offs.slice(1, total).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    txt(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
    const out = new Uint8Array(len); let p = 0; chunks.forEach((c) => { out.set(c, p); p += c.length; });
    return out;
  }
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };


  /* ---------- تصدير Excel: أوراق جاهزة لكل تقرير ---------- */
  function sheetsDetail(D, pre) {
    const P = pre ? pre + ' - ' : '', n = (i) => i + 1;
    return [
      { name: P + 'ملخص', widths: [26, 30], rows: [['البند', 'القيمة'], ['الجهة', D.org], ['التاريخ', dfull.format(noon(D.ds))], ['بيانات حتى', D.syncedAt ? tmf.format(new Date(D.syncedAt)) : ''], ['عدد الموظفين', D.total], ['حضور', D.att.length], ['متأخرون', D.late.length], ['إجازة', D.leave.length], ['مهام/مغادرات', D.mis.length], ['بلا تسجيل', D.unreg.length], ['المستثنون من التقرير', D.excluded || 0]] },
      { name: P + 'الحضور', widths: [6, 36, 16, 14, 14, 34, 34, 12], rows: [['#', 'الاسم', 'تاريخ الحضور', 'الدخول', 'الخروج', 'موقع الدخول', 'موقع الخروج', 'تأخر (د)']].concat(D.att.map((x, i) => [n(i), x.name, D.ds, x.in, x.out, x.place, x.outPlace, x.late || ''])) },
      { name: P + 'الإجازات', widths: [6, 36, 24], rows: [['#', 'الاسم', 'نوع الإجازة']].concat(D.leave.map((x, i) => [n(i), x.name, x.label])) },
      { name: P + 'المهام والمغادرات', widths: [6, 36, 14, 22, 36], rows: [['#', 'الاسم', 'النوع', 'الوقت', 'المشروع / السبب']].concat(D.mis.map((x, i) => [n(i), x.name, x.kind, x.time, x.what])) },
      { name: P + 'بلا تسجيل', widths: [6, 36, 28], rows: [['#', 'الاسم', 'القسم']].concat(D.unreg.map((x, i) => [n(i), x.name, x.dept])) },
      { name: P + 'المتأخرون', widths: [6, 36, 16, 14, 14], rows: [['#', 'الاسم', 'التاريخ', 'وقت الدخول', 'دقائق التأخر']].concat(D.late.map((x, i) => [n(i), x.name, D.ds, x.in, x.min])) },
      { name: P + 'المستثنون', widths: [6, 36, 28], rows: [['#', 'الاسم (مستثنى من تسجيل الحضور)', 'القسم']].concat((D.exList || []).map((x, i) => [n(i), x.name, x.dept])) }
    ];
  }
  function sheetsSummary(D) {
    const c = D.c;
    return [
      { name: 'ملخص اليوم', widths: [26, 30], rows: [['البند', 'القيمة'], ['التاريخ', dfull.format(noon(D.ds))], ['بيانات حتى', D.syncedAt ? tmf.format(new Date(D.syncedAt)) : ''], ['نسبة الحضور %', D.rate == null ? '' : D.rate], ['الموظفون', c.total], ['حاضر', c.present], ['متأخر', c.late], ['إجازة', c.leave], ['مهام/طلبات', c.mission], ['بلا تسجيل', c.unreg], ['دوام في عطلة', c.hwork]] },
      { name: 'حسب السلم', widths: [34, 12, 12, 12, 12, 14], rows: [['السلم', 'الإجمالي', 'حضور', 'متأخر', 'إجازة/مهام', 'بلا تسجيل']].concat(D.bands.map((b) => [b.name, b.total, b.present + b.late, b.late, b.leave, b.unreg])) },
      { name: 'الحضور', widths: [6, 36, 10, 16, 14, 14, 34, 12], rows: [['#', 'الاسم', 'الجهة', 'تاريخ الحضور', 'الدخول', 'الخروج', 'الموقع', 'تأخر (د)']].concat((D.att || []).map((x, i) => [i + 1, x.name, x.org, D.ds, x.in, x.out, x.place, x.late || ''])) },
      { name: 'المتأخرون', widths: [6, 36, 16, 14, 14], rows: [['#', 'الاسم', 'التاريخ', 'وقت الدخول', 'دقائق التأخر']].concat(D.late.map((x, i) => [i + 1, x.name, D.ds, x.at ? tmf.format(new Date(x.at)) : '', x.min])) },
      { name: 'بلا تسجيل', widths: [6, 36, 28, 24], rows: [['#', 'الاسم', 'القسم', 'السلم']].concat(D.unreg.map((x, i) => [i + 1, x.name, x.dept, x.band])) },
      { name: 'المستثنون', widths: [6, 36, 28, 10], rows: [['#', 'الاسم (مستثنى من تسجيل الحضور)', 'القسم', 'الجهة']].concat((D.exList || []).map((x, i) => [i + 1, x.name, x.dept, x.org])) }
    ];
  }
  function sheetsWeekly(D) {
    return [
      { name: 'الأسبوعي', widths: [28, 24], rows: [['البند', 'القيمة'], ['الفترة', fmtD(D.range.from) + ' ← ' + fmtD(D.range.to)], ['المجموعة', D.group || 'كل الموظفين'], ['نسبة الحضور %', D.rate == null ? '' : D.rate], ['حضور (موظف-يوم)', D.presentN], ['تأخر', D.lateN], ['دقائق التأخر', D.lateMin], ['بلا تسجيل', D.absentN], ['أيام إجازة', D.leaveDays], ['طلبات معلّقة', D.pending], ['أيام غير مزامنة', D.unsynced]] },
      { name: 'يومياً', widths: [20, 12, 12, 14, 12], rows: [['اليوم', 'حاضر', 'متأخر', 'بلا تسجيل', 'إجازة']].concat(D.days.map((d) => [d.ds, d.synced ? d.present : '', d.synced ? d.late : '', d.synced ? d.absent : '', d.synced ? d.leave : ''])) },
      { name: 'الأكثر تأخراً', widths: [6, 36, 12, 14], rows: [['#', 'الاسم', 'المرات', 'الدقائق']].concat(D.topLate.map((x, i) => [i + 1, x.name, x.n, x.min])) },
      { name: 'الأكثر غياباً', widths: [6, 36, 12], rows: [['#', 'الاسم', 'الأيام']].concat(D.topAbsent.map((x, i) => [i + 1, x.name, x.n])) },
      { name: 'المواقع', widths: [6, 36, 14], rows: [['#', 'الموقع', 'التسجيلات']].concat(D.topSites.map((x, i) => [i + 1, x.name, x.n])) },
      { name: 'تفاصيل الحضور', widths: [6, 36, 10, 16, 14, 14, 34, 12], rows: [['#', 'الاسم', 'الجهة', 'تاريخ الحضور', 'الدخول', 'الخروج', 'الموقع', 'تأخر (د)']].concat((D.attRows || []).map((x, i) => [i + 1, x.name, x.org, x.ds, x.in, x.out, x.place, x.late || ''])) },
      { name: 'كل المتأخرين', widths: [6, 36, 10, 16, 14, 14], rows: [['#', 'الاسم', 'الجهة', 'التاريخ', 'وقت الدخول', 'دقائق التأخر']].concat((D.lateRows || []).map((x, i) => [i + 1, x.name, x.org, x.ds, x.in, x.min])) },
      { name: 'المستثنون', widths: [6, 36, 28, 10], rows: [['#', 'الاسم (مستثنى من تسجيل الحضور)', 'القسم', 'الجهة']].concat((D.exList || []).map((x, i) => [i + 1, x.name, x.dept, x.org])) }
    ];
  }
  const xlsxOf = (sheets) => window.HRXlsx.build(sheets);

  window.HRReport = { range, build, toText, toCanvas, daily, dailyText, dailyCanvas, detail, detailPages, pdfOf, toB64, loadLetterhead, sheetsDetail, sheetsSummary, sheetsWeekly, xlsxOf };
})();
