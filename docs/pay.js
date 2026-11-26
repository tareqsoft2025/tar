// تحويل بنكي عبر USSD: محفظتي *370*1*1*الجوال*المبلغ#  ·  جوال بي *110*1*الرقم السري*الجوال*المبلغ*1#
// لا ينفّذ التطبيق التحويل بنفسه: يفتح لوحة الاتصال بالرمز جاهزاً بعد تأكيدك، ويضغط المستخدم «اتصال».
// الرقم السري (جوال بي) لا يُحفظ أبداً ولا يُنسخ، ويُمسح من الحقل بعد الإرسال.
(function () {
  const { $, store, toast, go, B } = App;
  const PROVIDERS = {
    mahfazti: { name: 'محفظتي', title: 'محفظتي — تحويل الأموال برمز USSD', pin: false, build: (n, a) => `*370*1*1*${n}*${a}#` },
    jawwalpay: { name: 'جوال بي', title: 'جوال بي — تحويل الأموال برمز USSD', pin: true, build: (n, a, pin) => `*110*1*${pin}*${n}*${a}*1#` }
  };
  let prov = store.get('payProv', 'mahfazti'); if (!PROVIDERS[prov]) prov = 'mahfazti';
  const digits = (v) => String(v || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
  // الصيغة المحلية 05XXXXXXXX؛ يُحوَّل +970/+972/00970 تلقائياً
  function normNum(v) {
    let d = digits(v);
    if (d.startsWith('00')) d = d.slice(2);
    if ((d.startsWith('970') || d.startsWith('972')) && d.length === 12) d = '0' + d.slice(3);
    return d;
  }
  const recents = () => store.get('payRecents', []);
  const saveRecent = (n, name) => {
    const l = recents().filter((x) => x.n !== n); l.unshift({ n, name: name || (recents().find((x) => x.n === n) || {}).name || '' });
    store.set('payRecents', l.slice(0, 8));
  };
  /* ---------- سجل التحويلات: وقت كل عملية والخدمة والمستلم والمبلغ (لا يُسجَّل الرمز السري ولا الرمز الكامل) ---------- */
  const logs = () => store.get('payLog', []);
  const ST = { sent: ['أُرسل للاتصال', 'sent'], ok: ['✓ تم', 'ok'], fail: ['✗ لم يتم', 'fail'] };
  const tfmt = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: (window.Core && Core.TZ) || 'Asia/Hebron' });
  const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: (window.Core && Core.TZ) || 'Asia/Hebron' }).format(new Date(t));
  function addLog(prov, n, name, a) {
    const l = logs(); l.unshift({ id: 'p' + Date.now(), t: Date.now(), p: prov, n, name: name || '', a, s: 'sent' });
    store.set('payLog', l.slice(0, 200));
  }
  function drawLog() {
    const box = $('payLog'), l = logs(); box.innerHTML = '';
    $('payLogClr').hidden = !l.length;
    const today = dayKey(Date.now()), ym = today.slice(0, 7), sum = (f) => l.filter((x) => x.s !== 'fail' && f(dayKey(x.t))).reduce((q, x) => q + (+x.a || 0), 0);
    const r2 = (v) => Math.round(v * 100) / 100;
    $('payLogSum').textContent = l.length ? `اليوم ${r2(sum((d) => d === today))} ₪ · الشهر ${r2(sum((d) => d.slice(0, 7) === ym))} ₪` : '';
    if (!l.length) { box.innerHTML = '<small class="muted">لا توجد تحويلات بعد</small>'; return; }
    l.forEach((x) => {
      const row = document.createElement('div'); row.className = 'pl-row';
      const P = PROVIDERS[x.p] || { name: x.p }, st = ST[x.s] || ST.sent;
      row.innerHTML = `<div class="pl-m"><b></b><small></small></div><div class="pl-r"><b class="pl-a"></b><button type="button" class="pl-s ${st[1]}"></button><button type="button" class="pl-x" aria-label="حذف">✕</button></div>`;
      row.querySelector('.pl-m b').textContent = (x.name ? x.name + ' · ' : '') + x.n;
      row.querySelector('.pl-m small').textContent = `${P.name} · ${tfmt.format(new Date(x.t))}`;
      row.querySelector('.pl-a').textContent = x.a + ' ₪';
      const sb = row.querySelector('.pl-s'); sb.textContent = st[0];
      sb.onclick = () => { const all = logs(), e = all.find((y) => y.id === x.id); if (!e) return; e.s = e.s === 'sent' ? 'ok' : e.s === 'ok' ? 'fail' : 'sent'; store.set('payLog', all); drawLog(); };
      row.querySelector('.pl-x').onclick = () => { store.set('payLog', logs().filter((y) => y.id !== x.id)); drawLog(); };
      box.appendChild(row);
    });
  }
  function check() {
    const P = PROVIDERS[prov], n = normNum($('payNum').value), a = +$('payAmt').value, pin = digits($('payPin').value);
    if (P.pin && !/^\d{4,8}$/.test(pin)) return { err: 'اكتب الرقم السري (من 4 إلى 8 أرقام)' };
    if (!/^05\d{8}$/.test(n)) return { err: 'اكتب رقم جوال صحيحاً من 10 أرقام يبدأ بـ 05 (مثال 0599123456)' };
    if (!(a > 0)) return { err: 'اكتب مبلغاً أكبر من صفر' };
    if (a > 100000) return { err: 'المبلغ كبير جداً، تحقق منه' };
    const amt = String(Math.round(a * 100) / 100);
    return { n, a: amt, code: P.build(n, amt, pin), shown: P.build(n, amt, '••••') };
  }
  function paint() {
    const P = PROVIDERS[prov], r = check();
    $('payTitle').textContent = P.title;
    $('payPinRow').hidden = !P.pin; $('payPinNote').hidden = !P.pin; $('payCopy').hidden = P.pin;
    document.querySelectorAll('#payProv [data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === prov));
    $('payCode').textContent = r.shown || P.build(normNum($('payNum').value) || 'رقم الجوال', $('payAmt').value || 'المبلغ', P.pin ? '••••' : '');
    const hasInput = $('payNum').value || $('payAmt').value || $('payPin').value;
    $('payErr').hidden = !(r.err && hasInput); $('payErr').textContent = r.err || '';
  }
  function drawRecents() {
    const box = $('payRec'); box.innerHTML = '';
    const l = recents();
    if (!l.length) { box.innerHTML = '<small class="muted">لا يوجد مستلمون محفوظون بعد</small>'; return; }
    l.forEach((x) => {
      const b = document.createElement('span'); b.className = 'chip sm'; b.style.display = 'inline-flex'; b.style.gap = '8px'; b.style.alignItems = 'center';
      const t = document.createElement('button'); t.type = 'button'; t.style.cssText = 'background:none;border:0;color:inherit;font:inherit;cursor:pointer'; t.textContent = (x.name ? x.name + ' · ' : '') + x.n;
      t.onclick = () => { $('payNum').value = x.n; $('payName').value = x.name || ''; paint(); $('payAmt').focus(); };
      const d = document.createElement('button'); d.type = 'button'; d.setAttribute('aria-label', 'حذف'); d.style.cssText = 'background:none;border:0;color:var(--muted);cursor:pointer'; d.textContent = '✕';
      d.onclick = () => { store.set('payRecents', recents().filter((y) => y.n !== x.n)); drawRecents(); };
      b.appendChild(t); b.appendChild(d); box.appendChild(b);
    });
  }
  $('payBar').onclick = () => { $('payPin').value = ''; go('pay'); paint(); drawRecents(); drawLog(); };
  $('payLogClr').onclick = () => { if (confirm('مسح كل سجل التحويلات؟')) { store.set('payLog', []); drawLog(); } };
  document.querySelectorAll('#payProv [data-p]').forEach((b) => { b.onclick = () => { prov = b.dataset.p; store.set('payProv', prov); $('payPin').value = ''; paint(); }; });
  ['payNum', 'payAmt', 'payPin'].forEach((id) => { $(id).oninput = paint; });
  $('payGo').onclick = () => {
    const r = check(); if (r.err) { $('payErr').hidden = false; $('payErr').textContent = r.err; toast(r.err); return; }
    const who = $('payName').value.trim(), P = PROVIDERS[prov];
    if (!confirm(`تأكيد التحويل عبر ${P.name}\n\nإلى: ${r.n}${who ? ' (' + who + ')' : ''}\nالمبلغ: ${r.a} ₪\n\nستُفتح لوحة الاتصال بالرمز جاهزاً، ثم تضغط «اتصال».`)) return;
    saveRecent(r.n, who); drawRecents(); addLog(prov, r.n, who, +r.a); drawLog();
    const url = 'tel:' + r.code.replace(/#/g, '%23');
    if (B && B.openExternal) B.openExternal(url); else window.open(url, '_blank');
    toast('اضغط «اتصال» لإتمام التحويل');
    if (P.pin) setTimeout(() => { $('payPin').value = ''; paint(); }, 800);   // لا يبقى الرقم السري في الحقل
  };
  $('payCopy').onclick = () => {
    const r = check(); if (r.err) { toast(r.err); return; }
    if (PROVIDERS[prov].pin) { toast('نسخ الرمز معطّل لهذه الخدمة لحماية الرقم السري'); return; }
    if (B && B.copy) B.copy(r.code); else if (navigator.clipboard) navigator.clipboard.writeText(r.code);
    toast('تم نسخ الرمز');
  };
  paint();
  window.payCode = (p, n, a, pin) => PROVIDERS[p].build(normNum(n), a, pin);   // للاختبار
})();
