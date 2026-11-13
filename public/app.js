(function () {
    const MAX_ADMINS = 3; // affichage seulement — la vraie limite est vérifiée côté serveur

    // ============================================================
    // Appels à l'API (backend Netlify Functions)
    // ============================================================
    async function api(path, opts) {
        opts = opts || {};
        const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        const token = sessionStorage.getItem('chores.token');
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch('/api' + path, {
            method: opts.method || 'GET',
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
        return data;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ============================================================
    // État — persisté en sessionStorage (survit à un rafraîchissement)
    // ============================================================
    let screen = 'landing';
    let household = null;
    let role = sessionStorage.getItem('chores.role');
    let currentAdminId = sessionStorage.getItem('chores.adminId');
    let code = sessionStorage.getItem('chores.code');
    let pendingAdminId = null;
    let joinStep = 'code';
    let joinError = '';
    let devError = '';

    const root = document.getElementById('root');

    function colorFor(personId) {
        const p = household.persons.find(p => p.id === personId);
        return p ? p.color : '#c8c3b6';
    }

    function buildingName(buildingId) {
        const b = household.buildings.find(b => b.id === buildingId);
        return b ? b.name : 'Bâtiment non défini';
    }

    function buildingOptions(includeCommon) {
        return household.buildings.filter(b => includeCommon || !b.common).map(b => `<option value="${b.id}">${escapeHtml(b.name)}${b.common ? ' · commun' : ''}</option>`).join('');
    }

    function isAdmin() { return role === 'admin' && !!currentAdminId; }

    function persistSession(t, c, r, aId) {
        if (t) sessionStorage.setItem('chores.token', t); else sessionStorage.removeItem('chores.token');
        if (c) sessionStorage.setItem('chores.code', c); else sessionStorage.removeItem('chores.code');
        if (r) sessionStorage.setItem('chores.role', r); else sessionStorage.removeItem('chores.role');
        if (aId) sessionStorage.setItem('chores.adminId', aId); else sessionStorage.removeItem('chores.adminId');
    }

    function clearSession() {
        sessionStorage.removeItem('chores.token');
        sessionStorage.removeItem('chores.code');
        sessionStorage.removeItem('chores.role');
        sessionStorage.removeItem('chores.adminId');
        role = null; currentAdminId = null; code = null; household = null;
    }

    async function enterApp(c, r, aId) {
        code = c; role = r; currentAdminId = aId || null;
        try {
            const data = await api(`/households/${code}/data`);
            household = data.household;
        } catch (e) {
            alert("Impossible de charger le foyer : " + e.message);
            clearSession(); screen = 'landing'; render();
            return;
        }
        document.body.classList.remove('role-admin', 'role-exec');
        document.body.classList.add(role === 'admin' ? 'role-admin' : 'role-exec');
        screen = 'app';
        render();
    }

    function showChooser() {
        clearSession();
        document.body.classList.remove('role-admin', 'role-exec');
        screen = 'landing';
        joinStep = 'code';
        render();
    }

    // ============================================================
    // Rendu
    // ============================================================
    function render() {
        if (screen === 'landing') return renderLanding();
        if (screen === 'create') return renderCreate();
        if (screen === 'join') return renderJoin();
        if (screen === 'app') return renderApp();
        if (screen === 'devLogin') return renderDevLogin();
        if (screen === 'devDashboard') return renderDevDashboard();
    }

    function renderLanding() {
        root.innerHTML = `
        <div class="role-chooser">
            <div class="hero-3d" aria-hidden="true">
                <div class="hero-scene">
                    <div class="task-cards">
                        <div class="task-card" style="--delay:0s">
                            <div class="task-card-inner">
                                <div class="task-face task-front">Vaisselle</div>
                                <div class="task-face task-back">Vaisselle ✓</div>
                            </div>
                        </div>
                        <div class="task-card" style="--delay:1.3s">
                            <div class="task-card-inner">
                                <div class="task-face task-front">Poubelles</div>
                                <div class="task-face task-back">Poubelles ✓</div>
                            </div>
                        </div>
                        <div class="task-card" style="--delay:2.6s">
                            <div class="task-card-inner">
                                <div class="task-face task-front">Lessive</div>
                                <div class="task-face task-back">Lessive ✓</div>
                            </div>
                        </div>
                    </div>
                    <div class="broom-wrap">
                        <span class="broom">🧹</span>
                        <span class="dust dust-1"></span>
                        <span class="dust dust-2"></span>
                        <span class="dust dust-3"></span>
                    </div>
                    <span class="dustpan">🧺</span>
                </div>
            </div>
            <div class="role-card">
                <h1>Nettoyage de l’internat</h1>
                <p class="tagline">Chaque foyer a son propre espace, privé et partageable.</p>
                <div class="role-buttons">
                    <button type="button" id="goCreate" class="role-btn">
                        Créer l’espace de mon internat
                        <span class="role-btn-sub">Nouvel internat, nouveau code d'accès</span>
                    </button>
                    <button type="button" id="goJoin" class="role-btn role-btn-secondary">
                        Rejoindre mon internat
                        <span class="role-btn-sub">J'ai déjà un code d'accès</span>
                    </button>
                </div>
                <button type="button" id="goDev" class="footer-link">Accès développeur</button>
            </div>
        </div>`;
        document.getElementById('goCreate').onclick = () => { screen = 'create'; render(); };
        document.getElementById('goJoin').onclick = () => { screen = 'join'; joinStep = 'code'; render(); };
        document.getElementById('goDev').onclick = () => { screen = 'devLogin'; render(); };
    }

    function renderCreate() {
        root.innerHTML = `
        <div class="role-chooser">
            <div class="role-card">
                <h1>Nouvel internat</h1>
                <p class="tagline">Tu deviens le premier responsable de ce foyer.</p>
                <form id="createForm" class="pin-form">
                    <label for="hName">Nom de l’internat</label>
                    <input type="text" id="hName" placeholder="Ex. Famille Dossou" required>
                    <label for="aName">Ton nom</label>
                    <input type="text" id="aName" placeholder="Ton nom" required>
                    <label for="aPin">Choisis un code PIN</label>
                    <input type="password" id="aPin" inputmode="numeric" pattern="[0-9]*" placeholder="Code PIN" autocomplete="off" required>
                    <div class="pin-form-actions">
                        <button type="button" id="cancelCreate" class="secondary-btn">Retour</button>
                        <button type="submit">Créer le foyer</button>
                    </div>
                    <p class="form-error" id="createError"></p>
                </form>
            </div>
        </div>`;
        document.getElementById('cancelCreate').onclick = () => { screen = 'landing'; render(); };
        document.getElementById('createForm').onsubmit = async (e) => {
            e.preventDefault();
            const hName = document.getElementById('hName').value.trim();
            const aName = document.getElementById('aName').value.trim();
            const aPin = document.getElementById('aPin').value.trim();
            const errEl = document.getElementById('createError');
            if (!hName || !aName || !aPin) return;
            errEl.textContent = 'Création en cours…';
            try {
                const data = await api('/households', { method: 'POST', body: { householdName: hName, adminName: aName, pin: aPin } });
                persistSession(data.token, data.code, 'admin', data.household.admins[0].id);
                await enterApp(data.code, 'admin', data.household.admins[0].id);
            } catch (err) {
                errEl.textContent = err.message;
            }
        };
    }

    function renderJoin() {
        if (joinStep === 'code') {
            root.innerHTML = `
            <div class="role-chooser">
                <div class="role-card">
                    <h1>Rejoindre mon internat</h1>
                    <p class="tagline">Entre le code d'accès de ton foyer.</p>
                    <form id="codeForm" class="pin-form">
                        <label for="codeInput">Code du foyer</label>
                        <input type="text" id="codeInput" placeholder="Ex. RENARD-4821" autocomplete="off" required>
                        <div class="pin-form-actions">
                            <button type="button" id="cancelJoin" class="secondary-btn">Retour</button>
                            <button type="submit">Continuer</button>
                        </div>
                        <p class="form-error" id="joinErrorEl">${joinError}</p>
                    </form>
                </div>
            </div>`;
            document.getElementById('cancelJoin').onclick = () => { screen = 'landing'; render(); };
            document.getElementById('codeForm').onsubmit = async (e) => {
                e.preventDefault();
                const c = document.getElementById('codeInput').value.trim().toUpperCase();
                if (!c) return;
                document.getElementById('joinErrorEl').textContent = 'Recherche…';
                try {
                    const data = await api(`/households/${c}/exists`);
                    code = c;
                    household = { name: data.name, admins: data.admins };
                    joinError = '';
                    joinStep = 'role';
                    render();
                } catch (err) {
                    joinError = 'Ce code ne correspond à aucun foyer.';
                    render();
                }
            };
            return;
        }
        if (joinStep === 'role') {
            root.innerHTML = `
            <div class="role-chooser">
                <div class="role-card">
                    <h1>${escapeHtml(household.name)}</h1>
                    <p class="tagline">Comment veux-tu accéder à cet espace ?</p>
                    <div class="role-buttons">
                        <button type="button" id="pickAdmin" class="role-btn">
                            Espace Responsable
                            <span class="role-btn-sub">Ajouter, attribuer, gérer</span>
                        </button>
                        <button type="button" id="pickExec" class="role-btn role-btn-secondary">
                            Espace Exécutant
                            <span class="role-btn-sub">Voir les tâches attribuées</span>
                        </button>
                    </div>
                    <button type="button" id="backCode" class="footer-link">Retour</button>
                </div>
            </div>`;
            document.getElementById('backCode').onclick = () => { joinStep = 'code'; render(); };
            document.getElementById('pickExec').onclick = async () => {
                try {
                    const data = await api(`/households/${code}/login-exec`, { method: 'POST' });
                    persistSession(data.token, code, 'exec', null);
                    await enterApp(code, 'exec', null);
                } catch (err) { alert(err.message); }
            };
            document.getElementById('pickAdmin').onclick = () => { joinStep = 'adminSelect'; render(); };
            return;
        }
        if (joinStep === 'adminSelect') {
            const btns = household.admins.map(a => `<button type="button" data-id="${a.id}">${escapeHtml(a.name)}</button>`).join('');
            root.innerHTML = `
            <div class="role-chooser">
                <div class="role-card">
                    <p class="pin-form-label">Qui es-tu ?</p>
                    <div class="admin-select-list" id="adminBtns">${btns}</div>
                    <button type="button" id="backRole" class="footer-link">Retour</button>
                </div>
            </div>`;
            document.getElementById('backRole').onclick = () => { joinStep = 'role'; render(); };
            document.querySelectorAll('#adminBtns button').forEach(btn => {
                btn.onclick = () => { pendingAdminId = btn.getAttribute('data-id'); joinStep = 'pin'; joinError = ''; render(); };
            });
            return;
        }
        if (joinStep === 'pin') {
            const admin = household.admins.find(a => a.id === pendingAdminId);
            root.innerHTML = `
            <div class="role-chooser">
                <div class="role-card">
                    <form id="pinForm" class="pin-form">
                        <label for="pinInput">Code PIN de ${escapeHtml(admin ? admin.name : '')}</label>
                        <input type="password" id="pinInput" inputmode="numeric" pattern="[0-9]*" placeholder="Code PIN" autocomplete="off" required>
                        <div class="pin-form-actions">
                            <button type="button" id="backSelect" class="secondary-btn">Retour</button>
                            <button type="submit">Valider</button>
                        </div>
                        <p class="form-error" id="pinErrorMsg">${joinError}</p>
                    </form>
                </div>
            </div>`;
            document.getElementById('backSelect').onclick = () => { joinStep = 'adminSelect'; render(); };
            document.getElementById('pinForm').onsubmit = async (e) => {
                e.preventDefault();
                const entered = document.getElementById('pinInput').value.trim();
                try {
                    const data = await api(`/households/${code}/login`, { method: 'POST', body: { adminId: admin.id, pin: entered } });
                    persistSession(data.token, code, 'admin', admin.id);
                    await enterApp(code, 'admin', admin.id);
                } catch (err) {
                    joinError = 'Code incorrect. Réessaie.';
                    render();
                }
            };
            return;
        }
    }

    // --- Application (espace internat) ---
    async function refreshHousehold() {
        const data = await api(`/households/${code}/data`);
        household = data.household;
    }

    function renderApp() {
        const me = household.admins.find(a => a.id === currentAdminId);
        const roleLabel = role === 'admin' ? `Espace Responsable — ${escapeHtml(me ? me.name : '')}` : 'Espace Exécutant';
        const latestRotation = household.history.length ? household.history[household.history.length - 1] : null;
        const commonNames = household.buildings.filter(b => b.common).map(b => b.name);

        root.innerHTML = `
        <div class="app">
            <header class="app-header">
                <div class="app-header-top">
                    <div>
                        <h1>${escapeHtml(household.name)}</h1>
                        <p class="tagline">Organisation du nettoyage de l’internat, bâtiment par bâtiment.</p>
                    </div>
                    <div class="role-status">
                        <span class="role-badge">${roleLabel}</span>
                        <span class="household-badge">Code : ${code}</span>
                        <button type="button" id="switchRoleBtn" class="secondary-btn">Changer d'espace</button>
                    </div>
                </div>
            </header>

            <section class="panel rotation-summary">
                <div class="panel-head"><h2>Rotation de la semaine</h2><span class="count">${latestRotation ? escapeHtml(latestRotation.weekKey || 'historique') : 'à générer'}</span></div>
                <p class="hint">Bâtiments communs : ${commonNames.length ? escapeHtml(commonNames.join(', ')) : 'aucun pour le moment'}.</p>
                ${latestRotation ? `<p class="hint">${latestRotation.assignments.length} affectation(s), dont ${latestRotation.assignments.filter(a => a.buildingId && household.buildings.find(b => b.id === a.buildingId)?.common).length} pour les bâtiments communs.</p>${latestRotation.unassignedTaskIds?.length ? `<p class="rotation-warning">${latestRotation.unassignedTaskIds.length} tâche(s) restent sans personne.</p>` : '<p class="rotation-ok">Toutes les tâches ouvertes sont affectées.</p>'}${latestRotation.deficientBuildingIds?.length ? `<p class="rotation-warning">Bâtiments en déficit : ${latestRotation.deficientBuildingIds.map(id => escapeHtml(buildingName(id))).join(', ')}</p>` : ''}` : '<p class="empty-state">Lance « Répartir les tâches » pour générer la rotation de cette semaine.</p>'}
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h2>Résidents de l’internat</h2>
                    <span class="count">${household.persons.length}</span>
                </div>
                <form id="personForm" class="inline-form admin-only">
                    <input type="text" id="personInput" placeholder="Nom du résident" required>
                    <select id="personBuilding" required>${buildingOptions(false)}</select>
                    <button type="submit">Ajouter</button>
                </form>
                <ul class="person-list" id="personList"></ul>
                ${household.persons.length === 0 ? `<p class="empty-state">Personne n'est encore dans le foyer.</p>` : ''}
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h2>Tâches</h2>
                    <span class="count">${household.tasks.length}</span>
                </div>
                <form id="taskForm" class="inline-form admin-only">
                    <input type="text" id="taskInput" placeholder="Tâche de nettoyage" required>
                    <select id="taskBuilding" required>${buildingOptions(true)}</select>
                    <select id="taskAssignee">
                        <option value="">Affectation automatique</option>
                        ${household.persons.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                    </select>
                    <button type="submit">Ajouter</button>
                </form>
                <div class="distribute-row admin-only">
                    <button type="button" id="distributeBtn" class="secondary-btn">Répartir les tâches</button>
                    <span class="hint">La rotation tient compte des bâtiments communs, des absences et des affectations manuelles.</span>
                </div>
                <p class="hint exec-only">Coche une tâche une fois terminée.</p>
                <ul class="task-list" id="taskList"></ul>
                ${household.tasks.length === 0 ? `<p class="empty-state">Aucune tâche pour l'instant.</p>` : ''}
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h2>Historique des répartitions</h2>
                    <div class="admin-only">
                        <button type="button" id="clearHistoryBtn" class="secondary-btn danger-btn">Vider</button>
                    </div>
                </div>
                <ul class="history-list" id="historyList"></ul>
                ${household.history.length === 0 ? `<p class="empty-state">Aucune répartition générée pour l'instant.</p>` : ''}
            </section>

            <section class="panel admin-only">
                <div class="panel-head"><h2>Bâtiments de l’internat</h2><span class="count">${household.buildings.length}</span></div>
                <form id="buildingForm" class="inline-form">
                    <input type="text" id="buildingInput" placeholder="Nom du bâtiment" required>
                    <label class="presence-toggle"><input type="checkbox" id="buildingCommon"> bâtiment commun</label>
                    <button type="submit">Ajouter</button>
                </form>
                <ul class="building-list" id="buildingList"></ul>
                <p class="hint">Un bâtiment commun reçoit des tâches nettoyées par rotation par les résidents des autres bâtiments.</p>

                <div class="panel-head settings-panel-head"><h2>Paramètres du responsable</h2></div>
                <h3 class="settings-subhead">Mon code PIN</h3>
                <form id="pinChangeForm" class="inline-form">
                    <input type="password" id="currentPinInput" placeholder="Code PIN actuel" autocomplete="off" required>
                    <input type="password" id="newPinInput" placeholder="Nouveau code PIN" autocomplete="off" required>
                    <button type="submit">Modifier</button>
                </form>
                <p class="form-msg" id="pinChangeMsg"></p>

                <h3 class="settings-subhead">Responsables (${household.admins.length}/${MAX_ADMINS})</h3>
                <ul class="admin-manage-list" id="adminManageList"></ul>
                ${household.admins.length < MAX_ADMINS ? `
                <form id="addAdminForm" class="inline-form">
                    <input type="text" id="addAdminName" placeholder="Nom du nouveau responsable" required>
                    <input type="password" id="addAdminPin" placeholder="Son code PIN" autocomplete="off" required>
                    <button type="submit">Ajouter</button>
                </form>
                <p class="form-msg" id="addAdminMsg"></p>
                ` : `<p class="hint">Nombre maximum de responsables atteint (${MAX_ADMINS}). Retire-en un pour en ajouter un autre.</p>`}

                <h3 class="settings-subhead">Code d’accès de l’internat</h3>
                <p class="hint">Partage ce code avec les membres du foyer pour qu'ils rejoignent l'espace : <strong>${code}</strong></p>
            </section>
        </div>`;

        document.getElementById('switchRoleBtn').onclick = () => { showChooser(); };

        renderPersons();
        renderTasks();
        renderHistory();
        if (role === 'admin') { renderBuildings(); renderAdminManageList(); }

        document.getElementById('personForm').onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('personInput');
            const nameVal = input.value.trim();
            const buildingId = document.getElementById('personBuilding').value;
            if (!nameVal || !buildingId) return;
            try {
                const data = await api(`/households/${code}/persons`, { method: 'POST', body: { name: nameVal, buildingId } });
                household = data.household;
                renderApp();
            } catch (err) { alert(err.message); }
        };

        document.getElementById('taskForm').onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById('taskInput');
            const assignee = document.getElementById('taskAssignee');
            const taskBuilding = document.getElementById('taskBuilding');
            const textVal = input.value.trim();
            if (!textVal || !taskBuilding.value) return;
            try {
                const data = await api(`/households/${code}/tasks`, { method: 'POST', body: { text: textVal, buildingId: taskBuilding.value, assigneeId: assignee.value || '' } });
                household = data.household;
                renderApp();
            } catch (err) { alert(err.message); }
        };

        const distributeBtn = document.getElementById('distributeBtn');
        if (distributeBtn) distributeBtn.onclick = async () => {
            try {
                const data = await api(`/households/${code}/distribute`, { method: 'POST' });
                household = data.household;
                renderApp();
            } catch (err) { alert(err.message); }
        };

        const buildingForm = document.getElementById('buildingForm');
        if (buildingForm) buildingForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('buildingInput').value.trim();
            const common = document.getElementById('buildingCommon').checked;
            if (!name) return;
            try {
                const data = await api(`/households/${code}/buildings`, { method: 'POST', body: { name, common } });
                household = data.household; renderApp();
            } catch (err) { alert(err.message); }
        };

        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        if (clearHistoryBtn) clearHistoryBtn.onclick = async () => {
            if (household.history.length === 0) return;
            if (!confirm(`Supprimer les ${household.history.length} entrée(s) de l'historique ?`)) return;
            try {
                const data = await api(`/households/${code}/history`, { method: 'DELETE' });
                household = data.household;
                renderApp();
            } catch (err) { alert(err.message); }
        };

        const pinChangeForm = document.getElementById('pinChangeForm');
        if (pinChangeForm) pinChangeForm.onsubmit = async (e) => {
            e.preventDefault();
            const current = document.getElementById('currentPinInput').value.trim();
            const next = document.getElementById('newPinInput').value.trim();
            const msg = document.getElementById('pinChangeMsg');
            try {
                await api(`/households/${code}/admins/${currentAdminId}/pin`, { method: 'PATCH', body: { currentPin: current, newPin: next } });
                msg.style.color = 'var(--sage-dark)'; msg.textContent = 'Code PIN mis à jour.';
                pinChangeForm.reset();
            } catch (err) {
                msg.style.color = 'var(--danger)'; msg.textContent = err.message;
            }
        };

        const addAdminForm = document.getElementById('addAdminForm');
        if (addAdminForm) addAdminForm.onsubmit = async (e) => {
            e.preventDefault();
            const nameVal = document.getElementById('addAdminName').value.trim();
            const pinVal = document.getElementById('addAdminPin').value.trim();
            const msg = document.getElementById('addAdminMsg');
            if (!nameVal || !pinVal) return;
            try {
                const data = await api(`/households/${code}/admins`, { method: 'POST', body: { name: nameVal, pin: pinVal } });
                household = data.household;
                msg.style.color = 'var(--sage-dark)'; msg.textContent = `${nameVal} a été ajouté(e) comme responsable.`;
                addAdminForm.reset();
                renderAdminManageList();
            } catch (err) {
                msg.style.color = 'var(--danger)'; msg.textContent = err.message;
            }
        };
    }

    function renderPersons() {
        const personList = document.getElementById('personList');
        personList.innerHTML = '';
        household.persons.forEach(person => {
            const li = document.createElement('li');
            const tag = document.createElement('span');
            tag.className = 'tag'; tag.style.backgroundColor = person.color;
            const name = document.createElement('span');
            name.className = 'person-name'; name.textContent = person.name;
            const building = document.createElement('select');
            building.className = 'person-building admin-only';
            building.innerHTML = buildingOptions(false);
            building.value = person.buildingId;
            building.addEventListener('change', async () => {
                try {
                    const data = await api(`/households/${code}/persons/${person.id}`, { method: 'PATCH', body: { buildingId: building.value } });
                    household = data.household;
                    renderApp();
                } catch (err) { alert(err.message); }
            });
            const buildingStatic = document.createElement('span');
            buildingStatic.className = 'person-building exec-only'; buildingStatic.textContent = buildingName(person.buildingId);

            const presenceLabel = document.createElement('label');
            presenceLabel.className = 'presence-toggle admin-only';
            const presenceInput = document.createElement('input');
            presenceInput.type = 'checkbox'; presenceInput.checked = person.present;
            presenceInput.addEventListener('change', async () => {
                try {
                    const data = await api(`/households/${code}/persons/${person.id}`, { method: 'PATCH', body: { present: presenceInput.checked } });
                    household = data.household;
                } catch (err) { alert(err.message); renderApp(); }
            });
            presenceLabel.append(presenceInput, document.createTextNode('présent(e)'));

            const presenceStatic = document.createElement('span');
            presenceStatic.className = 'presence-static exec-only';
            presenceStatic.textContent = person.present ? 'présent(e)' : 'absent(e)';

            const del = document.createElement('button');
            del.className = 'delete-btn admin-only'; del.textContent = '×';
            del.addEventListener('click', async () => {
                try {
                    const data = await api(`/households/${code}/persons/${person.id}`, { method: 'DELETE' });
                    household = data.household;
                    renderApp();
                } catch (err) { alert(err.message); }
            });

            li.append(tag, name, building, buildingStatic, presenceLabel, presenceStatic, del);
            personList.appendChild(li);
        });
    }

    function renderTasks() {
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';
        household.buildings.forEach(building => {
            const buildingTasks = household.tasks.filter(task => task.buildingId === building.id);
            if (!buildingTasks.length) return;
            const heading = document.createElement('li');
            heading.className = 'task-building-heading';
            heading.textContent = `${building.name}${building.common ? ' · bâtiment commun' : ''}`;
            taskList.appendChild(heading);
            buildingTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = task.completed ? 'completed' : '';
            const tag = document.createElement('span');
            tag.className = 'tag'; tag.style.backgroundColor = task.assigneeId ? colorFor(task.assigneeId) : '#d8d4cb';
            const text = document.createElement('span');
            text.className = 'task-text'; text.textContent = task.text;
            const building = document.createElement('span');
            building.className = 'task-building'; building.textContent = buildingName(task.buildingId);
            text.addEventListener('click', async () => {
                try {
                    const data = await api(`/households/${code}/tasks/${task.id}`, { method: 'PATCH', body: { completed: !task.completed } });
                    household = data.household;
                    renderApp();
                } catch (err) { alert(err.message); }
            });
            li.append(tag, text, building);
            if (task.assignmentMode) {
                const mode = document.createElement('span');
                mode.className = 'task-mode'; mode.textContent = task.assignmentMode === 'manual' ? 'manuel' : 'auto';
                li.appendChild(mode);
            }
            const assignedPerson = household.persons.find(p => p.id === task.assigneeId);
            if (assignedPerson) {
                const badge = document.createElement('span');
                badge.className = 'task-assignee'; badge.textContent = assignedPerson.name;
                li.appendChild(badge);
            }
            const assignment = document.createElement('select');
            assignment.className = 'task-assignment admin-only';
            assignment.innerHTML = `<option value="">Automatique</option>${household.persons.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}`;
            assignment.value = task.assignmentMode === 'manual' ? task.assigneeId : '';
            assignment.addEventListener('change', async () => {
                try {
                    const data = await api(`/households/${code}/tasks/${task.id}`, { method: 'PATCH', body: { assigneeId: assignment.value } });
                    household = data.household;
                    renderApp();
                } catch (err) { alert(err.message); }
            });
            li.appendChild(assignment);
            const del = document.createElement('button');
            del.className = 'delete-btn admin-only'; del.textContent = '×';
            del.addEventListener('click', async () => {
                try {
                    const data = await api(`/households/${code}/tasks/${task.id}`, { method: 'DELETE' });
                    household = data.household;
                    renderApp();
                } catch (err) { alert(err.message); }
            });
            li.appendChild(del);
            taskList.appendChild(li);
            });
        });
    }

    function renderHistory() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        [...household.history].reverse().forEach(entry => {
            const li = document.createElement('li');
            const head = document.createElement('div');
            head.className = 'history-entry-head';
            const dateLabel = document.createElement('span');
            dateLabel.textContent = new Date(entry.date).toLocaleString('fr-FR');
            const countLabel = document.createElement('span');
            countLabel.textContent = `${entry.assignments.length} tâche(s)`;
            head.append(dateLabel, countLabel);
            const body = document.createElement('div');
            body.className = 'history-assignments';
            entry.assignments.forEach(a => {
                const line = document.createElement('div');
                const personSpan = document.createElement('span');
                personSpan.className = 'person'; personSpan.textContent = a.personName + ' : ';
                const target = a.buildingName ? ` → ${a.buildingName}` : '';
                const mode = a.mode ? ` (${a.mode})` : '';
                line.append(personSpan, document.createTextNode((a.taskText || 'tâche') + target + mode));
                body.appendChild(line);
            });
            li.append(head, body);
            historyList.appendChild(li);
        });
    }

    function renderBuildings() {
        const list = document.getElementById('buildingList');
        if (!list) return;
        list.innerHTML = '';
        household.buildings.forEach(building => {
            const li = document.createElement('li');
            li.className = 'building-row';
            const label = document.createElement('span');
            label.className = 'building-name'; label.textContent = building.name;
            const badge = document.createElement('span');
            badge.className = building.common ? 'building-badge common' : 'building-badge';
            badge.textContent = building.common ? 'commun' : 'résidentiel';
            li.append(label, badge);
            const rename = document.createElement('button');
            rename.className = 'secondary-btn'; rename.textContent = 'Renommer';
            rename.onclick = async () => {
                const name = prompt('Nouveau nom du bâtiment', building.name);
                if (!name || !name.trim()) return;
                try { const data = await api(`/households/${code}/buildings/${building.id}`, { method: 'PATCH', body: { name: name.trim() } }); household = data.household; renderApp(); }
                catch (err) { alert(err.message); }
            };
            const toggle = document.createElement('button');
            toggle.className = 'secondary-btn'; toggle.textContent = building.common ? 'Rendre résidentiel' : 'Rendre commun';
            toggle.onclick = async () => {
                try { const data = await api(`/households/${code}/buildings/${building.id}`, { method: 'PATCH', body: { common: !building.common } }); household = data.household; renderApp(); }
                catch (err) { alert(err.message); }
            };
            const del = document.createElement('button'); del.className = 'delete-btn'; del.textContent = '×';
            del.onclick = async () => { if (!confirm(`Supprimer ${building.name} ?`)) return; try { const data = await api(`/households/${code}/buildings/${building.id}`, { method: 'DELETE' }); household = data.household; renderApp(); } catch (err) { alert(err.message); } };
            li.append(rename, toggle, del); list.appendChild(li);
        });
    }

    function renderAdminManageList() {
        const list = document.getElementById('adminManageList');
        if (!list) return;
        list.innerHTML = '';
        household.admins.forEach(admin => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.className = 'admin-name'; name.textContent = admin.name;
            if (admin.id === currentAdminId) {
                const you = document.createElement('span');
                you.className = 'admin-you'; you.textContent = ' (toi)';
                name.appendChild(you);
            }
            li.appendChild(name);
            if (household.admins.length > 1) {
                const del = document.createElement('button');
                del.className = 'delete-btn'; del.textContent = '×';
                del.addEventListener('click', async () => {
                    if (!confirm(`Retirer ${admin.name} des responsables ?`)) return;
                    try {
                        const data = await api(`/households/${code}/admins/${admin.id}`, { method: 'DELETE' });
                        if (data.loggedOut) { showChooser(); return; }
                        household = data.household;
                        renderAdminManageList();
                    } catch (err) { alert(err.message); }
                });
                li.appendChild(del);
            }
            list.appendChild(li);
        });
    }

    // --- Espace développeur ---
    function renderDevLogin() {
        root.innerHTML = `
        <div class="role-chooser">
            <div class="role-card">
                <h1>Espace développeur</h1>
                <p class="tagline">Vue d'ensemble de tous les foyers créés.</p>
                <form id="devForm" class="pin-form">
                    <label for="devPin">Mot de passe</label>
                    <input type="password" id="devPin" autocomplete="off" required>
                    <div class="pin-form-actions">
                        <button type="button" id="backDev" class="secondary-btn">Retour</button>
                        <button type="submit">Entrer</button>
                    </div>
                    <p class="form-error" id="devErrorMsg">${devError}</p>
                </form>
            </div>
        </div>`;
        document.getElementById('backDev').onclick = () => { screen = 'landing'; render(); };
        document.getElementById('devForm').onsubmit = async (e) => {
            e.preventDefault();
            const val = document.getElementById('devPin').value;
            try {
                const data = await api('/dev/login', { method: 'POST', body: { password: val } });
                sessionStorage.setItem('chores.devToken', data.token);
                devError = '';
                screen = 'devDashboard'; render();
            } catch (err) {
                devError = err.message; render();
            }
        };
    }

    async function apiDev(path, opts) {
        opts = opts || {};
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionStorage.getItem('chores.devToken') };
        const res = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erreur');
        return data;
    }

    async function renderDevDashboard() {
        root.innerHTML = `<div class="app"><p class="spinner-text">Chargement des foyers…</p></div>`;
        let details = [];
        try {
            const data = await apiDev('/dev/households');
            details = data.households;
        } catch (err) {
            screen = 'devLogin'; devError = err.message; render();
            return;
        }

        const rows = details.map(h => `
            <li data-code="${h.code}">
                <div class="dev-row-head">
                    <span class="dev-code">${escapeHtml(h.name)} · ${h.code}</span>
                    <button type="button" class="delete-btn dev-del-btn" data-code="${h.code}">×</button>
                </div>
                <span class="dev-stats">${h.admins} responsable(s) · ${h.persons} membre(s) · ${h.tasks} tâche(s) · ${h.history} répartition(s) — créé le ${new Date(h.createdAt).toLocaleDateString('fr-FR')}</span>
            </li>`).join('');

        root.innerHTML = `
        <div class="app">
            <header class="app-header">
                <div class="app-header-top">
                    <div>
                        <h1>Espace développeur</h1>
                        <p class="tagline">${details.length} internat(s) enregistré(s) au total.</p>
                    </div>
                    <div class="role-status">
                        <button type="button" id="refreshDev" class="secondary-btn">Actualiser</button>
                        <button type="button" id="exitDev" class="secondary-btn">Quitter</button>
                    </div>
                </div>
            </header>
            <section class="panel">
                <ul class="dev-list" id="devList">${rows}</ul>
                ${details.length === 0 ? '<p class="empty-state">Aucun foyer créé pour le moment.</p>' : ''}
            </section>
        </div>`;

        document.getElementById('refreshDev').onclick = () => renderDevDashboard();
        document.getElementById('exitDev').onclick = () => {
            sessionStorage.removeItem('chores.devToken');
            screen = 'landing'; render();
        };
        document.querySelectorAll('.dev-del-btn').forEach(btn => {
            btn.onclick = async () => {
                const c = btn.getAttribute('data-code');
                if (!confirm(`Supprimer définitivement le foyer ${c} et toutes ses données ?`)) return;
                try {
                    await apiDev(`/dev/households/${c}`, { method: 'DELETE' });
                    renderDevDashboard();
                } catch (err) { alert(err.message); }
            };
        });
    }

    // ============================================================
    // Démarrage : reprendre la session si elle existe
    // ============================================================
    (async function start() {
        if (role && code) {
            await enterApp(code, role, currentAdminId);
        } else {
            render();
        }
    })();
})();
