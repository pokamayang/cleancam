// ============================================================
// CleanCam – Internationalisation (English & French)
// ============================================================
const TRANSLATIONS = {
  en: {
    // Nav
    nav_home:        'Home',
    nav_report:      'Report',
    nav_map:         'Map',
    nav_about:       'About',
    nav_login:       'Admin Login',
    nav_signup:      'Sign Up',
    nav_logout:      'Log Out',
    lang_toggle:     'Français',

    // Hero
    hero_title:      'CleanCam',
    hero_subtitle:   'AI-Powered Pollution Reporting & Monitoring for Cameroon',
    hero_cta1:       'Report Pollution',
    hero_cta2:       'View Hotspot Map',
    hero_badge:      'Hackathon Build · v1.0',

    // Stats strip
    stat_reports:    'Reports submitted',
    stat_resolved:   'Cases resolved',
    stat_hotspots:   'Active hotspots',
    stat_sensors:    'Live sensors',

    // How it works
    how_title:       'How CleanCam Works',
    how_1_title:     'Report',
    how_1_desc:      'Take a photo, record a voice note or call our free line – no internet needed.',
    how_2_title:     'AI Analysis',
    how_2_desc:      'Our AI classifies the type, severity and recommended actor instantly.',
    how_3_title:     'Council Action',
    how_3_desc:      'Officers receive the case on a live dashboard and assign a crew.',
    how_4_title:     'Resolution',
    how_4_desc:      'You get a status update and a reference code for every report.',

    // Report form
    report_title:    'New Report',
    report_type:     'Type of pollution',
    report_desc:     'Description',
    report_location: 'Where is it?',
    report_photo:    'Add photos (max 5)',
    report_voice:    'Record voice note',
    report_quarter:  'Select quarter',
    report_submit:   'Send report',
    report_offline:  'Saved. Will send when online.',
    report_ref:      'Your reference code is',
    report_success:  'Report submitted successfully!',

    // Report types
    type_plastic:    'Plastic waste',
    type_burning:    'Burning waste',
    type_dump:       'Open dump',
    type_water:      'Water contamination',
    type_smoke:      'Air / Smoke',
    type_dust:       'Dust',
    type_oil:        'Oil spill',
    type_drain:      'Drain blockage',
    type_other:      'Other',

    // Map
    map_title:       'Pollution Hotspot Map',
    map_estimated:   'Estimated (no direct data)',
    map_simulated:   'Simulated data',
    map_layer_air:   'Air sensors',
    map_layer_rep:   'Reports',
    map_layer_heat:  'Heatmap',
    map_layer_traf:  'Traffic',
    map_days_7:      'Last 7 days',
    map_days_30:     'Last 30 days',
    map_score:       'Score',
    map_band:        'Band',
    map_reports_7d:  'Reports (7 d)',
    map_pm25_avg:    'PM2.5 avg',
    map_drivers:     'Main drivers',

    // Risk bands
    risk_low:        'Low',
    risk_moderate:   'Moderate',
    risk_high:       'High',
    risk_critical:   'Critical',

    // Drain / sensor
    drain_warning:   'Flood warning for your area',
    sensor_online:   'Online',
    sensor_offline:  'Offline',
    sensor_sim:      'Simulated',
    sensor_pm25:     'PM2.5',
    sensor_pm10:     'PM10',
    sensor_water:    'Water level',
    sensor_blockage: 'Blockage score',
    sensor_flood:    'Flood risk',

    // Status
    status_submitted:   'Submitted',
    status_assigned:    'Assigned',
    status_in_progress: 'In progress',
    status_resolved:    'Resolved',
    status_rejected:    'Rejected',

    // Messages
    msg_title:       'Messages',
    msg_placeholder: 'Write a message…',
    msg_send:        'Send',

    // Dashboard
    dash_title:      'Officer Dashboard',
    dash_reports:    'Reports',
    dash_cases:      'Cases',
    dash_sensors:    'Sensors',
    dash_alerts:     'Alerts',
    dash_drainage:   'DrainageGuard',
    dash_export:     'Export CSV',
    dash_filter:     'Filter',
    dash_assign:     'Assign',
    dash_resolve:    'Resolve',
    dash_reject:     'Reject',
    dash_reply:      'Reply',

    // Auth
    auth_email:      'Email',
    auth_password:   'Password',
    auth_login:      'Log In',
    auth_signup:     'Create Account',
    auth_name:       'Full name',
    auth_phone:      'Phone (optional)',
    auth_lang:       'Preferred language',

    // Offline badge
    offline_badge:   'reports waiting to sync',
    offline_1:       'report waiting to sync',

    // Footer
    footer_rights:   '© 2026 CleanCam. Built for Cameroon.',
    footer_privacy:  'Privacy',
    footer_about:    'About',

    // IVR / call
    ivr_title:       'No internet? Call us',
    ivr_desc:        'Call our free line to report pollution or check a report status. English and French. Any phone.',

    // Misc
    loading:         'Loading…',
    error_generic:   'Something went wrong. Please try again.',
    label_indicative:'Indicative – not a certified measurement',
    confirm_quarter: 'Did you mean',
    yes: 'Yes', no: 'No',
    close: 'Close',
    back: 'Back',
    save: 'Save',
    cancel: 'Cancel',
  },

  fr: {
    nav_home:        'Accueil',
    nav_report:      'Signaler',
    nav_map:         'Carte',
    nav_about:       'À propos',
    nav_login:       'Connexion admin',
    nav_signup:      'S\'inscrire',
    nav_logout:      'Déconnexion',
    lang_toggle:     'English',

    hero_title:      'CleanCam',
    hero_subtitle:   'Signalement et surveillance de la pollution au Cameroun par l\'IA',
    hero_cta1:       'Signaler une pollution',
    hero_cta2:       'Voir la carte des points chauds',
    hero_badge:      'Prototype hackathon · v1.0',

    stat_reports:    'Signalements soumis',
    stat_resolved:   'Cas résolus',
    stat_hotspots:   'Points chauds actifs',
    stat_sensors:    'Capteurs en ligne',

    how_title:       'Comment fonctionne CleanCam',
    how_1_title:     'Signaler',
    how_1_desc:      'Prenez une photo, enregistrez un message vocal ou appelez notre ligne gratuite – sans internet.',
    how_2_title:     'Analyse par IA',
    how_2_desc:      'Notre IA classe le type, la gravité et l\'acteur recommandé instantanément.',
    how_3_title:     'Action du conseil',
    how_3_desc:      'Les agents reçoivent le dossier sur un tableau de bord en direct et affectent une équipe.',
    how_4_title:     'Résolution',
    how_4_desc:      'Vous recevez une mise à jour et un code de référence pour chaque signalement.',

    report_title:    'Nouveau signalement',
    report_type:     'Type de pollution',
    report_desc:     'Description',
    report_location: 'Où se trouve-t-il ?',
    report_photo:    'Ajouter des photos (max 5)',
    report_voice:    'Enregistrer un message vocal',
    report_quarter:  'Sélectionner le quartier',
    report_submit:   'Envoyer le signalement',
    report_offline:  'Enregistré. Envoi dès la connexion.',
    report_ref:      'Votre code de référence est',
    report_success:  'Signalement soumis avec succès !',

    type_plastic:    'Déchets plastiques',
    type_burning:    'Brûlage de déchets',
    type_dump:       'Décharge sauvage',
    type_water:      'Contamination de l\'eau',
    type_smoke:      'Air / Fumée',
    type_dust:       'Poussière',
    type_oil:        'Déversement d\'huile',
    type_drain:      'Caniveau bouché',
    type_other:      'Autre',

    map_title:       'Carte des points chauds de pollution',
    map_estimated:   'Estimé (pas de donnée directe)',
    map_simulated:   'Données simulées',
    map_layer_air:   'Capteurs air',
    map_layer_rep:   'Signalements',
    map_layer_heat:  'Carte de chaleur',
    map_layer_traf:  'Trafic',
    map_days_7:      '7 derniers jours',
    map_days_30:     '30 derniers jours',
    map_score:       'Score',
    map_band:        'Niveau',
    map_reports_7d:  'Signalements (7 j)',
    map_pm25_avg:    'PM2.5 moy.',
    map_drivers:     'Principaux facteurs',

    risk_low:        'Faible',
    risk_moderate:   'Modéré',
    risk_high:       'Élevé',
    risk_critical:   'Critique',

    drain_warning:   'Alerte d\'inondation pour votre quartier',
    sensor_online:   'En ligne',
    sensor_offline:  'Hors ligne',
    sensor_sim:      'Simulé',
    sensor_pm25:     'PM2.5',
    sensor_pm10:     'PM10',
    sensor_water:    'Niveau d\'eau',
    sensor_blockage: 'Score de blocage',
    sensor_flood:    'Risque d\'inondation',

    status_submitted:   'Soumis',
    status_assigned:    'Assigné',
    status_in_progress: 'En cours',
    status_resolved:    'Résolu',
    status_rejected:    'Rejeté',

    msg_title:       'Messages',
    msg_placeholder: 'Écrire un message…',
    msg_send:        'Envoyer',

    dash_title:      'Tableau de bord des agents',
    dash_reports:    'Signalements',
    dash_cases:      'Dossiers',
    dash_sensors:    'Capteurs',
    dash_alerts:     'Alertes',
    dash_drainage:   'DrainageGuard',
    dash_export:     'Exporter CSV',
    dash_filter:     'Filtrer',
    dash_assign:     'Assigner',
    dash_resolve:    'Résoudre',
    dash_reject:     'Rejeter',
    dash_reply:      'Répondre',

    auth_email:      'E-mail',
    auth_password:   'Mot de passe',
    auth_login:      'Se connecter',
    auth_signup:     'Créer un compte',
    auth_name:       'Nom complet',
    auth_phone:      'Téléphone (facultatif)',
    auth_lang:       'Langue préférée',

    offline_badge:   'signalements en attente de synchronisation',
    offline_1:       'signalement en attente de synchronisation',

    footer_rights:   '© 2026 CleanCam. Fait pour le Cameroun.',
    footer_privacy:  'Confidentialité',
    footer_about:    'À propos',

    ivr_title:       'Pas d\'internet ? Appelez-nous',
    ivr_desc:        'Appelez notre ligne gratuite pour signaler une pollution ou vérifier un signalement. Français et anglais. N\'importe quel téléphone.',

    loading:         'Chargement…',
    error_generic:   'Une erreur s\'est produite. Veuillez réessayer.',
    label_indicative:'Indicatif – pas une mesure certifiée',
    confirm_quarter: 'Vous voulez dire',
    yes: 'Oui', no: 'Non',
    close: 'Fermer',
    back: 'Retour',
    save: 'Enregistrer',
    cancel: 'Annuler',
  }
};

// Active language state
let currentLang = localStorage.getItem('cc_lang') || 'fr';

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
    || (TRANSLATIONS['en'] && TRANSLATIONS['en'][key])
    || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('cc_lang', lang);
  applyTranslations();
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.documentElement.lang = currentLang;
}

window.i18n = { t, setLang, applyTranslations, get lang() { return currentLang; } };
