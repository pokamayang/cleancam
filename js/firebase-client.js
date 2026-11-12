// ============================================================
// CleanCam – Firebase Client & Universal Data Layer
// Supports Firestore, Firebase Auth, Firebase Storage with
// resilient local synchronization and initial seed data.
// ============================================================

(function() {
  let _auth = null;
  let _firestore = null;
  let _storage = null;
  let _currentUser = null;

  // Local mirror storage keys
  const LS_REPORTS = 'cc_reports_v2';
  const LS_MEDIA = 'cc_media_v2';
  const LS_MESSAGES = 'cc_messages_v2';
  const LS_LOGS = 'cc_status_logs_v2';
  const LS_DEVICES = 'cc_devices_v2';
  const LS_READINGS = 'cc_readings_v2';
  const LS_HOTSPOTS = 'cc_hotspots_v2';
  const LS_ALERTS = 'cc_alerts_v2';
  const LS_SESSION = 'cc_auth_session_v2';

  // Seed Data Generation for Cameroon (SRS Section 11)
  function generateSeedData() {
    const devices = [
      {
        id: 'drain-douala-001',
        name: 'Akwa Drainage & Air Node #1',
        kind: 'drain_and_air',
        district: 'douala',
        quarter: 'Akwa',
        lat: 4.0511,
        lng: 9.7679,
        status: 'online',
        last_seen: new Date().toISOString(),
        simulated: true
      },
      {
        id: 'drain-douala-002',
        name: 'Bonanjo Waterway & Port Canal #2',
        kind: 'drain',
        district: 'douala',
        quarter: 'Bonanjo',
        lat: 4.0481,
        lng: 9.6965,
        status: 'online',
        last_seen: new Date().toISOString(),
        simulated: true
      },
      {
        id: 'drain-yaounde-001',
        name: 'Mokolo Market Culvert & Air Node #3',
        kind: 'drain_and_air',
        district: 'yaounde',
        quarter: 'Mokolo',
        lat: 3.8724,
        lng: 11.5143,
        status: 'online',
        last_seen: new Date().toISOString(),
        simulated: true
      }
    ];

    const readings = [];
    const now = Date.now();
    devices.forEach(dev => {
      // 24 hours of hourly history
      for (let h = 24; h >= 0; h--) {
        const ts = new Date(now - h * 3600000).toISOString();
        const isAkwa = dev.id === 'drain-douala-001';
        const isMokolo = dev.id === 'drain-yaounde-001';
        
        const basePM = isAkwa ? (h < 4 ? 68 : 45) : isMokolo ? 48 : 26;
        const pm25 = Math.max(12, Math.round(basePM + Math.sin(h / 3) * 14 + (Math.random() * 8 - 4)));
        const pm10 = Math.round(pm25 * 1.5 + Math.random() * 8);
        const waterLevel = isAkwa ? Math.round((14 + Math.sin(h / 4) * 5 + (h === 0 ? 8 : 0)) * 10) / 10 : 9.5;
        const floodRisk = Math.min(100, Math.round(waterLevel * 3.8 + (isAkwa ? 20 : 5)));
        
        readings.push({
          id: 'read_' + dev.id + '_' + h,
          device_id: dev.id,
          ts,
          pm25,
          pm10,
          water_level_cm: waterLevel,
          water_present: true,
          battery_v: 3.92,
          temperature_c: 28.5,
          flood_risk: floodRisk,
          blockage_score: isAkwa ? 2 : 1,
          simulated: true
        });
      }
    });

    const hotspots = [
      // Douala cells (Akwa demo cell has high burning & PM2.5)
      {
        cell_id: 'douala_120_340',
        district: 'douala',
        quarter: 'Akwa',
        lat: 4.0511,
        lng: 9.7679,
        score: 82,
        band: 'critical',
        is_estimated: false,
        reports_7d: 9,
        pm25_avg: 58.2,
        traffic_vph: 1400,
        top_types: ['burning_waste', 'plastic_waste'],
        drivers_en: 'Severe PM2.5 spike (58 µg/m³), 9 waste burning reports, and dense junction traffic (1,400 vph).',
        drivers_fr: 'Pic sévère de PM2.5 (58 µg/m³), 9 signalements de brûlage et fort trafic de carrefour (1 400 véh/h).'
      },
      {
        cell_id: 'douala_121_341',
        district: 'douala',
        quarter: 'Bonanjo',
        lat: 4.0481,
        lng: 9.6965,
        score: 46,
        band: 'moderate',
        is_estimated: false,
        reports_7d: 5,
        pm25_avg: 28.4,
        traffic_vph: 980,
        top_types: ['plastic_waste', 'drain_blockage'],
        drivers_en: 'Plastic litter in gutters and moderate drainage obstruction.',
        drivers_fr: 'Déchets plastiques dans les caniveaux et obstruction modérée des drains.'
      },
      {
        cell_id: 'douala_122_342',
        district: 'douala',
        quarter: 'Deido',
        lat: 4.0771,
        lng: 9.7417,
        score: 64,
        band: 'high',
        is_estimated: false,
        reports_7d: 7,
        pm25_avg: 41.5,
        traffic_vph: 1850,
        top_types: ['open_dump', 'air_smoke'],
        drivers_en: 'Open waste dump near residential zone and heavy roundabout traffic.',
        drivers_fr: 'Décharge sauvage proche d\'habitations et circulation intense au rond-point.'
      },
      {
        cell_id: 'douala_123_343',
        district: 'douala',
        quarter: 'New Bell',
        lat: 4.0384,
        lng: 9.7147,
        score: 36,
        band: 'moderate',
        is_estimated: false,
        reports_7d: 3,
        pm25_avg: 22.0,
        traffic_vph: 800,
        top_types: ['plastic_waste'],
        drivers_en: 'Localized plastic debris and moderate particulate readings.',
        drivers_fr: 'Débris plastiques localisés et relevés particulaires modérés.'
      },
      {
        cell_id: 'douala_124_344',
        district: 'douala',
        quarter: 'Bonamoussadi',
        lat: 4.0921,
        lng: 9.7641,
        score: 28,
        band: 'moderate',
        is_estimated: true,
        reports_7d: 1,
        pm25_avg: 18.5,
        traffic_vph: 600,
        top_types: ['plastic_waste'],
        drivers_en: 'Estimated cell – interpolated via inverse-distance weighting from nearby 5 measured cells.',
        drivers_fr: 'Cellule estimée – interpolée par pondération inverse de la distance depuis les 5 cellules voisines.'
      },
      {
        cell_id: 'douala_125_345',
        district: 'douala',
        quarter: 'Bonabéri',
        lat: 4.0576,
        lng: 9.6852,
        score: 52,
        band: 'high',
        is_estimated: false,
        reports_7d: 6,
        pm25_avg: 35.8,
        traffic_vph: 1200,
        top_types: ['water_contamination', 'drain_blockage'],
        drivers_en: 'Industrial runoff concerns and clogged drainage channels.',
        drivers_fr: 'Signalements d\'écoulements industriels et caniveaux d\'évacuation obstrués.'
      },
      // Yaoundé cells
      {
        cell_id: 'yaounde_080_210',
        district: 'yaounde',
        quarter: 'Mokolo',
        lat: 3.8724,
        lng: 11.5143,
        score: 72,
        band: 'high',
        is_estimated: false,
        reports_7d: 8,
        pm25_avg: 45.6,
        traffic_vph: 1600,
        top_types: ['dust', 'open_dump'],
        drivers_en: 'Market refuse heap, heavy dust from unpaved lanes, and dense market traffic.',
        drivers_fr: 'Amas d\'ordures du marché, forte poussière de pistes et afflux de véhicules.'
      },
      {
        cell_id: 'yaounde_081_211',
        district: 'yaounde',
        quarter: 'Briqueterie',
        lat: 3.8841,
        lng: 11.5172,
        score: 23,
        band: 'low',
        is_estimated: true,
        reports_7d: 0,
        pm25_avg: 15.0,
        traffic_vph: 450,
        top_types: [],
        drivers_en: 'Estimated cell (no local sensor) – derived through 5-point inverse-distance weighting.',
        drivers_fr: 'Cellule estimée (sans capteur local) – calculée par pondération inverse 5 points.'
      },
      {
        cell_id: 'yaounde_082_212',
        district: 'yaounde',
        quarter: 'Mvog-Ada',
        lat: 3.8541,
        lng: 11.5101,
        score: 45,
        band: 'moderate',
        is_estimated: false,
        reports_7d: 4,
        pm25_avg: 27.2,
        traffic_vph: 850,
        top_types: ['plastic_waste', 'water_contamination'],
        drivers_en: 'Household waste dumping and stagnant water pools.',
        drivers_fr: 'Dépôts de déchets ménagers et poches d\'eaux stagnantes.'
      },
      {
        cell_id: 'yaounde_083_213',
        district: 'yaounde',
        quarter: 'Nlongkak',
        lat: 3.8781,
        lng: 11.5054,
        score: 58,
        band: 'high',
        is_estimated: false,
        reports_7d: 6,
        pm25_avg: 38.0,
        traffic_vph: 1500,
        top_types: ['burning_waste', 'dust'],
        drivers_en: 'Evening waste incineration and intersection vehicle emissions.',
        drivers_fr: 'Incinération nocturne de déchets et émissions automobiles de carrefour.'
      }
    ];

    const reports = [
      {
        id: 'rep-001',
        client_id: 'c1111111-1111-4111-8111-111111111111',
        reference: 'CC-4821',
        channel: 'pwa',
        type: 'burning_waste',
        severity: 4,
        description: 'Smoke from burning tyres and mixed plastic behind the market every evening.',
        transcript: 'Heavy toxic smoke every evening near the market stores.',
        lat: 4.0511,
        lng: 9.7679,
        location_source: 'pin',
        quarter: 'Akwa',
        district: 'douala',
        status: 'in_progress',
        ai_result: {
          type: 'burning_waste',
          materials: ['plastic', 'mixed'],
          severity: 4,
          confidence: 0.88,
          needs_human_review: false,
          language_detected: 'en',
          summary_en: 'Active combustion of tyre rubber and plastics generating toxic black smoke.',
          summary_fr: 'Combustion active de pneus et de plastiques dégageant une fumée noire toxique.',
          recommended_actor: 'council_sanitation'
        },
        needs_human_review: false,
        incomplete: false,
        created_at: new Date(now - 12 * 3600000).toISOString()
      },
      {
        id: 'rep-002',
        client_id: 'c2222222-2222-4222-8222-222222222222',
        reference: 'CC-3140',
        channel: 'voice_call',
        type: 'drain_blockage',
        severity: 5,
        description: 'Le caniveau principal est complètement bloqué par des bouteilles en plastique et des débris après la pluie.',
        transcript: 'Le caniveau principal est complètement bloqué par des bouteilles en plastique et des débris après la pluie.',
        lat: 4.0453,
        lng: 9.7312,
        location_source: 'quarter',
        quarter: 'Banya-Sable',
        district: 'douala',
        status: 'assigned',
        ai_result: {
          type: 'drain_blockage',
          materials: ['plastic', 'mixed'],
          severity: 5,
          confidence: 0.92,
          needs_human_review: false,
          language_detected: 'fr',
          summary_en: 'Severe drain obstruction posing immediate flash-flood danger to nearby houses.',
          summary_fr: 'Obstruction sévère du caniveau posant un risque immédiat d\'inondation éclair des habitations.',
          recommended_actor: 'council_sanitation'
        },
        needs_human_review: false,
        caller_phone: '+237670123456',
        incomplete: false,
        created_at: new Date(now - 8 * 3600000).toISOString()
      },
      {
        id: 'rep-003',
        client_id: 'c3333333-3333-4333-8333-333333333333',
        reference: 'CC-1092',
        channel: 'clerk',
        type: 'open_dump',
        severity: 3,
        description: 'Dépôt sauvage d\'ordures ménagères débordant sur la chaussée.',
        lat: 3.8724,
        lng: 11.5143,
        location_source: 'pin',
        quarter: 'Mokolo',
        district: 'yaounde',
        status: 'submitted',
        ai_result: {
          type: 'open_dump',
          materials: ['organic', 'plastic', 'mixed'],
          severity: 3,
          confidence: 0.79,
          needs_human_review: false,
          language_detected: 'fr',
          summary_en: 'Accumulated commercial and household dump obstructing pedestrian lane.',
          summary_fr: 'Décharge sauvage d\'ordures ménagères et commerciales encombrant la voie piétonne.',
          recommended_actor: 'collector'
        },
        needs_human_review: false,
        incomplete: false,
        created_at: new Date(now - 22 * 3600000).toISOString()
      },
      {
        id: 'rep-004',
        client_id: 'c4444444-4444-4444-8444-444444444444',
        reference: 'CC-8820',
        channel: 'pwa',
        type: 'water_contamination',
        severity: 4,
        description: 'Huiles de vidange déversées dans la rivière par un garage mécanique.',
        lat: 4.0576,
        lng: 9.6852,
        location_source: 'exif',
        quarter: 'Bonabéri',
        district: 'douala',
        status: 'resolved',
        ai_result: {
          type: 'oil_spill',
          materials: ['unknown'],
          severity: 4,
          confidence: 0.85,
          needs_human_review: false,
          language_detected: 'fr',
          summary_en: 'Hydrocarbon contamination in local watercourse requiring environmental inspection.',
          summary_fr: 'Contamination par hydrocarbures dans le cours d\'eau local nécessitant inspection environnementale.',
          recommended_actor: 'environment_ministry'
        },
        needs_human_review: false,
        incomplete: false,
        created_at: new Date(now - 48 * 3600000).toISOString()
      },
      {
        id: 'rep-005',
        client_id: 'c5555555-5555-4555-8555-555555555555',
        reference: 'CC-9201',
        channel: 'agent',
        type: 'plastic_waste',
        severity: 2,
        description: 'Large cluster of empty plastic sachets and bottles near the school gate.',
        lat: 3.8541,
        lng: 11.5101,
        location_source: 'gps',
        quarter: 'Mvog-Ada',
        district: 'yaounde',
        status: 'submitted',
        ai_result: {
          type: 'plastic_waste',
          materials: ['plastic'],
          severity: 2,
          confidence: 0.54,
          needs_human_review: true,
          language_detected: 'en',
          summary_en: 'Low confidence plastic classification, flag for review.',
          summary_fr: 'Classification plastique à faible certitude, vérification humaine requise.',
          recommended_actor: 'collector'
        },
        needs_human_review: true,
        incomplete: false,
        created_at: new Date(now - 4 * 3600000).toISOString()
      }
    ];

    const alerts = [
      {
        id: 'alt-001',
        device_id: 'drain-douala-001',
        metric: 'pm25',
        value: 58.2,
        threshold: '35 µg/m³ (WHO Alert)',
        acknowledged_by: null,
        created_at: new Date(now - 30 * 60000).toISOString()
      },
      {
        id: 'alt-002',
        device_id: 'drain-douala-001',
        metric: 'flood_risk',
        value: 78,
        threshold: 'Risk > 70% (High)',
        acknowledged_by: null,
        created_at: new Date(now - 15 * 60000).toISOString()
      }
    ];

    const messages = [
      {
        id: 'msg-001',
        report_id: 'rep-001',
        sender_role: 'citizen',
        body: 'The smoke started again at 18:00 today. Please send an inspection.',
        created_at: new Date(now - 6 * 3600000).toISOString()
      },
      {
        id: 'msg-002',
        report_id: 'rep-001',
        sender_role: 'officer',
        body: 'Sanitation squad #4 has been dispatched to Akwa marketplace.',
        created_at: new Date(now - 4 * 3600000).toISOString()
      }
    ];

    const statusLogs = [
      {
        id: 'log-001',
        report_id: 'rep-001',
        from_status: 'submitted',
        to_status: 'in_progress',
        actor_id: 'officer-demo',
        reason: 'Squad dispatched to Akwa',
        created_at: new Date(now - 5 * 3600000).toISOString()
      },
      {
        id: 'log-002',
        report_id: 'rep-004',
        from_status: 'in_progress',
        to_status: 'resolved',
        actor_id: 'officer-demo',
        reason: 'Waste removed and channel cleared',
        created_at: new Date(now - 20 * 3600000).toISOString()
      }
    ];

    return { devices, readings, hotspots, reports, alerts, messages, statusLogs };
  }

  // ── Local Storage Helper ────────────────────────────────────
  function loadLocal(key, defaultVal) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : defaultVal;
    } catch (_) { return defaultVal; }
  }
  function saveLocal(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  // Initialize seed data if not present
  function ensureSeedData() {
    let reports = loadLocal(LS_REPORTS, null);
    if (!reports || reports.length === 0) {
      const seed = generateSeedData();
      saveLocal(LS_DEVICES, seed.devices);
      saveLocal(LS_READINGS, seed.readings);
      saveLocal(LS_HOTSPOTS, seed.hotspots);
      saveLocal(LS_REPORTS, seed.reports);
      saveLocal(LS_ALERTS, seed.alerts);
      saveLocal(LS_MESSAGES, seed.messages);
      saveLocal(LS_LOGS, seed.statusLogs);
    }
  }

  ensureSeedData();

  // ── Firebase Init ───────────────────────────────────────────
  function initFirebase() {
    if (typeof firebase !== 'undefined' && window.CC && CC.FIREBASE_CONFIG) {
      try {
        if (!firebase.apps || !firebase.apps.length) {
          firebase.initializeApp(CC.FIREBASE_CONFIG);
        }
        _auth = firebase.auth();
        _firestore = firebase.firestore();
        _storage = firebase.storage();

        // Listen for auth state
        _auth.onAuthStateChanged(u => {
          _currentUser = u;
          if (u) {
            saveLocal(LS_SESSION, {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName || 'Admin Officer'
            });
          } else {
            // Keep demo session if logged in as demo admin
            const s = loadLocal(LS_SESSION, null);
            if (s && s.isDemoAdmin) {
              // preserve demo session
            } else {
              localStorage.removeItem(LS_SESSION);
            }
          }
        });
      } catch (err) {
        console.warn('Firebase init notice:', err.message);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
  } else {
    initFirebase();
  }

  // ── Event Emitters for Realtime Subscriptions ───────────────
  const reportListeners = new Set();
  const alertListeners  = new Set();
  const messageListeners = new Map(); // reportId -> Set

  function notifyReportChange(action, report) {
    reportListeners.forEach(cb => {
      try { cb({ event: action, new: report, old: report }); } catch (_) {}
    });
  }

  function notifyAlertChange(alert) {
    alertListeners.forEach(cb => {
      try { cb(alert); } catch (_) {}
    });
  }

  function notifyMessage(reportId, msg) {
    const set = messageListeners.get(reportId);
    if (set) {
      set.forEach(cb => {
        try { cb(msg); } catch (_) {}
      });
    }
  }

  // ── Core DB API Implementation ──────────────────────────────

  // Auth methods
  async function signIn(email, password) {
    // 1. Try Firebase Auth if available
    if (_auth) {
      try {
        const cred = await _auth.signInWithEmailAndPassword(email, password);
        _currentUser = cred.user;
        saveLocal(LS_SESSION, {
          uid: _currentUser.uid,
          email: _currentUser.email,
          displayName: _currentUser.displayName || 'Council Officer'
        });
        return { user: _currentUser, session: { user: _currentUser } };
      } catch (err) {
        console.warn('Firebase auth attempt failed, checking admin fallback:', err.message);
      }
    }

    // 2. Fallback: Demo credentials (CleanCam2026! / admin@cleancam.cm)
    if (email === CC.ADMIN_EMAIL && password === CC.ADMIN_PASSWORD) {
      const demoUser = {
        uid: 'officer-demo-uuid',
        email: CC.ADMIN_EMAIL,
        user_metadata: { name: 'Council Officer (Douala / Yaoundé)' },
        role: 'officer'
      };
      saveLocal(LS_SESSION, { ...demoUser, isDemoAdmin: true });
      return { user: demoUser, session: { user: demoUser } };
    }

    throw new Error('Identifiants incorrects / Invalid credentials');
  }

  async function signUp(email, password, meta = {}) {
    if (_auth) {
      try {
        const cred = await _auth.createUserWithEmailAndPassword(email, password);
        _currentUser = cred.user;
        if (meta.name) {
          await _currentUser.updateProfile({ displayName: meta.name });
        }
        return { user: _currentUser };
      } catch (err) {
        console.warn('Firebase signup:', err.message);
      }
    }
    const user = { uid: 'u_' + Date.now(), email, user_metadata: meta };
    saveLocal(LS_SESSION, user);
    return { user };
  }

  async function signOut() {
    if (_auth) {
      try { await _auth.signOut(); } catch (_) {}
    }
    _currentUser = null;
    localStorage.removeItem(LS_SESSION);
  }

  async function getSession() {
    if (_currentUser) return { user: _currentUser };
    const s = loadLocal(LS_SESSION, null);
    if (s) {
      return { user: { id: s.uid, uid: s.uid, email: s.email, user_metadata: { name: s.displayName || s.email } } };
    }
    return null;
  }

  async function getUser() {
    const s = await getSession();
    return s?.user || null;
  }

  // ── Reports API ─────────────────────────────────────────────
  async function createReport(payload) {
    if (!payload.reference) payload.reference = window.generateRef ? window.generateRef() : 'CC-' + Math.floor(1000 + Math.random()*9000);
    if (!payload.id) payload.id = payload.client_id || 'rep_' + Date.now();
    if (!payload.status) payload.status = 'submitted';
    if (!payload.created_at) payload.created_at = new Date().toISOString();

    // 1. Save in Firestore if available
    if (_firestore) {
      try {
        await _firestore.collection('reports').doc(payload.id).set(payload, { merge: true });
      } catch (err) {
        console.warn('Firestore write notice (using mirrored storage):', err.message);
      }
    }

    // 2. Save in Local Mirror (Idempotent by client_id)
    const list = loadLocal(LS_REPORTS, []);
    const idx = list.findIndex(r => r.client_id === payload.client_id || r.id === payload.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...payload };
    } else {
      list.unshift(payload);
    }
    saveLocal(LS_REPORTS, list);

    // Check duplicate grouping (FR-DASH-03: within 50m and 7 days)
    groupDuplicates(payload, list);

    notifyReportChange('INSERT', payload);
    return payload;
  }

  function groupDuplicates(target, list) {
    const targetTime = new Date(target.created_at).getTime();
    const duplicates = list.filter(r => {
      if (r.id === target.id) return false;
      if (r.type !== target.type) return false;
      const t = new Date(r.created_at).getTime();
      const dayDiff = Math.abs(targetTime - t) / (1000 * 3600 * 24);
      if (dayDiff > 7) return false;
      const dist = Math.hypot((r.lat - target.lat) * 111000, (r.lng - target.lng) * 111000 * Math.cos(target.lat * Math.PI/180));
      return dist <= 50; // 50m radius
    });

    if (duplicates.length > 0) {
      const caseId = target.case_id || duplicates[0].case_id || ('case_' + target.id);
      target.case_id = caseId;
      target.duplicate_count = duplicates.length + 1;
      duplicates.forEach(d => {
        d.case_id = caseId;
        d.duplicate_count = duplicates.length + 1;
      });
      saveLocal(LS_REPORTS, list);
    }
  }

  async function getMyReports(userId) {
    const list = loadLocal(LS_REPORTS, []);
    if (userId) return list.filter(r => r.user_id === userId).slice(0, 20);
    return list.slice(0, 20);
  }

  async function getReportById(id) {
    if (_firestore) {
      try {
        const doc = await _firestore.collection('reports').doc(id).get();
        if (doc.exists) return { id: doc.id, ...doc.data() };
      } catch (_) {}
    }
    const list = loadLocal(LS_REPORTS, []);
    return list.find(r => r.id === id || r.reference === id) || null;
  }

  async function getAllReports(filters = {}) {
    let list = loadLocal(LS_REPORTS, []);

    // Try fetching newer from Firestore
    if (_firestore) {
      try {
        const snap = await _firestore.collection('reports').orderBy('created_at', 'desc').limit(200).get();
        if (!snap.empty) {
          const remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // Merge unique by id
          const map = new Map();
          remote.forEach(r => map.set(r.id, r));
          list.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
          list = Array.from(map.values()).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
          saveLocal(LS_REPORTS, list);
        }
      } catch (_) {}
    }

    if (filters.status && filters.status !== 'all') {
      list = list.filter(r => r.status === filters.status);
    }
    if (filters.type && filters.type !== 'all') {
      list = list.filter(r => r.type === filters.type);
    }
    if (filters.district && filters.district !== 'all') {
      list = list.filter(r => r.district === filters.district);
    }
    if (filters.channel && filters.channel !== 'all') {
      list = list.filter(r => r.channel === filters.channel);
    }
    if (filters.review) {
      list = list.filter(r => r.needs_human_review === true);
    }
    return list;
  }

  async function updateReportStatus(id, toStatus, reason, actorId) {
    const list = loadLocal(LS_REPORTS, []);
    const rep = list.find(r => r.id === id);
    const fromStatus = rep ? rep.status : 'submitted';

    if (rep) {
      rep.status = toStatus;
      saveLocal(LS_REPORTS, list);
    }

    // Firestore update
    if (_firestore) {
      try {
        await _firestore.collection('reports').doc(id).update({ status: toStatus });
      } catch (_) {}
    }

    // Log status change (FR-DASH-02 / NFR-11)
    const logs = loadLocal(LS_LOGS, []);
    const logEntry = {
      id: 'log_' + Date.now(),
      report_id: id,
      from_status: fromStatus,
      to_status: toStatus,
      actor_id: actorId || 'officer',
      reason: reason || null,
      created_at: new Date().toISOString()
    };
    logs.unshift(logEntry);
    saveLocal(LS_LOGS, logs);

    if (_firestore) {
      try {
        await _firestore.collection('status_log').add(logEntry);
      } catch (_) {}
    }

    notifyReportChange('UPDATE', rep || { id, status: toStatus });
    return { success: true, log: logEntry };
  }

  async function getStatusLog(reportId) {
    const logs = loadLocal(LS_LOGS, []);
    return logs.filter(l => l.report_id === reportId).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  }

  // ── Media Upload API (FR-REP-02 / FR-MSG-01) ────────────────
  async function uploadFile(bucketOrFolder, path, fileOrBlob) {
    // 1. Try Firebase Storage if available
    if (_storage) {
      try {
        const storageRef = _storage.ref().child(`${bucketOrFolder}/${path}`);
        const snapshot = await storageRef.put(fileOrBlob);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        return downloadUrl;
      } catch (err) {
        console.warn('Firebase storage notice (fallback to DataURL):', err.message);
      }
    }

    // 2. Resilient Fallback: Convert to Base64 dataURL / Blob URL
    return new Promise(resolve => {
      if (typeof fileOrBlob === 'string') return resolve(fileOrBlob);
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => resolve(URL.createObjectURL(fileOrBlob));
      reader.readAsDataURL(fileOrBlob);
    });
  }

  async function insertMedia(payload) {
    if (!payload.id) payload.id = 'med_' + Date.now();
    if (!payload.created_at) payload.created_at = new Date().toISOString();
    const media = loadLocal(LS_MEDIA, []);
    media.push(payload);
    saveLocal(LS_MEDIA, media);
    return payload;
  }

  async function getMediaForReport(reportId) {
    const media = loadLocal(LS_MEDIA, []);
    return media.filter(m => m.report_id === reportId);
  }

  // ── Messaging Thread API (FR-MSG-02) ────────────────────────
  async function getMessages(reportId) {
    const msgs = loadLocal(LS_MESSAGES, []);
    return msgs.filter(m => m.report_id === reportId).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  }

  async function sendMessage(payload) {
    if (!payload.id) payload.id = 'msg_' + Date.now();
    if (!payload.created_at) payload.created_at = new Date().toISOString();
    const msgs = loadLocal(LS_MESSAGES, []);
    msgs.push(payload);
    saveLocal(LS_MESSAGES, msgs);

    if (_firestore) {
      try {
        await _firestore.collection('report_messages').add(payload);
      } catch (_) {}
    }

    notifyMessage(payload.report_id, payload);
    return payload;
  }

  function subscribeToMessages(reportId, callback) {
    if (!messageListeners.has(reportId)) {
      messageListeners.set(reportId, new Set());
    }
    messageListeners.get(reportId).add(callback);

    // Also attach Firestore realtime listener if available
    let unsubscribeFirestore = null;
    if (_firestore) {
      try {
        unsubscribeFirestore = _firestore.collection('report_messages')
          .where('report_id', '==', reportId)
          .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
              if (change.type === 'added') callback(change.doc.data());
            });
          });
      } catch (_) {}
    }

    return {
      unsubscribe: () => {
        messageListeners.get(reportId)?.delete(callback);
        if (unsubscribeFirestore) unsubscribeFirestore();
      }
    };
  }

  function subscribeToReports(callback) {
    reportListeners.add(callback);
    return {
      unsubscribe: () => reportListeners.delete(callback)
    };
  }

  function subscribeToAlerts(callback) {
    alertListeners.add(callback);
    return {
      unsubscribe: () => alertListeners.delete(callback)
    };
  }

  // ── Hotspots API (FR-HOT-01 to 08) ──────────────────────────
  async function getHotspots(district) {
    const list = loadLocal(LS_HOTSPOTS, []);
    if (!district || district === 'all') return list;
    return list.filter(h => h.district === district);
  }

  // ── Devices & Sensor Feed API (FR-SENS-01 to 05 / DRN-01 to 08) ─
  async function getAllDevices() {
    return loadLocal(LS_DEVICES, []);
  }

  async function getDevicesByDistrict(district) {
    const devs = loadLocal(LS_DEVICES, []);
    if (!district || district === 'all') return devs;
    return devs.filter(d => d.district === district);
  }

  async function getReadingsSeries(deviceId, hours = 24) {
    const readings = loadLocal(LS_READINGS, []);
    const cutoff = Date.now() - hours * 3600000;
    return readings
      .filter(r => r.device_id === deviceId && new Date(r.ts).getTime() >= cutoff)
      .sort((a,b) => new Date(a.ts) - new Date(b.ts));
  }

  async function getLatestReading(deviceId) {
    const readings = loadLocal(LS_READINGS, []);
    const matching = readings.filter(r => r.device_id === deviceId).sort((a,b) => new Date(b.ts) - new Date(a.ts));
    return matching[0] || null;
  }

  async function addReading(reading) {
    if (!reading.id) reading.id = 'read_' + Date.now();
    if (!reading.ts) reading.ts = new Date().toISOString();
    const readings = loadLocal(LS_READINGS, []);
    readings.push(reading);
    saveLocal(LS_READINGS, readings);

    // Threshold check (FR-SENS-03: PM2.5 > 35)
    if (reading.pm25 > 35) {
      await createAlert({
        device_id: reading.device_id,
        metric: 'pm25',
        value: reading.pm25,
        threshold: '35 µg/m³ (WHO Alert)'
      });
    }

    // Flood risk check (DRN-05: Flood Risk > 70%)
    if (reading.flood_risk > 70) {
      await createAlert({
        device_id: reading.device_id,
        metric: 'flood_risk',
        value: reading.flood_risk,
        threshold: 'Flood Risk > 70% (High Danger)'
      });
    }

    return reading;
  }

  // ── Alerts API ──────────────────────────────────────────────
  async function getAlerts() {
    const alerts = loadLocal(LS_ALERTS, []);
    return alerts.filter(a => !a.acknowledged_by).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function getAllAlerts() {
    const alerts = loadLocal(LS_ALERTS, []);
    return alerts.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function createAlert(payload) {
    if (!payload.id) payload.id = 'alt_' + Date.now();
    if (!payload.created_at) payload.created_at = new Date().toISOString();
    payload.acknowledged_by = null;
    const alerts = loadLocal(LS_ALERTS, []);
    alerts.unshift(payload);
    saveLocal(LS_ALERTS, alerts);
    notifyAlertChange(payload);
    return payload;
  }

  async function acknowledgeAlert(id, userId) {
    const alerts = loadLocal(LS_ALERTS, []);
    const a = alerts.find(x => x.id === id);
    if (a) {
      a.acknowledged_by = userId || 'officer';
      saveLocal(LS_ALERTS, alerts);
    }
  }

  // ── Interactive Simulation Helpers (for Demo Scenarios) ─────
  async function simulatePM25Spike(deviceId = 'drain-douala-001', spikeValue = 94.5) {
    const reading = {
      device_id: deviceId,
      ts: new Date().toISOString(),
      pm25: spikeValue,
      pm10: Math.round(spikeValue * 1.6),
      water_level_cm: 18.2,
      flood_risk: 45,
      temperature_c: 29.8,
      battery_v: 3.90,
      simulated: true
    };
    await addReading(reading);

    // Update corresponding hotspot cell score
    const hotspots = loadLocal(LS_HOTSPOTS, []);
    const cell = hotspots.find(h => h.cell_id === 'douala_120_340');
    if (cell) {
      cell.score = 92;
      cell.band = 'critical';
      cell.pm25_avg = spikeValue;
      cell.drivers_en = 'CRITICAL ALERT: PM2.5 spike to ' + spikeValue + ' µg/m³ recorded by Akwa node!';
      cell.drivers_fr = 'ALERTE CRITIQUE : Pic de PM2.5 à ' + spikeValue + ' µg/m³ enregistré par le nœud d\'Akwa !';
      saveLocal(LS_HOTSPOTS, hotspots);
    }
    return reading;
  }

  async function simulateDrainWaterSurge(deviceId = 'drain-douala-001', waterLevelCm = 42.0, blockageScore = 4) {
    const floodRisk = Math.min(100, Math.round(100 * (0.40 * (waterLevelCm/50) + 0.30 * 0.8 + 0.30 * (blockageScore/4)) + 8));
    const reading = {
      device_id: deviceId,
      ts: new Date().toISOString(),
      pm25: 38.0,
      pm10: 48.0,
      water_level_cm: waterLevelCm,
      blockage_score: blockageScore,
      flood_risk: floodRisk,
      temperature_c: 26.5,
      battery_v: 3.88,
      simulated: true
    };
    await addReading(reading);
    return reading;
  }

  // ── Dashboard Stats (FR-DASH) ───────────────────────────────
  async function getStats() {
    const reports = loadLocal(LS_REPORTS, []);
    const hotspots = loadLocal(LS_HOTSPOTS, []);
    const devices = loadLocal(LS_DEVICES, []);
    const alerts = loadLocal(LS_ALERTS, []);

    const totalReports = reports.length;
    const resolvedReports = reports.filter(r => r.status === 'resolved').length;
    const activeHotspots = hotspots.filter(h => h.score >= 50).length;
    const sensorsOnline = devices.filter(d => d.status === 'online').length;
    const pendingAlerts = alerts.filter(a => !a.acknowledged_by).length;
    const reviewNeeded = reports.filter(r => r.needs_human_review === true).length;

    return { totalReports, resolvedReports, activeHotspots, sensorsOnline, pendingAlerts, reviewNeeded };
  }

  // ── CSV Export (FR-DASH-05) ─────────────────────────────────
  async function exportReportsCSV(filters = {}) {
    const reports = await getAllReports(filters);
    const headers = ['reference', 'type', 'status', 'severity', 'channel', 'quarter', 'district', 'lat', 'lng', 'description', 'created_at', 'needs_human_review'];
    const rows = reports.map(r => headers.map(h => {
      const v = r[h] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  // ── Worker Accounts API (Admin-only) ───────────────────────
  const LS_WORKERS = 'cc_workers_v1';
  const LS_APPLICATIONS = 'cc_applications_v1';

  async function createWorkerAccount(payload) {
    if (!payload.id) payload.id = 'wrk_' + Date.now();
    if (!payload.created_at) payload.created_at = new Date().toISOString();
    if (!payload.role) payload.role = 'collector';
    if (!payload.status) payload.status = 'active';
    // Hash password in a simple way (this is demo; in production use proper hashing)
    payload.password_hash = btoa(payload.password || '').replace(/=/g, '');

    const workers = loadLocal(LS_WORKERS, []);
    const existing = workers.find(w => w.email === payload.email);
    if (existing) throw new Error('Un compte avec cet e-mail existe déjà.');
    workers.unshift(payload);
    saveLocal(LS_WORKERS, workers);

    // Also try Firestore
    if (_firestore) {
      try {
        const { password, password_hash, ...safePayload } = payload;
        await _firestore.collection('workers').doc(payload.id).set(safePayload, { merge: true });
      } catch (_) {}
    }
    return payload;
  }

  async function getAllWorkers() {
    const workers = loadLocal(LS_WORKERS, []);
    return workers.map(w => {
      const { password, password_hash, ...safe } = w;
      return safe;
    });
  }

  async function updateWorker(id, updates) {
    const workers = loadLocal(LS_WORKERS, []);
    const idx = workers.findIndex(w => w.id === id);
    if (idx < 0) throw new Error('Worker not found');
    workers[idx] = { ...workers[idx], ...updates, updated_at: new Date().toISOString() };
    saveLocal(LS_WORKERS, workers);
    if (_firestore) {
      try { await _firestore.collection('workers').doc(id).update(updates); } catch (_) {}
    }
    return workers[idx];
  }

  async function deleteWorker(id) {
    const workers = loadLocal(LS_WORKERS, []);
    const filtered = workers.filter(w => w.id !== id);
    saveLocal(LS_WORKERS, filtered);
    if (_firestore) {
      try { await _firestore.collection('workers').doc(id).delete(); } catch (_) {}
    }
  }

  async function workerSignIn(email, password) {
    const workers = loadLocal(LS_WORKERS, []);
    const worker = workers.find(w => w.email === email && w.status === 'active');
    if (!worker) throw new Error('Compte introuvable ou désactivé.');
    const hash = btoa(password).replace(/=/g, '');
    if (worker.password_hash !== hash) throw new Error('Mot de passe incorrect.');
    const session = {
      uid: worker.id,
      email: worker.email,
      displayName: worker.name,
      role: worker.role,
      isWorker: true
    };
    saveLocal(LS_SESSION, session);
    return { user: session };
  }

  // ── Admin Credentials API ───────────────────────────────────
  const LS_ADMIN_CREDS = 'cc_admin_creds_v1';

  function getAdminCredentials() {
    return loadLocal(LS_ADMIN_CREDS, {
      email: CC.ADMIN_EMAIL,
      name: 'Administrateur CleanCam',
      updated_at: null
    });
  }

  async function updateAdminCredentials(currentPassword, newEmail, newPassword, newName) {
    const creds = getAdminCredentials();
    // Verify current password
    const storedPwd = loadLocal(LS_ADMIN_CREDS, null)?.password || CC.ADMIN_PASSWORD;
    if (currentPassword !== storedPwd) {
      throw new Error('Mot de passe actuel incorrect.');
    }
    const updated = {
      email: newEmail || creds.email,
      name: newName || creds.name,
      password: newPassword || storedPwd,
      updated_at: new Date().toISOString()
    };
    saveLocal(LS_ADMIN_CREDS, updated);

    // Update Firebase Auth if available
    if (_currentUser && _auth) {
      try {
        if (newEmail && newEmail !== _currentUser.email) {
          await _currentUser.updateEmail(newEmail);
        }
        if (newPassword) {
          await _currentUser.updatePassword(newPassword);
        }
        if (newName) {
          await _currentUser.updateProfile({ displayName: newName });
        }
      } catch (err) {
        console.warn('Firebase credential update notice:', err.message);
      }
    }
    // Update current session
    const session = loadLocal(LS_SESSION, null);
    if (session) {
      session.email = updated.email;
      session.displayName = updated.name;
      saveLocal(LS_SESSION, session);
    }
    return updated;
  }

  // Override signIn to also check updated admin credentials
  const _originalSignIn = signIn;
  async function signInWithAdminOverride(email, password) {
    // Check updated admin creds first
    const adminCreds = getAdminCredentials();
    if (email === adminCreds.email) {
      const storedPwd = loadLocal(LS_ADMIN_CREDS, null)?.password || CC.ADMIN_PASSWORD;
      if (password === storedPwd) {
        const demoUser = {
          uid: 'officer-demo-uuid',
          email: adminCreds.email,
          user_metadata: { name: adminCreds.name || 'Administrateur CleanCam' },
          role: 'admin',
          isAdmin: true
        };
        saveLocal(LS_SESSION, { ...demoUser, isDemoAdmin: true });
        return { user: demoUser, session: { user: demoUser } };
      }
    }
    // Check worker accounts
    try {
      return await workerSignIn(email, password);
    } catch (_) {}
    // Fall back to original
    return _originalSignIn(email, password);
  }

  // ── Applications API ───────────────────────────────────────
  async function getAllApplications() {
    const apps = loadLocal(LS_APPLICATIONS, []);
    return apps.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  }

  async function updateApplicationStatus(id, status, notes) {
    const apps = loadLocal(LS_APPLICATIONS, []);
    const app = apps.find(a => a.id === id);
    if (app) {
      app.status = status;
      app.admin_notes = notes || '';
      app.reviewed_at = new Date().toISOString();
      saveLocal(LS_APPLICATIONS, apps);
    }
    return app;
  }

  // ── Expose Window.db globally ───────────────────────────────
  window.db = {
    // Auth
    signUp, signIn: signInWithAdminOverride, signOut, getSession, getUser,
    workerSignIn,
    // Reports
    createReport, getMyReports, getReportById, getAllReports, updateReportStatus, getStatusLog,
    // Media & Storage
    uploadFile, insertMedia, getMediaForReport,
    // Messages
    getMessages, sendMessage, subscribeToMessages,
    // Realtime Events
    subscribeToReports, subscribeToAlerts,
    // Hotspots & Sensors
    getHotspots, getAllDevices, getDevicesByDistrict, getReadingsSeries, getLatestReading, addReading,
    // Alerts & Simulation
    getAlerts, getAllAlerts, acknowledgeAlert, createAlert, simulatePM25Spike, simulateDrainWaterSurge,
    // Stats & Export
    getStats, exportReportsCSV,
    // Worker accounts (Admin only)
    createWorkerAccount, getAllWorkers, updateWorker, deleteWorker,
    // Admin credentials
    getAdminCredentials, updateAdminCredentials,
    // Applications
    getAllApplications, updateApplicationStatus,
    // Backwards compatibility alias
    getSupabase: () => null,
    getFirebase: () => ({ auth: _auth, firestore: _firestore, storage: _storage }),
    _firestore: null // set internally, exposed for apply.html
  };

  // Expose _firestore through db after init
  const _origInitFirebase = window.initFirebase;
  Object.defineProperty(window.db, '_firestore', {
    get: () => _firestore,
    configurable: true
  });

  console.log('CleanCam Firebase & Data Layer initialized successfully.');
})();
