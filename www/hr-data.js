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
  // تحديث حالة طلب (PUT) عبر الطبقة الأصلية؛ في المتصفح للاختبار فقط
  function send(path, body, role) {
    if (!B || !B.erpSend) return webCall('PUT', path, body);
    return new Promise((res) => { const id = 's' + (++seq); pending[id] = res; B.erpSend(id, path, JSON.stringify(body), role || ''); });
  }
  let roleCache = null;
  async function userRole() {
    if (roleCache) return roleCache;
    try {
      const r = await get('/api/auth/session');
      const d = r.data || {}, u = d.user || d.data || d;
      const v = u.role || u.activeRole || d.role || (Array.isArray(u.roles) ? u.roles[0] : null) || (Array.isArray(d.roles) ? d.roles[0] : null);
      roleCache = typeof v === 'string' ? v : v && (v.code || v.key || v.name) ? String(v.code || v.key || v.name) : '';
    } catch (e) { roleCache = ''; }
    return roleCache;
  }
  // ما يمكن عمله على الطلب حسب نوعه وحالته (نفس خطوات نظام PEF)
  function reqActions(q) {
    const st = String(q.status || '');
    if (q.kind === 'daily') {
      if (st === 'submitted') return { approve: 'manager_approved', reject: 'manager_rejected', label: 'موافقة المدير' };
      if (st === 'manager_approved') return { approve: 'approved', reject: 'rejected', label: 'الاعتماد' };
    }
    if ((q.kind === 'hourly' || q.kind === 'mission') && st === 'submitted') return { approve: 'approved', reject: 'rejected', label: 'الاعتماد' };
    return null;
  }
  async function decide(q, action, reason) {
    const a = reqActions(q); if (!a) return { ok: false, error: 'not_actionable' };
    const status = a[action]; if (!status) return { ok: false, error: 'not_actionable' };
    const path = q.kind === 'daily' ? '/api/hr/leaves/requests' : '/api/hr/leaves/requests/hourly';
    const rawId = q.raw && q.raw.id != null ? q.raw.id : null;
    if (rawId == null) return { ok: false, error: 'no_id' };
    const body = { id: rawId, status };
    if (action === 'reject' && reason) { if (q.kind === 'daily') body.reason = reason; else body.comment = reason; }
    const r = await send(path, body, await userRole());
    if (r.ok) {
      const key = 'req_' + q.kind, all = db.get(key, {}); const k = Object.keys(all).find((x) => String(all[x].id) === String(rawId));
      if (k) { all[k] = Object.assign({}, all[k], { status }); db.put(key, all); reqCache = null; }
    }
    return { ok: r.ok, status: r.status, data: r.data, newStatus: status };
  }
  function login(user, pass, remember) {
    if (!B || !B.erpLogin) return webCall('POST', '/api/auth/login', { username: user, password: pass, rememberMe: true });
    return new Promise((res) => { const id = 'l' + (++seq); pending[id] = res; if (B.erpLogin2) B.erpLogin2(id, user, pass, !!remember); else B.erpLogin(id, user, pass); });
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
    reload() { Object.keys(mem).forEach((k) => delete mem[k]); },
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
  const txt = (v) => v == null ? null : typeof v === 'object' ? (v.titleAr || v.nameAr || v.name || v.titleEn || v.code || null) : v;

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
      phone: pick(x, 'mobileNumber', 'mobile', 'phone', 'phoneNumber', 'mobilePhone'), email: pick(x, 'email'),
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
      pos: txt(pick(x, 'position.titleAr', 'positionTitleAr', 'positionName', 'position.nameAr', 'position.titleEn', 'position')), dept: txt(pick(x, 'department.nameAr', 'departmentName', 'department.name', 'department')),
      scale: txt(pick(x, 'salaryScaleBand.nameAr', 'salaryScaleBand.name', 'salaryScaleBand.code', 'salaryScaleBand')), grade: pick(x, 'grade', 'salaryRecord.grade'), level: pick(x, 'level', 'salaryRecord.level'), step: pick(x, 'step', 'salaryRecord.step'),
      salary: pick(x, 'salary', 'basicSalary', 'salaryRecord.salary'), cur: pick(x, 'salaryScaleBand.currency', 'currency') || 'USD', pct: pick(x, 'employmentPercentage', 'percent'), status: pick(x, 'status'),
      changeType: pick(x, 'changeType'), reason: pick(x, 'reason'),
      history: listOf(pick(x, 'versions', 'history', 'steps', 'salaryHistory') || []).map((h) => ({
        type: pick(h, 'changeType', 'type', 'kind'), from: d10(pick(h, 'effectiveFrom', 'startDate', 'date', 'createdAt')), to: d10(pick(h, 'effectiveTo', 'endDate')),
        grade: pick(h, 'grade'), level: pick(h, 'level'), step: pick(h, 'step'), salary: pick(h, 'salary', 'basicSalary'), reason: pick(h, 'reason', 'reasonAr'), end: d10(pick(h, 'newEndDate'))
      })), upd: pick(x, 'updatedAt'), raw: x
    };
  }
  // المشاريع (من /api/projects/lookup) لربط التكليف برقم المشروع ورمزه واسمه وعملته
  let projIdx = null;
  function projOf(id) {
    if (id == null) return null;
    if (!projIdx) { projIdx = {}; Object.values(db.get('projects', {})).forEach((p) => { if (p.id != null) projIdx[String(p.id)] = p; if (p.projectId != null && !projIdx[String(p.projectId)]) projIdx[String(p.projectId)] = p; }); }
    return projIdx[String(id)] || null;
  }
  function asg(x) {
    const pr = projOf(pick(x, 'projectId', 'project.id')) || {};
    return {
      id: idOf(x), empId: String(pick(x, 'employeeId', 'employee.id') || ''), name: pick(x, 'employeeNameAr', 'employeeName', 'fullNameAr', 'employee.fullNameAr'),
      no: pick(x, 'assignmentNumber', 'number'), project: txt(pick(x, 'projectName', 'project.nameAr', 'project.name', 'project.titleAr')) || pr.nameAr || pr.name || pr.nameEn || null,
      code: pick(x, 'codeProject', 'projectCode', 'project.codeProject', 'project.code') || pr.codeProject || null, pno: pick(x, 'projectNumber', 'project.projectNumber', 'project.number') || pr.projectNumber || null,
      cur: pick(x, 'currency', 'project.currency', 'projectCurrency') || pr.currency || null, pct: pick(x, 'percent', 'percentage'),
      status: pick(x, 'status', 'entryStatus'), locked: x.periodLocked === true,
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
  // حدود اليوم بتوقيت فلسطين كما يرسلها النظام نفسه: from=بداية اليوم و to=نهايته بصيغة ISO
  const offFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function tzOff(ms) { const p = {}; offFmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; }); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; }
  function localMidnight(ds) { const [y, m, d] = ds.split('-').map(Number); const g = Date.UTC(y, m - 1, d); return g - tzOff(g - tzOff(g)); }
  const dayRange = (ds) => ({ from: new Date(localMidnight(ds)).toISOString(), to: new Date(localMidnight(addDays(ds, 1)) - 1).toISOString() });
  const numOr = (v) => v == null || v === '' || !isFinite(+v) ? null : +v;
  function mapEvents(list) {
    return list.map((e) => ({
      id: e.id, employeeId: String(e.employeeId != null ? e.employeeId : pick(e, 'employee.id', 'empId')), eventType: String(e.eventType || e.type || '').toLowerCase().replace('checkin', 'check_in').replace('checkout', 'check_out'), recordedAt: e.recordedAt, hiddenAt: e.hiddenAt || null,
      source: e.source || null, kind: e.kind || null, mode: e.registrationMode || null,
      lat: numOr(pick(e, 'latitude', 'lat', 'location.latitude')), lon: numOr(pick(e, 'longitude', 'lng', 'lon', 'location.longitude')), acc: numOr(pick(e, 'accuracy', 'accuracyMeters')),
      siteId: pick(e, 'workSiteId', 'siteId'), match: e.workSiteMatchStatus || null, siteName: pick(e, 'matchedSiteNameAr', 'workSiteNameAr', 'workSite.nameAr', 'siteName'),
      dist: numOr(pick(e, 'distanceMeters', 'distance')), device: typeof e.deviceInfo === 'string' ? e.deviceInfo.slice(0, 120) : e.deviceInfo ? JSON.stringify(e.deviceInfo).slice(0, 120) : null,
      note: pick(e, 'note', 'reason', 'changeReason'), by: pick(e, 'createdByUserName')
    }));
  }
  // تسجيلات جديدة لم تكن محفوظة من قبل (اليوم وأمس فقط): للتنبيه المنبثق
  function collectFresh(ds, evs, seen, fresh) {
    if (!fresh) return;
    const t = dayStr();
    if (ds !== t && ds !== addDays(t, -1)) return;
    evs.forEach((e) => {
      if (e.hiddenAt || !e.recordedAt) return;
      const age = Date.now() - Date.parse(e.recordedAt);
      if (age > 36 * 3600e3 || age < -3600e3) return;
      if (seen ? !seen.has(e.id) : age < 3 * 3600e3) fresh.push(Object.assign({ ds }, e));
    });
  }
  const evPath = (from, to) => '/api/hr/attendance/events?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&limit=500';
  async function syncDay(ds, fresh) {
    const rg = dayRange(ds);
    const r = await get(evPath(rg.from, rg.to));
    if (!r.ok) throw Object.assign(new Error(errText(r)), { res: r });
    const m = db.get(monthKey(ds), {});
    const evs = mapEvents(listOf(r.data));
    collectFresh(ds, evs, m[ds] ? new Set(m[ds].map((e) => e.id)) : null, fresh);
    const before = JSON.stringify(m[ds] || []), after = JSON.stringify(evs);
    m[ds] = evs; db.put(monthKey(ds), m);
    return before === after ? 0 : 1;
  }
  // جلب تراكمي: فقط ما بعد آخر تسجيل محفوظ (طلب صغير جداً يناسب الإنترنت الضعيف)
  async function syncDayInc(ds, fresh) {
    const m = db.get(monthKey(ds), {}), prev = m[ds];
    if (!prev || !prev.length) return syncDay(ds, fresh);
    const rg = dayRange(ds), lastTs = Math.max(...prev.map((e) => Date.parse(e.recordedAt) || 0));
    const from = new Date(Math.max(Date.parse(rg.from), lastTs - 5 * 60e3)).toISOString();
    const r = await get(evPath(from, rg.to));
    if (!r.ok) throw Object.assign(new Error(errText(r)), { res: r });
    const have = new Set(prev.map((e) => e.id));
    const add = mapEvents(listOf(r.data)).filter((e) => !have.has(e.id));
    if (!add.length) return 0;
    collectFresh(ds, add, have, fresh);
    m[ds] = prev.concat(add).sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
    db.put(monthKey(ds), m);
    return 1;
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
  const netInfo = () => { try { return B && B.netInfo ? JSON.parse(B.netInfo()) : { online: navigator.onLine !== false, kbps: 0, wifi: false, metered: false }; } catch (e) { return { online: true, kbps: 0, wifi: false, metered: false }; } };
  // اتصال ضعيف (2G/EDGE): أقل من ~1 ميغابت/ث على بيانات الجوال
  const isSlow = () => { const n = netInfo(); return !!(n.online && !n.wifi && n.kbps > 0 && n.kbps < 1000); };
  /**
   * أوضاع المزامنة:
   *  quick: حضور اليوم فقط وتراكمياً (طلب صغير، لخدمة المراقبة كل بضع دقائق)
   *  light: الحضور منذ آخر مزامنة + الإجازات القريبة، والبيانات الكبيرة (موظفون/عقود/تكليفات/طلبات/أرصدة) كل 6 ساعات (12 على الاتصال الضعيف)
   *  full : كل شيء (زر المزامنة اليدوي)
   * وكل قسم يُحفظ فور اكتماله، وفشل قسم (ضعف الاتصال) لا يُسقط الباقي.
   */
  async function sync(progress, opts) {
    if (syncing) return null;
    opts = opts || {};
    syncing = true;
    db.reload(); // قراءة أحدث ما كتبته خدمة المراقبة (تعمل في WebView مستقل)
    const mode = opts.quick ? 'quick' : opts.full ? 'full' : 'light';
    const meta = db.get('meta', {});
    const slow = isSlow();
    const st = { at: Date.now(), mode, slow, errors: [], ok: 0 };
    const stage = async (name, fn) => {
      try { const r = await fn(); st.ok++; return r; }
      catch (e) { if (e && e.res && e.res.status === 401) throw e; st.errors.push(name); return undefined; }
    };
    try {
      const t = dayStr();
      const haveEmps = Object.keys(db.get('employees', {})).length > 0;
      // أول مرة: كل شيء. بعدها: الحضور والإجازات حديثاً فقط (تراكمياً)، والطلبات كل ساعتين، والبيانات شبه الثابتة (موظفون، عقود، تكليفات، أرصدة) مرة يومياً.
      // النظام لا يوفّر «ما تغيّر منذ…» لهذه القوائم، فتُخفَّف تكرارها بدل جلبها كل مرة. الزر اليدوي يجلب كل شيء.
      const heavyDue = mode === 'full' || !haveEmps || (mode === 'light' && (!meta.heavyAt || Date.now() - meta.heavyAt > (slow ? 48 : 24) * 3600e3));
      const reqDue = heavyDue || opts.requests || (mode === 'light' && (!meta.reqAt || Date.now() - meta.reqAt > (slow ? 4 : 2) * 3600e3));
      if (mode !== 'quick' && heavyDue) {
        progress && progress('الموظفون…');
        await stage('employees', async () => { st.employees = merge('employees', await pagedAll('/api/hr/employees?pageSize=150&status=all&sortBy=empId&sortDir=asc', progress, 'الموظفون')); });
        progress && progress('العقود…');
        await stage('contracts', async () => { st.contracts = merge('contracts', await pagedAll('/api/hr/contracts?pageSize=100&sortBy=employeeName&sortDir=asc', progress, 'العقود')); });
        progress && progress('المشاريع والتكليفات…');
        try { const projs = await pagedAll('/api/projects/lookup?pageSize=50', progress, 'المشاريع'); if (projs.length) { st.projects = merge('projects', projs); projIdx = null; } } catch (e) { /* قد لا يملك الحساب صلاحية المشاريع */ }
        await stage('assignments', async () => {
          const ar = await get('/api/hr/assignments');
          if (!ar.ok) throw new Error('assignments');
          st.assignments = merge('assignments', listOf(ar.data && ar.data.data ? ar.data.data : ar.data));
          const es = await get('/api/hr/assignments/ending-soon');
          if (es.ok) db.put('asgEnding', listOf(es.data && es.data.data ? es.data.data : es.data).map((x) => idOf(x)));
        });
        await stage('sites', async () => {
          const ws = await get('/api/hr/attendance/work-sites?all=1');
          if (!ws.ok) throw new Error('sites');
          db.put('sites', listOf(ws.data).map((x) => ({ id: x.id, name: pick(x, 'nameAr', 'name', 'nameEn'), lat: +x.latitude, lon: +x.longitude, r: +x.radiusMeters || 150 })));
        });
      }
      // الحضور
      const start = opts.from || settings().attStart;
      const days = []; const want = new Set();
      const addRange = (a, b) => { for (let d = a; d <= b && want.size < 400; d = addDays(d, 1)) want.add(d); };
      if (mode === 'quick') { want.add(t); if (new Date().getHours() < 3) want.add(addDays(t, -1)); }
      else if (!meta.attUntil || !meta.attFrom) addRange(start, t);
      else {
        if (start < meta.attFrom) addRange(start, addDays(meta.attFrom, -1));
        addRange(addDays(meta.attUntil, -1), t);
        if (meta.evVer !== 3) addRange(meta.attFrom < start ? meta.attFrom : start, t);
        if (opts.from) addRange(opts.from, t);
      }
      days.push(...[...want].sort());
      const from = days[0] || t;
      let changedDays = 0, done = 0;
      const freshRaw = [];
      // اليوم الحالي: تراكمي (تسجيلات جديدة فقط) إلا كل 45 دقيقة أو في الوضع الكامل لالتقاط التعديلات
      const fullToday = mode === 'full' || !meta.todayFullAt || Date.now() - meta.todayFullAt > 45 * 60e3;
      const total = days.length;
      const worker = async () => {
        while (days.length) {
          const d = days.shift();
          try { changedDays += (d === t && !fullToday) ? await syncDayInc(d, meta.lastSync ? freshRaw : null) : await syncDay(d, meta.lastSync ? freshRaw : null); if (d === t && fullToday) meta.todayFullAt = Date.now(); }
          catch (e) { if (e && e.res && e.res.status === 401) throw e; st.errors.push('att:' + d); }
          done++; progress && progress(`الحضور ${done}/${total}`);
        }
      };
      await Promise.all(Array.from({ length: slow ? 1 : 2 }, worker));
      if (done && st.errors.filter((x) => x.startsWith('att:')).length < total) st.ok++;
      st.attendance = { days: done, changed: changedDays };
      st.fresh = meta.lastSync ? summarizeFresh(freshRaw) : [];
      alertFilter(st.fresh).forEach((v) => addNotice({ key: 'att:' + v.id, type: 'att', title: v.name, at: v.ts, body: (v.kind === 'in' ? 'دخول ' : 'خروج ') + hmFmt(v.ts) + (v.late > 0 ? ' · متأخر ' + v.late + ' د' : '') + (v.st === 'outside' ? ' · خارج نطاق الموقع' : ''), data: { empId: v.empId, ds: v.ds, bad: v.late > 0 || v.st === 'outside' } }));
      if (mode !== 'quick') {
        progress && progress('الإجازات والمهام…');
        await stage('leaves', async () => { st.leaves = await syncLeaves(addDays(mode === 'full' ? from : t, -1), addDays(t, mode === 'full' ? 30 : 3)); });
        if (reqDue) {
          st.requests = {};
          for (const [k, path] of REQ_SRC) {
            progress && progress('الطلبات: ' + REQ_LABEL[k] + '…');
            await stage('req:' + k, async () => { const r = await get(path); if (!r.ok) throw new Error(k); st.requests[k] = merge('req_' + k, listOf(r.data)); reqCache = null; });
          }
          if (!st.errors.some((x) => x.startsWith('req:'))) { meta.reqAt = Date.now(); noticeNewRequests(); }
        }
        const bm = db.get('balMeta', {});
        if (heavyDue && (opts.balances || mode === 'full' || !bm.at || Date.now() - bm.at > (slow ? 48 : 24) * 3600e3)) await stage('balances', async () => { st.balances = await syncBalances(progress); });
      }
      if (!st.ok) throw Object.assign(new Error('تعذّر الاتصال بالنظام، تحقق من الإنترنت'), { res: { status: 0 } });
      if (heavyDue && !st.errors.some((x) => x === 'employees' || x === 'contracts')) meta.heavyAt = Date.now();
      if (mode !== 'quick' || !meta.attUntil) { meta.attUntil = t; meta.attFrom = meta.attFrom && meta.attFrom < from ? meta.attFrom : from; }
      meta.bg = !!opts.background;
      meta.lastSync = st.at; meta.last = st; meta.evVer = 3;
      if (mode === 'quick') meta.lastQuick = st.at;
      db.put('meta', meta);
      return st;
    } finally { syncing = false; }
  }

  /* ---------- الطلبات والأرصدة ---------- */
  const REQ_SRC = [
    ['daily', '/api/hr/leaves/requests?search=&view=active'],
    ['hourly', '/api/hr/leaves/requests/hourly?scope=personal_hourly&search=&view=active'],
    ['mission', '/api/hr/leaves/requests/hourly?scope=work_mission&search=&view=active'],
    ['overtime', '/api/hr/overtime?search=&view=active'],
    ['holiday', '/api/hr/leaves/requests/holiday-work?scope=all']
  ];
  const REQ_LABEL = { daily: 'إجازة يومية', hourly: 'مغادرة ساعية', mission: 'مهمة عمل', overtime: 'عمل إضافي', holiday: 'عمل في عطلة' };
  const tm = (v) => { if (!v) return null; const sv = String(v); if (/^\d{1,2}:\d{2}/.test(sv)) return sv.slice(0, 5); const d = new Date(sv); if (isNaN(d)) return sv; return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); };
  function req(kind, x) {
    const date = d10(pick(x, 'date', 'workDate', 'startDate'));
    return {
      id: kind + ':' + idOf(x), kind, empId: String(pick(x, 'employeeId', 'employee.id') || ''),
      name: pick(x, 'employeeFullNameAr', 'employeeNameAr', 'employeeName', 'employee.fullNameAr', 'fullNameAr'),
      nature: pick(x, 'nature', 'type', 'leaveType'), status: String(pick(x, 'status') || '').toLowerCase() || null,
      from: d10(pick(x, 'startDate', 'date', 'workDate')) || date, to: d10(pick(x, 'endDate', 'date', 'workDate', 'startDate')) || date,
      start: tm(pick(x, 'actualDepartureTime', 'plannedDepartureTime', 'startTime', 'fromTime')), end: tm(pick(x, 'actualReturnTime', 'plannedReturnTime', 'endTime', 'toTime', 'checkoutTime')),
      planned: tm(pick(x, 'plannedDepartureTime')) ? tm(pick(x, 'plannedDepartureTime')) + (tm(pick(x, 'plannedReturnTime')) ? ' ← ' + tm(pick(x, 'plannedReturnTime')) : '') : null,
      hours: pick(x, 'hours', 'totalHours', 'durationHours'), days: pick(x, 'days', 'workDays', 'totalDays'),
      reason: pick(x, 'reason', 'notes', 'description'), project: pick(x, 'projectNameAr', 'projectName', 'projectLabel', 'projectNumber'),
      by: pick(x, 'approvedByFullNameAr', 'approvedByFullNameEn'), raw: x
    };
  }
  let reqCache = null;
  function requests() {
    if (!reqCache) { reqCache = []; REQ_SRC.forEach(([k]) => Object.values(db.get('req_' + k, {})).forEach((x) => reqCache.push(req(k, x)))); }
    return reqCache;
  }
  const reqsOn = (empId, ds) => requests().filter((r) => r.empId === empId && r.from && r.from <= ds && (r.to || r.from) >= ds && !['rejected', 'cancelled', 'canceled', 'deleted'].includes(r.status));

  // أرصدة الإجازات من /api/hr/leaves/balance (V2 مع سلاسل المنصب إن وُجدت)
  function pool(p) { return p ? { ent: +p.entitlementDays || 0, used: +p.usedDays || 0, rem: p.remainingDays != null ? +p.remainingDays : null } : null; }
  function addPool(a, b) { if (!b) return a; if (!a) return Object.assign({}, b); return { ent: a.ent + b.ent, used: a.used + b.used, rem: (a.rem || 0) + (b.rem || 0) }; }
  function parseBalance(d) {
    if (!d) return null;
    const v2 = d.leaveBalanceV2 || d.v2Preview || null;
    let annual = null, sickFull = null, sickHalf = null;
    if (v2 && Array.isArray(v2.positionChains) && v2.positionChains.length) v2.positionChains.forEach((c) => { annual = addPool(annual, pool(c.annual)); sickFull = addPool(sickFull, pool(c.sickFull)); sickHalf = addPool(sickHalf, pool(c.sickHalf)); });
    else if (v2) { annual = pool(v2.annual); sickFull = pool(v2.sickFull); sickHalf = pool(v2.sickHalf); }
    if (!annual) annual = pool(d.annual);
    if (!sickFull) sickFull = pool(d.sick || d.sickFull);
    const c = (v2 && v2.compensatory) || d.compensatory || null;
    const comp = c ? { earned: +c.earnedHours || 0, used: +c.usedHours || 0, remH: c.remainingHours != null ? +c.remainingHours : null, remD: c.remainingDays != null ? +c.remainingDays : null, exp: d10(c.earliestExpiry) } : null;
    return { annual, sickFull, sickHalf, comp, asOf: (v2 && v2.asOf) || null, pending: v2 && v2.pendingAssignmentAttribution, year: d.year || null };
  }
  async function syncBalance(empId) {
    const now = new Date(); const ym = dayStr().split('-');
    const r = await get('/api/hr/leaves/balance?employeeId=' + encodeURIComponent(empId) + '&previewV2=1&throughMonth=' + (+ym[1]) + '&year=' + ym[0]);
    if (!r.ok) return false;
    const all = db.get('balances', {}); all[empId] = { at: now.getTime(), d: r.data }; db.put('balances', all);
    return true;
  }
  async function syncBalances(progress) {
    const ids = Object.values(db.get('employees', {})).map(emp).filter((e) => e.active).map((e) => e.id);
    let done = 0, ok = 0; const q = ids.slice();
    const all = db.get('balances', {});
    const worker = async () => {
      while (q.length) {
        const id = q.shift();
        const ym = dayStr().split('-');
        const r = await get('/api/hr/leaves/balance?employeeId=' + encodeURIComponent(id) + '&previewV2=1&throughMonth=' + (+ym[1]) + '&year=' + ym[0]);
        if (r.ok) { all[id] = { at: Date.now(), d: r.data }; ok++; }
        else if (r.status === 403) { q.length = 0; }
        done++; progress && progress(`الأرصدة ${done}/${ids.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    db.put('balances', all);
    db.put('balMeta', { at: Date.now(), ok, total: ids.length });
    return { ok, total: ids.length };
  }
  const balanceOf = (empId) => { const b = db.get('balances', {})[empId]; return b ? Object.assign(parseBalance(b.d) || {}, { at: b.at }) : null; };

  /* ---------- تنبيهات الحضور ---------- */
  // يحوّل التسجيلات الجديدة إلى بيانات جاهزة للعرض (بلا اعتماد على أي شاشة) ويتذكر ما سبق التنبيه عنه
  function summarizeFresh(raw) {
    if (!raw.length) return [];
    const seen = new Set(db.get('attSeen', [])), reps = {}, emps = {};
    employees().forEach((e) => { emps[e.id] = e; });
    const out = [];
    raw.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)).forEach((ev) => {
      const key = String(ev.id) + ':' + ev.employeeId;
      if (seen.has(key)) return;
      seen.add(key);
      const kind = ev.eventType === 'check_in' ? 'in' : ev.eventType === 'check_out' ? 'out' : null;
      const e = emps[ev.employeeId];
      if (!kind || !e) return;
      const rep = reps[ev.ds] || (reps[ev.ds] = dayReport(ev.ds));
      const row = rep.rows.find((r) => r.e.id === ev.employeeId);
      const pl = place(ev);
      out.push({ id: key, empId: ev.employeeId, ds: ev.ds, name: e.name, dept: e.dept, org: e.org, type: e.type, kind, ts: Date.parse(ev.recordedAt),
        late: kind === 'in' && row && row.firstIn === ev.recordedAt ? row.lateMin : 0, st: pl.st, place: pl.name || pl.near || null, dist: pl.dist, work: kind === 'out' && row ? row.workMin : 0 });
    });
    db.put('attSeen', [...seen].slice(-800));
    return out.slice(-40);
  }
  // حسب إعداد المستخدم: الكل / الدخول فقط / المتأخرون والخارجون عن الموقع / إيقاف
  const alertFilter = (arr) => { const m = settings().attAlert; if (!arr || m === 'off') return []; if (m === 'in') return arr.filter((x) => x.kind === 'in'); if (m === 'issues') return arr.filter((x) => x.late > 0 || x.st === 'outside'); return arr; };

  /* ---------- الاستعلام ---------- */
  const employees = () => Object.values(db.get('employees', {})).map(emp);
  const contracts = () => Object.values(db.get('contracts', {})).map(con);
  const assignments = () => Object.values(db.get('assignments', {})).map(asg);
  const events = (ds) => (db.get(monthKey(ds), {})[ds]) || null;
  const leaveOf = (eid, ds) => db.get('leaves', {})[eid + ':' + ds] || null;
  // auto: off | open (عند الفتح) ؛ every: كل كم دقيقة؛ bg: المزامنة في الخلفية
  const settings = () => Object.assign({ office: '08:00', field: '08:00', grace: 10, dayHours: 8, attAlert: 'all', digestOn: true, digestAt: '08:45', weekend: [5], attStart: '2026-11-01', auto: 'open', every: 60, bg: true }, db.get('settings', {}));

  const minutesOf = (iso) => { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).forEach((x) => { p[x.type] = x.value; }); return (+p.hour % 24) * 60 + +p.minute; };
  const hmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const activeOn = (e, ds) => (!e.join || e.join <= ds) && (!e.term || e.term >= ds) && e.active !== false;

  // المكان: اسم موقع العمل، وهل التسجيل داخل نطاقه، والمسافة
  const sites = () => db.get('sites', []);
  function haversine(a, b, c, d) { const R = 6371e3, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  function place(ev) {
    const ss = sites();
    const byId = ev.siteId != null ? ss.find((x) => String(x.id) === String(ev.siteId)) : null;
    let near = null;
    if (ev.lat != null && ev.lon != null) ss.forEach((x) => { if (!isFinite(x.lat) || !isFinite(x.lon)) return; const dd = haversine(ev.lat, ev.lon, x.lat, x.lon); if (!near || dd < near.d) near = { s: x, d: dd }; });
    const site = byId || (near && near.s) || null;
    const dist = ev.dist != null ? ev.dist : near ? near.d : null;
    let st = ev.match;
    if (!st || st === 'unknown') st = ev.lat == null ? 'unknown' : near ? (near.d <= near.s.r ? 'matched' : 'outside') : 'unknown';
    const nm = ev.siteName || (site && site.name) || null;
    return { name: st === 'outside' ? null : nm, near: nm, st, dist: dist != null ? Math.round(dist) : null, lat: ev.lat, lon: ev.lon, acc: ev.acc };
  }
  // ساعات العمل: مجموع فترات (دخول ← خروج)، والفترة المفتوحة اليوم تُحسب حتى الآن
  function worked(list, ds) {
    let ms = 0, open = null;
    list.forEach((x) => {
      const t = Date.parse(x.recordedAt);
      if (x.eventType === 'check_in') { if (open == null) open = t; }
      else if (x.eventType === 'check_out' && open != null) { ms += Math.max(0, t - open); open = null; }
    });
    const live = open != null && ds === dayStr();
    if (live) ms += Math.max(0, Date.now() - open);
    return { min: Math.round(ms / 60000), open: open != null, live };
  }

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
        const reqs = reqsOn(e.id, ds);
        const dayLeave = reqs.find((q) => q.kind === 'daily');
        const leave = leaveOf(e.id, ds) || (dayLeave ? String(dayLeave.nature || 'leave').toLowerCase() : null);
        const hasAsg = asgs.some((a) => a.empId === e.id && (!a.start || a.start <= ds) && (!a.end || a.end >= ds));
        let lateMin = 0;
        if (firstIn) { const start = hmToMin(e.type === 'field' ? cfg.field : cfg.office); lateMin = Math.max(0, minutesOf(firstIn) - start - cfg.grace); }
        let status = 'present';
        if (!list.length) status = leave ? 'leave' : weekend ? 'off' : 'absent';
        else if (lateMin > 0) status = 'late';
        if (list.length && !ins.length) status = 'noin';
        const w = worked(list, ds);
        const outside = list.some((x) => place(x).st === 'outside');
        return { e, list, firstIn, lastOut, lateMin, leave, hasAsg, status, workMin: w.min, openShift: w.open, live: w.live, outside, reqs };
      })
    };
  }


  /* ---------- مركز الإشعارات ---------- */
  const hmFmt = (ms) => new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(ms));
  const PENDING_ST = ['pending', 'submitted', 'manager_approved', 'new'];
  const pendingReqs = () => { const lim = addDays(dayStr(), -30); return requests().filter((q) => PENDING_ST.includes(q.status) && (q.to || q.from || '') >= lim); };
  const notices = () => db.get('notices', {}).list || [];
  const putNotices = (list) => db.put('notices', { list: list.slice(0, 200) });
  function addNotice(n) {
    const all = notices();
    if (n.key && all.some((x) => x.key === n.key)) return false;
    all.unshift(Object.assign({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), read: false, done: false }, n));
    const lim = Date.now() - 45 * 864e5;
    putNotices(all.filter((x) => x.at >= lim));
    return true;
  }
  function patchNotice(id, patch) { const all = notices(); const x = all.find((n) => n.id === id); if (!x) return; Object.assign(x, patch); putNotices(all); }
  const markAllRead = () => putNotices(notices().map((n) => Object.assign({}, n, { read: true })));
  const clearDone = () => putNotices(notices().filter((n) => !n.done));
  const unreadCount = () => notices().filter((n) => !n.read).length;
  // طلبات معلّقة جديدة (أول مرة تُحفظ نقطة البداية دون إشعارات)
  function noticeNewRequests() {
    const pend = pendingReqs(), seen = db.get('reqSeen', null);
    db.put('reqSeen', pend.map((q) => q.id).slice(-400));
    if (seen === null) return;
    const have = new Set(seen), fresh = pend.filter((q) => !have.has(q.id));
    if (!fresh.length) return;
    if (fresh.length > 3) { addNotice({ key: 'reqs:' + Date.now(), type: 'req', title: fresh.length + ' طلبات جديدة قيد الاعتماد', body: fresh.slice(0, 3).map((q) => q.name || '—').join('، ') + '…', data: { many: true } }); return; }
    fresh.forEach((q) => addNotice({ key: 'req:' + q.id, type: 'req', title: (q.name || 'طلب جديد') + ' — ' + (q.kind === 'daily' ? 'إجازة' : q.kind === 'hourly' ? 'مغادرة ساعية' : q.kind === 'mission' ? 'مهمة عمل' : q.kind === 'overtime' ? 'عمل إضافي' : 'عمل في عطلة'), body: 'طلب جديد قيد الاعتماد', data: { reqId: q.id, empId: q.empId } }));
  }

  /* ---------- الملخص الصباحي ---------- */
  function digest() {
    const t = dayStr(), rep = dayReport(t);
    if (!rep.synced) return null;
    const by = (s) => rep.rows.filter((r) => r.status === s);
    const late = by('late'), absent = by('absent');
    const in7 = (x) => x.end && x.end >= t && x.end <= addDays(t, 7);
    const cons = contracts().filter(in7), asgs = assignments().filter(in7), pend = pendingReqs();
    const counts = { late: late.length, absent: absent.length, con: cons.length, asg: asgs.length, req: pend.length };
    const parts = [];
    if (counts.late) parts.push(`${counts.late} متأخر`);
    if (counts.absent) parts.push(`${counts.absent} بلا تسجيل`);
    if (counts.req) parts.push(`${counts.req} طلب معلّق`);
    if (counts.con) parts.push(`${counts.con} عقد ينتهي هذا الأسبوع`);
    if (counts.asg) parts.push(`${counts.asg} تكليف ينتهي هذا الأسبوع`);
    const first = counts.late ? 'late' : counts.absent ? 'absent' : counts.req ? 'req' : counts.con ? 'con' : counts.asg ? 'asg' : null;
    return { ds: t, counts, first, title: 'ملخص اليوم', body: parts.length ? parts.join(' · ') : 'كل شيء على ما يرام اليوم',
      late: late.map((r) => ({ empId: r.e.id, name: r.e.name, min: r.lateMin })), absent: absent.map((r) => ({ empId: r.e.id, name: r.e.name })) };
  }
  // يُرسل مرة واحدة يومياً بعد وقت الملخص (بعد بداية الدوام وتسجيلات الصباح)، ويتخطى العطلة
  function maybeDigest() {
    const s = settings(), t = dayStr();
    if (s.digestOn === false) return null;
    if ((db.get('digestState', {}) || {}).day === t) return null;
    if (s.weekend.includes(Tracker.dowOf(t))) return null;
    const nowMin = minutesOf(new Date().toISOString());
    if (nowMin < hmToMin(s.digestAt || '08:45')) return null;
    const d = digest();
    if (!d) return null;
    db.put('digestState', { day: t });
    addNotice({ key: 'digest:' + t, type: 'digest', title: d.title, body: d.body, data: { first: d.first, ds: t } });
    return d;
  }

  /* ---------- فحص تكيّفي: أقل عدد ممكن من الطلبات للنظام ---------- */
  // كثيف (الفترة التي يختارها المستخدم، بحد أدنى دقيقتين) وقت وصول الموظفين وانصرافهم،
  // 20 دقيقة بين النافذتين، ساكن ليلاً حتى الصباح، وساعة في أيام العطلة.
  function pollHint(base, at) {
    const now = at ? new Date(at) : new Date(), cfg = settings();
    base = Math.max(2, +base || 5);
    const nowMin = minutesOf(now.toISOString());
    const start = Math.min(hmToMin(cfg.office), hmToMin(cfg.field)), end = start + (cfg.dayHours || 8) * 60;
    const MORNING = 330, NIGHT = 21 * 60;
    if (nowMin < MORNING) return Math.min(480, MORNING - nowMin + 1);
    if (nowMin >= NIGHT) return Math.min(480, 24 * 60 - nowMin + MORNING);
    if (cfg.weekend.includes(Tracker.dowOf(dayStr(now)))) return 60;
    const inWin = (nowMin >= start - 30 && nowMin <= start + 150) || (nowMin >= end - 30 && nowMin <= end + 120);
    if (inWin) return base;
    const nextWin = nowMin < start - 30 ? start - 30 : (nowMin > start + 150 && nowMin < end - 30) ? end - 30 : null;
    const gap = nextWin != null ? nextWin - nowMin : 0;
    return gap > 0 && gap < 20 ? gap : 20;
  }

  window.HR = { pollHint, notices, addNotice, patchNotice, markAllRead, clearDone, unreadCount, digest, maybeDigest, pendingReqs, reqActions, decide, netInfo, isSlow, alertFilter, requests, reqsOn, REQ_LABEL, balanceOf, syncBalance, syncBalances, place, sites, get, login, errText, db, sync, isSyncing: () => syncing, employees, contracts, assignments, events, leaveOf, dayReport, settings, emp, con, asg, listOf,
    setWatch: (min) => { if (B && B.hrWatch) B.hrWatch(min | 0); },
    watchState: () => { try { return B && B.hrWatchState ? JSON.parse(B.hrWatchState()) : { min: 0, last: 0, ok: true }; } catch (e) { return { min: 0, last: 0, ok: true }; } },
    hasCreds: () => !!(B && B.erpHasCreds && B.erpHasCreds()),
    forgetCreds: () => { if (B && B.erpForgetCreds) B.erpForgetCreds(); },
    setBackground: (min) => { if (B && B.hrSetBackground) B.hrSetBackground(min | 0); },
    hasSession: () => B && B.erpSession ? B.erpSession() : !!localStorage.getItem('hrWebSession'),
    logout() { if (B && B.erpLogout) B.erpLogout(); else { webCall('POST', '/api/auth/logout', {}); localStorage.removeItem('hrWebSession'); } db.wipe(); localStorage.removeItem('hrUser'); },
    meta: () => db.get('meta', {}) };
})();
