// ============================================================
// CleanCam – Supabase client
// Real project: sevqgiaxpgodbfimgzrn.supabase.co
// ============================================================

const SUPABASE_URL     = 'https://sevqgiaxpgodbfimgzrn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_stSVBUjFBa-qSw3tofFs-w_mJViWttI';

let _sb = null;

function getSupabase() {
  if (_sb) return _sb;
  if (!window.supabase) { console.error('Supabase JS SDK not loaded'); return null; }
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return _sb;
}

// ── Auth ─────────────────────────────────────────────────────
async function signUp(email, password, meta = {}) {
  const { data, error } = await getSupabase().auth.signUp({ email, password, options: { data: meta } });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await getSupabase().auth.signOut();
}

async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

// ── Reports ──────────────────────────────────────────────────

/**
 * Create or update a report (idempotent on client_id)
 */
async function createReport(payload) {
  // Generate reference if not set
  if (!payload.reference) payload.reference = generateRef();

  const { data, error } = await getSupabase()
    .from('reports')
    .upsert(payload, { onConflict: 'client_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getMyReports(userId) {
  let q = getSupabase()
    .from('reports')
    .select('id,reference,type,status,created_at,quarter,district,location_source,lat,lng,severity,channel,needs_human_review')
    .order('created_at', { ascending: false })
    .limit(20);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function getReportById(id) {
  const { data, error } = await getSupabase()
    .from('reports')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function getAllReports(filters = {}) {
  let q = getSupabase()
    .from('reports')
    .select('id,reference,type,status,severity,channel,quarter,district,lat,lng,created_at,needs_human_review,description,ai_result,incomplete')
    .order('created_at', { ascending: false });
  if (filters.status   && filters.status   !== 'all') q = q.eq('status',   filters.status);
  if (filters.type     && filters.type     !== 'all') q = q.eq('type',     filters.type);
  if (filters.district && filters.district !== 'all') q = q.eq('district', filters.district);
  if (filters.channel  && filters.channel  !== 'all') q = q.eq('channel',  filters.channel);
  if (filters.review) q = q.eq('needs_human_review', true);
  const { data, error } = await q.limit(300);
  if (error) throw error;
  return data || [];
}

async function updateReportStatus(id, toStatus, reason, actorId) {
  const sb = getSupabase();
  const { data: rep } = await sb.from('reports').select('status').eq('id', id).single();
  const { error } = await sb.from('reports').update({ status: toStatus }).eq('id', id);
  if (error) throw error;
  await sb.from('status_log').insert({
    report_id:   id,
    from_status: rep?.status,
    to_status:   toStatus,
    actor_id:    actorId || null,
    reason:      reason || null
  });
}

async function getStatusLog(reportId) {
  const { data, error } = await getSupabase()
    .from('status_log')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

// ── Media ────────────────────────────────────────────────────
async function uploadFile(bucket, path, file) {
  const sb = getSupabase();
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function insertMedia(payload) {
  const { data, error } = await getSupabase().from('report_media').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function getMediaForReport(reportId) {
  const { data, error } = await getSupabase()
    .from('report_media')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

// ── Messages ─────────────────────────────────────────────────
async function getMessages(reportId) {
  const { data, error } = await getSupabase()
    .from('report_messages')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

async function sendMessage(payload) {
  const { data, error } = await getSupabase().from('report_messages').insert(payload).select().single();
  if (error) throw error;
  return data;
}

function subscribeToMessages(reportId, callback) {
  return getSupabase()
    .channel('messages_' + reportId)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'report_messages',
      filter: `report_id=eq.${reportId}`
    }, payload => callback(payload.new))
    .subscribe();
}

function subscribeToReports(callback) {
  return getSupabase()
    .channel('reports_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, payload => callback(payload))
    .subscribe();
}

function subscribeToAlerts(callback) {
  return getSupabase()
    .channel('alerts_live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, payload => callback(payload.new))
    .subscribe();
}

// ── Hotspots ─────────────────────────────────────────────────
async function getHotspots(district) {
  const { data, error } = await getSupabase()
    .from('hotspot_cells')
    .select('*')
    .eq('district', district);
  if (error) throw error;
  return data || [];
}

// ── Devices / Sensors ────────────────────────────────────────
async function getAllDevices() {
  const { data, error } = await getSupabase().from('devices').select('*');
  if (error) throw error;
  return data || [];
}

async function getDevicesByDistrict(district) {
  const { data, error } = await getSupabase().from('devices').select('*').eq('district', district);
  if (error) throw error;
  return data || [];
}

async function getReadingsSeries(deviceId, hours = 24) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data, error } = await getSupabase()
    .from('sensor_readings')
    .select('ts,pm25,pm10,water_level_cm,battery_v,temperature_c,simulated')
    .eq('device_id', deviceId)
    .gte('ts', since)
    .order('ts');
  if (error) throw error;
  return data || [];
}

async function getLatestReading(deviceId) {
  const { data, error } = await getSupabase()
    .from('sensor_readings')
    .select('*')
    .eq('device_id', deviceId)
    .order('ts', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

// ── Alerts ───────────────────────────────────────────────────
async function getAlerts() {
  const { data, error } = await getSupabase()
    .from('alerts')
    .select('*')
    .is('acknowledged_by', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function getAllAlerts() {
  const { data, error } = await getSupabase()
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

async function acknowledgeAlert(id, userId) {
  const { error } = await getSupabase().from('alerts').update({ acknowledged_by: userId || '00000000-0000-0000-0000-000000000000' }).eq('id', id);
  if (error) throw error;
}

// ── Dashboard stats ──────────────────────────────────────────
async function getStats() {
  const sb = getSupabase();
  const [
    { count: totalReports },
    { count: resolvedReports },
    { count: activeHotspots },
    { count: sensorsOnline },
    { count: pendingAlerts },
    { count: reviewNeeded }
  ] = await Promise.all([
    sb.from('reports').select('id', { count: 'exact', head: true }),
    sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
    sb.from('hotspot_cells').select('id', { count: 'exact', head: true }).gte('score', 50),
    sb.from('devices').select('id', { count: 'exact', head: true }).eq('status', 'online'),
    sb.from('alerts').select('id', { count: 'exact', head: true }).is('acknowledged_by', null),
    sb.from('reports').select('id', { count: 'exact', head: true }).eq('needs_human_review', true)
  ]);
  return { totalReports, resolvedReports, activeHotspots, sensorsOnline, pendingAlerts, reviewNeeded };
}

// ── CSV Export ───────────────────────────────────────────────
async function exportReportsCSV(filters = {}) {
  const reports = await getAllReports(filters);
  const headers = ['reference','type','status','severity','channel','quarter','district','lat','lng','description','created_at','needs_human_review'];
  const rows = reports.map(r => headers.map(h => {
    const v = r[h] ?? '';
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// Expose globally
window.db = {
  getSupabase, signUp, signIn, signOut, getSession, getUser,
  createReport, getMyReports, getReportById, getAllReports, updateReportStatus, getStatusLog,
  uploadFile, insertMedia, getMediaForReport,
  getMessages, sendMessage, subscribeToMessages, subscribeToReports, subscribeToAlerts,
  getHotspots, getAllDevices, getDevicesByDistrict, getReadingsSeries, getLatestReading,
  getAlerts, getAllAlerts, acknowledgeAlert,
  getStats, exportReportsCSV
};
