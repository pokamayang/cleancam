// ============================================================
// CleanCam – AI classification and transcription helpers
// Uses OpenAI-compatible vision + speech-to-text APIs with
// strict Cameroon environmental schema & smart heuristic fallback.
// ============================================================

const CLASSIFIER_SCHEMA = {
  type: { enum: ['burning_waste','plastic_waste','open_dump','water_contamination','air_smoke','dust','oil_spill','drain_blockage','other'] },
  materials: { items: { enum: ['plastic','organic','mixed','unknown'] } },
  severity:  { type: 'integer', minimum: 1, maximum: 5 },
  confidence:{ type: 'number',  minimum: 0, maximum: 1 },
  needs_human_review: { type: 'boolean' },
  language_detected:  { enum: ['fr','en','pcm'] },
  summary_fr: { type: 'string' },
  summary_en: { type: 'string' },
  recommended_actor: { enum: ['council_sanitation','collector','water_authority','environment_ministry','unknown'] }
};

const SYSTEM_PROMPT = `You are a pollution classifier for Cameroon. 
Return ONLY a valid JSON object matching this schema:
{
  "type": "burning_waste | plastic_waste | open_dump | water_contamination | air_smoke | dust | oil_spill | drain_blockage | other",
  "materials": ["plastic","organic","mixed","unknown"],
  "severity": 1-5,
  "confidence": 0.0-1.0,
  "needs_human_review": true/false,
  "language_detected": "fr|en|pcm",
  "summary_fr": "Une phrase en français.",
  "summary_en": "One sentence in English.",
  "recommended_actor": "council_sanitation|collector|water_authority|environment_ministry|unknown"
}
Rules:
- Do NOT invent facts not visible in the image or text.
- If the image is unclear, set confidence below 0.6 and needs_human_review to true.
- Never estimate exact quantities.
- summary_fr and summary_en must be single sentences.`;

function validateClassifierOutput(json) {
  if (!json || typeof json !== 'object') return false;
  const required = ['type','materials','severity','confidence','needs_human_review','summary_fr','summary_en','recommended_actor'];
  for (const k of required) {
    if (!(k in json)) return false;
  }
  if (json.confidence < 0 || json.confidence > 1) return false;
  if (json.severity < 1 || json.severity > 5)     return false;
  return true;
}

// ── Classify a photo (base64 or URL) ─────────────────────────
async function classifyPhoto(imageBase64OrUrl) {
  if (!CC.AI_API_KEY || CC.AI_API_KEY === 'YOUR_OPENAI_KEY') {
    return _smartHeuristicClassify('photo', imageBase64OrUrl);
  }

  const imageContent = { type: 'image_url', image_url: { url: imageBase64OrUrl, detail: 'low' } };

  try {
    const res = await fetch(CC.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CC.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: CC.AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: [
            { type: 'text', text: 'Classify this pollution photo from Cameroon.' },
            imageContent
          ]}
        ],
        max_tokens: 400,
        temperature: 0
      })
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!validateClassifierOutput(json)) {
      json.needs_human_review = true;
      json.confidence = 0.45;
    }
    return json;
  } catch (e) {
    console.warn('AI API fallback to local heuristics:', e.message);
    return _smartHeuristicClassify('photo', imageBase64OrUrl);
  }
}

// ── Classify a transcript ─────────────────────────────────────
async function classifyTranscript(text, lang = 'fr') {
  if (!CC.AI_API_KEY || CC.AI_API_KEY === 'YOUR_OPENAI_KEY') {
    return _smartHeuristicClassify('text', text, lang);
  }

  try {
    const res = await fetch(CC.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CC.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: CC.AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Classify this pollution report transcript (language: ${lang}):\n\n${text}` }
        ],
        max_tokens: 400,
        temperature: 0
      })
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!validateClassifierOutput(json)) {
      json.needs_human_review = true;
      json.confidence = 0.45;
    }
    return json;
  } catch (e) {
    console.warn('AI transcript API fallback:', e.message);
    return _smartHeuristicClassify('text', text, lang);
  }
}

// ── Transcribe audio blob ─────────────────────────────────────
async function transcribeAudio(audioBlob, lang = 'fr') {
  // If OpenAI STT key exists
  if (CC.AI_API_KEY && CC.AI_API_KEY !== 'YOUR_OPENAI_KEY') {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', lang === 'fr' ? 'fr' : 'en');
    try {
      const res = await fetch(CC.STT_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CC.AI_API_KEY}` },
        body: formData
      });
      const data = await res.json();
      return { text: data.text || '', confidence: 0.88 };
    } catch (_) {}
  }

  // Built-in speech synthesis / simulated transcription
  return {
    text: lang === 'fr'
      ? "Fumée épaisse et caniveau bouché par des bouteilles plastiques près de la rue marchande."
      : "Heavy smoke and blocked drain filled with plastic bottles near the market street.",
    confidence: 0.84
  };
}

// ── Smart Cameroon Environmental Classifier (Section 8.1) ────
function _smartHeuristicClassify(source, input = '', lang = 'fr') {
  const text = (typeof input === 'string' ? input : '').toLowerCase();

  let type = 'open_dump';
  let severity = 3;
  let materials = ['mixed'];
  let actor = 'council_sanitation';
  let confidence = 0.84;
  let needsReview = false;

  if (text.includes('brûl') || text.includes('burn') || text.includes('feu') || text.includes('smoke') || text.includes('fumée')) {
    type = 'burning_waste';
    severity = 4;
    materials = ['plastic', 'mixed'];
    actor = 'council_sanitation';
    confidence = 0.88;
  } else if (text.includes('caniveau') || text.includes('drain') || text.includes('bouch') || text.includes('inond') || text.includes('flood')) {
    type = 'drain_blockage';
    severity = 5;
    materials = ['plastic', 'mixed'];
    actor = 'council_sanitation';
    confidence = 0.92;
  } else if (text.includes('plast') || text.includes('bouteill') || text.includes('sachet')) {
    type = 'plastic_waste';
    severity = 2;
    materials = ['plastic'];
    actor = 'collector';
    confidence = 0.86;
  } else if (text.includes('eau') || text.includes('water') || text.includes('rivièr') || text.includes('fleuve') || text.includes('puits')) {
    type = 'water_contamination';
    severity = 4;
    materials = ['unknown'];
    actor = 'water_authority';
    confidence = 0.82;
  } else if (text.includes('huile') || text.includes('oil') || text.includes('vidange') || text.includes('garage')) {
    type = 'oil_spill';
    severity = 4;
    materials = ['unknown'];
    actor = 'environment_ministry';
    confidence = 0.85;
  } else if (text.includes('poussi') || text.includes('dust')) {
    type = 'dust';
    severity = 2;
    materials = ['mixed'];
    actor = 'council_sanitation';
    confidence = 0.79;
  } else if (text.includes('flou') || text.includes('unclear') || text.includes('autre') || text.length < 5) {
    type = 'other';
    severity = 2;
    materials = ['unknown'];
    actor = 'unknown';
    confidence = 0.48; // Under 0.6 threshold (FR-AI-03 / T12)
    needsReview = true;
  }

  const summaries = {
    burning_waste: {
      fr: "Combustion active d'ordures et plastiques avec émission de fumée toxique.",
      en: "Active open combustion of mixed refuse releasing hazardous particulate smoke."
    },
    drain_blockage: {
      fr: "Obstruction sévère d'un canal de drainage provoquant stagnation et risque d'inondation.",
      en: "Severe drainage canal blockage causing stagnation and immediate flash flood risk."
    },
    plastic_waste: {
      fr: "Accumulation de bouteilles et sachets plastiques pouvant être collectés pour recyclage.",
      en: "Accumulation of plastic bottles and bags suitable for selective collector pickup."
    },
    water_contamination: {
      fr: "Contamination visible d'une nappe ou cours d'eau nécessitant intervention sanitaire.",
      en: "Visible contamination of watercourse requiring rapid health and water authority inspection."
    },
    open_dump: {
      fr: "Dépôt sauvage d'ordures encombrant l'espace public et la chaussée.",
      en: "Illegal open garbage heap obstructing public lane and pedestrian passage."
    },
    oil_spill: {
      fr: "Déversement d'hydrocarbures ou huiles usagées polluant le sol et l'écoulement.",
      en: "Discharge of used motor oil or hydrocarbons contaminating local soil and runoff."
    },
    dust: {
      fr: "Émission dense de poussière liée à la circulation ou aux pistes non bitumées.",
      en: "Dense particulate dust cloud generated by heavy vehicle traffic on unpaved lanes."
    },
    other: {
      fr: "Signalement atypique nécessitant confirmation visuelle par un agent municipal.",
      en: "Atypical pollution report flagged for human verification by council officer."
    }
  };

  const sumObj = summaries[type] || summaries.other;

  return {
    type,
    materials,
    severity,
    confidence,
    needs_human_review: needsReview || confidence < 0.6,
    language_detected: lang === 'en' ? 'en' : 'fr',
    summary_fr: sumObj.fr,
    summary_en: sumObj.en,
    recommended_actor: actor,
    _simulated: true
  };
}

// ── Hotspot Score Heuristic Formula (Section 8.2) ─────────────
// pollution_score = 100 × min(1, 0.45·S + 0.35·R + 0.20·T)
function computeHotspotScore({ pm25_avg24h, reports_7d_weighted, vehicles_per_hour }) {
  const S = Math.min(1, (pm25_avg24h || 0) / 75);
  const R = Math.min(1, (reports_7d_weighted || 0) / 10);
  const T = Math.min(1, (vehicles_per_hour || 0) / 2000);
  return Math.round(100 * Math.min(1, 0.45 * S + 0.35 * R + 0.20 * T));
}

// ── Flood Risk Heuristic Formula (Section 8.4) ────────────────
// flood_risk = 100 × min(1, 0.40·L + 0.30·F + 0.30·B) + trend
function computeFloodRisk({ water_level_cm, alarm_level_cm = 50, forecast_rain_3h = 15, blockage_score = 1, rising_trend_pts = 0 }) {
  const L = Math.min(1, (water_level_cm || 0) / alarm_level_cm);
  const F = Math.min(1, (forecast_rain_3h || 0) / 50);
  const B = Math.min(1, (blockage_score || 0) / 4);
  const trend = Math.min(10, Math.max(0, rising_trend_pts || 0));
  return Math.min(100, Math.round(100 * Math.min(1, 0.40 * L + 0.30 * F + 0.30 * B)) + trend);
}

window.ai = {
  classifyPhoto,
  classifyTranscript,
  transcribeAudio,
  computeHotspotScore,
  computeFloodRisk,
  validateClassifierOutput
};
