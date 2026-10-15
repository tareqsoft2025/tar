// يوم الجمعة: سنن، ساعة الإجابة، الصلاة على النبي ﷺ، وشريط الجمعة في الشاشة الرئيسية
(function () {
  const { $, state, store, B, icon, toast, go } = App;
  const TZ = Core.TZ;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  const df = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  const pad = (n) => String(n).padStart(2, '0');
  const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

  const SUNNAHS = [
    { k: 'ghusl', t: 'الاغتسال', d: 'غسل يوم الجمعة سنة مؤكدة قبل الذهاب إلى الصلاة' },
    { k: 'tib', t: 'التطيّب ولبس أحسن الثياب', d: 'الزينة والطيب إكراماً ليوم الجمعة' },
    { k: 'siwak', t: 'السواك', d: 'استعمال السواك أو تنظيف الأسنان' },
    { k: 'early', t: 'التبكير إلى المسجد', d: 'كلما بكّرت عظُم الأجر، والإنصات للخطبة واجب' },
    { k: 'kahf', t: 'قراءة سورة الكهف', d: 'نور ما بين الجمعتين', action: 'kahf' },
    { k: 'salawat', t: 'الإكثار من الصلاة على النبي ﷺ', d: 'تُحسب تلقائياً عند بلوغ هدفك اليومي', auto: true },
    { k: 'dua', t: 'الدعاء في ساعة الإجابة', d: 'آخر ساعة بعد العصر حتى المغرب' },
    { k: 'sadaqa', t: 'الصدقة', d: 'الصدقة يوم الجمعة أعظم أجراً' }
  ];
  const FORMULAS = [
    'اللهم صلّ وسلّم على نبينا محمد',
    'اللهم صلّ على محمد وعلى آل محمد، كما صليت على إبراهيم وعلى آل إبراهيم، إنك حميد مجيد، اللهم بارك على محمد وعلى آل محمد، كما باركت على إبراهيم وعلى آل إبراهيم، إنك حميد مجيد',
    'اللهم صلّ وسلّم وبارك على سيدنا محمد وعلى آله وصحبه أجمعين',
    'صلى الله عليه وسلم'
  ];
  const FNAMES = ['مختصرة', 'الإبراهيمية', 'مع الآل والصحب', 'صلى الله عليه وسلم'];

  /* ----- مساعدات التاريخ ----- */
  const today = () => Tracker.dayStr();
  const daysToFriday = (ds) => (5 - Tracker.dowOf(ds) + 7) % 7;
  const fridayKey = (ds) => Tracker.addDays(ds, daysToFriday(ds));
  const isFriday = () => daysToFriday(today()) === 0;

  /* ----- الصلاة على النبي ----- */
  const sal = () => store.get('salawat', { total: 0, days: {} });
  const goal = () => store.get('salGoal', 100);
  const salToday = () => sal().days[today()] || 0;
  function salWeek() {
    const s = sal(), t = today(); let n = 0;
    for (let i = 0; i < 7; i++) n += s.days[Tracker.addDays(t, -i)] || 0;
    return n;
  }
  function addSalawat(n) {
    const s = sal(), t = today();
    s.days[t] = Math.max(0, (s.days[t] || 0) + n);
    s.total = Math.max(0, (s.total || 0) + n);
    // حفظ آخر 60 يوماً فقط
    Object.keys(s.days).sort().slice(0, -60).forEach((k) => delete s.days[k]);
    store.set('salawat', s);
  }

  /* ----- سنن الجمعة (قائمة أسبوعية) ----- */
  function doneMap() {
    const all = store.get('jmDone', {});
    const key = fridayKey(today());
    Object.keys(all).sort().slice(0, -8).forEach((k) => delete all[k]);
    return { all, key, cur: all[key] || {} };
  }
  function toggleDone(k) {
    const { all, key, cur } = doneMap();
    cur[k] = !cur[k];
    all[key] = cur;
    store.set('jmDone', all);
  }

  /* ----- الحالة والتوقيت ----- */
  function times() {
    const now = new Date();
    const delta = daysToFriday(today());
    const fri = new Date(now.getTime() + delta * 864e5);
    const t = Core.calc(state, fri);
    return { now, delta, fri, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib };
  }
  function status(t) {
    const ms = t.now.getTime();
    if (t.delta > 0) return { kind: 'wait', text: t.delta === 1 ? 'الجمعة غداً بإذن الله' : `الجمعة بعد ${t.delta} أيام`, sub: df.format(t.fri) };
    if (ms < t.dhuhr.getTime()) return { kind: 'before', text: `تبقّى ${hms(t.dhuhr.getTime() - ms)} على أذان الجمعة`, sub: 'بادر بالاغتسال والتطيّب والتبكير' };
    if (ms < t.asr.getTime()) return { kind: 'after', text: 'تقبّل الله صلاتك', sub: 'أكثر من الصلاة على النبي ﷺ والدعاء' };
    if (ms < t.maghrib.getTime()) return { kind: 'hour', text: `الآن ساعة الإجابة · ${hms(t.maghrib.getTime() - ms)}`, sub: 'أكثر من الدعاء حتى غروب الشمس' };
    return { kind: 'done', text: 'انقضى يوم الجمعة، تقبّل الله منك', sub: 'نلقاك على خير في الجمعة القادمة' };
  }

  /* ----- رسم الشاشة ----- */
  function renderChecks() {
    const { cur } = doneMap();
    const box = $('jmChecks'); box.innerHTML = '';
    let done = 0;
    SUNNAHS.forEach((s) => {
      const on = s.auto ? salToday() >= goal() : !!cur[s.k];
      if (on) done++;
      const row = el('button', 'jrow' + (on ? ' on' : ''), `<span class="jck">${icon('check')}</span><span class="st"><b>${s.t}</b><small>${s.d}</small></span>${s.action ? icon('chev', 'chev') : ''}`);
      row.onclick = () => {
        if (s.auto) { toast(`تُحتسب عند بلوغ ${goal()} صلاة على النبي ﷺ اليوم`); return; }
        if (s.action === 'kahf') { if (!cur[s.k]) { toggleDone(s.k); } App.openSurah && App.openSurah(18); return; }
        toggleDone(s.k); renderChecks(); renderBanner();
      };
      box.appendChild(row);
    });
    $('jmBar').style.width = (done / SUNNAHS.length * 100) + '%';
  }
  function renderSal() {
    const g = goal(), n = salToday();
    $('salNum').textContent = n;
    $('salGoalTxt').textContent = `من ${g}`;
    const frac = Math.min(1, n / g);
    $('salRing').style.strokeDashoffset = String(754 * (1 - frac));
    $('salToday').textContent = n;
    $('salWeek').textContent = salWeek();
    $('salTotal').textContent = sal().total;
    const idx = store.get('salIdx', 0);
    document.querySelectorAll('#salChips .chip').forEach((c, i) => c.classList.toggle('on', i === idx));
    $('salText').textContent = FORMULAS[idx];
  }
  FNAMES.forEach((n, i) => {
    const b = el('button', 'chip', n);
    b.onclick = () => { store.set('salIdx', i); renderSal(); };
    $('salChips').appendChild(b);
  });
  $('salBtn').onclick = () => {
    const before = salToday();
    addSalawat(1);
    if (navigator.vibrate) navigator.vibrate(salToday() === goal() ? 200 : 12);
    if (before < goal() && salToday() >= goal()) toast('بلغت هدفك اليومي من الصلاة على النبي ﷺ، تقبّل الله منك');
    renderSal(); renderChecks(); renderBanner();
  };
  $('salReset').onclick = () => { addSalawat(-salToday()); renderSal(); renderChecks(); renderBanner(); };
  $('salGoal').onclick = () => {
    const opts = [33, 100, 300, 500, 1000];
    const i = (opts.indexOf(goal()) + 1) % opts.length;
    store.set('salGoal', opts[i]);
    toast('الهدف اليومي: ' + opts[i]);
    renderSal(); renderChecks(); renderBanner();
  };

  function renderJumah() {
    const t = times();
    const st = status(t);
    $('jmWhen').textContent = t.delta === 0 ? 'اليوم' : 'الجمعة القادمة';
    $('jmStatus').textContent = st.text;
    $('jmStatus').dataset.kind = st.kind;
    $('jmPrayer').textContent = tf.format(t.dhuhr);
    $('jmHour').textContent = `${tf.format(t.asr)} – ${tf.format(t.maghrib)}`;
    $('jmWhen').textContent = st.sub;
    renderChecks();
    renderSal();
  }
  App.screens.jumah = renderJumah;
  $('jmKahf').onclick = () => { if (App.openSurah) App.openSurah(18); };
  $('jmHadith').onclick = () => go('hadith', { cat: 'جمعة' });
  setInterval(() => { if (App.isActive('jumah') && !document.hidden) { const t = times(); const st = status(t); $('jmStatus').textContent = st.text; $('jmStatus').dataset.kind = st.kind; $('jmWhen').textContent = st.sub; } }, 1000);

  /* ----- شريط الجمعة في الشاشة الرئيسية ----- */
  function renderBanner() {
    const b = $('jumahBanner');
    const t = times();
    const nowH = t.now;
    const thursdayNight = daysToFriday(today()) === 1 && nowH.getTime() > Core.calc(state, nowH).maghrib.getTime();
    if (!(isFriday() || thursdayNight)) { b.hidden = true; return; }
    const st = status(t);
    const n = salToday(), g = goal();
    b.hidden = false;
    b.innerHTML = `<div class="jb-top"><span class="jb-ic">${icon('star')}</span><span class="jb-t"><b>${isFriday() ? 'اليوم الجمعة' : 'ليلة الجمعة'}</b><small>${isFriday() ? st.text : 'أكثر من الصلاة على النبي ﷺ واقرأ الكهف'}</small></span>${icon('chev', 'chev')}</div><div class="progress"><i style="width:${Math.min(100, n / g * 100)}%"></i></div><div class="jb-s">صلاتك على النبي ﷺ اليوم: ${n} / ${g}</div>`;
    b.onclick = () => go('jumah');
  }
  window.renderJumahBanner = renderBanner;
  renderBanner();
  setInterval(() => { if (!document.hidden) renderBanner(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderBanner(); });
})();
