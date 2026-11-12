// ============================================================
// CleanCam – Application Configuration
// Powered by Firebase (Auth, Firestore, Storage)
// ============================================================

// Firebase Configuration provided by user
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDWIGkq0FokEYdBFPQT-kqWY7aiWuyvVk",
  authDomain: "symbolic-mystery-c07pf.firebaseapp.com",
  projectId: "symbolic-mystery-c07pf",
  storageBucket: "symbolic-mystery-c07pf.firebasestorage.app",
  messagingSenderId: "256352607250",
  appId: "1:256352607250:web:58aa793e24b89d506ecccb"
};

// Admin demo credentials
const ADMIN_EMAIL = 'admin@cleancam.cm';
const ADMIN_PASSWORD = 'CleanCam2026!';

// AI / Vision API (OpenAI-compatible) & Speech-to-text
const AI_API_URL = 'https://api.openai.com/v1/chat/completions';
const AI_API_KEY = 'YOUR_OPENAI_KEY';
const AI_MODEL = 'gpt-4o';
const STT_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

// App config
const APP_VERSION = '1.0.0';
const REFRESH_OFFICER = 60000;   // ms – officer dashboard refresh (FR-HOT-07)
const REFRESH_PUBLIC  = 300000;  // ms – public map refresh (FR-HOT-07)

// Demo district centres (approximate for Cameroon)
const DISTRICTS = {
  douala: { lat: 4.0511, lng: 9.7679, label: 'Douala – Akwa', labelFr: 'Douala – Akwa' },
  yaounde: { lat: 3.8667, lng: 11.5167, label: 'Yaoundé – Mokolo', labelFr: 'Yaoundé – Mokolo' }
};

// Bundled Cameroon quarter list for reverse geocoding (Douala & Yaoundé)
const QUARTERS = [
  { name: 'Akwa',          district: 'douala',  lat: 4.0511, lng: 9.7679 },
  { name: 'Bonanjo',       district: 'douala',  lat: 4.0481, lng: 9.6965 },
  { name: 'Bali',          district: 'douala',  lat: 4.0637, lng: 9.7101 },
  { name: 'Deido',         district: 'douala',  lat: 4.0771, lng: 9.7417 },
  { name: 'New Bell',      district: 'douala',  lat: 4.0384, lng: 9.7147 },
  { name: 'Bepanda',       district: 'douala',  lat: 4.0691, lng: 9.7538 },
  { name: 'Makepe',        district: 'douala',  lat: 4.0817, lng: 9.7714 },
  { name: 'Bonamoussadi',  district: 'douala',  lat: 4.0921, lng: 9.7641 },
  { name: 'Bonabéri',      district: 'douala',  lat: 4.0576, lng: 9.6852 },
  { name: 'Banya-Sable',   district: 'douala',  lat: 4.0453, lng: 9.7312 },
  { name: 'Mokolo',        district: 'yaounde', lat: 3.8724, lng: 11.5143 },
  { name: 'Briqueterie',   district: 'yaounde', lat: 3.8841, lng: 11.5172 },
  { name: 'Mvog-Ada',      district: 'yaounde', lat: 3.8541, lng: 11.5101 },
  { name: 'Melen',         district: 'yaounde', lat: 3.8614, lng: 11.4987 },
  { name: 'Nlongkak',      district: 'yaounde', lat: 3.8781, lng: 11.5054 },
  { name: 'Tsinga',        district: 'yaounde', lat: 3.8831, lng: 11.5212 },
  { name: 'Obili',         district: 'yaounde', lat: 3.8641, lng: 11.4891 },
  { name: 'Biyem-Assi',    district: 'yaounde', lat: 3.8441, lng: 11.4847 }
];

// Hotspot score thresholds (FR-HOT-03)
const BANDS = [
  { label: 'low',      labelFr: 'Faible',   labelEn: 'Low',      min: 0,  max: 24, color: '#22c55e' },
  { label: 'moderate', labelFr: 'Modéré',   labelEn: 'Moderate', min: 25, max: 49, color: '#eab308' },
  { label: 'high',     labelFr: 'Élevé',    labelEn: 'High',     min: 50, max: 74, color: '#f97316' },
  { label: 'critical', labelFr: 'Critique', labelEn: 'Critical', min: 75, max: 100, color: '#ef4444' }
];

function getBand(score) {
  return BANDS.find(b => score >= b.min && score <= b.max) || BANDS[0];
}

// Major traffic junctions (Douala and Yaoundé - demo survey counts)
const TRAFFIC_JUNCTIONS = [
  { name: 'Carrefour Akwa (Douala)', lat: 4.0515, lng: 9.7685, vph: 1400, district: 'douala' },
  { name: 'Rond-Point Deido (Douala)', lat: 4.0775, lng: 9.7420, vph: 1850, district: 'douala' },
  { name: 'Carrefour Ndokoti (Douala)', lat: 4.0490, lng: 9.7450, vph: 1950, district: 'douala' },
  { name: 'Poste Centrale Bonanjo (Douala)', lat: 4.0485, lng: 9.6970, vph: 980, district: 'douala' },
  { name: 'Marché Mokolo (Yaoundé)', lat: 3.8728, lng: 11.5140, vph: 1600, district: 'yaounde' },
  { name: 'Poste Centrale (Yaoundé)', lat: 3.8680, lng: 11.5200, vph: 1720, district: 'yaounde' },
  { name: 'Carrefour Bastos (Yaoundé)', lat: 3.8900, lng: 11.5150, vph: 1100, district: 'yaounde' },
  { name: 'Carrefour Warda (Yaoundé)', lat: 3.8650, lng: 11.5120, vph: 1450, district: 'yaounde' }
];

// Global CC Namespace
window.CC = {
  FIREBASE_CONFIG, ADMIN_EMAIL, ADMIN_PASSWORD,
  AI_API_URL, AI_API_KEY, AI_MODEL, STT_API_URL,
  APP_VERSION, REFRESH_OFFICER, REFRESH_PUBLIC,
  DISTRICTS, QUARTERS, BANDS, TRAFFIC_JUNCTIONS, getBand
};
