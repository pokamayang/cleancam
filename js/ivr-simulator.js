// ============================================================
// CleanCam – IVR Calling Line Simulator (FR-CALL-01 to 08)
// Bilingual Interactive Phone Menu with DTMF Sound, Speech
// Synthesis, and full report creation / hotspot readout.
// ============================================================

(function() {
  let audioCtx = null;
  let currentStep = 'welcome'; // welcome, main_menu, report_type, location, record_desc, done, hotspot_readout, status_check
  let currentLang = 'fr';      // 'fr' or 'en'
  let callReport = {};
  let recTimerInterval = null;
  let recSeconds = 0;
  let isCallActive = false;

  // DTMF Frequencies (Hz)
  const DTMF_FREQS = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  function playTone(key) {
    if (!DTMF_FREQS[key]) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const [f1, f2] = DTMF_FREQS[key];
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.frequency.value = f1;
      osc2.frequency.value = f2;
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.18);
      osc2.stop(audioCtx.currentTime + 0.18);
    } catch (_) {}
  }

  // Voice synthesis
  function speak(text, lang = currentLang) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    ut.rate = 0.95;
    window.speechSynthesis.speak(ut);
  }

  // Prompts dictionary
  const PROMPTS = {
    fr: {
      welcome: "Bienvenue sur CleanCam Cameroun. Pour le français, tapez 1. For English, press 2.",
      main_menu: "Menu principal. Tapez 1 pour signaler une pollution. Tapez 2 pour écouter les points chauds récents. Tapez 3 pour suivre un signalement. Tapez 0 pour parler à un agent.",
      report_type: "Choisissez le type de pollution : 1 pour déchets et plastique, 2 pour brûlage d'ordures, 3 pour contamination de l'eau, 4 pour fumée ou poussière, 5 pour caniveau bouché, 6 pour autre.",
      location: "Indiquez votre quartier : tapez 1 pour Akwa, 2 pour Bonanjo, 3 pour Deido, 4 pour Mokolo, 5 pour Briqueterie, ou tapez 6 pour un autre quartier.",
      location_confirmed: (q) => `Quartier sélectionné : ${q}. Décrivez le problème maintenant. Tapez la touche dièse # pour terminer l'enregistrement.`,
      recording_start: "Enregistrement en cours (max 60 secondes). Parlez après le bip. Appuyez sur # pour terminer.",
      done: (ref) => `Merci pour votre civisme citoyen. Votre signalement a été enregistré avec succès sous la référence : ${ref}. Les services municipaux ont été informés.`,
      status_prompt: "Entrez les 4 chiffres de votre référence CleanCam (ex: 4821) puis tapez #.",
      agent: "Mise en relation avec un agent municipal de garde. Veuillez patienter en ligne...",
      drop_saved: "Appel interrompu. Votre signalement a été sauvegardé comme brouillon pour intervention urgente."
    },
    en: {
      welcome: "Welcome to CleanCam Cameroon. For French, press 1. For English, press 2.",
      main_menu: "Main menu. Press 1 to report pollution. Press 2 to hear recent hotspots. Press 3 to check a report status. Press 0 to speak with an officer.",
      report_type: "Select pollution type: 1 for rubbish & plastic, 2 for waste burning, 3 for water contamination, 4 for smoke or dust, 5 for blocked drain, 6 for other.",
      location: "Select your quarter: press 1 for Akwa, 2 for Bonanjo, 3 for Deido, 4 for Mokolo, 5 for Briqueterie, or press 6 for other.",
      location_confirmed: (q) => `Selected quarter: ${q}. Please describe the issue. Press the hash key # when finished.`,
      recording_start: "Recording in progress (max 60s). Speak after the beep. Press # when finished.",
      done: (ref) => `Thank you for your report. Your case has been logged successfully under reference: ${ref}. Council teams have been alerted.`,
      status_prompt: "Enter the 4 digits of your CleanCam reference code (e.g. 4821) followed by #.",
      agent: "Connecting to a council duty officer. Please stay on the line...",
      drop_saved: "Call dropped. Your report was preserved as a high-priority draft."
    }
  };

  // Start a new call
  function startCall() {
    isCallActive = true;
    currentStep = 'welcome';
    currentLang = i18n.lang || 'fr';
    callReport = {
      channel: 'voice_call',
      caller_phone: '+23767' + Math.floor(1000000 + Math.random()*8999999),
      client_id: window.uuid ? window.uuid() : 'ivr_' + Date.now(),
      status: 'submitted',
      location_source: 'quarter',
      district: 'douala',
      quarter: 'Akwa',
      lat: 4.0511,
      lng: 9.7679,
      type: 'burning_waste',
      severity: 3,
      description: '',
      transcript: '',
      incomplete: false
    };

    renderScreen();
    speak(PROMPTS[currentLang].welcome);
  }

  // End / Hang up call
  async function hangUp(isDropped = false) {
    if (!isCallActive) return;
    isCallActive = false;
    clearInterval(recTimerInterval);

    if (isDropped && (currentStep === 'record_desc' || currentStep === 'location')) {
      // Save partial recording as draft with incomplete: true (FR-CALL-05 / T8)
      callReport.incomplete = true;
      callReport.description = callReport.description || 'Description partielle enregistrée avant coupure de ligne.';
      callReport.transcript  = callReport.description;
      callReport.reference   = window.generateRef ? window.generateRef() : 'CC-' + Math.floor(1000 + Math.random()*9000);
      try {
        await window.db.createReport(callReport);
        showToast(currentLang === 'fr' ? '📞 Appel coupé : Brouillon incomplet sauvegardé' : '📞 Call dropped: Incomplete draft saved', 'warning');
      } catch (_) {}
    }

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    updateUIHangup();
  }

  // Handle keypad press (DTMF)
  async function handleKey(key) {
    playTone(key);
    const p = PROMPTS[currentLang];

    if (currentStep === 'welcome') {
      if (key === '1') {
        currentLang = 'fr';
        currentStep = 'main_menu';
        renderScreen();
        speak(p.main_menu);
      } else if (key === '2') {
        currentLang = 'en';
        currentStep = 'main_menu';
        renderScreen();
        speak(PROMPTS.en.main_menu);
      }
      return;
    }

    if (currentStep === 'main_menu') {
      if (key === '1') {
        currentStep = 'report_type';
        renderScreen();
        speak(p.report_type);
      } else if (key === '2') {
        currentStep = 'hotspot_readout';
        renderScreen();
        await readHotspots();
      } else if (key === '3') {
        currentStep = 'status_check';
        callReport._statusBuffer = '';
        renderScreen();
        speak(p.status_prompt);
      } else if (key === '0') {
        currentStep = 'agent';
        renderScreen();
        speak(p.agent);
      }
      return;
    }

    if (currentStep === 'report_type') {
      const types = {
        '1': 'plastic_waste',
        '2': 'burning_waste',
        '3': 'water_contamination',
        '4': 'air_smoke',
        '5': 'drain_blockage',
        '6': 'other'
      };
      callReport.type = types[key] || 'burning_waste';
      currentStep = 'location';
      renderScreen();
      speak(p.location);
      return;
    }

    if (currentStep === 'location') {
      const quarters = {
        '1': { name: 'Akwa', lat: 4.0511, lng: 9.7679, district: 'douala' },
        '2': { name: 'Bonanjo', lat: 4.0481, lng: 9.6965, district: 'douala' },
        '3': { name: 'Deido', lat: 4.0771, lng: 9.7417, district: 'douala' },
        '4': { name: 'Mokolo', lat: 3.8724, lng: 11.5143, district: 'yaounde' },
        '5': { name: 'Briqueterie', lat: 3.8841, lng: 11.5172, district: 'yaounde' },
        '6': { name: 'Banya-Sable', lat: 4.0453, lng: 9.7312, district: 'douala' }
      };
      const q = quarters[key] || quarters['1'];
      callReport.quarter = q.name;
      callReport.lat = q.lat;
      callReport.lng = q.lng;
      callReport.district = q.district;

      currentStep = 'record_desc';
      renderScreen();
      speak(p.location_confirmed(q.name));
      startRecordingTimer();
      return;
    }

    if (currentStep === 'record_desc') {
      if (key === '#') {
        // End recording and create report
        clearInterval(recTimerInterval);
        await finalizeReport();
      }
      return;
    }

    if (currentStep === 'status_check') {
      if (key === '#') {
        await checkStatusResult(callReport._statusBuffer);
      } else {
        callReport._statusBuffer = (callReport._statusBuffer || '') + key;
        renderScreen();
      }
    }
  }

  function startRecordingTimer() {
    recSeconds = 0;
    clearInterval(recTimerInterval);
    recTimerInterval = setInterval(() => {
      recSeconds++;
      const el = document.getElementById('ivr-rec-timer');
      if (el) el.textContent = `0:${recSeconds < 10 ? '0' + recSeconds : recSeconds} / 1:00`;
      if (recSeconds >= 60) {
        clearInterval(recTimerInterval);
        finalizeReport();
      }
    }, 1000);
  }

  async function finalizeReport() {
    currentStep = 'done';
    const ref = window.generateRef ? window.generateRef() : 'CC-' + Math.floor(1000 + Math.random()*9000);
    callReport.reference = ref;
    callReport.description = callReport.description || (currentLang === 'fr'
      ? `Signalement vocal téléphonique pour ${callReport.type} à ${callReport.quarter}.`
      : `Phone voice report for ${callReport.type} in ${callReport.quarter}.`);
    callReport.transcript = callReport.description;
    callReport.incomplete = false;

    // AI classification preview for voice call
    callReport.ai_result = {
      type: callReport.type,
      materials: ['mixed'],
      severity: 3,
      confidence: 0.85,
      needs_human_review: false,
      language_detected: currentLang,
      summary_fr: `Signalement téléphonique parvenu depuis ${callReport.quarter}.`,
      summary_en: `Voice call report received from ${callReport.quarter}.`,
      recommended_actor: 'council_sanitation'
    };

    renderScreen();
    speak(PROMPTS[currentLang].done(ref));

    try {
      await window.db.createReport(callReport);
      showToast(currentLang === 'fr' ? `📞 Signalement créé : ${ref}` : `📞 Report created: ${ref}`, 'success');
    } catch (err) {
      console.warn('IVR save error:', err);
    }
  }

  // Option 2: Hear recent hotspots (FR-CALL-04 / T7)
  async function readHotspots() {
    const hotspots = await window.db.getHotspots('all');
    const top = hotspots.sort((a,b) => b.score - a.score).slice(0, 3);

    let speechText = currentLang === 'fr'
      ? `Voici les trois zones de pollution critique récentes : `
      : `Here are the top three critical pollution zones: `;

    top.forEach((h, i) => {
      const q = h.quarter || h.district;
      speechText += currentLang === 'fr'
        ? `Numéro ${i+1} : Quartier ${q}, indice de pollution ${h.score} sur 100, niveau ${h.band}. `
        : `Number ${i+1}: Quarter ${q}, pollution score ${h.score} out of 100, level ${h.band}. `;
    });

    speechText += currentLang === 'fr'
      ? "Pour revenir au menu principal, tapez 1."
      : "To return to the main menu, press 1.";

    const screenText = top.map((h, i) => `${i+1}. ${h.quarter || h.district} – Score: ${h.score}/100 (${h.band})`).join('\n');
    const scr = document.getElementById('ivr-screen-content');
    if (scr) {
      scr.innerHTML = `<strong>🔥 ${currentLang === 'fr' ? 'Points Chauds Récents' : 'Recent Hotspots'}</strong><pre style="margin-top:.5rem;font-size:.8rem">${screenText}</pre>`;
    }

    speak(speechText);
  }

  // Option 3: Status check (FR-CALL-06)
  async function checkStatusResult(refDigits) {
    const fullRef = refDigits.startsWith('CC-') ? refDigits : 'CC-' + refDigits;
    const reports = await window.db.getAllReports();
    const rep = reports.find(r => r.reference === fullRef || r.reference.endsWith(refDigits));

    let msg = '';
    if (rep) {
      msg = currentLang === 'fr'
        ? `Signalement ${rep.reference} trouvé. Statut actuel : ${rep.status}. Quartier : ${rep.quarter}.`
        : `Report ${rep.reference} found. Current status: ${rep.status}. Quarter: ${rep.quarter}.`;
    } else {
      msg = currentLang === 'fr'
        ? `Aucun signalement trouvé pour la référence CC ${refDigits}.`
        : `No report found for reference CC ${refDigits}.`;
    }

    const scr = document.getElementById('ivr-screen-content');
    if (scr) scr.innerHTML = `<p>${msg}</p><p style="margin-top:.5rem;font-size:.75rem">Tapez 1 pour le menu.</p>`;
    speak(msg);
    currentStep = 'main_menu';
  }

  // UI Renderer for IVR Screen
  function renderScreen() {
    const scr = document.getElementById('ivr-screen-content');
    if (!scr) return;

    if (currentStep === 'welcome') {
      scr.innerHTML = `
        <div style="text-align:center">
          <div style="font-size:1.4rem">🌍 CleanCam IVR</div>
          <div style="font-size:.82rem;color:#86efac;margin-top:.25rem">Appel sans internet · No-Internet Line</div>
          <p style="margin-top:.85rem;font-size:.85rem">Tapez <strong>1</strong> pour Français<br>Press <strong>2</strong> for English</p>
        </div>`;
    } else if (currentStep === 'main_menu') {
      scr.innerHTML = `
        <div>
          <div style="font-size:.75rem;color:#86efac">CleanCam Hotline (+237 670 00 22)</div>
          <ul style="list-style:none;padding:0;margin-top:.5rem;font-size:.82rem;display:flex;flex-direction:column;gap:.35rem">
            <li><strong>1</strong> : ${currentLang === 'fr' ? 'Signaler une pollution' : 'Report pollution'}</li>
            <li><strong>2</strong> : ${currentLang === 'fr' ? 'Points chauds récents' : 'Recent hotspots'}</li>
            <li><strong>3</strong> : ${currentLang === 'fr' ? 'Suivre un signalement' : 'Check report status'}</li>
            <li><strong>0</strong> : ${currentLang === 'fr' ? 'Parler à un agent' : 'Speak to officer'}</li>
          </ul>
        </div>`;
    } else if (currentStep === 'report_type') {
      scr.innerHTML = `
        <div>
          <div style="font-size:.75rem;color:#86efac">${currentLang === 'fr' ? 'Étape 1 : Type de problème' : 'Step 1: Pollution type'}</div>
          <ul style="list-style:none;padding:0;margin-top:.5rem;font-size:.8rem;display:grid;grid-template-columns:1fr 1fr;gap:.25rem">
            <li><strong>1</strong> : 🗑️ ${currentLang === 'fr' ? 'Déchets' : 'Rubbish'}</li>
            <li><strong>2</strong> : 🔥 ${currentLang === 'fr' ? 'Brûlage' : 'Burning'}</li>
            <li><strong>3</strong> : 💧 ${currentLang === 'fr' ? 'Eau polluée' : 'Water'}</li>
            <li><strong>4</strong> : 💨 ${currentLang === 'fr' ? 'Fumée/Air' : 'Smoke/Dust'}</li>
            <li><strong>5</strong> : 🚧 ${currentLang === 'fr' ? 'Caniveau' : 'Drain'}</li>
            <li><strong>6</strong> : ❓ ${currentLang === 'fr' ? 'Autre' : 'Other'}</li>
          </ul>
        </div>`;
    } else if (currentStep === 'location') {
      scr.innerHTML = `
        <div>
          <div style="font-size:.75rem;color:#86efac">${currentLang === 'fr' ? 'Étape 2 : Quartier / Landmark' : 'Step 2: Quarter'}</div>
          <ul style="list-style:none;padding:0;margin-top:.5rem;font-size:.8rem;display:grid;grid-template-columns:1fr 1fr;gap:.25rem">
            <li><strong>1</strong> : Akwa</li>
            <li><strong>2</strong> : Bonanjo</li>
            <li><strong>3</strong> : Deido</li>
            <li><strong>4</strong> : Mokolo</li>
            <li><strong>5</strong> : Briqueterie</li>
            <li><strong>6</strong> : Banya-Sable</li>
          </ul>
        </div>`;
    } else if (currentStep === 'record_desc') {
      scr.innerHTML = `
        <div style="text-align:center">
          <div style="font-size:1.5rem">🎙️</div>
          <div style="font-size:.85rem;font-weight:700;color:#ef4444">${currentLang === 'fr' ? 'ENREGISTREMENT' : 'RECORDING'}</div>
          <div id="ivr-rec-timer" style="font-size:1.1rem;font-family:monospace;margin:.4rem 0">0:00 / 1:00</div>
          <div style="font-size:.75rem;color:#86efac">${currentLang === 'fr' ? 'Tapez # pour valider' : 'Press # to submit'}</div>
        </div>`;
    } else if (currentStep === 'done') {
      scr.innerHTML = `
        <div style="text-align:center">
          <div style="font-size:1.5rem">✅</div>
          <div style="font-size:.9rem;font-weight:700">${currentLang === 'fr' ? 'Signalement Enregistré' : 'Report Registered'}</div>
          <div style="font-size:1.2rem;font-weight:800;color:#22c55e;margin:.5rem 0">${callReport.reference}</div>
          <p style="font-size:.75rem;color:rgba(255,255,255,.8)">${currentLang === 'fr' ? 'L\'équipe municipale a été notifiée.' : 'Municipal crew has been alerted.'}</p>
        </div>`;
    } else if (currentStep === 'status_check') {
      scr.innerHTML = `
        <div>
          <div style="font-size:.75rem;color:#86efac">${currentLang === 'fr' ? 'Vérifier un signalement' : 'Status Check'}</div>
          <p style="font-size:.8rem;margin-top:.4rem">${currentLang === 'fr' ? 'Entrez le code (ex: 4821) puis #' : 'Enter digits (e.g. 4821) then #'}</p>
          <div style="font-size:1.3rem;font-family:monospace;letter-spacing:4px;color:#22c55e;text-align:center;margin-top:.5rem">
            ${callReport._statusBuffer || '____'}
          </div>
        </div>`;
    } else if (currentStep === 'agent') {
      scr.innerHTML = `
        <div style="text-align:center">
          <div style="font-size:1.4rem">🏛️</div>
          <div style="font-size:.85rem;font-weight:700;margin-top:.3rem">${currentLang === 'fr' ? 'Mairie de Douala / Yaoundé' : 'Council Dispatch'}</div>
          <p style="font-size:.75rem;color:#86efac;margin-top:.4rem">Transfert en cours vers la permanence...</p>
        </div>`;
    }
  }

  function updateUIHangup() {
    const scr = document.getElementById('ivr-screen-content');
    if (scr) {
      scr.innerHTML = `
        <div style="text-align:center;padding:.75rem 0">
          <div style="font-size:1.2rem">📞 Appel terminé</div>
          <p style="font-size:.75rem;color:rgba(255,255,255,.6);margin-top:.25rem">Ligne libre · Cliquez sur Appeler pour relancer</p>
        </div>`;
    }
  }

  // Inject IVR Modal in Document
  function createIVRModal() {
    if (document.getElementById('ivr-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'ivr-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:360px;background:#0f172a;color:white;border-radius:24px;border:1px solid #334155;box-shadow:0 25px 50px -12px rgba(0,0,0,.6)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <div style="display:flex;align-items:center;gap:.5rem">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite"></span>
            <span style="font-size:.85rem;font-weight:700;letter-spacing:.5px">CleanCam Hotline (+237)</span>
          </div>
          <button onclick="closeIVR()" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer">✕</button>
        </div>

        <!-- Phone screen -->
        <div id="ivr-screen" style="background:#1e293b;border-radius:12px;padding:.875rem;min-height:120px;border:1px solid #334155;display:flex;flex-direction:column;justify-content:center">
          <div id="ivr-screen-content">
            <div style="text-align:center">
              <div style="font-size:1.3rem">📞 Ligne Vocale IVR</div>
              <p style="font-size:.78rem;color:#94a3b8;margin-top:.4rem">Pour utilisateurs sans smartphone ni internet</p>
            </div>
          </div>
        </div>

        <!-- Phone dialpad -->
        <div class="ivr-keypad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.625rem;margin-top:1.25rem">
          <button class="ivr-btn" onclick="ivrPress('1')">1<span class="sub">.</span></button>
          <button class="ivr-btn" onclick="ivrPress('2')">2<span class="sub">ABC</span></button>
          <button class="ivr-btn" onclick="ivrPress('3')">3<span class="sub">DEF</span></button>
          <button class="ivr-btn" onclick="ivrPress('4')">4<span class="sub">GHI</span></button>
          <button class="ivr-btn" onclick="ivrPress('5')">5<span class="sub">JKL</span></button>
          <button class="ivr-btn" onclick="ivrPress('6')">6<span class="sub">MNO</span></button>
          <button class="ivr-btn" onclick="ivrPress('7')">7<span class="sub">PQRS</span></button>
          <button class="ivr-btn" onclick="ivrPress('8')">8<span class="sub">TUV</span></button>
          <button class="ivr-btn" onclick="ivrPress('9')">9<span class="sub">WXYZ</span></button>
          <button class="ivr-btn" onclick="ivrPress('*')">*</button>
          <button class="ivr-btn" onclick="ivrPress('0')">0<span class="sub">+</span></button>
          <button class="ivr-btn" onclick="ivrPress('#')">#</button>
        </div>

        <!-- Action buttons -->
        <div style="display:flex;gap:.75rem;margin-top:1.25rem">
          <button class="btn btn-primary" onclick="ivrStartCall()" style="flex:2;background:#22c55e;color:white;display:flex;align-items:center;justify-content:center;gap:.4rem">
            <span>📞</span> <span id="ivr-call-btn-text">Appeler / Call</span>
          </button>
          <button class="btn btn-danger" onclick="ivrDropCall()" style="flex:1" title="Simuler coupure d'appel (T8)">
            <span>📵</span> Couper
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Keypad button CSS
    const style = document.createElement('style');
    style.textContent = `
      .ivr-btn {
        background: #1e293b; border: 1px solid #334155; color: white;
        border-radius: 50%; width: 56px; height: 56px; margin: 0 auto;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-size: 1.25rem; font-weight: 700; cursor: pointer; transition: all .15s ease;
      }
      .ivr-btn:hover { background: #334155; border-color: #22c55e; transform: scale(1.05); }
      .ivr-btn:active { background: #22c55e; color: black; transform: scale(0.95); }
      .ivr-btn .sub { font-size: 0.55rem; color: #94a3b8; font-weight: normal; margin-top: -2px; }
    `;
    document.head.appendChild(style);
  }

  // Global methods
  window.openIVR = function() {
    createIVRModal();
    const modal = document.getElementById('ivr-modal');
    if (modal) modal.style.display = 'flex';
    startCall();
  };

  window.closeIVR = function() {
    hangUp(false);
    const modal = document.getElementById('ivr-modal');
    if (modal) modal.style.display = 'none';
  };

  window.ivrPress = function(key) {
    if (!isCallActive) startCall();
    handleKey(key);
  };

  window.ivrStartCall = function() {
    startCall();
  };

  window.ivrDropCall = function() {
    hangUp(true); // Drop call intentionally (FR-CALL-05 / T8)
  };

  document.addEventListener('DOMContentLoaded', createIVRModal);
})();
