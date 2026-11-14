// خريطة الحضور التفاعلية داخل التطبيق (Leaflet): مواقع العمل ونطاقها، تسجيلات الدخول والخروج، المسار والمسافات
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = { in: '#2FBF71', out: '#F0A64B', bad: '#F2716A', site: '#5B9DFF', other: '#A98BFF' };
  let map = null, base = null, layer = null, mode = 'map', markers = [];

  const light = () => document.documentElement.getAttribute('data-theme') === 'light';
  /* ---------- الخريطة دون إنترنت (قطاع غزة) ---------- */
  const B0 = window.AndroidBridge || null;
  const OFF = {
    bbox: [34.17, 31.20, 34.60, 31.62], // غرب، جنوب، شرق، شمال
    url: 'https://raw.githubusercontent.com/tareqsoft2025/tar/main/dist/maps/gaza.pmtiles',
    pm: null, downloading: false, pct: 0, fns: [],
    info() { try { return B0 && B0.mapInfo ? JSON.parse(B0.mapInfo()) : { have: !!window.__offlineSource, size: 0 }; } catch (e) { return { have: false, size: 0 }; } },
    have() { return !!this.info().have; },
    inside(p) { return p.lon >= this.bbox[0] && p.lon <= this.bbox[2] && p.lat >= this.bbox[1] && p.lat <= this.bbox[3]; },
    usable(pts) { return !!window.protomapsL && !!window.pmtiles && this.have() && pts.every((p) => this.inside(p)); },
    source() {
      if (B0 && B0.mapRead) return { getKey: () => 'gaza-offline', getBytes: (offset, length) => new Promise((res, rej) => {
        try { const b64 = B0.mapRead(offset, length); if (!b64) return rej(new Error('read')); const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); res({ data: u.buffer }); } catch (e) { rej(e); } }) };
      return window.__offlineSource || null;
    },
    getPM() { if (!this.pm) this.pm = new pmtiles.PMTiles(this.source()); return this.pm; },
    onChange(fn) { this.fns.push(fn); },
    emit() { this.fns.forEach((f) => { try { f(this.state()); } catch (e) { /* ignore */ } }); },
    state() { const i = this.info(); return { have: !!i.have, size: i.size || 0, downloading: this.downloading, pct: this.pct, native: !!(B0 && B0.mapDownload) }; },
    wanted() { try { return !window.HR || HR.settings().mapAuto !== false; } catch (e) { return true; } },
    download() {
      if (!B0 || !B0.mapDownload || this.downloading) return false;
      this.downloading = true; this.pct = 0; this.emit();
      B0.mapDownload(this.url);
      return true;
    },
    remove() { if (B0 && B0.mapDelete) { B0.mapDelete(); this.pm = null; this.emit(); } },
    // تنزيل تلقائي مرة واحدة عند توفر الإنترنت (إن لم تكن الخريطة محمّلة)
    ensure() {
      if (!B0 || this.have() || this.downloading || !this.wanted() || navigator.onLine === false) return false;
      // ملف كبير: التنزيل التلقائي على Wi‑Fi أو الشبكات غير المقيّدة فقط؛ اليدوي متاح دائماً
      try { const n = B0.netInfo ? JSON.parse(B0.netInfo()) : null; if (n && (!n.online || n.metered)) return false; } catch (e) { /* proceed */ }
      return this.download();
    }
  };
  window.mapProgress = (pct) => { if (!OFF.downloading) return; OFF.pct = pct; OFF.emit(); };
  window.mapDone = (ok, msg) => {
    OFF.downloading = false; OFF.pct = ok ? 100 : 0; OFF.pm = null; OFF.emit();
    if (window.toast) window.toast(ok ? 'تم حفظ خريطة غزة، تعمل الآن دون إنترنت' : msg || 'تعذّر تنزيل الخريطة');
    if (ok && map && !document.getElementById('hrMapView').hidden && mode === 'map') tiles();
  };
  window.OfflineMap = OFF;
  let viewPts = [];
  const dlPill = () => document.getElementById('hmDl');
  function pill(txt, auto) {
    const e = dlPill(); if (!e) return;
    if (!txt) { e.hidden = true; return; }
    e.textContent = txt; e.hidden = false; clearTimeout(pill.t);
    if (auto) pill.t = setTimeout(() => { e.hidden = true; }, auto);
  }
  OFF.onChange((st) => { if (st.downloading) pill(`جارٍ تنزيل خريطة غزة للعمل دون إنترنت… ${st.pct}%`); else { const e = dlPill(); if (e && !e.hidden && e.textContent.startsWith('جارٍ')) pill(null); } });
  function vectorLayer() {
    base = protomapsL.leafletLayer({ url: OFF.getPM(), flavor: light() ? 'light' : 'dark', lang: 'ar', maxDataZoom: 15, maxZoom: 20, attribution: '© OpenStreetMap · Protomaps' }).addTo(map);
    document.getElementById('hmMap').dataset.mode = 'offline';
    const n = document.getElementById('hmNet'); if (n) n.hidden = true;
    pill('✓ خريطة غزة محفوظة على الجهاز وتعمل دون إنترنت', 3500);
  }

  // خرائط Esri (بلا مفتاح): رمادية فاتحة/داكنة حسب الثيم، الشوارع، والقمر الصناعي مع الأسماء والطرق.
  // (خرائط CARTO صارت تتطلب مفتاحاً، وOpenStreetMap يرفض طلبات WebView)
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const lay = (path, native) => ({ url: ESRI + path + '/MapServer/tile/{z}/{y}/{x}', opt: { maxZoom: 20, maxNativeZoom: native || 19, attribution: '© Esri, HERE, Garmin, OpenStreetMap' } });
  const MODES = {
    // الطبقة الرمادية دقيقة حتى تكبير 16؛ بعدها: الخريطة الطبوغرافية التفصيلية (فاتح) أو تكبير ناعم (داكن)، بلا طبقة أسماء Esri (عبرية/إنجليزية)؛ أسماء الشوارع العربية ضمن الخريطة نفسها
    map: () => light() ? { base: [lay('Canvas/World_Light_Gray_Base', 16), lay('World_Topo_Map')], deep: lay('World_Topo_Map'), over: [] }
      : { base: [lay('Canvas/World_Dark_Gray_Base', 16), lay('World_Street_Map')], over: [] },
    street: () => ({ base: [lay('World_Street_Map'), lay('World_Topo_Map')], over: [] }),
    sat: () => ({ base: [lay('World_Imagery'), lay('World_Street_Map')], over: [lay('Reference/World_Transportation')] })
  };
  let overs = [];
  function tiles(step) {
    step = step || 0;
    clearTimeout(tiles.t);
    // داخل قطاع غزة وفي وضع "خريطة": نستخدم الخريطة المحلية (تعمل بدون إنترنت)
    if (mode === 'map' && OFF.usable(viewPts)) {
      if (base) map.removeLayer(base);
      overs.forEach((o) => map.removeLayer(o)); overs = [];
      try { vectorLayer(); return; } catch (e) { /* ننتقل إلى الخرائط عبر الإنترنت */ }
    }
    const m = (MODES[mode] || MODES.map)(), list = m.base, prov = list[Math.min(step, list.length - 1)];
    if (base) map.removeLayer(base);
    overs.forEach((o) => map.removeLayer(o)); overs = [];
    base = L.tileLayer(prov.url, prov.opt).addTo(map);
    overs = m.over.map((o) => L.tileLayer(o.url, Object.assign({}, o.opt, { pane: 'overlayPane', attribution: '' }, o.cap ? { maxZoom: o.cap } : {})).addTo(map));
    if (m.deep && step === 0) overs.unshift(L.tileLayer(m.deep.url, Object.assign({}, m.deep.opt, { minZoom: 17, attribution: '' })).addTo(map));
    document.getElementById('hmMap').dataset.mode = mode;
    let loaded = 0, errors = 0; const n = document.getElementById('hmNet'); if (n) n.hidden = true;
    base.on('tileload', () => { loaded++; if (n) n.hidden = true; });
    base.on('tileerror', () => {
      errors++;
      if (!loaded && errors >= 4 && step + 1 < list.length) { clearTimeout(tiles.t); tiles(step + 1); }
    });
    clearTimeout(tiles.t);
    tiles.t = setTimeout(() => {
      if (loaded) return;
      if (OFF.usable(viewPts) && mode !== 'map') { mode = 'map'; document.querySelectorAll('#hmLayers button').forEach((x) => x.classList.toggle('on', x.dataset.l === 'map')); if (window.toast) window.toast('لا يوجد إنترنت، تم التحويل إلى الخريطة المحفوظة'); tiles(); return; }
      if (step + 1 < list.length) tiles(step + 1); else if (n) n.hidden = false;
    }, 6000);
  }
  function pin(color, label, pulse, big) {
    return L.divIcon({
      className: 'hm-pin-wrap', iconSize: [big ? 46 : 40, big ? 56 : 50], iconAnchor: [big ? 23 : 20, big ? 54 : 48], popupAnchor: [0, -46],
      html: `<div class="hm-pin${pulse ? ' pulse' : ''}${big ? ' big' : ''}" style="--pc:${color}"><span>${label}</span></div>`
    });
  }
  function siteIcon(name) {
    return L.divIcon({ className: 'hm-site-wrap', iconSize: [0, 0], html: `<div class="hm-site"><i></i><b>${esc(name)}</b></div>` });
  }
  const fmtD = (d) => d == null ? '' : d >= 1000 ? (d / 1000).toFixed(1) + ' كم' : Math.round(d) + ' م';

  function close() {
    const v = document.getElementById('hrMapView');
    v.classList.remove('in');
    setTimeout(() => { v.hidden = true; }, 250);
    if (window.history && history.state && history.state.hm) history.back();
  }

  /**
   * opts: { title, sub, sites:[{name,lat,lon,r}], points:[{lat,lon,kind:'in'|'out'|'other',st:'matched'|'outside'|'unknown',time,label,name,dist,acc,place}], focus, gmaps }
   */
  function open(opts) {
    const v = document.getElementById('hrMapView');
    v.hidden = false;
    requestAnimationFrame(() => v.classList.add('in'));
    try { history.pushState({ hm: 1 }, ''); } catch (e) { /* ignore */ }
    document.getElementById('hmTitle').textContent = opts.title || 'الخريطة';
    document.getElementById('hmSub').textContent = opts.sub || '';
    if (!window.L) { document.getElementById('hmNet').hidden = false; return; }
    if (!map) {
      map = L.map('hmMap', { zoomControl: false, maxZoom: 20, minZoom: 3, attributionControl: true, tap: true });
      L.control.zoom({ position: 'topleft' }).addTo(map);
      map.attributionControl.setPrefix('');
    }
    viewPts = (opts.points || []).concat(opts.sites || []).filter((p) => isFinite(p.lat) && isFinite(p.lon));
    OFF.ensure();
    tiles();
    if (layer) map.removeLayer(layer);
    layer = L.layerGroup().addTo(map);
    markers = [];
    const bounds = [];
    // مواقع العمل ونطاقها
    (opts.sites || []).forEach((s) => {
      if (!isFinite(s.lat) || !isFinite(s.lon)) return;
      L.circle([s.lat, s.lon], { radius: s.r || 150, color: COLORS.site, weight: 2, dashArray: '6 6', fillColor: COLORS.site, fillOpacity: 0.12 }).addTo(layer);
      L.marker([s.lat, s.lon], { icon: siteIcon(s.name || 'موقع العمل'), interactive: false }).addTo(layer);
      if (opts.fitSites !== false) bounds.push([s.lat, s.lon]);
    });
    // التسجيلات بالترتيب الزمني ومسار بينها
    const pts = (opts.points || []).filter((p) => isFinite(p.lat) && isFinite(p.lon));
    if (pts.length > 1 && opts.path !== false) L.polyline(pts.map((p) => [p.lat, p.lon]), { color: light() ? '#3f7fe0' : '#9cc4ff', weight: 3, opacity: 0.8, dashArray: '2 8', lineCap: 'round', className: 'hm-path' }).addTo(layer);
    pts.forEach((p, i) => {
      const color = p.st === 'outside' ? COLORS.bad : COLORS[p.kind] || COLORS.other;
      if (p.acc && p.acc > 15) L.circle([p.lat, p.lon], { radius: p.acc, color, weight: 1, fillOpacity: 0.08, opacity: 0.5 }).addTo(layer);
      const m = L.marker([p.lat, p.lon], { icon: pin(color, p.label || (i + 1), i === (opts.focus != null ? opts.focus : pts.length - 1), opts.focus === i), riseOnHover: true }).addTo(layer);
      m.bindPopup(`<div class="hm-pop"><b>${esc(p.name || (p.kind === 'in' ? 'تسجيل دخول' : p.kind === 'out' ? 'تسجيل خروج' : 'تسجيل'))}</b>
        <span class="hm-pt">${esc(p.time || '')}</span>
        <span class="hm-ps ${p.st}">${p.st === 'matched' ? 'داخل موقع العمل' : p.st === 'outside' ? 'خارج نطاق الموقع' : 'بلا مطابقة'}${p.dist != null ? ' · ' + fmtD(p.dist) : ''}</span>
        ${p.place ? `<small>${esc(p.place)}</small>` : ''}<small dir="ltr">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.acc ? ' ±' + Math.round(p.acc) + 'm' : ''}</small></div>`, { closeButton: false, className: 'hm-popup', autoPanPadding: [40, 120] });
      markers.push(m);
      bounds.push([p.lat, p.lon]);
    });
    // قائمة التسجيلات في الأسفل
    const strip = document.getElementById('hmStrip');
    strip.innerHTML = pts.map((p, i) => {
      const color = p.st === 'outside' ? COLORS.bad : COLORS[p.kind] || COLORS.other;
      return `<button class="hm-card" data-i="${i}" style="--pc:${color}"><span class="hm-dot">${esc(p.label || i + 1)}</span><span class="hm-ct"><b>${esc(p.name || (p.kind === 'in' ? 'دخول' : p.kind === 'out' ? 'خروج' : 'تسجيل'))}</b><small>${esc(p.time || '')}${p.dist != null ? ' · ' + fmtD(p.dist) : ''}</small></span></button>`;
    }).join('') || '<div class="hm-empty">لا توجد إحداثيات لهذه التسجيلات</div>';
    strip.querySelectorAll('.hm-card').forEach((c) => c.onclick = () => focusOn(+c.dataset.i));
    document.getElementById('hmFit').onclick = () => fit(bounds);
    document.getElementById('hmGo').onclick = () => { const p = pts[opts.focus != null ? opts.focus : 0] || pts[0]; if (p && window.AndroidBridge && AndroidBridge.openMap) AndroidBridge.openMap(p.lat, p.lon, p.name || ''); else if (p) window.open(`https://www.google.com/maps?q=${p.lat},${p.lon}`, '_blank'); };
    document.getElementById('hmGo').hidden = !pts.length;
    setTimeout(() => {
      map.invalidateSize();
      if (opts.focus != null && pts[opts.focus]) { fit(bounds, true); setTimeout(() => focusOn(opts.focus), 450); }
      else fit(bounds);
    }, 280);
  }
  function fit(bounds, quick) {
    if (!bounds.length) { map.setView([31.9, 35.2], 8); return; }
    if (bounds.length === 1) map.setView(bounds[0], 17, { animate: !quick });
    else map.fitBounds(bounds, { padding: [50, 50], paddingBottomRight: [50, 150], maxZoom: 18, animate: !quick });
  }
  function focusOn(i) {
    const m = markers[i]; if (!m) return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.8 });
    setTimeout(() => m.openPopup(), 850);
    document.querySelectorAll('#hmStrip .hm-card').forEach((c) => c.classList.toggle('on', +c.dataset.i === i));
  }

  function wire() {
    document.getElementById('hmBack').onclick = close;
    document.querySelectorAll('#hmLayers button').forEach((b) => b.onclick = () => {
      mode = b.dataset.l;
      document.querySelectorAll('#hmLayers button').forEach((x) => x.classList.toggle('on', x === b));
      if (map) tiles();
    });
    window.addEventListener('popstate', () => { const v = document.getElementById('hrMapView'); if (v && !v.hidden) { v.classList.remove('in'); setTimeout(() => { v.hidden = true; }, 250); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  // زر الرجوع في أندرويد: الخريطة ← نافذة التفاصيل ← المحرر
  window.appBack = () => {
    const v = document.getElementById('hrMapView');
    if (v && !v.hidden) { close(); return true; }
    for (const id of ['mgSheet', 'hrSheet', 'agSheet', 'wxSheet']) {
      const sh = document.getElementById(id);
      if (sh && !sh.hidden) { const c = sh.querySelector('[data-close]'); if (c) c.click(); else sh.hidden = true; return true; }
    }
    const rp = document.getElementById('remPop');
    if (rp && rp.firstChild) { const x = rp.querySelector('[data-a="close"]'); if (x) x.click(); return true; }
    return false;
  };
  window.HRMap = { open, close };
})();
