// سعر الدولار مقابل الشيكل (والعكس) مع محوّل ثنائي الاتجاه وتحديث تلقائي
(function () {
  const { $, store, toast, go } = App;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const TTL = 30 * 60000;
  let rate = (store.get('fx', null) || {}).usd || 0;
  let busy = false;

  async function getJSON(url) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctl.signal }); return await r.json(); } finally { clearTimeout(to); }
  }
  const n2 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n3 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  function paint() {
    const c = store.get('fx', null);
    if (!c || !c.usd) return;
    rate = c.usd;
    $('fxUsd').textContent = `$1 = ₪${n2(c.usd)}`;
    $('fxIls').textContent = `₪1 = $${n3(1 / c.usd)}`;
    $('fxBigUsd').textContent = `$1 = ₪${n2(c.usd)}`;
    $('fxBigIls').textContent = `₪1 = $${n3(1 / c.usd)}`;
    const t = new Date(c.at).toLocaleTimeString('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
    $('fxStamp').textContent = `آخر تحديث ${t}`;
    conv('A');
  }
  async function load(force) {
    const c = store.get('fx', null);
    if (c) paint();
    if (busy || (!force && c && Date.now() - c.at < TTL)) return;
    busy = true;
    try {
      let v;
      try { v = (await getJSON('https://open.er-api.com/v6/latest/USD')).rates.ILS; }
      catch (e) { v = (await getJSON('https://api.frankfurter.app/latest?from=USD&to=ILS')).rates.ILS; }
      if (!(v > 0)) throw new Error('bad');
      store.set('fx', { at: Date.now(), usd: v });
      paint();
      if (force) toast('تم تحديث السعر');
    } catch (e) {
      if (force) toast('تعذّر التحديث، تأكد من الاتصال بالإنترنت');
      if (!c) $('fxStamp').textContent = 'السعر غير متاح بدون اتصال';
    }
    busy = false;
  }

  // المحوّل: الكتابة في أحد الحقلين تحدّث الآخر
  const plain = (v) => String(Math.round(v * 100) / 100);
  function conv(from) {
    if (!rate) return;
    const a = $('fxA'), b = $('fxB');
    if (from === 'A') { const v = parseFloat(a.value); b.value = isNaN(v) ? '' : plain(v * rate); }
    else { const v = parseFloat(b.value); a.value = isNaN(v) ? '' : plain(v / rate); }
  }
  $('fxA').oninput = () => conv('A');
  $('fxB').oninput = () => conv('B');
  $('fxSwap').onclick = () => { const a = $('fxA').value, b = $('fxB').value; $('fxA').value = b; $('fxB').value = a; conv('A'); };
  [1, 10, 50, 100, 500, 1000].forEach((v) => {
    const c = el('button', 'chip', '$' + v);
    c.onclick = () => { $('fxA').value = v; conv('A'); };
    $('fxChips').appendChild(c);
  });
  $('fxRefresh').onclick = () => load(true);
  $('fxBar').onclick = () => go('fx');
  App.screens.fx = () => { paint(); load(false); };

  load(false);
  setInterval(() => { if (!document.hidden) load(false); }, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
})();
