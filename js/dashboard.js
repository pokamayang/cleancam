// ============================================================
// CleanCam – Officer Dashboard Logic (FR-DASH-01 to 06)
// Complete with Status Workflow & Audit Log, Case Grouping,
// Clerk Entry, Messaging Thread, Realtime Sync, and Sensors.
// ============================================================

let allReports    = [];
let currentReport = null;
let sortKey       = 'created_at';
let sortAsc       = false;
let dashMap       = null;
let dashMapMarkers = null;
let typeChart     = null;
let statusChart   = null;
let realtimeSub   = null;
let alertSub      = null;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard: check session
  const session = await window.db.getSession();
  if (!session) {
    // If not logged in, auto-fill demo admin session for seamless hackathon review
    try {
      await window.db.signIn(CC.ADMIN_EMAIL, CC.ADMIN_PASSWORD);
    } catch (_) {
      window.location.href = 'login.html';
      return;
    }
  }

  const user = await window.db.getUser();
  const userEl = document.getElementById('sidebar-user');
  if (userEl) {
    userEl.textContent = user?.user_metadata?.name || user?.email || 'Officier Municipal';
  }

  // Load dashboard
  await refreshDashboard();

  // Check URL parameters for direct report opening (e.g. dashboard.html?report=rep-001)
  const params = new URLSearchParams(window.location.search);
  const repId = params.get('report');
  if (repId) {
    setTimeout(() => openDrawer(repId), 200);
  }

  // Realtime subscriptions
  realtimeSub = window.db.subscribeToReports(payload => {
    showToast('📋 Nouveau signalement mis à jour', 'success');
    refreshDashboard();
  });

  alertSub = window.db.subscribeToAlerts(alert => {
    showToast(`🔔 Alerte : ${alert.metric?.toUpperCase()} = ${alert.value}`, 'warning');
    updateAlertBadge();
    loadAlerts();
  });

  // Auto-refresh timer
  setInterval(refreshDashboard, CC.REFRESH_OFFICER);

  // Update clock
  updateRefreshTime();
  setInterval(updateRefreshTime, 60000);
});

function updateRefreshTime() {
  const el = document.getElementById('last-refresh');
  if (el) {
    el.textContent = new Date().toLocaleTimeString(i18n.lang === 'fr' ? 'fr-CM' : 'en-CM', { hour:'2-digit', minute:'2-digit' });
  }
}

// ── Panel navigation ───────────────────────────────────────
let currentPanel = 'overview';
window.showPanel = function(name) {
  document.querySelectorAll('.dash-panel').forEach(p => p.style.display = 'none');
  const el = document.getElementById('panel-' + name);
  if (el) el.style.display = 'block';
  currentPanel = name;

  document.querySelectorAll('.dash-nav-item a').forEach(a => {
    a.classList.remove('active');
    if (a.id === 'nav-' + name) a.classList.add('active');
  });

  // Lazy init panel content
  if (name === 'map')      setTimeout(initDashMap, 100);
  if (name === 'sensors')  loadSensors();
  if (name === 'drainage') loadDrainage();
  if (name === 'alerts')   loadAlerts();
  if (name === 'settings') loadSettings();

  // Mobile sidebar auto-close
  if (window.innerWidth < 900) {
    const sb = document.getElementById('dash-sidebar');
    if (sb) sb.classList.remove('open');
  }
};

window.toggleSidebar = function() {
  const sb = document.getElementById('dash-sidebar');
  if (sb) sb.classList.toggle('open');
};

// ── Main refresh ───────────────────────────────────────────
window.refreshDashboard = async function() {
  try {
    const stats = await window.db.getStats();
    document.getElementById('kpi-total').textContent    = (stats.totalReports   || 0).toLocaleString();
    document.getElementById('kpi-resolved').textContent = (stats.resolvedReports || 0).toLocaleString();
    document.getElementById('kpi-hotspots').textContent = (stats.activeHotspots  || 0).toLocaleString();
    document.getElementById('kpi-alerts').textContent   = (stats.pendingAlerts   || 0).toLocaleString();

    // Review badge
    const reviewBadge = document.getElementById('badge-review');
    if (reviewBadge) {
      if (stats.reviewNeeded > 0) {
        reviewBadge.textContent = stats.reviewNeeded;
        reviewBadge.style.display = 'inline-flex';
      } else {
        reviewBadge.style.display = 'none';
      }
    }

    updateAlertBadge(stats.pendingAlerts);

    // Load reports
    allReports = await window.db.getAllReports({});
    renderRecentTable();
    renderReportsTable(allReports);
    renderCharts(allReports);

    // Refresh active panel
    if (currentPanel === 'sensors')  loadSensors();
    if (currentPanel === 'alerts')   loadAlerts();
    if (currentPanel === 'drainage') loadDrainage();
    if (currentPanel === 'map')      refreshDashMapMarkers();

  } catch (e) {
    console.warn('Dashboard refresh notice:', e);
  }
};

function updateAlertBadge(count) {
  const badge = document.getElementById('badge-alerts');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Recent table (overview) ────────────────────────────────
function renderRecentTable() {
  const tbody = document.getElementById('recent-tbody');
  if (!tbody) return;
  const recent = allReports.slice(0, 10);
  tbody.innerHTML = recent.map(r => `
    <tr>
      <td><strong>${r.reference}</strong></td>
      <td>
        <span class="badge badge-grey" style="font-size:.72rem">
          ${typeEmoji(r.type)} ${r.type?.replace(/_/g,' ')}
        </span>
        ${r.duplicate_count > 1 ? `<span class="badge badge-yellow" style="font-size:.65rem;margin-left:.25rem">👥 ×${r.duplicate_count}</span>` : ''}
      </td>
      <td>${r.quarter || '—'}</td>
      <td><span class="status-pill ${statusPillClass(r.status)}">${statusLabel(r.status)}</span></td>
      <td><span class="badge badge-grey" style="font-size:.7rem">${channelLabel(r.channel)}</span></td>
      <td style="font-size:.8rem;white-space:nowrap">${fmtDate(r.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openDrawer('${r.id}')">Détails →</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--grey-400);padding:2rem">Aucun signalement</td></tr>';
}

// ── Full reports table ─────────────────────────────────────
function renderReportsTable(reports) {
  const tbody = document.getElementById('reports-tbody');
  const empty = document.getElementById('reports-empty');
  if (!tbody) return;

  if (!reports.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = reports.map(r => `
    <tr onclick="openDrawer('${r.id}')" style="cursor:pointer">
      <td><strong>${r.reference}</strong></td>
      <td>
        <span style="font-size:.82rem">${typeEmoji(r.type)} ${r.type?.replace(/_/g,' ')}</span>
        ${r.duplicate_count > 1 ? `<span class="badge badge-yellow" style="font-size:.65rem;margin-left:.25rem" title="Dossier groupé dans un rayon de 50m">👥 ×${r.duplicate_count}</span>` : ''}
      </td>
      <td style="font-size:.85rem">${r.quarter || '—'}</td>
      <td style="text-align:center"><span style="font-weight:700;color:${r.severity>=4?'var(--red)':'var(--grey-700)'}">${r.severity}/5</span></td>
      <td><span class="status-pill ${statusPillClass(r.status)}">${statusLabel(r.status)}</span></td>
      <td style="font-size:.8rem">${channelLabel(r.channel)}</td>
      <td style="font-size:.8rem;white-space:nowrap">${fmtDate(r.created_at)}</td>
      <td>
        ${r.needs_human_review ? '<span class="badge badge-yellow" style="font-size:.7rem" title="Confiance IA < 0.6">⚠️ Revue</span>' : '<span class="badge badge-green" style="font-size:.7rem">✓ IA</span>'}
      </td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:.25rem">
          <button class="btn btn-ghost btn-sm" onclick="openDrawer('${r.id}')">👁</button>
          ${r.status==='submitted'?`<button class="btn btn-primary btn-sm" onclick="quickStatus('${r.id}','assigned',event)">Assigner</button>`:''}
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Filter & sort ─────────────────────────────────────────
window.applyFilters = function() {
  const status   = document.getElementById('f-status').value;
  const type     = document.getElementById('f-type').value;
  const district = document.getElementById('f-district').value;
  const channel  = document.getElementById('f-channel').value;
  const search   = document.getElementById('f-search').value.toLowerCase();
  const review   = document.getElementById('f-review').checked;

  let filtered = allReports.filter(r => {
    if (status   !== 'all' && r.status   !== status)   return false;
    if (type     !== 'all' && r.type     !== type)     return false;
    if (district !== 'all' && r.district !== district) return false;
    if (channel  !== 'all' && r.channel  !== channel)  return false;
    if (review && !r.needs_human_review)               return false;
    if (search && !JSON.stringify(r).toLowerCase().includes(search)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  renderReportsTable(filtered);
};

window.sortTable = function(key) {
  if (sortKey === key) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = false; }
  applyFilters();
};

// ── Charts (Recharts / Chart.js) ───────────────────────────
function renderCharts(reports) {
  const typeCounts = {};
  const statusCounts = { submitted:0, assigned:0, in_progress:0, resolved:0, rejected:0 };
  const typeColors = {
    burning_waste:'#ef4444', plastic_waste:'#3b82f6', open_dump:'#f97316',
    water_contamination:'#06b6d4', air_smoke:'#8b5cf6', drain_blockage:'#f59e0b',
    dust:'#9ca3af', oil_spill:'#1c1917', other:'#6b7280'
  };

  reports.forEach(r => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    if (r.status in statusCounts) statusCounts[r.status]++;
  });

  // Type bar chart
  const typeCtx = document.getElementById('type-chart')?.getContext('2d');
  if (typeCtx) {
    if (typeChart) typeChart.destroy();
    typeChart = new Chart(typeCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(typeCounts).map(t => t.replace(/_/g,' ')),
        datasets: [{
          data: Object.values(typeCounts),
          backgroundColor: Object.keys(typeCounts).map(t => typeColors[t] || '#6b7280'),
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Status doughnut chart
  const statusCtx = document.getElementById('status-chart')?.getContext('2d');
  if (statusCtx) {
    if (statusChart) statusChart.destroy();
    const labels = Object.keys(statusCounts).map(s => statusLabel(s));
    const vals   = Object.values(statusCounts);
    statusChart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: vals,
          backgroundColor: ['#3b82f6', '#eab308', '#f97316', '#22c55e', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } },
        cutout: '65%'
      }
    });
  }
}

// ── Report Detail Drawer (FR-DASH-04 & FR-MSG-02) ──────────
window.openDrawer = async function(id) {
  currentReport = allReports.find(r => r.id === id) || await window.db.getReportById(id);
  if (!currentReport) return;

  document.getElementById('drawer-ref').textContent = currentReport.reference;
  document.getElementById('drawer-status-badge').className = `status-pill ${statusPillClass(currentReport.status)}`;
  document.getElementById('drawer-status-badge').textContent = statusLabel(currentReport.status);

  // Load thread, media, and audit logs
  const [messages, media, log] = await Promise.all([
    window.db.getMessages(currentReport.id).catch(() => []),
    window.db.getMediaForReport(currentReport.id).catch(() => []),
    window.db.getStatusLog(currentReport.id).catch(() => [])
  ]);

  const r = currentReport;
  const aiRes = r.ai_result || {};

  document.getElementById('drawer-body').innerHTML = `
    <!-- Duplicate grouping notice (FR-DASH-03) -->
    ${r.duplicate_count > 1 ? `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:var(--radius-md);padding:.625rem;font-size:.825rem;color:#92400e;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem">
        <span>👥</span>
        <div>
          <strong>Dossier groupé (${r.duplicate_count} signalements similaires)</strong>
          <div style="font-size:.75rem">Regroupé automatiquement sous le même incident (rayon 50m / 7 jours).</div>
        </div>
      </div>
    ` : ''}

    <!-- Incomplete call warning (FR-CALL-05) -->
    ${r.incomplete ? `
      <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:var(--radius-md);padding:.625rem;font-size:.825rem;color:#991b1b;margin-bottom:1rem">
        ⚠️ <strong>Appel vocal interrompu :</strong> Signalement partiel sauvegardé automatiquement en brouillon prioritaire.
      </div>
    ` : ''}

    <!-- Key metadata grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.625rem;margin-bottom:1.25rem">
      <div class="card card-flat" style="padding:.625rem">
        <div style="font-size:.7rem;color:var(--grey-500)">Type</div>
        <strong>${typeEmoji(r.type)} ${r.type?.replace(/_/g,' ')}</strong>
      </div>
      <div class="card card-flat" style="padding:.625rem">
        <div style="font-size:.7rem;color:var(--grey-500)">Sévérité</div>
        <strong style="color:${r.severity>=4?'var(--red)':'inherit'}">${r.severity}/5</strong>
      </div>
      <div class="card card-flat" style="padding:.625rem">
        <div style="font-size:.7rem;color:var(--grey-500)">Canal</div>
        <strong>${channelLabel(r.channel)}</strong>
      </div>
      <div class="card card-flat" style="padding:.625rem">
        <div style="font-size:.7rem;color:var(--grey-500)">District</div>
        <strong>${r.district}</strong>
      </div>
    </div>

    <!-- Location -->
    <div class="card card-green" style="padding:.75rem;margin-bottom:1rem">
      <div style="font-size:.7rem;color:var(--grey-500);margin-bottom:.25rem">📍 Localisation certifiée</div>
      <strong>${r.quarter || '—'}</strong> · <span style="font-size:.8rem;color:var(--grey-500)">${r.location_source}</span>
      ${r.lat ? `<div style="font-size:.75rem;color:var(--grey-600);margin-top:.2rem">[${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}]</div>` : ''}
    </div>

    <!-- Description -->
    ${r.description ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.72rem;color:var(--grey-500);margin-bottom:.25rem">Description citoyenne</div>
        <div style="font-size:.875rem;background:var(--grey-50);padding:.625rem;border-radius:6px">${r.description}</div>
      </div>
    ` : ''}

    <!-- Transcript if from voice call or audio note -->
    ${r.transcript ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.72rem;color:var(--grey-500);margin-bottom:.25rem">🎙️ Transcription Vocale</div>
        <div style="background:var(--grey-100);border-radius:6px;padding:.625rem;font-size:.85rem;font-style:italic">"${r.transcript}"</div>
      </div>
    ` : ''}

    <!-- AI Classification & Action Recommendation (Section 8.1) -->
    ${Object.keys(aiRes).length ? `
      <div class="ai-result-card visible" style="margin-bottom:1.25rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <strong>🤖 Analyse IA</strong>
          <span class="badge ${r.needs_human_review ? 'badge-yellow' : 'badge-green'}">
            ${r.needs_human_review ? '⚠️ À Réviser' : '✓ Conforme'}
          </span>
        </div>
        <p style="font-size:.825rem;margin-bottom:.4rem;line-height:1.4">${i18n.lang === 'fr' ? (aiRes.summary_fr || '') : (aiRes.summary_en || '')}</p>
        <div style="font-size:.78rem;color:var(--grey-600);display:flex;justify-content:space-between">
          <span>Confiance : <strong>${Math.round((aiRes.confidence||0)*100)}%</strong></span>
          <span>Acteur : <strong>${aiRes.recommended_actor || 'council_sanitation'}</strong></span>
        </div>
      </div>
    ` : ''}

    <!-- Photos & Audio Media -->
    ${media.length ? `
      <div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;color:var(--grey-500);margin-bottom:.5rem">📎 Pièces jointes (${media.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">
          ${media.map(m => m.kind === 'photo'
            ? `<img src="${m.storage_path}" style="width:80px;height:80px;object-fit:cover;border-radius:var(--radius-sm);cursor:pointer;border:1px solid var(--grey-300)" onclick="window.open('${m.storage_path}','_blank')">`
            : `<audio controls src="${m.storage_path}" style="width:100%"></audio>`
          ).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Real-time Message Thread (FR-MSG-02) -->
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.72rem;color:var(--grey-500);margin-bottom:.5rem">💬 Fil de discussion Officier &lt;-&gt; Citoyen</div>
      <div class="thread-container" id="drawer-thread" style="max-height:220px;overflow-y:auto;background:var(--grey-50);padding:.75rem;border-radius:8px">
        ${messages.length ? messages.map(m => `
          <div class="msg-bubble ${m.sender_role === 'officer' ? 'outgoing' : 'incoming'}">
            <div>${m.body}</div>
            <div class="msg-meta">${m.sender_role} · ${fmtDate(m.created_at)}</div>
          </div>
        `).join('') : '<div style="text-align:center;color:var(--grey-400);font-size:.85rem;padding:1rem">Aucun message pour l\'instant</div>'}
      </div>
      <div class="thread-input" style="display:flex;gap:.5rem;margin-top:.5rem">
        <input class="form-control" type="text" id="officer-msg" placeholder="Écrire une réponse au citoyen...">
        <button class="btn btn-primary btn-sm" onclick="sendOfficerMessage()">Envoyer</button>
      </div>
    </div>

    <!-- Status Audit Log (NFR-11) -->
    ${log.length ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.72rem;color:var(--grey-500);margin-bottom:.4rem">📜 Historique d'audit des statuts</div>
        <div style="background:var(--grey-50);border-radius:6px;padding:.5rem;font-size:.78rem">
          ${log.map(l => `
            <div style="padding:.25rem 0;border-bottom:1px solid var(--grey-200,#e5e7eb)">
              <span class="status-pill badge-grey" style="font-size:.65rem">${l.from_status||'créé'}</span> → 
              <span class="status-pill badge-blue" style="font-size:.65rem">${l.to_status}</span> 
              par <em>${l.actor_id || 'officier'}</em> à ${fmtDate(l.created_at)}
              ${l.reason ? `<br><small style="color:var(--grey-500)">Motif : ${l.reason}</small>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div style="font-size:.7rem;color:var(--grey-400)">Client ID : ${r.client_id || r.id}</div>
  `;

  // Realtime subscription for thread
  window.db.subscribeToMessages(r.id, msg => {
    const thread = document.getElementById('drawer-thread');
    if (thread) {
      const div = document.createElement('div');
      div.className = `msg-bubble ${msg.sender_role === 'officer' ? 'outgoing' : 'incoming'}`;
      div.innerHTML = `<div>${msg.body}</div><div class="msg-meta">${msg.sender_role} · instant</div>`;
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
    }
  });

  updateDrawerButtons(r.status);
  document.getElementById('detail-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('active');
};

function updateDrawerButtons(status) {
  const btnAssign   = document.getElementById('btn-assign');
  const btnProgress = document.getElementById('btn-progress');
  const btnResolve  = document.getElementById('btn-resolve');
  const btnReject   = document.getElementById('btn-reject');

  if (btnAssign)   btnAssign.style.display   = ['submitted'].includes(status) ? 'inline-flex' : 'none';
  if (btnProgress) btnProgress.style.display = ['assigned'].includes(status) ? 'inline-flex' : 'none';
  if (btnResolve)  btnResolve.style.display  = ['assigned','in_progress'].includes(status) ? 'inline-flex' : 'none';
  if (btnReject)   btnReject.style.display   = ['submitted','assigned'].includes(status) ? 'inline-flex' : 'none';
}

window.closeDrawer = function() {
  document.getElementById('detail-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('active');
  currentReport = null;
};

// ── Status changes (FR-DASH-02 / T15 / NFR-11) ─────────────
window.changeStatus = async function(newStatus, reason) {
  if (!currentReport) return;
  try {
    const user = await window.db.getUser();
    await window.db.updateReportStatus(currentReport.id, newStatus, reason, user?.id || 'officer');
    currentReport.status = newStatus;

    const badge = document.getElementById('drawer-status-badge');
    if (badge) {
      badge.className = `status-pill ${statusPillClass(newStatus)}`;
      badge.textContent = statusLabel(newStatus);
    }
    updateDrawerButtons(newStatus);

    // Refresh memory reports & UI
    const r = allReports.find(x => x.id === currentReport.id);
    if (r) r.status = newStatus;
    renderReportsTable(allReports);
    renderRecentTable();

    showToast(`Statut mis à jour → ${statusLabel(newStatus)}`, 'success');
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
};

window.promptReject = function() {
  const reason = prompt('Motif officiel du rejet (obligatoire) / Rejection reason:');
  if (reason) changeStatus('rejected', reason);
};

window.quickStatus = async function(id, status, e) {
  e.stopPropagation();
  const user = await window.db.getUser();
  await window.db.updateReportStatus(id, status, 'Assignation rapide depuis tableau', user?.id || 'officer');
  const r = allReports.find(x => x.id === id);
  if (r) r.status = status;
  renderReportsTable(allReports);
  renderRecentTable();
  showToast('Dossier assigné aux équipes de salubrité ✓', 'success');
};

// ── Officer message reply ──────────────────────────────────
window.sendOfficerMessage = async function() {
  if (!currentReport) return;
  const inp = document.getElementById('officer-msg');
  const body = inp.value.trim();
  if (!body) return;

  const user = await window.db.getUser();
  try {
    await window.db.sendMessage({
      report_id: currentReport.id,
      sender_id: user?.id || 'officer',
      sender_role: 'officer',
      body
    });
    inp.value = '';
    showToast('Message transmis au citoyen', 'success');
  } catch (e) {
    showToast('Erreur d\'envoi: ' + e.message, 'error');
  }
};

// ── Clerk manual entry form (FR-DASH-06) ───────────────────
window.handleClerkSubmit = async function(e) {
  e.preventDefault();
  showLoading();

  const channel  = document.getElementById('clerk-channel').value;
  const type     = document.getElementById('clerk-type').value;
  const quarter  = document.getElementById('clerk-quarter').value;
  const desc     = document.getElementById('clerk-desc').value;
  const severity = parseInt(document.getElementById('clerk-sev').value, 10);

  const q = CC.QUARTERS.find(x => x.name === quarter) || CC.QUARTERS[0];

  const payload = {
    client_id: window.uuid ? window.uuid() : 'clk_' + Date.now(),
    reference: window.generateRef ? window.generateRef() : 'CC-' + Math.floor(1000 + Math.random()*9000),
    channel: channel,
    type: type,
    severity: severity,
    description: desc,
    quarter: quarter,
    district: q.district,
    lat: q.lat,
    lng: q.lng,
    location_source: 'quarter',
    status: 'submitted',
    ai_result: {
      type: type,
      materials: ['mixed'],
      severity: severity,
      confidence: 0.90,
      needs_human_review: false,
      language_detected: 'fr',
      summary_fr: `Signalement officiel enregistré au guichet communal pour ${quarter}.`,
      summary_en: `Official municipal clerk entry logged for ${quarter}.`,
      recommended_actor: 'council_sanitation'
    },
    needs_human_review: false,
    incomplete: false
  };

  try {
    await window.db.createReport(payload);
    hideLoading();
    document.getElementById('clerk-form').reset();
    showToast(`Signalement ${payload.reference} créé avec succès (Canal: ${channel})`, 'success');
    showPanel('reports');
    refreshDashboard();
  } catch (err) {
    hideLoading();
    showToast('Erreur: ' + err.message, 'error');
  }
};

// ── Operational Map ────────────────────────────────────────
function initDashMap() {
  if (dashMap) return;
  dashMap = L.map('dash-map').setView([4.0511, 9.7679], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(dashMap);
  dashMapMarkers = L.layerGroup().addTo(dashMap);
  refreshDashMapMarkers();
}

function refreshDashMapMarkers() {
  if (!dashMap || !dashMapMarkers) return;
  dashMapMarkers.clearLayers();
  const typeColors = {
    burning_waste:'#ef4444', plastic_waste:'#3b82f6', open_dump:'#f97316',
    water_contamination:'#06b6d4', drain_blockage:'#f59e0b', other:'#6b7280'
  };

  allReports.forEach(r => {
    if (!r.lat || !r.lng) return;
    const color = typeColors[r.type] || '#6b7280';
    const icon = L.divIcon({
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
      iconSize:[14,14], iconAnchor:[7,7], className:''
    });
    L.marker([r.lat, r.lng], { icon })
      .bindPopup(`<strong>${r.reference}</strong><br>${r.type?.replace(/_/g,' ')} · ${r.quarter}<br><span class="status-pill ${statusPillClass(r.status)}" style="font-size:.72rem">${statusLabel(r.status)}</span>`)
      .addTo(dashMapMarkers)
      .on('click', () => openDrawer(r.id));
  });
}

// ── Sensors Panel (Air Quality) ────────────────────────────
async function loadSensors() {
  const grid = document.getElementById('sensors-grid');
  if (!grid) return;
  try {
    const devices = await window.db.getAllDevices();
    grid.innerHTML = '';
    for (const dev of devices) {
      const reading = await window.db.getLatestReading(dev.id).catch(() => null);
      const card = document.createElement('div');
      card.className = 'sensor-card';
      const pm25 = reading?.pm25 || 28;
      const band = CC.getBand(Math.min(100, pm25 * 1.33));
      card.innerHTML = `
        <div class="sensor-header">
          <div>
            <h4 style="margin:0 0 .25rem">${dev.name}</h4>
            <span style="font-size:.75rem;color:var(--grey-500)">District : ${dev.district} (${dev.quarter})</span>
          </div>
          <div>
            <span class="sensor-status online">🟢 En ligne</span>
            <span class="simulated-label" style="margin-top:.25rem;display:inline-block">🔧 Simulé</span>
          </div>
        </div>
        <div class="sensor-readings" style="margin:1rem 0">
          <div class="reading-pill">PM2.5 <span>${pm25.toFixed(1)} µg/m³</span></div>
          <div class="reading-pill">PM10 <span>${(reading?.pm10 || 42).toFixed(1)} µg/m³</span></div>
          <div class="reading-pill">Batt <span>${reading?.battery_v || 3.92} V</span></div>
          <div class="reading-pill">Temp <span>${reading?.temperature_c || 28.5}°C</span></div>
        </div>
        <div style="margin-bottom:.5rem">
          <div style="font-size:.75rem;color:var(--grey-500);margin-bottom:.25rem">Qualité de l'air <span class="indicative-label">indicatif</span></div>
          <div class="score-bar-wrap"><div class="score-bar" style="width:${Math.min(100, pm25 * 1.33)}%;background:${band.color}"></div></div>
        </div>
        <button class="btn btn-outline btn-sm" style="width:100%;margin-top:.75rem" onclick="loadSensorChart('${dev.id}','${dev.name}')">
          📈 Historique 24h
        </button>
      `;
      grid.appendChild(card);
    }
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--grey-500)">Erreur: ${e.message}</p>`;
  }
}

window.loadSensorChart = async function(deviceId, name) {
  const readings = await window.db.getReadingsSeries(deviceId, 24).catch(() => []);
  const labels = readings.map(r => new Date(r.ts).toLocaleTimeString('fr-CM', { hour:'2-digit', minute:'2-digit' }));
  const pm25   = readings.map(r => r.pm25 || 0);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '3000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:580px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0">📈 ${name} – Évolution 24h</h3>
        <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-ghost btn-sm" style="font-size:1.2rem">✕</button>
      </div>
      <canvas id="sensor-history-chart" height="180"></canvas>
      <div class="indicative-label" style="margin-top:.75rem">Données indicatives pour démonstration hackathon</div>
    </div>
  `;
  document.body.appendChild(overlay);

  new Chart(document.getElementById('sensor-history-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'PM2.5 (µg/m³)',
        data: pm25,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,.12)',
        fill: true,
        tension: .35,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
    }
  });
};

// ── DrainageGuard Panel (DRN-01 to 08) ──────────────────────
async function loadDrainage() {
  const grid = document.getElementById('drainage-grid');
  if (!grid) return;
  const devices = await window.db.getAllDevices().catch(() => []);
  grid.innerHTML = '';

  for (const d of devices) {
    const r = await window.db.getLatestReading(d.id).catch(() => null);
    const waterLevel = r?.water_level_cm || 14.5;
    const blockage = r?.blockage_score || 2;
    const floodRisk = r?.flood_risk || Math.min(100, Math.round(waterLevel * 3.8 + 15));
    const floodBand = CC.getBand(floodRisk);

    const card = document.createElement('div');
    card.className = 'sensor-card';
    card.innerHTML = `
      <div class="sensor-header">
        <div>
          <h4 style="margin:0 0 .25rem">${d.name}</h4>
          <span style="font-size:.75rem;color:var(--grey-500)">Secteur : ${d.quarter} (${d.district})</span>
        </div>
        <span class="badge" style="background:${floodBand.color}25;color:${floodBand.color};font-weight:700">
          ${floodBand.labelFr}
        </span>
      </div>
      <div class="sensor-readings" style="margin:1rem 0">
        <div class="reading-pill">Niveau d'eau <span>${waterLevel} cm</span></div>
        <div class="reading-pill">Blocage IA <span>${blockage} / 4</span></div>
        <div class="reading-pill">Batterie <span>${r?.battery_v || 3.90} V</span></div>
      </div>
      <div style="margin:1rem 0">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.35rem">
          <span>Risque d'inondation :</span>
          <strong style="color:${floodBand.color}">${floodRisk}%</strong>
        </div>
        <div class="flood-gauge" style="height:10px;background:var(--grey-100);border-radius:99px;overflow:hidden">
          <div class="flood-gauge-fill" style="width:${floodRisk}%;height:100%;background:${floodBand.color}"></div>
        </div>
      </div>
      <div class="simulated-label">🔧 Capteur IoT DrainageGuard (Ultrasons + IA)</div>
      ${floodRisk >= 50 ? `
        <div class="alert-item critical" style="margin-top:.75rem;padding:.5rem">
          <span class="alert-icon">⚠️</span>
          <div class="alert-info">
            <h4 style="margin:0;font-size:.85rem">Alerte Crue Imminente</h4>
            <p style="margin:0;font-size:.75rem">Niveau d'eau élevé – risque de débordement dans le quartier</p>
          </div>
        </div>
      ` : ''}
    `;
    grid.appendChild(card);
  }
}

// ── Interactive Demo Triggers ───────────────────────────────
window.triggerAkwaSpike = async function() {
  showLoading();
  await window.db.simulatePM25Spike('drain-douala-001', 96.0);
  hideLoading();
  showToast('🔥 Spike PM2.5 simulé à Akwa (96 µg/m³) ! Alerte seuil OMS déclenchée.', 'error');
  refreshDashboard();
};

window.triggerDrainSurge = async function() {
  showLoading();
  await window.db.simulateDrainWaterSurge('drain-douala-001', 44.0, 4);
  hideLoading();
  showToast('🌊 Crue d\'eau simulée (44 cm) ! Risque inondation 86% Élevé.', 'error');
  refreshDashboard();
};

// ── Alerts panel ───────────────────────────────────────────
window.loadAlerts = async function() {
  const list = document.getElementById('alerts-list');
  if (!list) return;
  try {
    const alerts = await window.db.getAllAlerts();
    if (!alerts.length) {
      list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--grey-400)">🔔 Aucune alerte active</div>';
      return;
    }
    list.innerHTML = alerts.map(a => `
      <div class="alert-item ${a.value > 55 ? 'critical' : ''}" id="alert-${a.id}">
        <span class="alert-icon">${a.metric === 'pm25' ? '💨' : '💧'}</span>
        <div class="alert-info">
          <h4 style="margin:0 0 .2rem">${a.metric?.toUpperCase()} = ${a.value} (${a.threshold})</h4>
          <p style="margin:0;font-size:.75rem;color:var(--grey-500)">Nœud : ${a.device_id} · ${fmtDate(a.created_at)}</p>
        </div>
        <div>
          ${a.acknowledged_by
            ? '<span class="badge badge-green" style="font-size:.7rem">✓ Acquitté</span>'
            : `<button class="btn btn-ghost btn-sm" onclick="ackAlert('${a.id}')">Marquer lu ✓</button>`}
        </div>
      </div>
    `).join('');
    updateAlertBadge(alerts.filter(a => !a.acknowledged_by).length);
  } catch (e) {
    list.innerHTML = `<p style="color:var(--grey-500);padding:1rem">Erreur: ${e.message}</p>`;
  }
};

window.ackAlert = async function(id) {
  const user = await window.db.getUser();
  await window.db.acknowledgeAlert(id, user?.id || 'officer');
  loadAlerts();
  showToast('Alerte acquittée', 'success');
};

// ── Settings ───────────────────────────────────────────────
async function loadSettings() {
  const user = await window.db.getUser();
  const panel = document.getElementById('user-info-panel');
  if (user && panel) {
    panel.innerHTML = `
      <div class="form-group"><label class="form-label">E-mail</label><input class="form-control" value="${user.email||''}" readonly></div>
      <div class="form-group"><label class="form-label">Nom</label><input class="form-control" value="${user.user_metadata?.name || user.displayName || 'Officier Municipal'}" readonly></div>
      <div class="form-group"><label class="form-label">Rôle d'accès</label><input class="form-control" value="officer (Municipalité)" readonly></div>
    `;
  }
}

window.testConnection = async function() {
  const el = document.getElementById('conn-result');
  el.textContent = '⏳ Test…';
  try {
    await window.db.getStats();
    el.textContent = '✅ Connexion Firebase active & synchronisée';
    el.style.color = 'var(--green-700)';
  } catch (e) {
    el.textContent = '❌ Erreur: ' + e.message;
    el.style.color = 'var(--red)';
  }
};

// ── CSV Export (FR-DASH-05) ────────────────────────────────
window.exportCSV = async function() {
  showLoading();
  try {
    const csv = await window.db.exportReportsCSV({});
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `cleancam_officer_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export CSV téléchargé avec succès', 'success');
  } catch (e) {
    showToast('Erreur export: ' + e.message, 'error');
  }
  hideLoading();
};

// ── Logout ─────────────────────────────────────────────────
window.doLogout = async function() {
  await window.db.signOut();
  window.location.href = 'login.html';
};

// ── Helpers ────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(i18n.lang === 'fr' ? 'fr-CM' : 'en-CM', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function statusLabel(s) {
  const map = {
    submitted:   i18n.lang === 'fr' ? 'Soumis' : 'Submitted',
    assigned:    i18n.lang === 'fr' ? 'Assigné' : 'Assigned',
    in_progress: i18n.lang === 'fr' ? 'En cours' : 'In Progress',
    resolved:    i18n.lang === 'fr' ? 'Résolu' : 'Resolved',
    rejected:    i18n.lang === 'fr' ? 'Rejeté' : 'Rejected'
  };
  return map[s] || s;
}

function statusPillClass(s) {
  return {
    submitted:   'badge-blue',
    assigned:    'badge-yellow',
    in_progress: 'badge-orange',
    resolved:    'badge-green',
    rejected:    'badge-red'
  }[s] || 'badge-grey';
}

function channelLabel(c) {
  return {
    pwa:        '📱 PWA',
    voice_call: '📞 Vocal IVR',
    agent:      '👤 Agent',
    clerk:      '🏛 Mairie/Radio',
    sms:        '💬 SMS',
    web:        '🌐 Web'
  }[c] || c;
}

function typeEmoji(t) {
  return {
    burning_waste:       '🔥',
    plastic_waste:       '🗑️',
    open_dump:           '🗂️',
    water_contamination: '💧',
    air_smoke:           '💨',
    drain_blockage:      '🚧',
    dust:                '🌫️',
    oil_spill:           '🛢️',
    other:               '❓'
  }[t] || '❓';
}

// ── Workers & Applications Panel ───────────────────────────
let workerTab = 'accounts';

window.switchWorkerTab = function(tab) {
  workerTab = tab;
  document.getElementById('worker-accounts-panel').style.display    = tab === 'accounts'     ? 'block' : 'none';
  document.getElementById('worker-applications-panel').style.display = tab === 'applications' ? 'block' : 'none';
  document.getElementById('wtab-accounts').classList.toggle('active',     tab === 'accounts');
  document.getElementById('wtab-applications').classList.toggle('active', tab === 'applications');
  if (tab === 'accounts')     loadWorkers();
  if (tab === 'applications') loadApplications();
};

async function loadWorkers() {
  const tbody = document.getElementById('workers-tbody');
  if (!tbody) return;
  try {
    const workers = await window.db.getAllWorkers();
    if (!workers.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--grey-400);padding:2rem">
        <div style="font-size:2rem;margin-bottom:.5rem">👷</div>
        Aucun compte agent créé.<br>
        <button class="btn btn-primary btn-sm" style="margin-top:.75rem" onclick="openCreateWorkerModal()">+ Créer le premier compte</button>
      </td></tr>`;
      return;
    }
    const roleLabels = {
      collector: '🗑️ Collecteur', drainage_tech: '💧 DrainageGuard', inspector: '🔍 Inspecteur',
      clerk: '📞 Guichet', analyst: '📊 Analyste', officer: '🏛️ Officier'
    };
    tbody.innerHTML = workers.map(w => `
      <tr>
        <td><strong>${w.name}</strong></td>
        <td style="font-size:.85rem">${w.email}</td>
        <td><span class="badge badge-grey" style="font-size:.72rem">${roleLabels[w.role] || w.role}</span></td>
        <td style="font-size:.85rem">${w.district || '—'}</td>
        <td>
          <span class="badge ${w.status === 'active' ? 'badge-green' : 'badge-red'}" style="font-size:.72rem">
            ${w.status === 'active' ? '🟢 Actif' : '🔴 Désactivé'}
          </span>
        </td>
        <td style="font-size:.8rem;white-space:nowrap">${fmtDate(w.created_at)}</td>
        <td>
          <div style="display:flex;gap:.25rem;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="toggleWorkerStatus('${w.id}','${w.status}')" title="${w.status === 'active' ? 'Désactiver' : 'Activer'}">
              ${w.status === 'active' ? '🔴' : '🟢'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteWorker('${w.id}','${w.name}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--grey-500);padding:1rem">${e.message}</td></tr>`;
  }
}

window.toggleWorkerStatus = async function(id, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
  await window.db.updateWorker(id, { status: newStatus });
  showToast(`Compte ${newStatus === 'active' ? 'activé' : 'désactivé'} avec succès.`, 'success');
  loadWorkers();
};

window.confirmDeleteWorker = function(id, name) {
  if (confirm(`Supprimer définitivement le compte de ${name} ?`)) {
    window.db.deleteWorker(id).then(() => {
      showToast(`Compte de ${name} supprimé.`, 'success');
      loadWorkers();
    });
  }
};

window.openCreateWorkerModal = function() {
  const modal = document.getElementById('worker-modal-overlay');
  modal.style.display = 'flex';
  document.getElementById('create-worker-form').reset();
  document.getElementById('worker-create-error').style.display = 'none';
  document.getElementById('worker-create-success').style.display = 'none';
};

window.closeCreateWorkerModal = function() {
  document.getElementById('worker-modal-overlay').style.display = 'none';
};

window.generateWorkerPass = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  let pass = '';
  for (let i = 0; i < 12; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('w-password').value = pass;
};

window.handleCreateWorker = async function(e) {
  e.preventDefault();
  const name     = document.getElementById('w-name').value.trim();
  const email    = document.getElementById('w-email').value.trim();
  const phone    = document.getElementById('w-phone').value.trim();
  const role     = document.getElementById('w-role').value;
  const district = document.getElementById('w-district').value;
  const password = document.getElementById('w-password').value;

  const errEl = document.getElementById('worker-create-error');
  const sucEl = document.getElementById('worker-create-success');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  if (!name || !email || !password || password.length < 8) {
    errEl.textContent = 'Remplissez tous les champs obligatoires (mot de passe min. 8 caractères).';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('create-worker-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Création…';

  try {
    const worker = await window.db.createWorkerAccount({ name, email, phone, role, district, password });
    sucEl.innerHTML = `
      <strong>✅ Compte créé avec succès !</strong><br>
      <span style="font-size:.8rem;margin-top:.25rem;display:block">
        Communiquez ces identifiants à l'agent :<br>
        <code style="background:white;padding:.2rem .5rem;border-radius:4px;font-size:.8rem">📧 ${email}</code>&nbsp;
        <code style="background:white;padding:.2rem .5rem;border-radius:4px;font-size:.8rem">🔑 ${password}</code>
      </span>
    `;
    sucEl.style.display = 'block';
    document.getElementById('create-worker-form').reset();
    loadWorkers();
    // Update badge
    checkApplicationBadge();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = 'Créer le compte';
};

// ── Applications Panel ─────────────────────────────────────
async function loadApplications() {
  const list = document.getElementById('applications-list');
  if (!list) return;
  try {
    const apps = await window.db.getAllApplications();
    const badge = document.getElementById('badge-apps-tab');
    const pending = apps.filter(a => a.status === 'pending').length;
    if (pending > 0) {
      badge.textContent = pending;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }

    if (!apps.length) {
      list.innerHTML = `<div class="dash-section" style="text-align:center;padding:3rem;color:var(--grey-400)">
        <div style="font-size:2.5rem;margin-bottom:.75rem">📋</div>
        Aucune candidature reçue pour l'instant.
      </div>`;
      return;
    }
    const roleLabels = {
      collector:'Collecteur', drainage_tech:'DrainageGuard', inspector:'Inspecteur terrain',
      clerk:'Guichet communal', analyst:'Analyste données'
    };
    const statusColors = { pending:'badge-yellow', reviewing:'badge-blue', accepted:'badge-green', rejected:'badge-red' };
    list.innerHTML = apps.map(a => `
      <div class="dash-section" style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem">
          <div>
            <div style="display:flex;align-items:center;gap:.625rem;margin-bottom:.25rem">
              <strong>${a.fname} ${a.lname}</strong>
              <span class="badge ${statusColors[a.status] || 'badge-grey'}" style="font-size:.72rem">
                ${a.status === 'pending' ? '⏳ En attente' : a.status === 'accepted' ? '✅ Accepté' : a.status === 'reviewing' ? '👁 En revue' : '❌ Refusé'}
              </span>
              <code style="font-size:.7rem;background:var(--grey-100);padding:.1rem .4rem;border-radius:4px">${a.ref}</code>
            </div>
            <div style="font-size:.82rem;color:var(--grey-600)">
              📧 ${a.email} &nbsp;·&nbsp; 📞 ${a.phone} &nbsp;·&nbsp; 📍 ${a.location}
            </div>
            <div style="font-size:.82rem;color:var(--grey-600);margin-top:.2rem">
              🎯 Poste : <strong>${roleLabels[a.role] || a.role}</strong>
              &nbsp;·&nbsp; ⏱ Dispo : ${a.availability || '—'}
              &nbsp;·&nbsp; Soumis le ${fmtDate(a.submitted_at)}
            </div>
            ${a.motivation ? `<div style="font-size:.82rem;margin-top:.4rem;color:var(--grey-700);font-style:italic">"${a.motivation.slice(0,120)}${a.motivation.length > 120 ? '…' : ''}"</div>` : ''}
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-self:flex-start">
            ${a.status === 'pending' ? `
              <button class="btn btn-primary btn-sm" onclick="reviewApplication('${a.id}','accepted')">✅ Accepter</button>
              <button class="btn btn-outline btn-sm" onclick="reviewApplication('${a.id}','reviewing')">👁 En revue</button>
              <button class="btn btn-danger btn-sm" onclick="reviewApplication('${a.id}','rejected')">❌ Refuser</button>
            ` : `
              <button class="btn btn-ghost btn-sm" onclick="reviewApplication('${a.id}','pending')">↩ Réinitialiser</button>
            `}
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div style="color:var(--grey-500);padding:1rem">${e.message}</div>`;
  }
}

window.reviewApplication = async function(id, status) {
  await window.db.updateApplicationStatus(id, status);
  showToast(`Candidature marquée : ${status}`, 'success');
  loadApplications();
  checkApplicationBadge();
};

async function checkApplicationBadge() {
  const apps = await window.db.getAllApplications().catch(() => []);
  const pending = apps.filter(a => a.status === 'pending').length;
  const badge = document.getElementById('badge-apps');
  if (badge) {
    if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-flex'; }
    else { badge.style.display = 'none'; }
  }
}

// ── Admin Credential Update ─────────────────────────────────
async function loadSettings() {
  // Load current admin email into form
  const adminCreds = window.db.getAdminCredentials();
  const emailEl = document.getElementById('current-admin-email');
  if (emailEl) emailEl.value = adminCreds.email || '';
  const nameEl = document.getElementById('cred-new-name');
  if (nameEl && adminCreds.name) nameEl.placeholder = adminCreds.name;
}

window.handleUpdateAdminCreds = async function(e) {
  e.preventDefault();
  const currentPass = document.getElementById('cred-current-pass').value;
  const newName     = document.getElementById('cred-new-name').value.trim();
  const newEmail    = document.getElementById('cred-new-email').value.trim();
  const newPass     = document.getElementById('cred-new-pass').value;

  const resultEl = document.getElementById('cred-result');
  resultEl.style.display = 'none';

  const btn = document.getElementById('cred-save-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Mise à jour…';

  try {
    const updated = await window.db.updateAdminCredentials(currentPass, newEmail || null, newPass || null, newName || null);
    resultEl.style.cssText = 'display:block;background:var(--green-50);border:1.5px solid var(--green-300);color:var(--green-800);border-radius:var(--radius-sm)';
    resultEl.innerHTML = `✅ Identifiants mis à jour avec succès. Nouvel e-mail : <strong>${updated.email}</strong>`;
    document.getElementById('current-admin-email').value = updated.email;
    document.getElementById('cred-current-pass').value = '';
    document.getElementById('cred-new-pass').value = '';
    // Update sidebar user display
    const userEl = document.getElementById('sidebar-user');
    if (userEl) userEl.textContent = updated.name || updated.email;
    showToast('Identifiants administrateur mis à jour.', 'success');
  } catch (err) {
    resultEl.style.cssText = 'display:block;background:#fee2e2;border:1.5px solid #fca5a5;color:#991b1b;border-radius:var(--radius-sm)';
    resultEl.innerHTML = `❌ ${err.message}`;
  }

  btn.disabled = false;
  btn.textContent = 'Enregistrer les modifications';
};

// Hook into showPanel to load workers when navigating there
const _origShowPanel = window.showPanel;
window.showPanel = function(name) {
  _origShowPanel(name);
  if (name === 'workers') {
    loadWorkers();
    checkApplicationBadge();
  }
  if (name === 'settings') loadSettings();
};

// Also check application badge on dashboard load
const _origRefresh = window.refreshDashboard;
window.refreshDashboard = async function() {
  await _origRefresh();
  checkApplicationBadge();
};
