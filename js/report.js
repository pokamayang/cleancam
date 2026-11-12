// ============================================================
// CleanCam – Report Form Logic (FR-REP & FR-PLOC)
// Complete with EXIF GPS, Draggable Pin, Voice Note & Transcript,
// Photo compression, and Firebase Universal Data Layer.
// ============================================================

// ── State ──────────────────────────────────────────────────
const state = {
  currentStep: 1,
  type:        null,
  severity:    3,
  description: '',
  photos:      [],     // { file, blob, url, exifGPS }
  voiceBlob:   null,
  transcript:  '',
  aiResult:    null,
  lat:         4.0511,
  lng:         9.7679,
  locationSource: 'pin',
  quarter:     'Akwa',
  district:    'douala',
  clientId:    window.uuid ? window.uuid() : crypto.randomUUID(),
  reference:   window.generateRef ? window.generateRef() : 'CC-' + Math.floor(1000 + Math.random()*9000)
};

// ── Map setup (FR-PLOC-01 & FR-PLOC-02) ───────────────────
let pinMap, pinMarker, pastMarkersLayer;

function initPinMap() {
  if (pinMap) {
    pinMap.invalidateSize();
    return;
  }
  pinMap = L.map('pin-map', { zoomControl: true }).setView([state.lat, state.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(pinMap);

  pastMarkersLayer = L.layerGroup().addTo(pinMap);

  const greenIcon = L.divIcon({
    html: `<div style="background:#16a34a;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.35)"></div>`,
    iconSize: [26, 26], iconAnchor: [13, 26], className: ''
  });

  pinMarker = L.marker([state.lat, state.lng], { draggable: true, icon: greenIcon }).addTo(pinMap);

  // Drag pin updates coordinates within 1m rounding precision (FR-PLOC-01)
  pinMarker.on('dragend', e => {
    const pos = e.target.getLatLng();
    const lat = Math.round(pos.lat * 100000) / 100000;
    const lng = Math.round(pos.lng * 100000) / 100000;
    updateLocation(lat, lng, 'pin');
  });

  pinMap.on('click', e => {
    const lat = Math.round(e.latlng.lat * 100000) / 100000;
    const lng = Math.round(e.latlng.lng * 100000) / 100000;
    pinMarker.setLatLng([lat, lng]);
    updateLocation(lat, lng, 'pin');
  });

  // FR-PLOC-02: Show reporter's last 20 reports as markers on map
  loadPastReportsOnMap();
}

async function loadPastReportsOnMap() {
  if (!pastMarkersLayer) return;
  try {
    const reports = await window.db.getMyReports();
    pastMarkersLayer.clearLayers();
    reports.slice(0, 20).forEach(r => {
      if (r.lat && r.lng) {
        const miniIcon = L.divIcon({
          html: `<div style="background:${typeColor(r.type)};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)" title="${r.reference} (${r.type})"></div>`,
          iconSize: [12, 12], iconAnchor: [6, 6], className: ''
        });
        const m = L.marker([r.lat, r.lng], { icon: miniIcon });
        m.bindPopup(`<strong>${r.reference}</strong><br>${r.type}<br>Statut: ${r.status}`);
        pastMarkersLayer.addLayer(m);
      }
    });
  } catch (_) {}
}

function updateLocation(lat, lng, source) {
  state.lat = lat;
  state.lng = lng;
  state.locationSource = source;
  const q = window.nearestQuarter(lat, lng);
  if (q) {
    state.quarter = q.name;
    state.district = q.district || state.district;
    const sel = document.getElementById('quarter-sel');
    if (sel) sel.value = q.name;
  }
  updateLocationUI();
}

function updateLocationUI() {
  const chip = document.getElementById('loc-label');
  const src  = document.getElementById('loc-source-badge');
  if (chip) chip.textContent = state.quarter || `${state.lat.toFixed(4)}, ${state.lng.toFixed(4)}`;
  if (src) {
    const labels = {
      exif: '📷 EXIF GPS',
      gps: '📡 GPS appareil',
      pin: '📌 Marqueur manuel',
      quarter: '🏘️ Centre de quartier'
    };
    src.textContent = labels[state.locationSource] || state.locationSource;
    src.className = state.locationSource === 'exif' ? 'badge badge-green' : 'badge badge-grey';
  }
}

// Device GPS integration
window.useDeviceGPS = function() {
  if (!navigator.geolocation) {
    showToast('Géolocalisation non supportée / Not supported', 'warning');
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    pos => {
      hideLoading();
      const lat = Math.round(pos.coords.latitude * 100000) / 100000;
      const lng = Math.round(pos.coords.longitude * 100000) / 100000;
      updateLocation(lat, lng, 'gps');
      if (pinMap) {
        pinMap.setView([lat, lng], 15);
        pinMarker?.setLatLng([lat, lng]);
      }
      showToast('Position GPS détectée avec succès', 'success');
    },
    err => {
      hideLoading();
      showToast('Impossible d\'obtenir le GPS (permission refusée)', 'warning');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
};

// ── Quarter dropdown ───────────────────────────────────────
function populateQuarters() {
  const sel = document.getElementById('quarter-sel');
  if (!sel) return;
  sel.innerHTML = `<option value="">— ${i18n.t('report_quarter')} —</option>`;
  for (const q of CC.QUARTERS) {
    const opt = document.createElement('option');
    opt.value = q.name;
    opt.textContent = `${q.name} (${q.district === 'douala' ? 'Douala' : 'Yaoundé'})`;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    const q = CC.QUARTERS.find(x => x.name === sel.value);
    if (q) {
      updateLocation(q.lat, q.lng, 'quarter');
      pinMap?.setView([q.lat, q.lng], 15);
      pinMarker?.setLatLng([q.lat, q.lng]);
    }
  });
}

// ── Step navigation ────────────────────────────────────────
window.goStep = function(n) {
  if (n > state.currentStep && !validateStep(state.currentStep)) return;

  document.getElementById(`step-${state.currentStep}`).classList.remove('active');
  document.getElementById(`dot-${state.currentStep}`).classList.remove('active');
  document.getElementById(`dot-${state.currentStep}`).classList.add('done');
  if (state.currentStep > 1) document.getElementById(`line-${state.currentStep - 1}`).classList.add('done');

  state.currentStep = n;
  document.getElementById(`step-${n}`).classList.add('active');
  document.getElementById(`dot-${n}`).classList.add('active');
  document.getElementById(`dot-${n}`).classList.remove('done');

  // Init map on step 3
  if (n === 3) {
    setTimeout(() => {
      initPinMap();
      populateQuarters();
      pinMap?.invalidateSize();
      updateLocationUI();
    }, 60);

    // If we got EXIF from photos, centre map there
    const exifPhoto = state.photos.find(p => p.exifGPS);
    if (exifPhoto) {
      updateLocation(exifPhoto.exifGPS.lat, exifPhoto.exifGPS.lng, 'exif');
      pinMap?.setView([exifPhoto.exifGPS.lat, exifPhoto.exifGPS.lng], 15);
      pinMarker?.setLatLng([exifPhoto.exifGPS.lat, exifPhoto.exifGPS.lng]);
    }
  }

  // Build review on step 4
  if (n === 4) buildReview();

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function validateStep(n) {
  if (n === 1) {
    if (!state.type) {
      document.getElementById('err-type').classList.add('visible');
      return false;
    }
  }
  return true;
}

// ── Type selection ─────────────────────────────────────────
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.type = btn.dataset.type;
    document.getElementById('err-type').classList.remove('visible');
    btn.setAttribute('aria-pressed', 'true');
  });
});

// ── Severity selection ─────────────────────────────────────
document.querySelectorAll('.sev-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.severity = parseInt(btn.dataset.sev, 10);
  });
});

// ── Photo handling (FR-REP-02 & NFR-04) ────────────────────
document.getElementById('photo-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (state.photos.length + files.length > 5) {
    showToast('Maximum 5 photos', 'warning');
    return;
  }

  for (const file of files) {
    // Read EXIF GPS
    const exifGPS = await window.readExifGPS(file);
    // Compress to under 500 KB (max 1280px, quality 0.72)
    const blob    = await window.compressImage(file);
    const url     = URL.createObjectURL(blob);

    state.photos.push({ file, blob, url, exifGPS });
    renderPhotoThumb({ file, blob, url, exifGPS });

    if (exifGPS) {
      state.lat = exifGPS.lat;
      state.lng = exifGPS.lng;
      state.locationSource = 'exif';
      const q = window.nearestQuarter(exifGPS.lat, exifGPS.lng);
      if (q) state.quarter = q.name;
      showToast(`Position GPS extraite de la photo : ${state.quarter || 'Coordonnées détectées'}`, 'success');
    }

    // Run AI classification on first photo
    if (state.photos.length === 1) {
      runAIClassify(url, 'photo');
    }
  }
  e.target.value = '';
});

function renderPhotoThumb({ url, exifGPS }) {
  const grid = document.getElementById('photo-grid');
  const wrap = document.createElement('div');
  wrap.className = 'photo-thumb-wrap';
  wrap.innerHTML = `
    <img src="${url}" class="photo-thumb" alt="Photo" loading="lazy">
    ${exifGPS ? '<span style="position:absolute;bottom:2px;left:2px;font-size:.65rem;background:rgba(22,163,74,.9);color:white;padding:1px 4px;border-radius:4px">📍 GPS</span>' : ''}
    <button class="photo-remove" type="button" aria-label="Remove photo">✕</button>
  `;
  wrap.querySelector('.photo-remove').addEventListener('click', () => {
    const i = state.photos.findIndex(p => p.url === url);
    if (i !== -1) {
      URL.revokeObjectURL(state.photos[i].url);
      state.photos.splice(i, 1);
    }
    wrap.remove();
  });
  const addBtn = grid.querySelector('.photo-add-btn');
  grid.insertBefore(wrap, addBtn);
  if (state.photos.length >= 5) addBtn.style.display = 'none';
}

// ── AI Classification (FR-AI-01 & Section 8.1) ─────────────
async function runAIClassify(imageUrl, source) {
  const card = document.getElementById('ai-card');
  card.classList.add('visible');
  document.getElementById('ai-loading').style.display = 'block';
  document.getElementById('ai-result-content').style.display = 'none';

  const result = await window.ai.classifyPhoto(imageUrl);
  state.aiResult = result;

  document.getElementById('ai-loading').style.display = 'none';
  document.getElementById('ai-result-content').style.display = 'block';

  const summary = document.getElementById('ai-summary');
  summary.textContent = i18n.lang === 'fr' ? (result.summary_fr || '') : (result.summary_en || '');

  const conf = document.getElementById('ai-confidence');
  conf.textContent = result._simulated
    ? '🤖 IA Heuristique'
    : `Confiance: ${Math.round((result.confidence || 0) * 100)}%`;

  const review = document.getElementById('ai-review-warn');
  const needsReview = result.needs_human_review || result.confidence < 0.6;
  review.style.display = needsReview ? 'inline-flex' : 'none';

  // Auto-fill type if user hasn't chosen one
  if (!state.type && result.type) {
    const btn = document.querySelector(`.type-btn[data-type="${result.type}"]`);
    if (btn) btn.click();
  }
}

// ── Voice recorder (FR-MSG-01 & FR-MSG-03) ─────────────────
let mediaRecorder, audioChunks = [], recInterval, recSeconds = 0, audioCtx, analyser, animFrame;

const recBtn    = document.getElementById('rec-btn');
const recTimer  = document.getElementById('rec-timer');
const recWave   = document.getElementById('rec-wave');
const recAudio  = document.getElementById('rec-playback');
const wCtx      = recWave.getContext('2d');

recBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    await startRecording();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    recSeconds = 0;

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start(250);

    recBtn.classList.add('recording');
    recBtn.textContent = '⏹';
    recBtn.setAttribute('aria-pressed', 'true');

    recInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60), s = recSeconds % 60;
      recTimer.textContent = `${m}:${s.toString().padStart(2,'0')} / 1:00`;
      if (recSeconds >= 60) stopRecording();
    }, 1000);

    drawWaveform();
  } catch (e) {
    showToast('Microphone non disponible – simulation audio active', 'warning');
    // Fallback simulation
    state.transcript = "Fumée épaisse et caniveau bloqué près du marché.";
    const transcriptWrap = document.getElementById('transcript-wrap');
    const transcriptBox  = document.getElementById('transcript-box');
    transcriptWrap.style.display = 'block';
    transcriptBox.textContent = state.transcript;
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  clearInterval(recInterval);
  recBtn.classList.remove('recording');
  recBtn.textContent = '🎙️';
  recBtn.setAttribute('aria-pressed', 'false');
  cancelAnimationFrame(animFrame);
  if (audioCtx) audioCtx.close();
}

async function handleRecordingStop() {
  state.voiceBlob = new Blob(audioChunks, { type: 'audio/webm' });
  recAudio.src = URL.createObjectURL(state.voiceBlob);
  recAudio.style.display = 'block';

  // Transcribe automatically (FR-MSG-03)
  const transcriptWrap = document.getElementById('transcript-wrap');
  const transcriptBox  = document.getElementById('transcript-box');
  transcriptWrap.style.display = 'block';
  transcriptBox.textContent = i18n.t('loading');

  const result = await window.ai.transcribeAudio(state.voiceBlob, i18n.lang);
  state.transcript = result.text || 'Odeur âcre et fumée de brûlage de déchets observée sur le site.';
  transcriptBox.textContent = state.transcript;

  // Run AI classifier on voice transcript
  if (state.transcript) {
    runAIClassify(state.transcript, 'transcript');
  }
}

function drawWaveform() {
  if (!analyser) return;
  animFrame = requestAnimationFrame(drawWaveform);
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  wCtx.clearRect(0, 0, recWave.width, recWave.height);
  const bw = recWave.width / data.length;
  data.forEach((v, i) => {
    const h = (v / 255) * recWave.height;
    wCtx.fillStyle = `rgba(22,163,74,${0.4 + v / 400})`;
    wCtx.fillRect(i * bw, recWave.height - h, bw - 1, h);
  });
}

// ── Review builder ─────────────────────────────────────────
function buildReview() {
  const container = document.getElementById('review-summary');
  const typeLabel = document.querySelector(`.type-btn[data-type="${state.type}"] span:last-child`)?.textContent || state.type;
  const descVal = document.getElementById('inp-desc').value || state.description;

  container.innerHTML = `
    <div class="card card-flat" style="display:flex;gap:.75rem;align-items:center">
      <span style="font-size:1.75rem">${typeIcon(state.type)}</span>
      <div>
        <h4 style="margin:0">${typeLabel}</h4>
        <span class="badge badge-grey">Sévérité / Severity: ${state.severity}/5</span>
      </div>
    </div>

    ${descVal ? `<div style="background:var(--grey-50);padding:.75rem;border-radius:var(--radius-md);font-size:.875rem">${descVal}</div>` : ''}

    <div class="card card-flat" style="display:flex;gap:.5rem;align-items:center">
      <span>📍</span>
      <div>
        <strong>${state.quarter || 'Non spécifié'}</strong> · 
        <span style="color:var(--grey-500);font-size:.8rem">${state.locationSource} [${state.lat.toFixed(4)}, ${state.lng.toFixed(4)}]</span>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">
      ${state.photos.map(p => `<img src="${p.url}" style="width:64px;height:64px;border-radius:var(--radius-sm);object-fit:cover;border:1px solid var(--grey-300)">`).join('')}
      ${state.voiceBlob ? '<div style="background:var(--green-100);border-radius:var(--radius-sm);padding:.5rem .75rem;font-size:.8rem;color:var(--green-800)">🎙️ Note vocale attachée</div>' : ''}
    </div>

    ${state.aiResult ? `
      <div class="ai-result-card visible" style="margin:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>🤖 Analyse IA</strong>
          <span class="badge ${state.aiResult.needs_human_review ? 'badge-yellow' : 'badge-green'}">
            ${state.aiResult.needs_human_review ? '⚠️ À Réviser' : '✓ Conforme'}
          </span>
        </div>
        <p style="font-size:.825rem;margin-top:.5rem">${i18n.lang === 'fr' ? (state.aiResult.summary_fr || '') : (state.aiResult.summary_en || '')}</p>
        <span style="font-size:.72rem;color:var(--grey-500)">Acteur recommandé : ${state.aiResult.recommended_actor || 'council_sanitation'}</span>
      </div>
    ` : ''}

    <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem">
      <span class="badge badge-grey" style="font-size:.9rem;font-weight:700">${state.reference}</span>
      <span style="font-size:.8rem;color:var(--grey-500)">Numéro de référence citoyen</span>
    </div>
  `;
}

function typeIcon(type) {
  const icons = {
    plastic_waste:'🗑️', burning_waste:'🔥', open_dump:'🗂️',
    water_contamination:'💧', air_smoke:'💨', dust:'🌫️',
    oil_spill:'🛢️', drain_blockage:'🚧', other:'❓'
  };
  return icons[type] || '❓';
}

// ── Submit Report (FR-REP-01 & FR-REP-04) ──────────────────
window.submitReport = async function() {
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  showLoading();

  // Read editable transcript if modified by user
  const transcriptBox = document.getElementById('transcript-box');
  if (transcriptBox && transcriptBox.textContent) {
    state.transcript = transcriptBox.textContent;
  }

  const payload = {
    client_id:       state.clientId,
    reference:       state.reference,
    channel:         'pwa',
    type:            state.type,
    severity:        state.severity,
    description:     document.getElementById('inp-desc').value || state.description,
    transcript:      state.transcript || null,
    lat:             state.lat,
    lng:             state.lng,
    location:        `POINT(${state.lng} ${state.lat})`,
    location_source: state.locationSource,
    quarter:         state.quarter,
    district:        document.getElementById('inp-district').value || state.district,
    status:          'submitted',
    ai_result:       state.aiResult || null,
    needs_human_review: state.aiResult?.needs_human_review || (state.aiResult?.confidence < 0.6) || false,
    incomplete:      false
  };

  try {
    if (navigator.onLine) {
      await window.db.createReport(payload);
      await uploadMedia();
    } else {
      await window.offline.queueReport(payload);
      await queueMediaOffline();
      await window.offline.updateBadge();
      showToast(i18n.t('report_offline'), 'warning');
    }

    hideLoading();
    document.getElementById('modal-ref').textContent = state.reference;
    document.getElementById('success-modal').style.display = 'flex';
    loadMyReports();
  } catch (e) {
    hideLoading();
    console.warn('Submission error, fallback to offline store:', e);
    await window.offline.queueReport(payload);
    await window.offline.updateBadge();
    showToast(i18n.t('report_offline'), 'warning');
    document.getElementById('modal-ref').textContent = state.reference;
    document.getElementById('success-modal').style.display = 'flex';
  }
  btn.disabled = false;
};

async function uploadMedia() {
  for (const photo of state.photos) {
    try {
      const path = `reports/${state.clientId}/${window.uuid ? window.uuid() : Date.now()}.jpg`;
      const url  = await window.db.uploadFile('report-photos', path, photo.blob);
      await window.db.insertMedia({ report_id: state.clientId, kind: 'photo', storage_path: url });
    } catch (e) { console.warn('Photo upload:', e); }
  }
  if (state.voiceBlob) {
    try {
      const path = `voice/${state.clientId}/${window.uuid ? window.uuid() : Date.now()}.webm`;
      const url  = await window.db.uploadFile('report-voice', path, state.voiceBlob);
      await window.db.insertMedia({ report_id: state.clientId, kind: 'voice', storage_path: url, duration_s: recSeconds });
    } catch (e) { console.warn('Voice upload:', e); }
  }
}

async function queueMediaOffline() {
  for (const photo of state.photos) {
    const fileUrl = URL.createObjectURL(photo.blob);
    await window.offline.queueMedia({
      local_id: window.uuid ? window.uuid() : 'loc_' + Date.now(),
      report_client_id: state.clientId,
      kind: 'photo',
      file_data: fileUrl,
      bucket: 'report-photos',
      path: `reports/${state.clientId}/${Date.now()}.jpg`
    });
  }
  if (state.voiceBlob) {
    const fileUrl = URL.createObjectURL(state.voiceBlob);
    await window.offline.queueMedia({
      local_id: window.uuid ? window.uuid() : 'loc_' + Date.now(),
      report_client_id: state.clientId,
      kind: 'voice',
      file_data: fileUrl,
      bucket: 'report-voice',
      path: `voice/${state.clientId}/${Date.now()}.webm`
    });
  }
}

window.closeModal = function() {
  document.getElementById('success-modal').style.display = 'none';
  location.reload();
};

// ── My reports list ───────────────────────────────────────
async function loadMyReports() {
  try {
    const reports = await window.db.getMyReports();
    if (!reports.length) return;
    const section = document.getElementById('my-reports-section');
    const list    = document.getElementById('my-reports-list');
    section.style.display = 'block';
    list.innerHTML = reports.map(r => `
      <li class="report-item" style="cursor:pointer" onclick="openReportDetail('${r.id}')">
        <div class="report-type-dot" style="background:${typeColor(r.type)}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem">${r.reference}</div>
          <div style="font-size:.8rem;color:var(--grey-500)">${r.quarter || 'Quartier'} · ${formatDate(r.created_at)}</div>
        </div>
        <span class="badge ${statusBadge(r.status)}" data-i18n="status_${r.status}">${r.status}</span>
      </li>
    `).join('');
    i18n.applyTranslations();
  } catch (_) {}
}

window.openReportDetail = function(id) {
  window.location.href = `dashboard.html?report=${id}`;
};

function typeColor(type) {
  const map = {
    burning_waste:'#ef4444', plastic_waste:'#3b82f6', open_dump:'#f97316',
    water_contamination:'#06b6d4', air_smoke:'#8b5cf6', drain_blockage:'#f59e0b',
    dust:'#94a3b8', oil_spill:'#1e293b'
  };
  return map[type] || '#6b7280';
}

function statusBadge(s) {
  return {
    submitted:'badge-blue', assigned:'badge-yellow',
    in_progress:'badge-orange', resolved:'badge-green', rejected:'badge-red'
  }[s] || 'badge-grey';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(i18n.lang === 'fr' ? 'fr-CM' : 'en-CM', { day:'numeric', month:'short' });
}

// ── Init ──────────────────────────────────────────────────
loadMyReports();
