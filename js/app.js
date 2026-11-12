// ============================================================
// CleanCam – Main Application Entry Point
// Runs on every page; handles navbar, i18n, auth state,
// scroll animations, 3D card tilt, toast, and counters.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {

  // ── Apply translations ──────────────────────────────────
  if (window.i18n) i18n.applyTranslations();

  // ── Navbar scroll effect ────────────────────────────────
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    });
  }

  // ── Hamburger menu ──────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
    });
  }

  // ── Language toggle ─────────────────────────────────────
  window.toggleLang = () => {
    if (window.i18n) {
      const next = i18n.lang === 'fr' ? 'en' : 'fr';
      i18n.setLang(next);
      const btn = document.getElementById('lang-btn');
      if (btn) btn.innerHTML = `🌍 <span data-i18n="lang_toggle">${next === 'fr' ? 'English' : 'Français'}</span>`;
    }
  };

  // ── Auth state display ───────────────────────────────────
  try {
    const session = await window.db.getSession();
    const loginEl  = document.getElementById('nav-auth-login');
    const logoutEl = document.getElementById('nav-auth-logout');
    if (session) {
      if (loginEl)  loginEl.style.display  = 'none';
      if (logoutEl) logoutEl.style.display = 'list-item';
    }
  } catch (_) {}

  window.handleLogout = async () => {
    await window.db.signOut();
    const isPages = window.location.pathname.includes('/pages/');
    window.location.href = isPages ? '../index.html' : 'index.html';
  };

  // ── Load stats counters ──────────────────────────────────
  if (document.getElementById('stat-reports')) {
    try {
      const stats = await window.db.getStats();
      animateCounter('stat-reports',  stats.totalReports   || 0);
      animateCounter('stat-resolved', stats.resolvedReports || 0);
      animateCounter('stat-hotspots', stats.activeHotspots  || 0);
      animateCounter('stat-sensors',  stats.sensorsOnline   || 0);
    } catch (_) {
      animateCounter('stat-reports',  12);
      animateCounter('stat-resolved', 4);
      animateCounter('stat-hotspots', 5);
      animateCounter('stat-sensors',  3);
    }
  }

  // ── Scroll reveal (3D perspective transitions) ───────────
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObs.observe(el));

  // ── 3D tilt cards ────────────────────────────────────────
  document.querySelectorAll('.tilt-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width  - 0.5;
      const y = (e.clientY - rect.top)  / rect.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateZ(10px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // ── Hero 3D canvas (fallback if Three.js not present) ────
  const canvas = document.getElementById('hero-canvas');
  if (canvas && typeof THREE === 'undefined') {
    initHeroCanvas2DFallback(canvas);
  }

  // ── Offline badge ────────────────────────────────────────
  if (window.offline) {
    window.offline.updateBadge();
    window.offline.syncQueue();
  }
});

// ── Counter animation ──────────────────────────────────────
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0;
  const dur = 1400;
  const step = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(ease * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Toast helper ───────────────────────────────────────────
window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
};

// ── Loading overlay ────────────────────────────────────────
window.showLoading = () => {
  const el = document.getElementById('loading');
  if (el) el.classList.add('active');
};
window.hideLoading = () => {
  const el = document.getElementById('loading');
  if (el) el.classList.remove('active');
};

// ── Reference code generator (CC-XXXX) ─────────────────────
window.generateRef = () => {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `CC-${n}`;
};

// ── Nearest quarter lookup (FR-PLOC-03) ─────────────────────
window.nearestQuarter = (lat, lng) => {
  if (!window.CC || !CC.QUARTERS) return null;
  let best = null, bestDist = Infinity;
  for (const q of CC.QUARTERS) {
    const d = Math.hypot(q.lat - lat, q.lng - lng);
    if (d < bestDist) { bestDist = d; best = q; }
  }
  return best;
};

// ── EXIF GPS reader (FR-REP-03 / T2) ───────────────────────
window.readExifGPS = (file) => new Promise(resolve => {
  if (!file || !file.type.includes('jpeg')) return resolve(null);
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const view = new DataView(e.target.result);
      if (view.getUint16(0) !== 0xFFD8) return resolve(null);
      let offset = 2;
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset);
        if (marker === 0xFFE1) { // APP1 EXIF
          const exifData = e.target.result.slice(offset + 10);
          const gps = extractGPS(exifData);
          return resolve(gps);
        }
        offset += 2 + view.getUint16(offset + 2);
      }
      resolve(null);
    } catch (_) { resolve(null); }
  };
  reader.readAsArrayBuffer(file.slice(0, 65536));
});

function extractGPS(buffer) {
  try {
    const view   = new DataView(buffer);
    const isLE   = view.getUint16(0) === 0x4949;
    const read16 = o => isLE ? view.getUint16(o, true) : view.getUint16(o, false);
    const read32 = o => isLE ? view.getUint32(o, true) : view.getUint32(o, false);

    const ifdOffset = read32(4);
    const entryCount = read16(ifdOffset);

    let gpsIFDOffset = null;
    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (read16(entryOffset) === 0x8825) {
        gpsIFDOffset = read32(entryOffset + 8);
        break;
      }
    }
    if (gpsIFDOffset === null) return null;

    const gpsEntryCount = read16(gpsIFDOffset);
    const gpsData = {};
    for (let i = 0; i < gpsEntryCount; i++) {
      const e = gpsIFDOffset + 2 + i * 12;
      const tag = read16(e);
      const type = read16(e + 2);
      const offset = read32(e + 8);
      if ([1,2,3,4].includes(tag)) {
        if (type === 2) {
          gpsData[tag] = String.fromCharCode(view.getUint8(e + 8));
        } else if (type === 5) {
          const nums = [];
          for (let r = 0; r < 3; r++) {
            const num = read32(offset + r * 8);
            const den = read32(offset + r * 8 + 4);
            nums.push(den ? num / den : 0);
          }
          gpsData[tag] = nums;
        }
      }
    }
    if (!gpsData[2] || !gpsData[4]) return null;
    const lat = gpsData[2][0] + gpsData[2][1] / 60 + gpsData[2][2] / 3600;
    const lng = gpsData[4][0] + gpsData[4][1] / 60 + gpsData[4][2] / 3600;
    return {
      lat: gpsData[1] === 'S' ? -lat : lat,
      lng: gpsData[3] === 'W' ? -lng : lng
    };
  } catch (_) { return null; }
}

// ── Image compression (FR-REP-02 & NFR-04 < 500KB) ────────
window.compressImage = (file, maxPx = 1280, quality = 0.72) =>
  new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxPx) {
        const scale = maxPx / Math.max(w, h);
        w = Math.round(w * scale); h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        resolve(blob || file);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });

// ── 2D Canvas Fallback ────────────────────────────────────
function initHeroCanvas2DFallback(canvas) {
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.offsetWidth;
  let h = canvas.height = canvas.offsetHeight;
  window.addEventListener('resize', () => {
    w = canvas.width = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
  });
  let angle = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);
    angle += 0.005;
    const cx = w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(22,163,74,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    requestAnimationFrame(draw);
  }
  draw();
}

// ── UUID generator ─────────────────────────────────────────
window.uuid = () => crypto.randomUUID ? crypto.randomUUID() :
  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
