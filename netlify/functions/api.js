// ============================================================
// API backend — Netlify Function
// Internat multi-bâtiments : bâtiments, tâches par zone et rotation.
// Stockage : Appwrite Databases (un document JSON par clé).
// ============================================================
const crypto = require('crypto');

const MAX_ADMINS_PER_HOUSEHOLD = 3;
const WORDS = ['RENARD', 'TIGRE', 'LOUTRE', 'FAUCON', 'ZEBRE', 'LYNX', 'PANDA', 'KOALA', 'IGUANE', 'ORQUE', 'PUMA', 'HERON', 'MARMOTTE', 'CIGOGNE', 'HIBOU'];
const COLORS = ['#3f6b5e', '#c98a2b', '#6b7fb5', '#b0503f', '#7a6b9e', '#4a8a8a'];

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'foyer-taches';
const APPWRITE_COLLECTION_ID = process.env.APPWRITE_COLLECTION_ID || 'foyer-taches';
let appwriteReady;

async function appwriteRequest(path, options = {}) {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) throw new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID et APPWRITE_API_KEY doivent être configurés côté serveur.');
  const response = await fetch(`${APPWRITE_ENDPOINT}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': APPWRITE_PROJECT_ID, 'X-Appwrite-Key': APPWRITE_API_KEY, ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  if (!response.ok) { const error = new Error(data.message || `Appwrite HTTP ${response.status}`); error.status = response.status; throw error; }
  return data;
}

async function ensureAppwrite() {
  if (appwriteReady) return appwriteReady;
  appwriteReady = (async () => {
    try { await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}`); } catch (error) {
      if (error.status !== 404) throw error;
      await appwriteRequest('/databases', { method: 'POST', body: JSON.stringify({ databaseId: APPWRITE_DATABASE_ID, name: 'Tâches ménagères', enabled: true }) });
    }
    try { await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}`); } catch (error) {
      if (error.status !== 404) throw error;
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections`, { method: 'POST', body: JSON.stringify({ collectionId: APPWRITE_COLLECTION_ID, name: 'Données de l’application', documentSecurity: false, enabled: true }) });
    }
    try { await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/attributes/data`); } catch (error) {
      if (error.status !== 404) throw error;
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/attributes/string`, { method: 'POST', body: JSON.stringify({ key: 'data', size: 1000000, required: true }) });
      for (let i = 0; i < 20; i++) { await new Promise(resolve => setTimeout(resolve, 250)); try { const a = await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/attributes/data`); if (a.status === 'available') break; } catch (_) {} }
    }
  })();
  try { await appwriteReady; } catch (error) { appwriteReady = null; throw error; }
}

function documentId(key) {
  if (key.startsWith('household:')) return `h_${crypto.createHash('sha256').update(key.slice(10)).digest('hex').slice(0, 34)}`;
  return key === 'households-index' ? key : key.replace(/:/g, '_');
}

async function getData(key) {
  await ensureAppwrite();
  const ids = [documentId(key)];
  if (key.startsWith('household:')) ids.push(`household_${key.slice(10)}`);
  for (const id of ids) {
    try {
      const doc = await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents/${encodeURIComponent(id)}`);
      const raw = doc.data && Object.prototype.hasOwnProperty.call(doc.data, 'data') ? doc.data.data : doc.data;
      if (raw === null || raw === undefined || raw === '') return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) { if (error.status !== 404) throw error; }
  }
  return null;
}

async function setData(key, value) {
  await ensureAppwrite();
  const id = documentId(key);
  const data = JSON.stringify(value);
  try { await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ data: { data } }) }); }
  catch (error) { if (error.status !== 404) throw error; await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents`, { method: 'POST', body: JSON.stringify({ documentId: id, data: { data } }) }); }
}
async function deleteData(key) { await ensureAppwrite(); try { await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents/${encodeURIComponent(documentId(key))}`, { method: 'DELETE' }); } catch (error) { if (error.status !== 404) throw error; } }
function json(status, data) { return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' }, body: JSON.stringify(data) }; }
function uid() { return crypto.randomUUID(); }
function genCode() { return `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${1000 + Math.floor(Math.random() * 9000)}`; }
function hashPin(pin) { const salt = crypto.randomBytes(8).toString('hex'); return `${salt}:${crypto.scryptSync(String(pin), salt, 32).toString('hex')}`; }
function verifyPin(pin, stored) { if (!stored || !stored.includes(':')) return false; const [salt, hash] = stored.split(':'); const check = crypto.scryptSync(String(pin), salt, 32).toString('hex'); return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex')); }

function normalizeHousehold(h) {
  const fallback = { id: 'building-default', name: 'Bâtiment principal', common: false };
  if (!Array.isArray(h.buildings) || h.buildings.length === 0) h.buildings = [fallback];
  h.buildings = h.buildings.map(b => ({ id: b.id || uid(), name: b.name || 'Bâtiment sans nom', common: !!b.common }));
  const defaultBuilding = h.buildings.find(b => !b.common) || fallback;
  if (!h.buildings.some(b => b.id === defaultBuilding.id)) h.buildings.unshift(defaultBuilding);
  const residentialIds = new Set(h.buildings.filter(b => !b.common).map(b => b.id));
  const buildingIds = new Set(h.buildings.map(b => b.id));
  if (!Array.isArray(h.admins)) h.admins = [];
  h.admins = h.admins.map(a => ({ ...a, buildingId: buildingIds.has(a.buildingId) ? a.buildingId : '' }));
  if (!Array.isArray(h.persons)) h.persons = [];
  h.persons = h.persons.map((p, i) => ({ ...p, color: p.color || COLORS[i % COLORS.length], present: p.present !== false, buildingId: residentialIds.has(p.buildingId) ? p.buildingId : defaultBuilding.id }));
  if (!Array.isArray(h.tasks)) h.tasks = [];
  h.tasks = h.tasks.map(t => ({ ...t, buildingId: buildingIds.has(t.buildingId) ? t.buildingId : defaultBuilding.id, assignmentMode: t.assignmentMode || (t.assigneeId ? 'manual' : ''), validationStatus: t.validationStatus || (t.completed ? 'validated' : 'assigned') }));
  if (!Array.isArray(h.history)) h.history = [];
  if (!h.weeklyRotation || typeof h.weeklyRotation !== 'object') h.weeklyRotation = { key: '', indexByBuilding: {} };
  if (typeof h.rotationOffset !== 'number') h.rotationOffset = 0;
  return h;
}
async function getHousehold(code) { const h = await getData(`household:${code}`); return h ? normalizeHousehold(h) : null; }
async function saveHousehold(h) { normalizeHousehold(h); h.updatedAt = new Date().toISOString(); await setData(`household:${h.code}`, h); }
async function getIndex() { return (await getData('households-index')) || []; }
async function saveIndex(idx) { await setData('households-index', idx); }

async function createSession(payload) { const encoded = Buffer.from(JSON.stringify({ ...payload, createdAt: Date.now() })).toString('base64url'); const signature = crypto.createHmac('sha256', APPWRITE_API_KEY).update(encoded).digest('base64url'); return `${encoded}.${signature}`; }
async function getSession(token) { if (!token || !APPWRITE_API_KEY) return null; const [encoded, signature] = String(token).split('.'); if (!encoded || !signature) return null; const expected = crypto.createHmac('sha256', APPWRITE_API_KEY).update(encoded).digest('base64url'); const a = Buffer.from(signature), b = Buffer.from(expected); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch (_) { return null; } }
function publicHousehold(h) { return { code: h.code, name: h.name, createdAt: h.createdAt, buildings: h.buildings, admins: h.admins.map(a => ({ id: a.id, name: a.name, buildingId: a.buildingId || '' })), persons: h.persons, tasks: h.tasks, history: h.history, weeklyRotation: h.weeklyRotation }; }
function canValidateTask(h, session, task) { const admin = h.admins.find(a => a.id === session?.adminId); return !!admin && (!admin.buildingId || admin.buildingId === task.buildingId); }
function isoWeek(date = new Date()) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`; }
function weekOfMonth(date = new Date()) { return Math.ceil(date.getDate() / 7); }
function activePeople(h, buildingId) { return h.persons.filter(p => p.present && p.buildingId === buildingId); }

function distribute(h) {
  normalizeHousehold(h);
  const weekKey = isoWeek();
  const newWeek = !h.weeklyRotation || h.weeklyRotation.key !== weekKey;
  if (newWeek) h.weeklyRotation = { key: weekKey, indexByBuilding: {} };
  const commonBuildings = h.buildings.filter(b => b.common);
  const normalBuildings = h.buildings.filter(b => !b.common);
  if (newWeek) h.tasks.filter(t => !t.completed && t.assignmentMode === 'auto').forEach(t => { t.assigneeId = ''; t.assignmentMode = ''; });
  const pending = h.tasks.filter(t => !t.completed && t.assignmentMode !== 'manual' && !t.assigneeId);
  const assignedAuto = new Set(h.tasks.filter(t => !t.completed && t.assignmentMode === 'auto' && t.assigneeId).map(t => t.assigneeId));
  const assignments = [];
  const blockedByManual = new Set(h.tasks.filter(t => !t.completed && t.assignmentMode === 'manual' && t.assigneeId).map(t => t.assigneeId));
  const usedForCommonThisRun = new Set(h.tasks.filter(t => !t.completed && t.assignmentMode === 'auto' && commonBuildings.some(b => b.id === t.buildingId) && t.assigneeId).map(t => t.assigneeId));
  const normalTasks = pending.filter(t => !commonBuildings.some(b => b.id === t.buildingId));
  const commonTasks = pending.filter(t => commonBuildings.some(b => b.id === t.buildingId));
  const deficient = new Set(normalBuildings.filter(b => activePeople(h, b.id).length < h.tasks.filter(t => !t.completed && t.buildingId === b.id).length).map(b => b.id));
  const eligibleBuildings = normalBuildings.filter(b => !deficient.has(b.id));
  const monthlyDeficitBuildings = weekOfMonth() === 1 ? normalBuildings.filter(b => deficient.has(b.id)) : [];
  const monthlyUsed = new Set();
  const choosePerson = (building, avoid = new Set()) => {
    const people = activePeople(h, building.id).filter(p => !blockedByManual.has(p.id) && !avoid.has(p.id));
    if (!people.length) return null;
    const index = Number(h.weeklyRotation.indexByBuilding[building.id] || 0) % people.length;
    const person = people[index];
    h.weeklyRotation.indexByBuilding[building.id] = index + 1;
    return person;
  };
  commonTasks.forEach((task, i) => {
    const preferredSources = [...eligibleBuildings, ...monthlyDeficitBuildings.filter(b => !monthlyUsed.has(b.id))];
    const sources = preferredSources.length ? preferredSources : normalBuildings.filter(b => activePeople(h, b.id).some(p => !blockedByManual.has(p.id)));
    if (!sources.length) return;
    const building = sources.slice(i % sources.length).concat(sources.slice(0, i % sources.length)).find(candidate => activePeople(h, candidate.id).some(p => !blockedByManual.has(p.id) && !usedForCommonThisRun.has(p.id) && !assignedAuto.has(p.id)));
    if (!building) return;
    const person = choosePerson(building, new Set([...usedForCommonThisRun, ...assignedAuto]));
    if (!person) return;
    if (deficient.has(building.id)) monthlyUsed.add(building.id);
    task.assigneeId = person.id; task.assignmentMode = 'auto'; usedForCommonThisRun.add(person.id); assignedAuto.add(person.id);
    assignments.push({ taskId: task.id, taskText: task.text, personId: person.id, personName: person.name, fromBuildingId: person.buildingId, fromBuildingName: building.name, buildingId: task.buildingId, buildingName: commonBuildings.find(b => b.id === task.buildingId)?.name || 'Bâtiment commun', mode: 'auto' });
  });
  normalTasks.forEach(task => {
    const building = normalBuildings.find(b => b.id === task.buildingId);
    if (!building) return;
    let sourceBuilding = building;
    let person = choosePerson(building, assignedAuto);
    if (!person) {
      sourceBuilding = normalBuildings.find(candidate => candidate.id !== building.id && activePeople(h, candidate.id).some(p => !blockedByManual.has(p.id) && !assignedAuto.has(p.id))) || building;
      person = sourceBuilding === building ? null : choosePerson(sourceBuilding, assignedAuto);
    }
    if (!person) return;
    task.assigneeId = person.id; task.assignmentMode = 'auto'; assignedAuto.add(person.id);
    assignments.push({ taskId: task.id, taskText: task.text, personId: person.id, personName: person.name, fromBuildingId: person.buildingId, fromBuildingName: sourceBuilding.name, buildingId: task.buildingId, buildingName: building.name, mode: sourceBuilding.id === building.id ? 'auto' : 'auto-overflow' });
  });
  const unassignedTaskIds = h.tasks.filter(t => !t.completed && !t.assigneeId).map(t => t.id);
  const assignedPeople = new Set([...blockedByManual, ...assignedAuto]);
  const activePeopleCount = h.persons.filter(p => p.present).length;
  const remainingPeopleCount = h.persons.filter(p => p.present && !assignedPeople.has(p.id)).length;
  const totalAssignedCount = h.tasks.filter(t => !t.completed && !!t.assigneeId).length;
  const assignmentSnapshot = h.tasks.filter(t => !t.completed && t.assigneeId).map(task => {
    const person = h.persons.find(p => p.id === task.assigneeId);
    const sourceBuilding = normalBuildings.find(b => b.id === person?.buildingId) || h.buildings.find(b => b.id === person?.buildingId);
    const targetBuilding = h.buildings.find(b => b.id === task.buildingId);
    return { taskId: task.id, taskText: task.text, personId: task.assigneeId, personName: person?.name || 'Personne supprimée', fromBuildingId: person?.buildingId || '', fromBuildingName: sourceBuilding?.name || 'Bâtiment inconnu', buildingId: task.buildingId, buildingName: targetBuilding?.name || 'Bâtiment inconnu', mode: task.assignmentMode || 'manuel', completionComment: task.completionComment || '' };
  });
  h.history.push({ id: uid(), date: new Date().toISOString(), weekKey, assignments: assignmentSnapshot, newAssignments: assignments.length, totalAssignedCount, unassignedTaskIds, remainingPeopleCount, deficientBuildingIds: [...deficient], commonBuildingIds: commonBuildings.map(b => b.id) });
  return { assignments: assignmentSnapshot, newAssignments: assignments.length, totalAssignedCount, unassignedTaskIds, remainingPeopleCount, activePeopleCount, deficient: normalBuildings.filter(b => deficient.has(b.id)).map(b => b.name), weekKey };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  const path = event.path.replace(/^\/.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
  const method = event.httpMethod;
  let body = {}; try { body = event.body ? JSON.parse(event.body) : {}; } catch (_) {}
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  async function requireAdmin(code) { const s = await getSession(token); return s && s.code === code && s.role === 'admin' ? s : null; }
  async function requireAny(code) { const s = await getSession(token); return s && s.code === code ? s : null; }
  try {
    let m;
    if (path === '/dev/login' && method === 'POST') { if (!process.env.DEV_PASSWORD) return json(500, { error: 'DEV_PASSWORD non configuré.' }); if (body.password !== process.env.DEV_PASSWORD) return json(401, { error: 'Mot de passe incorrect.' }); return json(200, { token: await createSession({ dev: true }) }); }
    if (path === '/dev/households' && method === 'GET') { const s = await getSession(token); if (!s?.dev) return json(401, { error: 'Non autorisé.' }); const idx = await getIndex(), details = []; for (const e of idx) { const h = await getHousehold(e.code); if (h) details.push({ code: h.code, name: h.name, createdAt: h.createdAt, buildings: h.buildings.length, admins: h.admins.length, persons: h.persons.length, tasks: h.tasks.length, history: h.history.length }); } return json(200, { households: details }); }
    if ((m = path.match(/^\/dev\/households\/([^/]+)$/)) && method === 'DELETE') { const s = await getSession(token); if (!s?.dev) return json(401, { error: 'Non autorisé.' }); await deleteData(`household:${m[1]}`); await saveIndex((await getIndex()).filter(e => e.code !== m[1])); return json(200, { deleted: true }); }
    if (path === '/households' && method === 'POST') { const { householdName, adminName, pin } = body; if (!householdName || !adminName || !pin) return json(400, { error: 'Champs manquants.' }); const building = { id: uid(), name: 'Bâtiment principal', common: false }; const admin = { id: uid(), name: adminName, pinHash: hashPin(pin) }; const h = { code: genCode(), name: householdName, createdAt: new Date().toISOString(), buildings: [building], admins: [admin], persons: [], tasks: [], history: [], rotationOffset: 0, weeklyRotation: { key: '', indexByBuilding: {} } }; await saveHousehold(h); const idx = await getIndex(); idx.push({ code: h.code, name: h.name, createdAt: h.createdAt }); await saveIndex(idx); return json(200, { code: h.code, token: await createSession({ code: h.code, role: 'admin', adminId: admin.id }), household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/exists$/)) && method === 'GET') { const h = await getHousehold(m[1]); if (!h) return json(404, { exists: false }); return json(200, { exists: true, name: h.name, admins: h.admins.map(a => ({ id: a.id, name: a.name })) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/login$/)) && method === 'POST') { const h = await getHousehold(m[1]); if (!h) return json(404, { error: 'Internat introuvable.' }); const a = h.admins.find(x => x.id === body.adminId); if (!a || !verifyPin(body.pin, a.pinHash)) return json(401, { error: 'Code incorrect.' }); return json(200, { token: await createSession({ code: h.code, role: 'admin', adminId: a.id }) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/login-exec$/)) && method === 'POST') { const h = await getHousehold(m[1]); if (!h) return json(404, { error: 'Internat introuvable.' }); return json(200, { token: await createSession({ code: h.code, role: 'exec' }) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/data$/)) && method === 'GET') { const s = await requireAny(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); if (!h) return json(404, { error: 'Internat introuvable.' }); return json(200, { household: publicHousehold(h), role: s.role, adminId: s.adminId || null }); }

    if ((m = path.match(/^\/households\/([^/]+)\/buildings$/)) && method === 'POST') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); if (!body.name?.trim()) return json(400, { error: 'Nom du bâtiment manquant.' }); h.buildings.push({ id: uid(), name: body.name.trim(), common: !!body.common }); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/buildings\/([^/]+)$/)) && method === 'PATCH') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); const b = h.buildings.find(x => x.id === m[2]); if (!b) return json(404, { error: 'Bâtiment introuvable.' }); if (body.name?.trim()) b.name = body.name.trim(); if (typeof body.common === 'boolean') b.common = body.common; if (b.common && h.persons.some(p => p.buildingId === b.id)) return json(400, { error: 'Un bâtiment commun ne peut pas contenir de résidents.' }); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/buildings\/([^/]+)$/)) && method === 'DELETE') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); if (h.buildings.length <= 1) return json(400, { error: 'Il faut garder au moins un bâtiment.' }); if (h.persons.some(p => p.buildingId === m[2]) || h.tasks.some(t => t.buildingId === m[2])) return json(400, { error: 'Réaffecte d’abord les personnes et les tâches de ce bâtiment.' }); h.buildings = h.buildings.filter(x => x.id !== m[2]); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }

    if ((m = path.match(/^\/households\/([^/]+)\/persons$/)) && method === 'POST') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); const b = h.buildings.find(x => x.id === body.buildingId && !x.common); if (!b || !body.name?.trim()) return json(400, { error: 'Choisis un nom et un bâtiment non commun.' }); const used = h.persons.map(p => p.color); const color = COLORS.find(c => !used.includes(c)) || COLORS[h.persons.length % COLORS.length]; h.persons.push({ id: uid(), name: body.name.trim(), color, present: true, buildingId: b.id }); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/persons\/([^/]+)$/)) && method === 'DELETE') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); h.persons = h.persons.filter(p => p.id !== m[2]); h.tasks = h.tasks.map(t => t.assigneeId === m[2] ? { ...t, assigneeId: '', assignmentMode: '' } : t); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/persons\/([^/]+)$/)) && method === 'PATCH') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); const p = h.persons.find(x => x.id === m[2]); if (!p) return json(404, { error: 'Personne introuvable.' }); if (typeof body.present === 'boolean') p.present = body.present; if (body.buildingId) { const b = h.buildings.find(x => x.id === body.buildingId && !x.common); if (!b) return json(400, { error: 'Un résident doit appartenir à un bâtiment non commun.' }); p.buildingId = b.id; } await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }

    if ((m = path.match(/^\/households\/([^/]+)\/tasks$/)) && method === 'POST') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); if (!body.text?.trim() || !h.buildings.some(b => b.id === body.buildingId)) return json(400, { error: 'La tâche et son bâtiment sont obligatoires.' }); const manual = !!body.assigneeId; if (manual && !h.persons.some(p => p.id === body.assigneeId)) return json(400, { error: 'Personne affectée introuvable.' }); h.tasks.push({ id: uid(), text: body.text.trim(), buildingId: body.buildingId, assigneeId: body.assigneeId || '', assignmentMode: manual ? 'manual' : '', completed: false }); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/tasks\/([^/]+)$/)) && method === 'DELETE') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); h.tasks = h.tasks.filter(t => t.id !== m[2]); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/tasks\/([^/]+)$/)) && method === 'PATCH') { const s = await requireAdmin(m[1]); const any = await requireAny(m[1]); if (!any) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); const t = h.tasks.find(x => x.id === m[2]); if (!t) return json(404, { error: 'Tâche introuvable.' }); if (Object.prototype.hasOwnProperty.call(body, 'validationStatus')) { if (!s || !canValidateTask(h, s, t) || !['assigned', 'declared', 'validated', 'rejected'].includes(body.validationStatus)) return json(403, { error: 'Ce responsable ne peut pas vérifier cette tâche.' }); t.validationStatus = body.validationStatus; t.completed = body.validationStatus === 'validated'; if (body.validationStatus === 'declared') t.completionDeclaredAt = new Date().toISOString(); if (body.validationStatus === 'validated') t.validatedAt = new Date().toISOString(); } else if (typeof body.completed === 'boolean') { if (s) { if (!canValidateTask(h, s, t)) return json(403, { error: 'Ce responsable ne peut pas valider cette tâche.' }); t.completed = body.completed; t.validationStatus = body.completed ? 'validated' : 'assigned'; if (body.completed) t.validatedAt = new Date().toISOString(); } else if (body.completed && !t.completed) { t.completed = false; t.validationStatus = 'declared'; t.completionDeclaredAt = new Date().toISOString(); t.completionComment = typeof body.completionComment === 'string' ? body.completionComment.trim().slice(0, 500) : ''; } } if (s && Object.prototype.hasOwnProperty.call(body, 'assigneeId')) { if (body.assigneeId && !h.persons.some(p => p.id === body.assigneeId)) return json(400, { error: 'Personne affectée introuvable.' }); t.assigneeId = body.assigneeId || ''; t.assignmentMode = t.assigneeId ? 'manual' : ''; if (!t.assigneeId) t.validationStatus = 'assigned'; } await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }

    if ((m = path.match(/^\/households\/([^/]+)\/distribute$/)) && method === 'POST') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); const result = distribute(h); await saveHousehold(h); return json(200, { household: publicHousehold(h), distribution: result }); }
    if ((m = path.match(/^\/households\/([^/]+)\/history$/)) && method === 'DELETE') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); h.history = []; await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }

    if ((m = path.match(/^\/households\/([^/]+)\/admins\/([^/]+)\/pin$/)) && method === 'PATCH') { const s = await requireAdmin(m[1]); if (!s || s.adminId !== m[2]) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); const a = h.admins.find(x => x.id === m[2]); if (!a || !verifyPin(body.currentPin, a.pinHash)) return json(401, { error: 'Code actuel incorrect.' }); a.pinHash = hashPin(body.newPin); await saveHousehold(h); return json(200, { ok: true }); }
    if ((m = path.match(/^\/households\/([^/]+)\/admins$/)) && method === 'POST') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); if (h.admins.length >= MAX_ADMINS_PER_HOUSEHOLD) return json(400, { error: `Maximum ${MAX_ADMINS_PER_HOUSEHOLD} responsables.` }); if (body.buildingId && !h.buildings.some(b => b.id === body.buildingId)) return json(400, { error: 'Bâtiment du responsable introuvable.' }); h.admins.push({ id: uid(), name: body.name, pinHash: hashPin(body.pin), buildingId: body.buildingId || '' }); await saveHousehold(h); return json(200, { household: publicHousehold(h) }); }
    if ((m = path.match(/^\/households\/([^/]+)\/admins\/([^/]+)$/)) && method === 'DELETE') { const s = await requireAdmin(m[1]); if (!s) return json(401, { error: 'Non autorisé.' }); const h = await getHousehold(m[1]); if (h.admins.length <= 1) return json(400, { error: 'Il faut garder au moins un responsable.' }); const wasMe = m[2] === s.adminId; h.admins = h.admins.filter(a => a.id !== m[2]); await saveHousehold(h); return json(200, { household: publicHousehold(h), loggedOut: wasMe }); }
    return json(404, { error: `Route inconnue : ${method} ${path}` });
  } catch (err) { console.error('API error:', err && err.message ? err.message : String(err)); return json(500, { error: 'Erreur serveur.', detail: String((err && err.message) || err) }); }
};
