// ============================================================
// API backend — Netlify Function
// Toutes les routes /api/* passent par ici (voir netlify.toml).
// Stockage : Appwrite Databases (un document JSON par clé).
// ============================================================
const crypto = require('crypto');

const STORE_NAME = 'foyer-taches';
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
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    throw new Error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID et APPWRITE_API_KEY doivent être configurés côté serveur.');
  }
  const response = await fetch(`${APPWRITE_ENDPOINT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      'X-Appwrite-Key': APPWRITE_API_KEY,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  if (!response.ok) {
    const error = new Error(data.message || `Appwrite HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function ensureAppwrite() {
  if (appwriteReady) return appwriteReady;
  appwriteReady = (async () => {
    try {
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      await appwriteRequest('/databases', {
        method: 'POST',
        body: JSON.stringify({ databaseId: APPWRITE_DATABASE_ID, name: 'Tâches ménagères', enabled: true })
      });
    }
    try {
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections`, {
        method: 'POST',
        body: JSON.stringify({ collectionId: APPWRITE_COLLECTION_ID, name: 'Données de l’application', documentSecurity: false, enabled: true })
      });
    }
    try {
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/attributes/data`);
    } catch (error) {
      if (error.status !== 404) throw error;
      await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/attributes/string`, {
        method: 'POST',
        body: JSON.stringify({ key: 'data', size: 1000000, required: true })
      });
      // Appwrite crée les attributs de façon asynchrone.
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        try {
          const attribute = await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/attributes/data`);
          if (attribute.status === 'available') break;
        } catch (_) {}
      }
    }
  })();
  try { await appwriteReady; } catch (error) { appwriteReady = null; throw error; }
}

function documentId(key) {
  if (key.startsWith('session:')) {
    return `s_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 34)}`;
  }
  return key === 'households-index' ? 'households-index' : key.replace(/:/g, '_');
}

async function getData(key) {
  await ensureAppwrite();
  try {
    const doc = await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents/${encodeURIComponent(documentId(key))}`);
    return doc.data && doc.data.data ? JSON.parse(doc.data.data) : null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function setData(key, value) {
  await ensureAppwrite();
  const id = documentId(key);
  const data = JSON.stringify(value);
  try {
    await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ data: { data } }) });
  } catch (error) {
    if (error.status !== 404) throw error;
    await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents`, { method: 'POST', body: JSON.stringify({ documentId: id, data: { data } }) });
  }
}

async function deleteData(key) {
  await ensureAppwrite();
  try {
    await appwriteRequest(`/databases/${APPWRITE_DATABASE_ID}/collections/${APPWRITE_COLLECTION_ID}/documents/${encodeURIComponent(documentId(key))}`, { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

function json(status, data) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function uid() {
  return crypto.randomUUID();
}

function genCode() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = 1000 + Math.floor(Math.random() * 9000);
  return `${word}-${num}`;
}

// --- Hachage des codes PIN : jamais stockés ni renvoyés en clair ---
function hashPin(pin) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// --- Accès aux données ---
async function getHousehold(code) {
  return await getData(`household:${code}`);
}
async function saveHousehold(h) {
  h.updatedAt = new Date().toISOString();
  await setData(`household:${h.code}`, h);
}
async function getIndex() {
  return (await getData('households-index')) || [];
}
async function saveIndex(idx) {
  await setData('households-index', idx);
}

// --- Sessions : un jeton aléatoire -> { code, role, adminId } ---
async function createSession(payload) {
  const token = crypto.randomBytes(24).toString('hex');
  await setData(`session:${token}`, { ...payload, createdAt: Date.now() });
  return token;
}
async function getSession(token) {
  if (!token) return null;
  return await getData(`session:${token}`);
}

// --- Ne jamais renvoyer les hachages de PIN au client ---
function publicHousehold(h) {
  return {
    code: h.code,
    name: h.name,
    createdAt: h.createdAt,
    admins: h.admins.map(a => ({ id: a.id, name: a.name })),
    persons: h.persons,
    tasks: h.tasks,
    history: h.history
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
  const method = event.httpMethod;
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { body = {}; }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  async function requireAdmin(code) {
    const session = await getSession(token);
    if (!session || session.code !== code || session.role !== 'admin') return null;
    return session;
  }
  async function requireAny(code) {
    const session = await getSession(token);
    if (!session || session.code !== code) return null;
    return session;
  }

  try {
    let m;

    // ================= Développeur =================
    if (path === '/dev/login' && method === 'POST') {
      if (!process.env.DEV_PASSWORD) return json(500, { error: "DEV_PASSWORD n'est pas configuré côté serveur." });
      if (body.password !== process.env.DEV_PASSWORD) return json(401, { error: 'Mot de passe incorrect.' });
      const devToken = await createSession({ dev: true });
      return json(200, { token: devToken });
    }

    if (path === '/dev/households' && method === 'GET') {
      const session = await getSession(token);
      if (!session || !session.dev) return json(401, { error: 'Non autorisé.' });
      const idx = await getIndex();
      const details = [];
      for (const entry of idx) {
        const h = await getHousehold(entry.code);
        if (h) {
          details.push({
            code: h.code, name: h.name, createdAt: h.createdAt,
            admins: h.admins.length, persons: h.persons.length,
            tasks: h.tasks.length, history: h.history.length
          });
        }
      }
      return json(200, { households: details });
    }

    if ((m = path.match(/^\/dev\/households\/([^/]+)$/)) && method === 'DELETE') {
      const session = await getSession(token);
      if (!session || !session.dev) return json(401, { error: 'Non autorisé.' });
      const code = m[1];
      await deleteData(`household:${code}`);
      let idx = await getIndex();
      idx = idx.filter(e => e.code !== code);
      await saveIndex(idx);
      return json(200, { deleted: true });
    }

    // ================= Créer un foyer =================
    if (path === '/households' && method === 'POST') {
      const { householdName, adminName, pin } = body;
      if (!householdName || !adminName || !pin) return json(400, { error: 'Champs manquants.' });
      const code = genCode();
      const admin = { id: uid(), name: adminName, pinHash: hashPin(pin) };
      const household = {
        code, name: householdName, createdAt: new Date().toISOString(),
        admins: [admin], persons: [], tasks: [], history: [], rotationOffset: 0
      };
      await saveHousehold(household);
      const idx = await getIndex();
      idx.push({ code, name: householdName, createdAt: household.createdAt });
      await saveIndex(idx);
      const sessionToken = await createSession({ code, role: 'admin', adminId: admin.id });
      return json(200, { code, token: sessionToken, household: publicHousehold(household) });
    }

    // ================= Vérifier qu'un code existe =================
    if ((m = path.match(/^\/households\/([^/]+)\/exists$/)) && method === 'GET') {
      const h = await getHousehold(m[1]);
      if (!h) return json(404, { exists: false });
      return json(200, { exists: true, name: h.name, admins: h.admins.map(a => ({ id: a.id, name: a.name })) });
    }

    // ================= Connexion responsable =================
    if ((m = path.match(/^\/households\/([^/]+)\/login$/)) && method === 'POST') {
      const h = await getHousehold(m[1]);
      if (!h) return json(404, { error: 'Foyer introuvable.' });
      const admin = h.admins.find(a => a.id === body.adminId);
      if (!admin || !verifyPin(body.pin, admin.pinHash)) return json(401, { error: 'Code incorrect.' });
      const sessionToken = await createSession({ code: h.code, role: 'admin', adminId: admin.id });
      return json(200, { token: sessionToken });
    }

    // ================= Connexion exécutant =================
    if ((m = path.match(/^\/households\/([^/]+)\/login-exec$/)) && method === 'POST') {
      const h = await getHousehold(m[1]);
      if (!h) return json(404, { error: 'Foyer introuvable.' });
      const sessionToken = await createSession({ code: h.code, role: 'exec' });
      return json(200, { token: sessionToken });
    }

    // ================= Récupérer les données du foyer =================
    if ((m = path.match(/^\/households\/([^/]+)\/data$/)) && method === 'GET') {
      const session = await requireAny(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      if (!h) return json(404, { error: 'Foyer introuvable.' });
      return json(200, { household: publicHousehold(h), role: session.role, adminId: session.adminId || null });
    }

    // ================= Membres du foyer =================
    if ((m = path.match(/^\/households\/([^/]+)\/persons$/)) && method === 'POST') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      const used = h.persons.map(p => p.color);
      const color = COLORS.find(c => !used.includes(c)) || COLORS[h.persons.length % COLORS.length];
      h.persons.push({ id: uid(), name: body.name, color, present: true });
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/persons\/([^/]+)$/)) && method === 'DELETE') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      h.persons = h.persons.filter(p => p.id !== m[2]);
      h.tasks = h.tasks.map(t => t.assigneeId === m[2] ? { ...t, assigneeId: '' } : t);
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/persons\/([^/]+)$/)) && method === 'PATCH') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      const p = h.persons.find(p => p.id === m[2]);
      if (p && typeof body.present === 'boolean') p.present = body.present;
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    // ================= Tâches =================
    if ((m = path.match(/^\/households\/([^/]+)\/tasks$/)) && method === 'POST') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      h.tasks.push({ id: uid(), text: body.text, assigneeId: body.assigneeId || '', completed: false });
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/tasks\/([^/]+)$/)) && method === 'DELETE') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      h.tasks = h.tasks.filter(t => t.id !== m[2]);
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/tasks\/([^/]+)$/)) && method === 'PATCH') {
      // Cocher une tâche comme faite est permis au responsable ET à l'exécutant.
      const session = await requireAny(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      const t = h.tasks.find(t => t.id === m[2]);
      if (t && typeof body.completed === 'boolean') t.completed = body.completed;
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    // ================= Répartition =================
    if ((m = path.match(/^\/households\/([^/]+)\/distribute$/)) && method === 'POST') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      const presentPersons = h.persons.filter(p => p.present);
      const pendingTasks = h.tasks.filter(t => !t.completed);
      if (presentPersons.length === 0) return json(400, { error: 'Aucune personne présente.' });
      if (pendingTasks.length === 0) return json(400, { error: 'Aucune tâche en attente.' });
      const assignments = [];
      pendingTasks.forEach((task, i) => {
        const person = presentPersons[(i + h.rotationOffset) % presentPersons.length];
        task.assigneeId = person.id;
        assignments.push({ personName: person.name, taskText: task.text });
      });
      h.rotationOffset = (h.rotationOffset + 1) % presentPersons.length;
      h.history.push({ id: uid(), date: new Date().toISOString(), assignments });
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/history$/)) && method === 'DELETE') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      h.history = [];
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    // ================= Responsables =================
    if ((m = path.match(/^\/households\/([^/]+)\/admins\/([^/]+)\/pin$/)) && method === 'PATCH') {
      const session = await requireAdmin(m[1]);
      if (!session || session.adminId !== m[2]) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      const admin = h.admins.find(a => a.id === m[2]);
      if (!admin || !verifyPin(body.currentPin, admin.pinHash)) return json(401, { error: 'Code actuel incorrect.' });
      admin.pinHash = hashPin(body.newPin);
      await saveHousehold(h);
      return json(200, { ok: true });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/admins$/)) && method === 'POST') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      if (h.admins.length >= MAX_ADMINS_PER_HOUSEHOLD) {
        return json(400, { error: `Ce foyer a déjà ${MAX_ADMINS_PER_HOUSEHOLD} responsables (maximum autorisé).` });
      }
      h.admins.push({ id: uid(), name: body.name, pinHash: hashPin(body.pin) });
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h) });
    }

    if ((m = path.match(/^\/households\/([^/]+)\/admins\/([^/]+)$/)) && method === 'DELETE') {
      const session = await requireAdmin(m[1]);
      if (!session) return json(401, { error: 'Non autorisé.' });
      const h = await getHousehold(m[1]);
      if (h.admins.length <= 1) return json(400, { error: 'Il faut garder au moins un responsable.' });
      const wasMe = m[2] === session.adminId;
      h.admins = h.admins.filter(a => a.id !== m[2]);
      await saveHousehold(h);
      return json(200, { household: publicHousehold(h), loggedOut: wasMe });
    }

    return json(404, { error: 'Route inconnue : ' + method + ' ' + path });
  } catch (err) {
    console.error('API error:', err && err.message ? err.message : String(err));
    return json(500, { error: 'Erreur serveur.', detail: String((err && err.message) || err) });
  }
};
