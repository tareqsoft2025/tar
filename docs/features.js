// أسماء الله الحسنى، الأدعية المأثورة، ختمة القرآن، ووضع المسجد وصوت الأذان
(function () {
  const { $, state, store, B, icon, toast, go } = App;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const arNum = (n) => String(n).replace(/\d/g, (d) => AR[d]);
  const norm = (t) => String(t).replace(/[ًٌٍَُِّْٰ]/g, '');
  const dayIndex = () => { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5); };

  /* =============== أسماء الله الحسنى =============== */
  const A = window.ASMA;
  const todayName = () => A[dayIndex() % A.length];
  function renderAsmaCard() {
    const [n, m] = todayName();
    $('asmaCard').innerHTML = `<small>اسم الله اليوم</small><b>${n}</b><span>${m}</span>`;
  }
  $('asmaCard').onclick = () => go('asma');
  function renderAsmaList() {
    const q = norm($('asSearch').value.trim());
    const box = $('asList'); box.innerHTML = '';
    A.forEach(([n, m], i) => {
      if (q && !(norm(n).includes(q) || norm(m).includes(q))) return;
      box.appendChild(el('div', 'as-it', `<span class="n">${arNum(i + 1)}</span><b>${n}</b><small>${m}</small>`));
    });
    if (!box.children.length) box.appendChild(el('div', 'empty-msg', 'لا نتائج'));
  }
  $('asSearch').oninput = renderAsmaList;

  let quiz = null;
  const pick = (n, but) => { const out = []; while (out.length < n) { const i = Math.floor(Math.random() * A.length); if (i !== but && !out.includes(i)) out.push(i); } return out; };
  function renderQuiz() {
    const box = $('asQuiz'); box.innerHTML = '';
    if (!quiz) { box.hidden = true; return; }
    box.hidden = false;
    const wrap = el('div', 'quiz');
    if (quiz.n >= 10) {
      wrap.innerHTML = `<div class="qn">${arNum(quiz.score)} / ${arNum(10)}</div><div class="center muted">${quiz.score >= 8 ? 'ما شاء الله، حفظ ممتاز' : quiz.score >= 5 ? 'أحسنت، واصل المراجعة' : 'راجع الأسماء وأعد المحاولة'}</div>`;
      const again = el('button', 'btn-gold', 'اختبار جديد'); again.onclick = () => { quiz = { n: 0, score: 0 }; nextQ(); };
      wrap.appendChild(again);
      box.appendChild(wrap); return;
    }
    const q = quiz.q;
    wrap.innerHTML = `<div class="qh"><span>السؤال ${arNum(quiz.n + 1)} من ${arNum(10)}</span><span>الدرجة ${arNum(quiz.score)}</span></div><div class="qn">${A[q.i][0]}</div><div class="center muted small">ما معنى هذا الاسم؟</div>`;
    q.opts.forEach((oi) => {
      const b = el('button', 'qo', A[oi][1]);
      b.onclick = () => {
        if (quiz.done) return;
        quiz.done = true;
        const ok = oi === q.i;
        if (ok) quiz.score++;
        b.classList.add(ok ? 'ok' : 'bad');
        [...wrap.querySelectorAll('.qo')].forEach((x, k) => { if (q.opts[k] === q.i) x.classList.add('ok'); });
        if (navigator.vibrate) navigator.vibrate(ok ? 20 : 10);
        const nx = el('button', 'btn-outline wide', quiz.n >= 9 ? 'عرض النتيجة' : 'السؤال التالي');
        nx.onclick = () => { quiz.n++; nextQ(); };
        wrap.appendChild(nx);
      };
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
  }
  function nextQ() {
    if (quiz.n >= 10) { renderQuiz(); return; }
    const i = Math.floor(Math.random() * A.length);
    const opts = pick(3, i).concat(i).sort(() => Math.random() - 0.5);
    quiz.q = { i, opts }; quiz.done = false;
    renderQuiz();
  }
  $('asQuizBtn').onclick = () => { quiz = { n: 0, score: 0 }; nextQ(); $('asQuiz').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  App.screens.asma = () => {
    const [n, m] = todayName();
    $('asToday').textContent = n; $('asTodayM').textContent = m;
    renderAsmaList();
    if (!quiz) $('asQuiz').hidden = true;
  };

  /* =============== الأدعية المأثورة =============== */
  const D = window.DUAS;
  let dcat = 'الكل';
  function renderDuas() {
    const cats = ['الكل'].concat([...new Set(D.map((d) => d.c))]);
    const cb = $('duCats'); cb.innerHTML = '';
    cats.forEach((c) => { const b = el('button', 'chip' + (c === dcat ? ' on' : ''), c); b.onclick = () => { dcat = c; renderDuas(); }; cb.appendChild(b); });
    const q = norm($('duSearch').value.trim());
    const box = $('duList'); box.innerHTML = '';
    D.forEach((d) => {
      if (dcat !== 'الكل' && d.c !== dcat) return;
      if (q && !(norm(d.t).includes(q) || norm(d.w).includes(q))) return;
      const card = el('div', 'dcard', `<div class="dw">${d.w}</div><div class="dt">${d.t}</div><div class="df"><span>${d.s}</span></div>`);
      const cp = el('button', 'btn-outline', `${icon('copy')}<span>نسخ</span>`);
      cp.onclick = () => App.copyText && App.copyText(`${d.t}\n(${d.w} · ${d.s})`, 'تم نسخ الدعاء');
      card.querySelector('.df').appendChild(cp);
      box.appendChild(card);
    });
    if (!box.children.length) box.appendChild(el('div', 'empty-msg', 'لا نتائج'));
  }
  $('duSearch').oninput = renderDuas;
  App.screens.duas = renderDuas;

  /* =============== ختمة القرآن =============== */
  const Q = window.QURAN;
  const OFFS = []; let TOTAL = 0; Q.forEach((s) => { OFFS.push(TOTAL); TOTAL += s[2].length; });
  const absPos = (s, a) => OFFS[s - 1] + a;
  const curPos = () => { const lp = store.get('qlast', null); return lp ? absPos(lp.s, lp.a) : 0; };
  const PLANS = [['ختمة في 30 يوماً (رمضان)', 30], ['ختمة في 60 يوماً', 60], ['ختمة في 90 يوماً', 90], ['ختمة في 180 يوماً', 180]];
  const daysBetween = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 864e5);
  function startKhatma(days) {
    store.set('khatma', { start: Tracker.dayStr(), days, base: curPos() >= TOTAL - 5 ? 0 : curPos() });
    renderKhatma(); toast('بدأت ختمتك، بارك الله فيك');
  }
  function choosePlan() {
    App.choose('اختر مدة الختمة', PLANS.map(([t, d]) => [t, () => startKhatma(d)]));
  }
  function renderKhatma() {
    const box = $('khBody'); box.innerHTML = '';
    const k = store.get('khatma', null);
    const count = store.get('khatmaCount', 0);
    if (!k) {
      box.appendChild(el('div', 'kh-hero', `<div class="eyebrow">ختمة القرآن</div><div class="muted" style="margin:8px 0 4px">وزّع القرآن على أيام تناسبك، وتابع تقدّمك يوماً بيوم من القارئ.</div>${count ? `<div class="muted small">عدد ختماتك: ${arNum(count)}</div>` : ''}`));
      const b = el('button', 'btn-gold', 'ابدأ ختمة جديدة'); b.onclick = choosePlan; box.appendChild(b);
      return;
    }
    const cur = curPos();
    const span = Math.max(1, TOTAL - k.base);
    const elapsed = Math.max(0, daysBetween(k.start, Tracker.dayStr()));
    const left = Math.max(0, k.days - elapsed);
    const done = Math.max(0, Math.min(span, cur - k.base));
    const pct = done / span;
    const target = k.base + Math.min(span, Math.ceil(span * Math.min(k.days, elapsed + 1) / k.days));
    const need = Math.max(0, target - cur);
    const perDay = Math.ceil(span / k.days);
    const pages = (v) => Math.max(1, Math.round(v / (TOTAL / 604)));
    const finished = cur >= TOTAL - 1 || done >= span - 1;
    if (finished) {
      box.appendChild(el('div', 'kh-hero', `<div class="big">${icon('check', 'ic gold')}</div><b>ختمت القرآن، تقبّل الله منك</b><div class="muted" style="margin-top:6px">أتممت الختمة في ${arNum(elapsed + 1)} يوماً</div><div class="muted small" style="margin-top:6px">اللهم اجعله حجة لنا لا علينا</div>`));
      const b = el('button', 'btn-gold', 'تسجيل الختمة وبدء ختمة جديدة');
      b.onclick = () => { store.set('khatmaCount', count + 1); store.set('khatma', null); store.set('qlast', null); renderKhatma(); };
      box.appendChild(b);
      return;
    }
    const status = need === 0 ? 'أنت في الموعد أو متقدّم على الخطة' : `متبقٍّ لهدف اليوم ${arNum(need)} آية (نحو ${arNum(pages(need))} صفحة)`;
    box.appendChild(el('div', 'kh-hero', `<div class="eyebrow">تقدّم الختمة</div><div class="big">${arNum(Math.floor(pct * 100))}٪</div><div class="progress"><i style="width:${pct * 100}%"></i></div><div class="muted" style="margin-top:10px">${status}</div>`));
    const g = el('div', 'group pad', '');
    [['الآية الحالية', cur ? `${Q[(store.get('qlast').s) - 1][0]} · ${arNum(store.get('qlast').a)}` : 'لم تبدأ بعد'],
     ['وردك اليومي', `${arNum(perDay)} آية (نحو ${arNum(pages(perDay))} صفحة)`],
     ['الأيام المتبقية', arNum(left)],
     ['عدد ختماتك', arNum(count)]].forEach(([a, b]) => g.appendChild(el('div', 'kh-row', `<b>${a}</b><span>${b}</span>`)));
    box.appendChild(g);
    const cont = el('button', 'btn-gold', cur ? 'تابع القراءة' : 'ابدأ القراءة');
    cont.onclick = () => { const lp = store.get('qlast', null); App.openAyah(lp ? lp.s : 1, lp ? lp.a : 1); };
    box.appendChild(cont);
    const chg = el('button', 'btn-outline wide', 'تغيير الخطة أو إعادة البدء'); chg.onclick = () => App.choose('ختمة القرآن', PLANS.map(([t, d]) => [t, () => startKhatma(d)]).concat([['إلغاء الختمة', () => { store.set('khatma', null); renderKhatma(); }]]));
    box.appendChild(chg);
  }
  App.screens.khatma = renderKhatma;

  /* =============== وضع المسجد وصوت الأذان =============== */
  const mosq = () => state.mosque || { on: false, mins: 20 };
  function syncMosqUI() {
    $('mosqOn').checked = !!mosq().on;
    $('mosqMins').value = String(mosq().mins || 20);
    $('mosqSub').textContent = `من بعد الأذان بدقيقتين لمدة ${arNum(mosq().mins || 20)} دقيقة`;
    $('mosqPerm').hidden = !(B && B.dndAllowed && mosq().on && !B.dndAllowed());
  }
  function saveMosq(v) { state.mosque = v; store.set('mosque', v); syncMosqUI(); App.refresh(); }
  $('mosqOn').onchange = (e) => {
    saveMosq({ on: e.target.checked, mins: mosq().mins || 20 });
    if (!B) { toast('وضع المسجد يعمل داخل تطبيق الأندرويد فقط'); return; }
    if (e.target.checked) {
      if (B.dndAllowed && !B.dndAllowed()) { B.requestDnd(); toast('اسمح للتطبيق بالتحكم بوضع عدم الإزعاج ثم ارجع إلى هنا'); }
      else toast('سيكتم الجوال بعد الأذان ويعيد وضعه تلقائياً');
    } else if (B.mosqueEnd) B.mosqueEnd();
  };
  $('mosqMins').onchange = (e) => saveMosq({ on: !!mosq().on, mins: +e.target.value });
  $('mosqPerm').onclick = () => B && B.requestDnd && B.requestDnd();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncMosqUI(); });

  function syncSound() {
    const has = B && B.soundTitle;
    $('sndAdhanT').textContent = has && B.soundTitle('adhan') ? B.soundTitle('adhan') : 'افتراضي';
    $('sndFajrT').textContent = has && B.soundTitle('fajr') ? B.soundTitle('fajr') : 'مثل صوت الأذان';
  }
  window.onSoundPicked = () => { syncSound(); toast('تم حفظ الصوت، سيُستخدم في إشعارات الأذان القادمة'); };
  const needApp = () => { toast('اختيار الصوت متاح داخل تطبيق الأندرويد فقط'); };
  $('sndAdhan').onclick = () => (B && B.pickSound ? B.pickSound('adhan') : needApp());
  $('sndFajr').onclick = () => (B && B.pickSound ? B.pickSound('fajr') : needApp());
  $('sndReset').onclick = () => { if (B && B.clearSound) { B.clearSound('adhan'); B.clearSound('fajr'); syncSound(); toast('أُعيدت الأصوات الافتراضية'); } else needApp(); };
  syncMosqUI(); syncSound();

  renderAsmaCard();
})();
