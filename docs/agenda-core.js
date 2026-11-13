// منطق الأجندة الأساسي بلا واجهة: يُحمَّل في التطبيق وفي التحديث بالخلفية (refresh.html) حتى لا تضيع التذكيرات
(function () {
  const TZ = Core.TZ;
  const CATS = [
    { k: 'personal', n: 'شخصي', c: '#5B9DFF' },
    { k: 'work', n: 'عمل', c: '#F0A64B' },
    { k: 'family', n: 'عائلة', c: '#F2719B' },
    { k: 'worship', n: 'عبادة', c: '#2FBF71' },
    { k: 'study', n: 'دراسة', c: '#A98BFF' },
    { k: 'health', n: 'صحة', c: '#2EC4C4' },
    { k: 'other', n: 'أخرى', c: '#8FA2B2' }
  ];
  const catOf = (k) => CATS.find((c) => c.k === k) || CATS[0];
  const today = () => Tracker.dayStr();
  const addDays = Tracker.addDays;
  const dow = Tracker.dowOf;
  const tf = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });

  const offFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  function tzOffset(ms) {
    const p = {}; offFmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000;
  }
  function zoned(ds, h, m) {
    const [y, mo, d] = ds.split('-').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, m);
    return guess - tzOffset(guess - tzOffset(guess));
  }
  const hm = (t) => t.split(':').map(Number);
  const isTask = (it) => it.type !== 'note';
  const rep = (it) => !!it.repeat && it.repeat !== 'none';

  function occurs(it, ds) {
    if (!it.date || !isTask(it) || ds < it.date) return false;
    if (ds === it.date) return true;
    const [, m1, d1] = it.date.split('-'), [, m2, d2] = ds.split('-');
    switch (it.repeat) {
      case 'daily': return true;
      case 'weekdays': { const w = dow(ds); return w !== 5 && w !== 6; }
      case 'weekly': return dow(ds) === dow(it.date);
      case 'monthly': return d1 === d2;
      case 'yearly': return d1 === d2 && m1 === m2;
      default: return false;
    }
  }
  const dueOf = (it, ds) => it.time ? zoned(ds, ...hm(it.time)) : null;
  const isDone = (it, ds) => rep(it) ? !!(it.doneOn && it.doneOn[ds]) : !!it.done;

  // تذكيرات الأيام القادمة؛ كل تذكير يحمل بيانات النافذة المنبثقة
  function notifs(st, nowMs, push) {
    const list = Core.store.get('agenda', []).filter((it) => isTask(it) && it.time && it.remind != null && it.remind >= 0);
    if (!list.length) return;
    const base = today(); let n = 0;
    for (let d = -1; d < 8 && n < 80; d++) {
      const ds = addDays(base, d);
      list.forEach((it) => {
        if (!occurs(it, ds) || isDone(it, ds)) return;
        const due = dueOf(it, ds);
        const c = catOf(it.cat);
        const data = { tid: it.id, ds, title: it.title, body: it.note || '', due, cat: c.n, color: c.c, subs: (it.subs || []).map((s) => ({ t: s.t, d: s.d })) };
        push(due - it.remind * 60000, it.title, [tf.format(new Date(due)), it.note ? it.note.slice(0, 90) : ''].filter(Boolean).join(' · '), { tab: 'agenda', popup: JSON.stringify(data) });
        n++;
      });
    }
  }

  window.AgendaCore = { CATS, catOf, today, addDays, dow, tzOffset, zoned, hm, isTask, rep, occurs, dueOf, isDone };
  window.Agenda = { notifs };
})();
