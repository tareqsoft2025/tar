// نافذة التذكير في منتصف الشاشة (تُستخدم داخل التطبيق وفي نافذة أندرويد المنبثقة reminder.html)
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: (window.Core && Core.TZ) || 'Asia/Hebron' });
  const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function left(due) {
    const m = Math.round((due - Date.now()) / 60000);
    if (Math.abs(m) < 1) return 'الآن';
    const a = Math.abs(m);
    const txt = a < 60 ? `${a} دقيقة` : a < 1440 ? `${Math.floor(a / 60)} س${a % 60 ? ` و${a % 60} د` : ''}` : `${Math.round(a / 1440)} يوم`;
    return m > 0 ? `بعد ${txt}` : `منذ ${txt}`;
  }

  // يضع علامة الإنجاز مباشرة في بيانات الأجندة المحفوظة
  function markDone(tid, ds) {
    try {
      const list = JSON.parse(localStorage.getItem('agenda') || '[]');
      const it = list.find((x) => x.id === tid);
      if (!it) return false;
      if (it.repeat && it.repeat !== 'none') { it.doneOn = it.doneOn || {}; it.doneOn[ds] = 1; } else it.done = true;
      it.upd = Date.now();
      localStorage.setItem('agenda', JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }

  let timer = null;
  function show(host, d, h) {
    h = h || {};
    clearInterval(timer);
    const color = d.color || 'var(--gold)';
    const subs = (d.subs || []).filter((s) => !s.d).slice(0, 4);
    host.innerHTML = `<div class="rp" role="alertdialog" aria-modal="true" aria-labelledby="rpT" style="--rc:${esc(color)}">
      <div class="rp-scrim"></div>
      <div class="rp-card">
        <div class="rp-glow"></div>
        <div class="rp-bellwrap"><span class="rp-wave"></span><span class="rp-wave w2"></span><span class="rp-bell">${BELL}</span></div>
        <div class="rp-eyebrow">${esc(d.cat || 'تذكير بمهمة')}</div>
        <h2 id="rpT" class="rp-title">${esc(d.title)}</h2>
        ${d.due ? `<div class="rp-when"><b>${tf.format(new Date(d.due))}</b><span id="rpLeft">${left(d.due)}</span></div>` : ''}
        ${d.body ? `<p class="rp-body">${esc(d.body)}</p>` : ''}
        ${subs.length ? `<ul class="rp-subs">${subs.map((s) => `<li>${esc(s.t)}</li>`).join('')}</ul>` : ''}
        <button class="rp-done" type="button" data-a="done"><span>${CHECK}</span>تمّ الإنجاز</button>
        <div class="rp-row">
          <button type="button" data-a="s10">تأجيل 10 د</button>
          <button type="button" data-a="s30">تأجيل 30 د</button>
          ${h.open ? '<button type="button" data-a="open">فتح</button>' : ''}
        </div>
        <button class="rp-x" type="button" data-a="close">إغلاق</button>
      </div></div>`;
    const root = host.firstElementChild;
    requestAnimationFrame(() => root.classList.add('in'));
    if (d.due) timer = setInterval(() => { const e = host.querySelector('#rpLeft'); if (e) e.textContent = left(d.due); }, 15000);
    const finish = (fn) => {
      clearInterval(timer);
      root.classList.remove('in'); root.classList.add('out');
      setTimeout(() => { host.innerHTML = ''; if (fn) fn(); }, 260);
    };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'done') { root.querySelector('.rp-card').classList.add('ok'); setTimeout(() => finish(h.done), 420); }
      else if (a === 's10') finish(() => h.snooze && h.snooze(10));
      else if (a === 's30') finish(() => h.snooze && h.snooze(30));
      else if (a === 'open') finish(h.open);
      else finish(h.close);
    });
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
    setTimeout(() => { const b = root.querySelector('.rp-done'); if (b) b.focus(); }, 300);
  }

  window.RemindUI = { show, markDone, left };
})();
