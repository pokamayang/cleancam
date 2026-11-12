// ============================================================
// CleanCam – Hotspot Map Logic (FR-HOT-01 to 09)
// Complete with Leaflet 250m Grid, Color Bands, DrainageGuard,
// Air Sensors, Traffic Junctions, and Privacy Protection.
// ============================================================

let map, currentDistrict = 'douala', layers = {}, layerVisible = { heatmap: true, sensors: true, reports: true, traffic: true };
let refreshInterval;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Check URL params for district
  const params = new URLSearchParams(window.location.search);
  const distParam = params.get('district');
  if (distParam && (distParam === 'douala' || distParam === 'yaounde')) {
    currentDistrict = distParam;
  }

  initMap();
  const daysEl = document.getElementById('days-filter');
  if (daysEl) daysEl.addEventListener('change', refreshMap);
});

function initMap() {
  const centre = CC.DISTRICTS[currentDistrict] || CC.DISTRICTS.douala;
  map = L.map('leaflet-map', { zoomControl: true, preferCanvas: true })
    .setView([centre.lat, centre.lng], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  layers.heatmap  = L.layerGroup().addTo(map);
  layers.sensors  = L.layerGroup().addTo(map);
  layers.reports  = L.layerGroup().addTo(map);
  layers.traffic  = L.layerGroup().addTo(map);

  // Sync tab UI
  document.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.district === currentDistrict));

  refreshMap();
  refreshInterval = setInterval(refreshMap, CC.REFRESH_PUBLIC);

  // Fix: invalidate size after layout settles (common Leaflet flexbox issue)
  setTimeout(() => { if (map) map.invalidateSize(); }, 200);
  window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
}

async function refreshMap() {
  showLoading();
  try {
    const [cells, sensors, reports] = await Promise.all([
      window.db.getHotspots(currentDistrict),
      window.db.getDevicesByDistrict(currentDistrict),
      window.db.getAllReports({ district: currentDistrict })
    ]);

    renderHeatmap(cells);
    renderSensors(sensors);
    renderReports(reports);
    renderTraffic();
    i18n.applyTranslations();
  } catch (err) {
    console.warn('Map refresh notice:', err);
  } finally {
    hideLoading();
  }
}

// ── Hotspot 250m Grid (FR-HOT-01 to 03 & 08) ───────────────
function renderHeatmap(cells) {
  layers.heatmap.clearLayers();
  for (const cell of cells) {
    const band  = CC.getBand(cell.score);
    const alpha = 0.35 + cell.score / 220;
    const fill  = cell.is_estimated ? 'none' : band.color;

    // 250m cell rectangle
    const rect = L.rectangle(cellBounds(cell.lat, cell.lng, 0.00115), {
      color:     cell.is_estimated ? '#9ca3af' : band.color,
      weight:    cell.is_estimated ? 2 : 1,
      dashArray: cell.is_estimated ? '6 4' : null,
      fillColor: fill,
      fillOpacity: cell.is_estimated ? 0.08 : alpha
    }).addTo(layers.heatmap);

    // Label on cell
    const labelText = cell.is_estimated
      ? `<div style="background:rgba(255,255,255,.9);border:1px dashed #9ca3af;border-radius:4px;padding:1px 5px;font-size:.65rem;color:#6b7280;font-weight:600">Estimé</div>`
      : `<div style="background:${band.color};color:white;border-radius:99px;padding:1px 6px;font-size:.7rem;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3)">${Math.round(cell.score)}</div>`;

    L.marker([cell.lat, cell.lng], {
      icon: L.divIcon({
        html: labelText,
        iconSize: [40, 20], iconAnchor: [20, 10], className: ''
      })
    }).addTo(layers.heatmap);

    rect.on('click', () => showCellPanel(cell, band));
  }
}

function cellBounds(lat, lng, half) {
  return [[lat - half, lng - half], [lat + half, lng + half]];
}

// ── Sensors: DrainageGuard & Air Nodes (FR-HOT-04 & DRN-07) ─
async function renderSensors(sensors) {
  layers.sensors.clearLayers();
  for (const s of sensors) {
    const reading = await window.db.getLatestReading(s.id).catch(() => null);
    const isDrain = s.kind?.includes('drain') || s.id?.includes('drain');

    let badgeHtml = '';
    if (isDrain && reading?.water_level_cm) {
      const riskColor = reading.flood_risk > 70 ? '#ef4444' : (reading.flood_risk > 45 ? '#f97316' : '#0284c7');
      badgeHtml = `
        <div class="sensor-badge-icon" style="background:${riskColor}">
          💧 ${reading.water_level_cm}cm · Risque ${reading.flood_risk}%
        </div>`;
    } else {
      const pm25 = reading?.pm25 || 32;
      const airColor = pm25 > 35 ? (pm25 > 55 ? '#ef4444' : '#f97316') : '#16a34a';
      badgeHtml = `
        <div class="sensor-badge-icon" style="background:${airColor}">
          📡 PM2.5: ${Math.round(pm25)}µg
        </div>`;
    }

    const icon = L.divIcon({
      html: badgeHtml,
      iconSize: [110, 24], iconAnchor: [55, 12], className: ''
    });

    L.marker([s.lat, s.lng], { icon })
      .bindPopup(sensorPopup(s, reading), { className: 'cc-popup' })
      .addTo(layers.sensors);
  }
}

function sensorPopup(s, reading) {
  const isDrain = s.kind?.includes('drain') || s.id?.includes('drain');
  return `
    <div style="min-width:210px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
        <strong style="font-size:.9rem">${s.name}</strong>
        <span class="simulated-label" style="font-size:.65rem">🔧 Simulé</span>
      </div>
      <div style="font-size:.8rem;color:var(--grey-600);margin-bottom:.5rem">Quartier : ${s.quarter} (${s.district})</div>
      
      <div style="display:flex;flex-direction:column;gap:.35rem;font-size:.82rem;background:var(--grey-50);padding:.625rem;border-radius:6px">
        ${isDrain ? `
          <div>Niveau d'eau : <strong>${reading?.water_level_cm || 14} cm</strong></div>
          <div>Risque inondation : <strong style="color:${(reading?.flood_risk || 0)>70?'#ef4444':'#16a34a'}">${reading?.flood_risk || 35}%</strong></div>
          <div>Obstruction drain : <strong>${reading?.blockage_score || 1} / 4</strong></div>
        ` : ''}
        <div>PM2.5 : <strong>${reading?.pm25 || 28} µg/m³</strong> <span class="indicative-label" style="font-size:.65rem">indicatif</span></div>
        <div>PM10 : <strong>${reading?.pm10 || 42} µg/m³</strong></div>
        <div>Batterie : <strong>${reading?.battery_v || 3.92} V</strong> · Temp: <strong>${reading?.temperature_c || 28}°C</strong></div>
        <div>Statut : <strong style="color:#16a34a">🟢 En ligne</strong></div>
      </div>
    </div>
  `;
}

// ── Citizen Reports Layer (FR-HOT-04 & FR-HOT-09 Privacy) ───
function renderReports(reports) {
  layers.reports.clearLayers();
  const typeColors = {
    burning_waste: '#ef4444',
    plastic_waste: '#3b82f6',
    open_dump:     '#f97316',
    water_contamination: '#06b6d4',
    air_smoke:     '#8b5cf6',
    drain_blockage:'#f59e0b',
    dust:          '#64748b',
    oil_spill:     '#0f172a',
    other:         '#6b7280'
  };

  for (const r of reports) {
    if (!r.lat || !r.lng) continue;
    const color = typeColors[r.type] || '#6b7280';
    const icon = L.divIcon({
      html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer" title="${r.reference} (${r.type})"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8], className: ''
    });

    // FR-HOT-09: Privacy guarantee - No phone numbers or private identity displayed
    const popupContent = `
      <div style="min-width:160px">
        <div style="font-weight:700">${r.reference}</div>
        <div style="font-size:.82rem;color:var(--grey-600)">${r.quarter || ''} · ${r.type?.replace('_',' ')}</div>
        <div style="margin-top:.35rem">
          <span class="badge ${r.status==='resolved'?'badge-green':'badge-yellow'}" style="font-size:.7rem">${r.status}</span>
          <span class="badge badge-grey" style="font-size:.7rem">Sév. ${r.severity || 3}/5</span>
        </div>
      </div>
    `;

    L.marker([r.lat, r.lng], { icon })
      .bindPopup(popupContent, { className: 'cc-popup' })
      .addTo(layers.reports);
  }
}

// ── Traffic Junctions Layer ───────────────────────────────
function renderTraffic() {
  layers.traffic.clearLayers();
  const districtJunctions = CC.TRAFFIC_JUNCTIONS.filter(j => j.district === currentDistrict);

  for (const j of districtJunctions) {
    const size = Math.min(34, 14 + j.vph / 90);
    const icon = L.divIcon({
      html: `<div style="background:rgba(249,115,22,.9);color:white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)" title="${j.name}">${Math.round(j.vph/100)/10}k</div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2], className: ''
    });

    L.marker([j.lat, j.lng], { icon })
      .bindPopup(`<strong>${j.name}</strong><br>${j.vph.toLocaleString()} véh/h<br><small style="color:var(--grey-500)">Comptage statique de référence</small>`)
      .addTo(layers.traffic);
  }
}

// ── Cell detail panel (FR-HOT-05) ─────────────────────────
function showCellPanel(cell, band) {
  const emptyEl = document.getElementById('cell-empty');
  if (emptyEl) emptyEl.style.display = 'none';
  const panel = document.getElementById('cell-info');
  panel.classList.add('active');

  const topTypes = (cell.top_types || []).slice(0, 3).map(t =>
    `<span class="badge badge-grey" style="font-size:.72rem">${t.replace('_',' ')}</span>`
  ).join(' ');

  const driversText = i18n.lang === 'fr'
    ? (cell.drivers_fr || cell.drivers || 'Forte concentration de rapports et trafic de carrefour.')
    : (cell.drivers_en || cell.drivers || 'High concentration of citizen reports and junction traffic.');

  panel.innerHTML = `
    <div style="text-align:center;margin-bottom:1.25rem">
      <div class="cell-score-ring" style="background:${band.color};margin:0 auto .5rem;color:white;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;box-shadow:0 4px 12px ${band.color}50">
        ${Math.round(cell.score)}
      </div>
      <div>
        <span class="badge" style="background:${band.color}25;color:${band.color};font-weight:700;font-size:.85rem">
          ${i18n.lang === 'fr' ? band.labelFr : band.labelEn} (${band.min}-${band.max})
        </span>
        ${cell.is_estimated ? `<span class="badge badge-grey" style="font-size:.72rem;margin-left:.35rem">Estimé (IDW)</span>` : ''}
      </div>
      ${cell.quarter ? `<div style="font-size:.9rem;font-weight:600;margin-top:.4rem">📍 Quartier : ${cell.quarter}</div>` : ''}
    </div>

    <div class="score-bar-wrap" style="height:8px;background:var(--grey-100);border-radius:99px;overflow:hidden;margin-bottom:1rem">
      <div class="score-bar" style="width:${cell.score}%;height:100%;background:${band.color}"></div>
    </div>

    <div style="background:var(--grey-50);border-radius:var(--radius-md);padding:.75rem;margin-bottom:1rem;display:flex;flex-direction:column;gap:.5rem">
      <div class="factor-row">
        <span class="factor-label">📊 Signalements (7 jours) :</span>
        <strong>${cell.reports_7d ?? '—'}</strong>
      </div>
      <div class="factor-row">
        <span class="factor-label">💨 Moyenne PM2.5 :</span>
        <strong>${cell.pm25_avg ? cell.pm25_avg.toFixed(1) + ' µg/m³' : '—'}</strong>
      </div>
      <div class="factor-row">
        <span class="factor-label">🚗 Trafic carrefour :</span>
        <strong>${cell.traffic_vph ? cell.traffic_vph.toLocaleString() + ' véh/h' : '—'}</strong>
      </div>
    </div>

    ${topTypes ? `
      <div style="margin-bottom:.85rem">
        <div class="factor-label" style="font-size:.8rem;margin-bottom:.35rem"><strong>Types dominants :</strong></div>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap">${topTypes}</div>
      </div>
    ` : ''}

    <div style="background:var(--green-50);border-radius:var(--radius-md);padding:.75rem;font-size:.825rem;color:var(--grey-800);border-left:4px solid var(--green-600);line-height:1.5">
      💡 <strong>Explication heuristique :</strong><br>${driversText}
    </div>

    ${cell.is_estimated ? `
      <div class="indicative-label" style="margin-top:.75rem;font-size:.72rem;line-height:1.4">
        ⚠️ <em>Cellule sans capteur direct : valeur extrapolée par pondération inverse de la distance (IDW) depuis les 5 cellules mesurées les plus proches.</em>
      </div>
    ` : ''}

    <div style="display:flex;gap:.5rem;margin-top:1.25rem">
      <a href="report.html" class="btn btn-primary btn-sm" style="flex:1;text-align:center">
        📸 Signaler ici
      </a>
      <button onclick="openIVR()" class="btn btn-outline btn-sm" style="flex:1">
        📞 Appeler IVR
      </button>
    </div>
  `;
}

// ── Layer toggles ─────────────────────────────────────────
window.toggleLayer = function(el, name) {
  el.classList.toggle('active');
  layerVisible[name] = el.classList.contains('active');
  if (layerVisible[name]) {
    map.addLayer(layers[name]);
  } else {
    map.removeLayer(layers[name]);
  }
};

// ── District switcher ─────────────────────────────────────
window.switchDistrict = function(d) {
  currentDistrict = d;
  document.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.district === d));
  const centre = CC.DISTRICTS[d] || CC.DISTRICTS.douala;
  map.setView([centre.lat, centre.lng], 14);
  const emptyEl = document.getElementById('cell-empty');
  if (emptyEl) emptyEl.style.display = 'flex';
  const infoEl = document.getElementById('cell-info');
  if (infoEl) infoEl.classList.remove('active');
  refreshMap();
};
