// الموارد البشرية: الاتصال بنظام المؤسسة (PEF ERP)، التخزين على الجهاز، والمزامنة التراكمية
(function () {
  const B = window.AndroidBridge || null;
  const TZ = Core.TZ;
  const dayStr = Tracker.dayStr, addDays = Tracker.addDays;

  /* ---------- الاتصال ---------- */
  // في أندرويد يمر كل طلب عبر الطبقة الأصلية (الموقع يمنع الطلبات من خارجه ويحفظ الجلسة في كوكيز محمية)
  const pending = {};
  let seq = 0;
  window.__erp = (id, status, body) => {
    const p = pending[id]; if (!p) return; delete pending[id];
    let data = null; try { data = body ? JSON.parse(body) : null; } catch (e) { data = null; }
    p({ status, ok: status >= 200 && status < 300, data });
  };
  const webBase = () => localStorage.getItem('hrBase') || ''; // للاختبار في المتصفح فقط
  async function webCall(method, path, body) {
    try {
      const r = await fetch(webBase() + path, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      let data = null; try { data = await r.json(); } catch (e) { /* not json */ }
      return { status: r.status, ok: r.ok, data };
    } catch (e) { return { status: 0, ok: false, data: { error: 'network' } }; }
  }
  function get(path) {
    if (!B || !B.erpGet) return webCall('GET', path);
    return new Promise((res) => { const id = 'r' + (++seq); pending[id] = res; B.erpGet(id, path); });
  }
  function login(user, pass) {
    if (!B || !B.erpLogin) return webCall('POST', '/api/auth/login', { username: user, password: pass, rememberMe: true });
    return new Promise((res) => { const id = 'l' + (++seq); pending[id] = res; B.erpLogin(id, user, pass); });
  }
  const LOGIN_ERRORS = {
    not_found: 'رقم الهوية أو كلمة المرور غير صحيحة', invalid_credentials: 'رقم الهوية أو كلمة المرور غير صحيحة',
    contract_ended: 'انتهى عقد هذا الحساب', account_inactive: 'الحساب غير مفعّل', use_national_id: 'استخدم رقم الهوية لتسجيل الدخول',
    device_in_use: 'الحساب مستخدم على جهاز آخر', network: 'تعذّر الاتصال بالنظام، تحقق من الإنترنت', too_many_attempts: 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة'
  };
  const errText = (r) => (r && r.data && (LOGIN_ERRORS[r.data.error] || r.data.message)) || (r && r.status === 0 ? LOGIN_ERRORS.network : r && r.status === 401 ? 'انتهت الجلسة، سجّل الدخول من جديد' : r && r.status === 403 ? 'حسابك لا يملك صلاحية هذا القسم في النظام' : 'تعذّر الطلب (' + (r ? r.status : '?') + ')');

  /* ---------- التخزين على الجهاز ---------- */
  const mem = {};
  const db = {
    get(name, def) {
      if (name in mem) return mem[name];
      let raw = null;
      try { raw = B && B.hrGet ? B.hrGet(name) : localStorage.getItem('hr_' + name); } catch (e) { raw = null; }
      let v = def; try { if (raw) v = JSON.parse(raw); } catch (e) { v = def; }
      mem[name] = v; return v;
    },
    put(name, v) {
      mem[name] = v;
      const s = JSON.stringify(v);
      try { if (B && B.hrPut) B.hrPut(name, s); else localStorage.setItem('hr_' + name, s); } catch (e) { /* full */ }
    },
    wipe() {
      Object.keys(mem).forEach((k) => delete mem[k]);
      try { if (B && B.hrWipe) B.hrWipe(); else Object.keys(localStorage).filter((k) => k.startsWith('hr_')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- قراءة استجابات النظام ---------- */
  const listOf = (d) => Array.isArray(d) ? d : !d || typeof d !== 'object' ? [] :
    ['data', 'rows', 'items', 'results', 'employees', 'contracts', 'assignments', 'events', 'list'].map((k) => d[k]).find(Array.isArray) || [];
  const pagesOf = (d) => Math.max(1, Number(d && d.pagination && (d.pagination.totalPages || d.pagination.pages)) || 1);
  const idOf = (x) => String(x.id != null ? x.id : x.employeeId != null ? x.employeeId : x.empId != null ? x.empId : x.contractId != null ? x.contractId : JSON.stringify(x).length + ':' + (x.employeeRef || ''));
  const pick = (o, ...ks) => { for (const k of ks) { const v = k.split('.').reduce((a, p) => a == null ? a : a[p], o); if (v != null && v !== '') return v; } return null; };
  const d10 = (v) => v ? String(v).slice(0, 10) : null;

  /* ---------- النماذج ---------- */
  function emp(x) {
    const mode = String(pick(x, 'workScheduleMode', 'scheduleMode') || '').toLowerCase();
    const scale = String(pick(x, 'salaryScaleBand', 'scale', 'contract.salaryScaleBand') || '');
    const hho = mode.includes('hho') || /hho/i.test(scale) || /hho/i.test(String(pick(x, 'organization', 'org', 'company') || ''));
    return {
      id: idOf(x), empId: pick(x, 'empId', 'code', 'employeeRef'), ref: pick(x, 'employeeRef', 'empId'),
      name: pick(x, 'fullNameAr', 'nameAr', 'name', 'fullNameEn') || '—', nameEn: pick(x, 'fullNameEn', 'nameEn'),
      nid: pick(x, 'nationalId'), dept: pick(x, 'departmentName', 'department.nameAr', 'department.name', 'department'),
      pos: pick(x, 'positionName', 'position.nameAr', 'position.name', 'position'), mgr: pick(x, 'directManagerName', 'manager.fullNameAr'),
      phone: pick(x, 'phone', 'mobile', 'phoneNumber'), email: pick(x, 'email'),
      join: d10(pick(x, 'joinDate', 'hireDate', 'startDate')), term: d10(pick(x, 'terminationDate', 'endDate')),
      active: x.activeOnJob != null ? !!x.activeOnJob : !(pick(x, 'terminationDate') && d10(x.terminationDate) < dayStr()) && String(x.status || 'active').toLowerCase() !== 'inactive',
      validContract: x.hasValidContract, org: hho ? 'HHO' : 'PEF', type: mode.includes('field') ? 'field' : 'office', mode, raw: x
    };
  }
  function contractKind(x) {
    const ct = String(pick(x, 'changeType', 'kind', 'type') || '').toLowerCase();
    if (/annex|ملحق/.test(ct) || pick(x, 'annexNo', 'annexId')) return 'annex';
    if (/exten|تمديد/.test(ct) || pick(x, 'extensionNo', 'extensionId')) return 'extension';
    if (/placement|scale|grade|تسكين|settle/.test(ct)) return 'placement';
    if (/amend|تعديل/.test(ct) || pick(x, 'amendmentNo')) return 'amendment';
    return 'contract';
  }
  function con(x) {
    return {
      id: idOf(x), empId: String(pick(x, 'employeeId', 'employee.id') || ''), name: pick(x, 'employeeNameAr', 'employeeName', 'fullNameAr', 'employee.fullNameAr') || '—',
      no: pick(x, 'contractNumber', 'number', 'code'), kind: contractKind(x), ext: pick(x, 'extensionNo'), annex: pick(x, 'annexNo'), amend: pick(x, 'amendmentNo'),
      start: d10(pick(x, 'startDate', 'effectiveFrom')), end: d10(pick(x, 'endDate', 'newEndDate', 'effectiveTo')),
      pos: pick(x, 'position', 'positionName', 'position.nameAr'), dept: pick(x, 'department', 'departmentName', 'department.nameAr'),
      scale: pick(x, 'salaryScaleBand', 'grade'), grade: pick(x, 'grade'), level: pick(x, 'level'),
      salary: pick(x, 'basicSalary', 'salary'), cur: pick(x, 'currency'), status: pick(x, 'status'),
      history: listOf(pick(x, 'versions', 'history', 'steps') || []), upd: pick(x, 'updatedAt'), raw: x
    };
  }
  function asg(x) {
    return {
      id: idOf(x), empId: String(pick(x, 'employeeId', 'employee.id') || ''), name: pick(x, 'employeeNameAr', 'employeeName', 'fullNameAr', 'employee.fullNameAr'),
      no: pick(x, 'assignmentNumber', 'number'), project: pick(x, 'projectName', 'project.nameAr', 'project.name', 'nameAr', 'name'),
      code: pick(x, 'codeProject', 'projectCode', 'projectNumber', 'project.code'), pct: pick(x, 'percent', 'percentage'),
      start: d10(pick(x, 'startDate')), end: d10(pick(x, 'endDate')), raw: x
    };
  }

  /* ---------- المزامنة ---------- */
  // تجلب كل الصفحات ثم تدمجها مع المخزّن: تضيف الجديد، تحدّث المتغيّر فقط، وتُبقي الباقي كما هو
  async function pagedAll(base, progress, label) {
    const out = []; let page = 1, pages = 1;
    do {
      const r = await get(base + (base.includes('?') ? '&' : '?') + 'page=' + page);
      if (!r.ok) throw Object.assign(new Error(errText(r)), { res: r });
      out.push(...listOf(r.data)); pages = pagesOf(r.data);
      progress && progress(`${label} ${page}/${pages}`);
      page++;
    } while (page <= pages && page <= 200);
    return out;
  }
  function merge(name, items) {
    const old = db.get(name, {});
    const next = {}; let added = 0, updated = 0;
    items.forEach((x) => {
      const id = idOf(x); const s = JSON.stringify(x);
      if (!old[id]) added++; else if (JSON.stringify(old[id]) !== s) updated++;
      next[id] = x;
    });
    const removed = Object.keys(old).filter((k) => !(k in next)).length;
    // لا نعيد الكتابة إن لم يتغيّر شيء
    if (added || updated || removed || !Object.keys(old).length) db.put(name, next);
    return { total: items.length, added, updated, removed };
  }
  const monthKey = (ds) => 'att_' + ds.slice(0, 7);
  async function syncDay(ds) {
    const r = await get('/api/hr/attendance/events?from=' + ds + '&to=' + ds + '&limit=500');
    if (!r.ok) throw Object.assign(new Error(errText(r)), { res: r });
    const m = db.get(monthKey(ds), {});
    const evs = listOf(r.data).map((e) => ({ id: e.id, employeeId: String(e.employeeId), eventType: e.eventType, recordedAt: e.recordedAt, hiddenAt: e.hiddenAt || null, source: e.source || null, site: e.workSiteMatchStatus || null, kind: e.kind || null }));
    const before = JSON.stringify(m[ds] || []), after = JSON.stringify(evs);
    m[ds] = evs; db.put(monthKey(ds), m);
    return before === after ? 0 : 1;
  }
  async function syncLeaves(from, to) {
    const r = await get('/api/hr/attendance/leave-map?from=' + from + '&to=' + to);
    if (!r.ok) return 0;
    const leaves = Array.isArray(r.data && r.data.leaves) ? r.data.leaves : listOf(r.data);
    const all = db.get('leaves', {});
    // نحذف ما في المدى ثم نضيف الجديد (حتى تختفي الإجازات الملغاة)
    Object.keys(all).forEach((k) => { const d = k.split(':')[1]; if (d >= from && d <= to) delete all[k]; });
    leaves.forEach((l) => { if (l && l.employeeId && l.dateIso) all[l.employeeId + ':' + l.dateIso] = String(l.nature || l.type || 'leave').toLowerCase(); });
    db.put('leaves', all);
    return leaves.length;
  }

  let syncing = false;
  async function sync(progress, opts) {
    if (syncing) return null;
    syncing = true;
    const meta = db.get('meta', {});
    const st = { at: Date.now() };
    try {
      progress && progress('الموظفون…');
      st.employees = merge('employees', await pagedAll('/api/hr/employees?pageSize=500&status=all&sortBy=empId&sortDir=asc', progress, 'الموظفون'));
      progress && progress('العقود…');
      st.contracts = merge('contracts', await pagedAll('/api/hr/contracts?pageSize=100&sortBy=employeeName&sortDir=asc', progress, 'العقود'));
      progress && progress('التكليفات…');
      const ar = await get('/api/hr/assignments');
      if (ar.ok) st.assignments = merge('assignments', listOf(ar.data && ar.data.data ? ar.data.data : ar.data));
      const es = await get('/api/hr/assignments/ending-soon');
      if (es.ok) db.put('asgEnding', listOf(es.data && es.data.data ? es.data.data : es.data).map((x) => idOf(x)));
      // الحضور: الأيام التي لم تُزامن بعد + اليوم وأمس دائماً (لأنها تتغيّر)
      const t = dayStr();
      let from = meta.attUntil ? addDays(meta.attUntil, -1) : addDays(t, -((opts && opts.firstDays) || 14));
      if (opts && opts.from) from = opts.from;
      const days = []; for (let d = from; d <= t && days.length < 120; d = addDays(d, 1)) days.push(d);
      let changedDays = 0, done = 0;
      const worker = async () => { while (days.length) { const d = days.shift(); changedDays += await syncDay(d); done++; progress && progress(`الحضور ${done}/${done + days.length}`); } };
      await Promise.all([worker(), worker(), worker()]);
      st.attendance = { days: done, changed: changedDays };
      progress && progress('الإجازات والمهام…');
      st.leaves = await syncLeaves(addDays(from, -1), addDays(t, 30));
      meta.attUntil = t;
      meta.attFrom = meta.attFrom && meta.attFrom < from ? meta.attFrom : from;
      meta.lastSync = st.at; meta.last = st;
      db.put('meta', meta);
      return st;
    } finally { syncing = false; }
  }

  /* ---------- الاستعلام ---------- */
  const employees = () => Object.values(db.get('employees', {})).map(emp);
  const contracts = () => Object.values(db.get('contracts', {})).map(con);
  const assignments = () => Object.values(db.get('assignments', {})).map(asg);
  const events = (ds) => (db.get(monthKey(ds), {})[ds]) || null;
  const leaveOf = (eid, ds) => db.get('leaves', {})[eid + ':' + ds] || null;
  const settings = () => Object.assign({ office: '08:00', field: '08:00', grace: 10, weekend: [5] }, db.get('settings', {}));

  const minutesOf = (iso) => { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).forEach((x) => { p[x.type] = x.value; }); return (+p.hour % 24) * 60 + +p.minute; };
  const hmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const activeOn = (e, ds) => (!e.join || e.join <= ds) && (!e.term || e.term >= ds) && e.active !== false;

  // حالة كل موظف في يوم معيّن
  function dayReport(ds) {
    const evs = events(ds);
    const cfg = settings();
    const asgs = assignments();
    const byEmp = {};
    (evs || []).filter((e) => !e.hiddenAt).forEach((e) => { (byEmp[e.employeeId] = byEmp[e.employeeId] || []).push(e); });
    const weekend = cfg.weekend.includes(Tracker.dowOf(ds));
    return {
      synced: !!evs, weekend,
      rows: employees().filter((e) => activeOn(e, ds)).map((e) => {
        const list = (byEmp[e.id] || []).sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
        const ins = list.filter((x) => x.eventType === 'check_in'), outs = list.filter((x) => x.eventType === 'check_out');
        const firstIn = ins[0] ? ins[0].recordedAt : null, lastOut = outs.length ? outs[outs.length - 1].recordedAt : null;
        const leave = leaveOf(e.id, ds);
        const hasAsg = asgs.some((a) => a.empId === e.id && (!a.start || a.start <= ds) && (!a.end || a.end >= ds));
        let lateMin = 0;
        if (firstIn) { const start = hmToMin(e.type === 'field' ? cfg.field : cfg.office); lateMin = Math.max(0, minutesOf(firstIn) - start - cfg.grace); }
        let status = 'present';
        if (!list.length) status = leave ? 'leave' : weekend ? 'off' : 'absent';
        else if (lateMin > 0) status = 'late';
        if (list.length && !ins.length) status = 'noin';
        return { e, list, firstIn, lastOut, lateMin, leave, hasAsg, status };
      })
    };
  }

  window.HR = { get, login, errText, db, sync, isSyncing: () => syncing, employees, contracts, assignments, events, leaveOf, dayReport, settings, emp, con, asg, listOf,
    hasSession: () => B && B.erpSession ? B.erpSession() : !!localStorage.getItem('hrWebSession'),
    logout() { if (B && B.erpLogout) B.erpLogout(); else { webCall('POST', '/api/auth/logout', {}); localStorage.removeItem('hrWebSession'); } db.wipe(); localStorage.removeItem('hrUser'); },
    meta: () => db.get('meta', {}) };
})();
