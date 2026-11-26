// تحويل بنكي عبر محفظتي (USSD): *370*1*1*رقم الجوال*المبلغ#
// لا ينفّذ التطبيق التحويل بنفسه: يفتح لوحة الاتصال بالرمز جاهزاً بعد تأكيدك، ويضغط المستخدم «اتصال» ويُدخل رمزه السري على شاشة الشبكة.
(function () {
  const { $, store, toast, go, B } = App;
  const PREFIX = '*370*1*1*';
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
  function check() {
    const n = normNum($('payNum').value), a = +$('payAmt').value;
    if (!/^05\d{8}$/.test(n)) return { err: 'اكتب رقم جوال صحيحاً من 10 أرقام يبدأ بـ 05 (مثال 0599123456)' };
    if (!(a > 0)) return { err: 'اكتب مبلغاً أكبر من صفر' };
    if (a > 100000) return { err: 'المبلغ كبير جداً، تحقق منه' };
    const amt = String(Math.round(a * 100) / 100);
    return { n, a: amt, code: PREFIX + n + '*' + amt + '#' };
  }
  function paint() {
    const r = check(), show = r.code || (PREFIX + (normNum($('payNum').value) || 'رقم الجوال') + '*' + ($('payAmt').value || 'المبلغ') + '#');
    $('payCode').textContent = show;
    const hasInput = $('payNum').value || $('payAmt').value;
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
  $('payBar').onclick = () => { go('pay'); paint(); drawRecents(); };
  ['payNum', 'payAmt'].forEach((id) => { $(id).oninput = paint; });
  $('payGo').onclick = () => {
    const r = check(); if (r.err) { $('payErr').hidden = false; $('payErr').textContent = r.err; toast(r.err); return; }
    const who = $('payName').value.trim();
    if (!confirm(`تأكيد التحويل عبر محفظتي\n\nإلى: ${r.n}${who ? ' (' + who + ')' : ''}\nالمبلغ: ${r.a} ₪\n\nستُفتح لوحة الاتصال بالرمز جاهزاً، ثم تضغط «اتصال».`)) return;
    saveRecent(r.n, who); drawRecents();
    const url = 'tel:' + r.code.replace(/#/g, '%23');
    if (B && B.openExternal) B.openExternal(url); else window.open(url, '_blank');
    toast('اضغط «اتصال» لإتمام التحويل');
  };
  $('payCopy').onclick = () => {
    const r = check(); if (r.err) { toast(r.err); return; }
    if (B && B.copy) B.copy(r.code); else if (navigator.clipboard) navigator.clipboard.writeText(r.code);
    toast('تم نسخ الرمز');
  };
  window.payCode = (n, a) => PREFIX + normNum(n) + '*' + a + '#';   // للاختبار
})();
