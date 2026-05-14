// ============================================================
//  operations.js — WildTrack Backend
//  Connects every page to Supabase
//  Tables: users, species, animals, sightings, rangers,
//          conservation_zones
// ============================================================

// ── SUPABASE CLIENT ─────────────────────────────────────────
const SUPABASE_URL  = 'https://ornpftyrhxrouflasqnq.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybnBmdHlyaHhyb3VmbGFzcW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODE1MDYsImV4cCI6MjA5Mjk1NzUwNn0.QkLj7M-W4OZvyF9zlBiwfpLawCouxH-xrTpk2pP1w0g';
const sb            = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── SHARED STATE ─────────────────────────────────────────────
// Used by modals that need dropdown data
let _speciesList = [];
let _animalsList = [];
let _rangersList = [];
let _zonesList   = [];
let _editingId   = null;   // null = adding new, number = editing

// ============================================================
//  UTILITIES
// ============================================================

// Show a short toast notification
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent      = msg;
    t.style.background = isError ? '#3a1616' : '#163a2a';
    t.style.color      = isError ? '#ff6b6b' : '#6bffb8';
    t.style.border     = isError ? '1px solid #4a1a1a' : '1px solid #1e5c3e';
    t.style.opacity    = '1';
    setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// Open / close the shared modal
function openAddModal() {
    _editingId = null;
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'flex';
    const title = document.getElementById('modal-title');
    if (title) title.textContent = 'Add ' + title.textContent.replace('Edit ', '').replace('Add ', '');
}

function openEditModal(id) {
    _editingId = id;
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'flex';
    const title = document.getElementById('modal-title');
    if (title && !title.textContent.startsWith('Edit')) {
        title.textContent = 'Edit ' + title.textContent.replace('Add ', '');
    }
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    _editingId = null;
}

// Get value of a form input by ID
function fVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// Set value of a form input by ID
function fSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

// Build status badge HTML
function statusBadge(status) {
    const map = {
        'Critically Endangered': 'badge-critical',
        'Endangered':            'badge-endangered',
        'Vulnerable':            'badge-vulnerable',
        'Least Concern':         'badge-good',
        'Good':                  'badge-good',
        'Fair':                  'badge-endangered',
        'Poor':                  'badge-critical',
    };
    return `<span class="${map[status] || ''}">${status}</span>`;
}

// Pad an integer ID (e.g. 3 → "003")
function padId(n) { return String(n).padStart(3, '0'); }

// Restore sidebar profile from sessionStorage
function restoreProfile() {
    const name = sessionStorage.getItem('wt_user') || 'admin';
    const role = sessionStorage.getItem('wt_role') || 'Administrator';
    const avatarEl = document.getElementById('avatar-initial');
    const nameEl   = document.getElementById('profile-name');
    const roleEl   = document.getElementById('profile-role');
    if (avatarEl) avatarEl.textContent = name[0].toUpperCase();
    if (nameEl)   nameEl.textContent   = name;
    if (roleEl)   roleEl.textContent   = role;
}

// ============================================================
//  PAGE: LOGIN
// ============================================================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const username  = fVal('username').trim();
        const password  = fVal('password').trim();
        const errorDiv  = document.getElementById('error-message');
        const btn       = document.getElementById('sign-in-btn');

        errorDiv.style.display = 'none';
        btn.textContent        = 'Signing in...';
        btn.disabled           = true;

        // Check username + password against the users table
        const { data, error } = await sb
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();

        btn.textContent = 'Sign in →';
        btn.disabled    = false;

        if (error || !data) {
            errorDiv.textContent   = 'Invalid username or password.';
            errorDiv.style.display = 'block';
            return;
        }

        // Save session and go to dashboard
        sessionStorage.setItem('wt_user', data.username);
        sessionStorage.setItem('wt_uid',  data.user_id);
        window.location.href = 'dashboard.html';
    });
}

// ============================================================
//  PAGE: DASHBOARD
// ============================================================
if (document.getElementById('stat-species')) {
    restoreProfile();

    (async () => {
        // -- Stat counts --
        const [sp, an, sg, rg, poor, crit] = await Promise.all([
            sb.from('species').select('*', { count: 'exact', head: true }),
            sb.from('animals').select('*', { count: 'exact', head: true }),
            sb.from('sightings').select('*', { count: 'exact', head: true }),
            sb.from('rangers').select('*', { count: 'exact', head: true }),
            sb.from('animals').select('*', { count: 'exact', head: true }).eq('health_status', 'Poor'),
            sb.from('species').select('*', { count: 'exact', head: true }).eq('conservation_status', 'Critically Endangered'),
        ]);

        document.getElementById('stat-species').textContent   = sp.count ?? 0;
        document.getElementById('stat-animals').textContent   = an.count ?? 0;
        document.getElementById('stat-sightings').textContent = sg.count ?? 0;
        document.getElementById('stat-rangers').textContent   = rg.count ?? 0;
        document.getElementById('stat-critical').textContent  = `${crit.count ?? 0} Critically Endangered`;
        document.getElementById('stat-poor').textContent      = `${poor.count ?? 0} in poor health`;

        // -- Recent sightings --
        const { data: recent } = await sb
            .from('sightings')
            .select('*, animals(tag_number, species(common_name)), rangers(users(username))')
            .order('sighting_date', { ascending: false })
            .limit(5);

        const tbody = document.getElementById('recent-sightings-tbody');
        if (tbody) {
            tbody.innerHTML = (recent || []).map(s => `
                <tr>
                    <td>SG-${padId(s.sighting_id)}</td>
                    <td>${s.animals?.tag_number ?? '—'}</td>
                    <td>${s.animals?.species?.common_name ?? '—'}</td>
                    <td>${s.location ?? '—'}</td>
                    <td>${s.rangers?.users?.username ?? '—'}</td>
                    <td>${s.sighting_date ?? '—'}</td>
                </tr>`).join('') || '<tr><td colspan="6" style="color:var(--text-dim);text-align:center;">No sightings yet</td></tr>';
        }

        // -- Status by species --
        const { data: allSpecies } = await sb.from('species').select('conservation_status');
        const counts = {};
        (allSpecies || []).forEach(s => {
            counts[s.conservation_status] = (counts[s.conservation_status] || 0) + 1;
        });
        const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
        const statuses = [
            { key: 'Critically Endangered', color: '#f44336', emoji: '🔴' },
            { key: 'Endangered',            color: '#FF9800', emoji: '🟠' },
            { key: 'Vulnerable',            color: '#2196F3', emoji: '🔵' },
            { key: 'Least Concern',         color: '#24a17e', emoji: '🟢' },
        ];
        const chartEl = document.getElementById('status-chart');
        if (chartEl) {
            chartEl.innerHTML = statuses.map(s => `
                <div class="status-row">
                    <div class="status-label">${s.emoji} ${s.key}</div>
                    <div class="progress-bg">
                        <div class="progress-fill" style="width:${Math.round((counts[s.key] || 0) / total * 100)}%; background:${s.color};"></div>
                    </div>
                    <div class="count">${counts[s.key] || 0}</div>
                </div>`).join('');
        }
    })();
}

// ============================================================
//  PAGE: SPECIES
// ============================================================
if (document.getElementById('species-tbody')) {
    restoreProfile();
    loadSpecies();
}

async function loadSpecies() {
    const { data, error } = await sb.from('species').select('*').order('common_name');
    const tbody = document.getElementById('species-tbody');
    if (error || !data) { tbody.innerHTML = '<tr><td colspan="6" style="color:#ff6b6b;text-align:center;">Error loading data</td></tr>'; return; }

    tbody.innerHTML = data.map(s => `
        <tr>
            <td>SP-${padId(s.species_id)}</td>
            <td><strong>${s.common_name}</strong></td>
            <td style="font-style:italic; color:var(--text-dim);">${s.scientific_name ?? '—'}</td>
            <td>${statusBadge(s.conservation_status)}</td>
            <td>${s.habitat ?? '—'}</td>
            <td>
                <button class="btn-edit" onclick="editSpecies(${s.species_id})">Edit</button>
                <button class="btn-del"  onclick="deleteSpecies(${s.species_id}, '${s.common_name}')">Del</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="6" style="color:var(--text-dim);text-align:center;">No species found</td></tr>';
}

async function editSpecies(id) {
    const { data } = await sb.from('species').select('*').eq('species_id', id).single();
    if (!data) return;
    fSet('f-common_name',         data.common_name);
    fSet('f-scientific_name',     data.scientific_name);
    fSet('f-conservation_status', data.conservation_status);
    fSet('f-habitat',             data.habitat);
    openEditModal(id);
}

async function saveSpecies() {
    const payload = {
        common_name:         fVal('f-common_name'),
        scientific_name:     fVal('f-scientific_name'),
        conservation_status: fVal('f-conservation_status'),
        habitat:             fVal('f-habitat'),
    };
    const { error } = _editingId
        ? await sb.from('species').update(payload).eq('species_id', _editingId)
        : await sb.from('species').insert(payload);

    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast(_editingId ? 'Species updated!' : 'Species added!');
    closeModal();
    loadSpecies();
}

async function deleteSpecies(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await sb.from('species').delete().eq('species_id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('Deleted!');
    loadSpecies();
}

// ============================================================
//  PAGE: ANIMALS
// ============================================================
if (document.getElementById('animals-tbody')) {
    restoreProfile();
    loadAnimals();
    // Pre-fill species dropdown
    sb.from('species').select('species_id, common_name').order('common_name').then(({ data }) => {
        _speciesList = data || [];
        const sel = document.getElementById('f-species_id');
        if (sel) sel.innerHTML = _speciesList.map(s => `<option value="${s.species_id}">${s.common_name}</option>`).join('');
    });
}

async function loadAnimals() {
    const { data, error } = await sb.from('animals').select('*, species(common_name)').order('tag_number');
    const tbody = document.getElementById('animals-tbody');
    if (error || !data) { tbody.innerHTML = '<tr><td colspan="6" style="color:#ff6b6b;text-align:center;">Error loading data</td></tr>'; return; }

    tbody.innerHTML = data.map(a => `
        <tr>
            <td>${a.tag_number}</td>
            <td>${a.species?.common_name ?? '—'}</td>
            <td>${a.sex === 'M' ? 'Male' : a.sex === 'F' ? 'Female' : '—'}</td>
            <td>${a.birth_year ?? '—'}</td>
            <td>${statusBadge(a.health_status)}</td>
            <td>
                <button class="btn-edit" onclick="editAnimal(${a.animal_id})">Edit</button>
                <button class="btn-del"  onclick="deleteAnimal(${a.animal_id}, '${a.tag_number}')">Del</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="6" style="color:var(--text-dim);text-align:center;">No animals found</td></tr>';
}

async function editAnimal(id) {
    const { data } = await sb.from('animals').select('*').eq('animal_id', id).single();
    if (!data) return;
    fSet('f-tag_number',   data.tag_number);
    fSet('f-species_id',   data.species_id);
    fSet('f-sex',          data.sex);
    fSet('f-birth_year',   data.birth_year);
    fSet('f-health_status',data.health_status);
    openEditModal(id);
}

async function saveAnimal() {
    const payload = {
        tag_number:    fVal('f-tag_number'),
        species_id:    parseInt(fVal('f-species_id')),
        sex:           fVal('f-sex'),
        birth_year:    parseInt(fVal('f-birth_year')),
        health_status: fVal('f-health_status'),
    };
    const { error } = _editingId
        ? await sb.from('animals').update(payload).eq('animal_id', _editingId)
        : await sb.from('animals').insert(payload);

    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast(_editingId ? 'Animal updated!' : 'Animal added!');
    closeModal();
    loadAnimals();
}

async function deleteAnimal(id, tag) {
    if (!confirm(`Delete animal "${tag}"? This cannot be undone.`)) return;
    const { error } = await sb.from('animals').delete().eq('animal_id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('Deleted!');
    loadAnimals();
}

// ============================================================
//  PAGE: SIGHTINGS
// ============================================================
if (document.getElementById('sightings-tbody')) {
    restoreProfile();
    loadSightings();

    // Pre-fill animal and ranger dropdowns
    Promise.all([
        sb.from('animals').select('animal_id, tag_number').order('tag_number'),
        sb.from('rangers').select('ranger_id, users(username)'),
    ]).then(([{ data: animals }, { data: rangers }]) => {
        _animalsList = animals || [];
        _rangersList = rangers || [];

        const anSel = document.getElementById('f-animal_id');
        const rgSel = document.getElementById('f-ranger_id');
        if (anSel) anSel.innerHTML = _animalsList.map(a => `<option value="${a.animal_id}">${a.tag_number}</option>`).join('');
        if (rgSel) rgSel.innerHTML = _rangersList.map(r => `<option value="${r.ranger_id}">${r.users?.username ?? 'Ranger ' + r.ranger_id}</option>`).join('');

        // Set today as default date
        const dateEl = document.getElementById('f-sighting_date');
        if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    });
}

async function loadSightings() {
    const { data, error } = await sb
        .from('sightings')
        .select('*, animals(tag_number, species(common_name)), rangers(users(username))')
        .order('sighting_date', { ascending: false });

    const tbody = document.getElementById('sightings-tbody');
    if (error || !data) { tbody.innerHTML = '<tr><td colspan="8" style="color:#ff6b6b;text-align:center;">Error loading data</td></tr>'; return; }

    tbody.innerHTML = data.map(s => `
        <tr>
            <td>SG-${padId(s.sighting_id)}</td>
            <td>${s.animals?.tag_number ?? '—'}</td>
            <td>${s.animals?.species?.common_name ?? '—'}</td>
            <td>${s.location ?? '—'}</td>
            <td>${s.rangers?.users?.username ?? '—'}</td>
            <td>${s.sighting_date ?? '—'}</td>
            <td style="font-size:11px; color:var(--text-dim); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.notes ?? '—'}</td>
            <td>
                <button class="btn-del" onclick="deleteSighting(${s.sighting_id})">Del</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="8" style="color:var(--text-dim);text-align:center;">No sightings found</td></tr>';
}

// Live search filter for sightings
function filterSightings(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#sightings-tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

async function saveSighting() {
    const payload = {
        animal_id:     parseInt(fVal('f-animal_id')),
        ranger_id:     parseInt(fVal('f-ranger_id')),
        location:      fVal('f-location'),
        sighting_date: fVal('f-sighting_date'),
        notes:         fVal('f-notes'),
    };
    const { error } = await sb.from('sightings').insert(payload);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('Sighting logged!');
    closeModal();
    loadSightings();
}

async function deleteSighting(id) {
    if (!confirm('Delete this sighting record?')) return;
    const { error } = await sb.from('sightings').delete().eq('sighting_id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('Deleted!');
    loadSightings();
}

// ============================================================
//  PAGE: RANGERS
// ============================================================
if (document.getElementById('rangers-tbody')) {
    restoreProfile();
    loadRangers();

    // Pre-fill user and zone dropdowns
    Promise.all([
        sb.from('users').select('user_id, username').order('username'),
        sb.from('conservation_zones').select('zone_id, zone_name').order('zone_name'),
    ]).then(([{ data: users }, { data: zones }]) => {
        _zonesList = zones || [];
        const usrSel  = document.getElementById('f-user_id');
        const zoneSel = document.getElementById('f-zone_id');
        if (usrSel)  usrSel.innerHTML  = (users  || []).map(u => `<option value="${u.user_id}">${u.username}</option>`).join('');
        if (zoneSel) zoneSel.innerHTML = _zonesList.map(z => `<option value="${z.zone_id}">${z.zone_name}</option>`).join('');
    });
}

async function loadRangers() {
    const { data, error } = await sb
        .from('rangers')
        .select('*, users(username), conservation_zones(zone_name)');

    const tbody = document.getElementById('rangers-tbody');
    if (error || !data) { tbody.innerHTML = '<tr><td colspan="6" style="color:#ff6b6b;text-align:center;">Error loading data</td></tr>'; return; }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td>RG-${padId(r.ranger_id)}</td>
            <td>${r.users?.username ?? '—'}</td>
            <td>${r.conservation_zones?.zone_name ?? '—'}</td>
            <td>${r.hire_date ?? '—'}</td>
            <td>${r.contact ?? '—'}</td>
            <td>
                <button class="btn-edit" onclick="editRanger(${r.ranger_id})">Edit</button>
                <button class="btn-del"  onclick="deleteRanger(${r.ranger_id})">Del</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="6" style="color:var(--text-dim);text-align:center;">No rangers found</td></tr>';
}

async function editRanger(id) {
    const { data } = await sb.from('rangers').select('*').eq('ranger_id', id).single();
    if (!data) return;
    fSet('f-user_id',   data.user_id);
    fSet('f-zone_id',   data.zone_id);
    fSet('f-hire_date', data.hire_date);
    fSet('f-contact',   data.contact);
    openEditModal(id);
}

async function saveRanger() {
    const payload = {
        user_id:   parseInt(fVal('f-user_id')),
        zone_id:   parseInt(fVal('f-zone_id')),
        hire_date: fVal('f-hire_date'),
        contact:   fVal('f-contact'),
    };
    const { error } = _editingId
        ? await sb.from('rangers').update(payload).eq('ranger_id', _editingId)
        : await sb.from('rangers').insert(payload);

    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast(_editingId ? 'Ranger updated!' : 'Ranger added!');
    closeModal();
    loadRangers();
}

async function deleteRanger(id) {
    if (!confirm('Delete this ranger?')) return;
    const { error } = await sb.from('rangers').delete().eq('ranger_id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('Deleted!');
    loadRangers();
}

// ============================================================
//  PAGE: USERS
// ============================================================
if (document.getElementById('users-tbody')) {
    restoreProfile();
    loadUsers();
}

async function loadUsers() {
    const { data, error } = await sb.from('users').select('*').order('username');
    const tbody = document.getElementById('users-tbody');
    if (error || !data) { tbody.innerHTML = '<tr><td colspan="5" style="color:#ff6b6b;text-align:center;">Error loading data</td></tr>'; return; }

    tbody.innerHTML = data.map(u => `
        <tr>
            <td>USR-${padId(u.user_id)}</td>
            <td><strong>${u.username}</strong></td>
            <td style="font-size:12px;">${u.email ?? '—'}</td>
            <td style="font-size:11px; color:var(--text-dim);">${u.created_at ? u.created_at.split('T')[0] : '—'}</td>
            <td>
                <button class="btn-edit" onclick="editUser(${u.user_id})">Edit</button>
                <button class="btn-del"  onclick="deleteUser(${u.user_id}, '${u.username}')">Del</button>
            </td>
        </tr>`).join('') || '<tr><td colspan="5" style="color:var(--text-dim);text-align:center;">No users found</td></tr>';
}

async function editUser(id) {
    const { data } = await sb.from('users').select('*').eq('user_id', id).single();
    if (!data) return;
    fSet('f-username', data.username);
    fSet('f-email',    data.email);
    // Hide password field when editing
    const pwdGroup = document.getElementById('password-group');
    if (pwdGroup) pwdGroup.style.display = 'none';
    openEditModal(id);
}

async function saveUser() {
    const payload = {
        username: fVal('f-username'),
        email:    fVal('f-email'),
    };
    // Include password only when adding new user
    if (!_editingId) {
        const pwd = fVal('f-password');
        if (!pwd) { showToast('Password is required', true); return; }
        payload.password = pwd;
    }

    const { error } = _editingId
        ? await sb.from('users').update(payload).eq('user_id', _editingId)
        : await sb.from('users').insert(payload);

    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast(_editingId ? 'User updated!' : 'User added!');
    closeModal();
    // Show password field again for next add
    const pwdGroup = document.getElementById('password-group');
    if (pwdGroup) pwdGroup.style.display = 'block';
    loadUsers();
}

async function deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    const { error } = await sb.from('users').delete().eq('user_id', id);
    if (error) { showToast('Error: ' + error.message, true); return; }
    showToast('Deleted!');
    loadUsers();
}
