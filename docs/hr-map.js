// خريطة الحضور التفاعلية داخل التطبيق (Leaflet): مواقع العمل ونطاقها، تسجيلات الدخول والخروج، المسار والمسافات
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = { in: '#2FBF71', out: '#F0A64B', bad: '#F2716A', site: '#5B9DFF', other: '#A98BFF' };
  let map = null, base = null, labels = null, layer = null, mode = 'map', markers = [];

  const light = () => document.documentElement.getAttribute('data-theme') === 'light';
  function tiles() {
    if (base) map.removeLayer(base);
    if (labels) { map.removeLayer(labels); labels = null; }
    if (mode === 'sat') {
      base = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' }).addTo(map);
      labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO', pane: 'overlayPane' }).addTo(map);
    } else {
      base = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${light() ? 'voyager' : 'dark_all'}/{z}/{x}/{y}{r}.png`, { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' }).addTo(map);
    }
    // رسالة انقطاع فقط إذا لم تُحمَّل أي بلاطة خلال 5 ثوانٍ
    let loaded = 0; const n = document.getElementById('hmNet'); if (n) n.hidden = true;
    base.on('tileload', () => { loaded++; if (n) n.hidden = true; });
    clearTimeout(tiles.t); tiles.t = setTimeout(() => { if (!loaded && n) n.hidden = false; }, 5000);
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
      map = L.map('hmMap', { zoomControl: false, attributionControl: true, tap: true });
      L.control.zoom({ position: 'topleft' }).addTo(map);
      map.attributionControl.setPrefix('');
    }
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
    for (const id of ['hrSheet', 'agSheet', 'wxSheet']) {
      const sh = document.getElementById(id);
      if (sh && !sh.hidden) { const c = sh.querySelector('[data-close]'); if (c) c.click(); else sh.hidden = true; return true; }
    }
    const rp = document.getElementById('remPop');
    if (rp && rp.firstChild) { const x = rp.querySelector('[data-a="close"]'); if (x) x.click(); return true; }
    return false;
  };
  window.HRMap = { open, close };
})();
