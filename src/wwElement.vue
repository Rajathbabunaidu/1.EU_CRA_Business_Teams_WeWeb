<template>
  <section class="bt-root" aria-label="Business Team Management">
    <div class="bt-heading">
      <div>
        <div v-if="showBreadcrumbs" class="bt-crumb">Settings / Security / Administration / Business Teams</div>
        <h1>Business Teams</h1>
        <p>Manage business teams, descriptions and assigned members</p>
      </div>
      <div class="bt-toolbar">
        <button type="button" class="bt-btn" :disabled="loading || !configured" @click="refreshAll">↻ Refresh</button>
        <button type="button" class="bt-btn" @click="showColumnManager = true">☷ Columns</button>
        <button v-if="customEnabled" type="button" class="bt-btn" @click="openFieldManager">Manage Fields</button>
        <button v-if="canEdit" type="button" class="bt-btn bt-primary" :disabled="!configured" @click="openCreate">+ Add Team</button>
      </div>
    </div>

    <div v-if="!configured" class="bt-banner bt-info" role="status">
      <strong>Connect Supabase:</strong> Select this coded element in WeWeb, then enter your <b>Supabase Project URL</b> and <b>Supabase Publishable Key</b> in the right-hand settings.
    </div>
    <div v-if="errors.core" class="bt-banner bt-danger" role="alert">{{ errors.core }}</div>
    <div v-else-if="errors.memberships" class="bt-banner bt-warning" role="status">Membership counts unavailable: {{ errors.memberships }}</div>
    <div v-if="notice" class="bt-banner bt-info" role="status">{{ notice }} <button class="bt-close" type="button" aria-label="Dismiss message" @click="notice = ''">×</button></div>

    <div class="bt-kpis" :class="{ 'bt-four': showMembershipKpi }">
      <div class="bt-kpi"><span>Total Teams</span><strong>{{ teams.length }}</strong><small>Business teams</small></div>
      <div class="bt-kpi"><span>Active Teams</span><strong>{{ teams.filter(t => Number(t.status_id) === 1).length }}</strong><small>Currently active</small></div>
      <div class="bt-kpi"><span>Inactive Teams</span><strong>{{ teams.filter(t => Number(t.status_id) === 2).length }}</strong><small>Currently inactive</small></div>
      <div v-if="showMembershipKpi" class="bt-kpi"><span>Total Memberships</span><strong>{{ totalMemberships }}</strong><small>Assigned users</small></div>
    </div>

    <div class="bt-filters">
      <label class="bt-search"><span class="bt-sr">Search teams</span><input v-model="searchTerm" type="search" placeholder="Search team code, name or description..." /></label>
      <label class="bt-select"><span class="bt-sr">Team status</span><select v-model="statusFilter"><option value="all">All Statuses</option><option value="1">Active</option><option value="2">Inactive</option><option value="3">Archived</option></select></label>
      <label class="bt-select"><span class="bt-sr">Sort column</span><select v-model="sortField"><option value="team_name">Sort: Name</option><option value="team_code">Sort: Code</option><option value="members">Sort: Members</option><option value="created_at">Sort: Created</option></select></label>
      <button class="bt-btn bt-icon-btn" type="button" :aria-label="sortDir === 'asc' ? 'Sorting ascending; click to descend' : 'Sorting descending; click to ascend'" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
    </div>

    <div class="bt-table-scroll" role="region" aria-label="Business teams table" tabindex="0">
      <table class="bt-table">
        <thead><tr>
          <th v-for="col in displayedColumns" :key="col.key" scope="col">{{ col.label }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="team in pagedTeams" :key="team.id">
            <td v-for="col in displayedColumns" :key="col.key">
              <template v-if="col.key === 'actions'"><div class="bt-row-actions"><button type="button" @click="openView(team)">View</button><button v-if="canEdit" type="button" @click="openEdit(team)">Edit</button></div></template>
              <template v-else-if="col.key === 'team_name'"><strong class="bt-team-name">{{ team.team_name || '—' }}</strong></template>
              <template v-else-if="col.key === 'team_code'"><span class="bt-code">{{ team.team_code || '—' }}</span></template>
              <template v-else-if="col.key === 'description'"><span class="bt-desc" :title="team.description || ''">{{ team.description || '—' }}</span></template>
              <template v-else-if="col.key === 'members'"><button class="bt-member-link" type="button" @click="openView(team)">{{ memberCounts[team.id] ?? 0 }} member{{ (memberCounts[team.id] ?? 0) === 1 ? '' : 's' }}</button></template>
              <template v-else-if="col.key === 'status'"><span class="bt-pill" :class="statusClass(team.status_id)">{{ statusLabel(team.status_id) }}</span></template>
              <template v-else-if="col.key === 'created_at' || col.key === 'updated_at'">{{ formattedDate(team[col.key]) }}</template>
              <template v-else-if="col.kind === 'custom'">{{ formattedCustomValue(team.id, col.field) }}</template>
              <template v-else>{{ team[col.key] ?? '—' }}</template>
            </td>
          </tr>
          <tr v-if="pagedTeams.length === 0"><td class="bt-empty" :colspan="Math.max(displayedColumns.length, 1)">{{ loading ? 'Loading business teams…' : !configured ? 'Configure Supabase above to load teams.' : errors.core ? 'Could not load teams.' : 'No business teams found.' }}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="bt-footer">
      <span>Showing {{ filteredTeams.length ? (page - 1) * rowsPerPage + 1 : 0 }}–{{ Math.min(page * rowsPerPage, filteredTeams.length) }} of {{ filteredTeams.length }} teams</span>
      <div class="bt-pager"><label>Rows <select v-model.number="rowsPerPage"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label><button type="button" class="bt-btn" :disabled="page <= 1" @click="page--">Previous</button><span>Page {{ page }} / {{ pageCount }}</span><button type="button" class="bt-btn" :disabled="page >= pageCount" @click="page++">Next</button></div>
    </div>

    <!-- Column manager: no backend privileges required; per-browser storage. -->
    <div v-if="showColumnManager" class="bt-backdrop" @click.self="showColumnManager = false">
      <div class="bt-modal bt-column-modal" role="dialog" aria-modal="true" aria-labelledby="bt-columns-title">
        <div class="bt-modal-head"><div><h2 id="bt-columns-title">Table Columns</h2><p>Choose which columns appear, and reorder them.</p></div><button class="bt-close" type="button" aria-label="Close" @click="showColumnManager = false">×</button></div>
        <div class="bt-list">
          <div v-for="(col, idx) in allColumns" :key="col.key" class="bt-list-row">
            <label><input type="checkbox" :checked="visibleColumnKeys.includes(col.key)" :disabled="col.key === 'team_name' || col.key === 'actions'" @change="setColumnVisible(col.key, $event.target.checked)" /> {{ col.label }}</label>
            <div class="bt-move"><button type="button" :disabled="idx === 0" title="Move column left" @click="moveColumn(idx,-1)">↑</button><button type="button" :disabled="idx === allColumns.length - 1" title="Move column right" @click="moveColumn(idx,1)">↓</button></div>
          </div>
        </div>
        <div class="bt-modal-actions"><span class="bt-helper">Saved in this browser, not yet to a user account.</span><button type="button" class="bt-btn" @click="resetColumns">Reset</button><button type="button" class="bt-btn bt-primary" @click="showColumnManager = false">Done</button></div>
      </div>
    </div>

    <!-- View/Edit/Create dialog -->
    <div v-if="modalMode" class="bt-backdrop" @click.self="closeTeamModal">
      <div class="bt-modal bt-details-modal" role="dialog" aria-modal="true" aria-labelledby="bt-team-modal-title">
        <div class="bt-modal-head"><div><h2 id="bt-team-modal-title">{{ modalMode === 'view' ? 'Team Details' : modalMode === 'create' ? 'Add Business Team' : 'Edit Business Team' }}</h2><p>{{ modalMode === 'view' ? 'Team information and assigned members' : 'Update business-team master data' }}</p></div><button class="bt-close" type="button" aria-label="Close" @click="closeTeamModal">×</button></div>
        <template v-if="modalMode === 'view'">
          <div class="bt-detail-grid"><div><span>Team Code</span><b>{{ selectedTeam?.team_code || '—' }}</b></div><div><span>Team Name</span><b>{{ selectedTeam?.team_name || '—' }}</b></div><div><span>Status</span><b>{{ statusLabel(selectedTeam?.status_id) }}</b></div><div><span>Members</span><b>{{ selectedTeam ? memberCounts[selectedTeam.id] ?? 0 : 0 }}</b></div><div class="bt-full"><span>Description</span><p>{{ selectedTeam?.description || '—' }}</p></div></div>
          <h3 class="bt-subheading">Assigned Members <span>({{ detailMembers.length }})</span></h3>
          <div v-if="detailLoading" class="bt-muted">Loading members…</div>
          <div v-else-if="detailError" class="bt-banner bt-warning">{{ detailError }}</div>
          <div v-else-if="!detailMembers.length" class="bt-muted">No users assigned to this team.</div>
          <div v-else class="bt-member-list"><div v-for="m in detailMembers" :key="m.id" class="bt-member"><div class="bt-avatar">{{ initials(m.full_name) }}</div><div><strong>{{ m.full_name || '—' }}</strong><small>{{ m.user_code || '—' }} · {{ m.job_title || 'Job title not provided' }}</small><small>{{ m.email || 'Email not provided' }}</small></div><span class="bt-pill" :class="statusClass(m.status_id)">{{ statusLabel(m.status_id) }}</span></div></div>
          <div v-if="activeFields.length" class="bt-detail-fields"><h3 class="bt-subheading">Additional Fields</h3><div class="bt-detail-grid"><div v-for="field in activeFields" :key="field.id"><span>{{ field.field_label }}</span><b>{{ selectedTeam ? formattedCustomValue(selectedTeam.id, field) : '—' }}</b></div></div></div>
        </template>
        <form v-else @submit.prevent="saveTeam">
          <label class="bt-field"><span>Team Name <em>*</em></span><input v-model.trim="teamForm.team_name" type="text" required maxlength="200" placeholder="Enter team name" autocomplete="off" /></label>
          <label class="bt-field"><span>Description</span><textarea v-model="teamForm.description" rows="3" placeholder="Optional team description" /></label>
          <label v-if="modalMode === 'edit'" class="bt-field"><span>Team Status</span><select v-model.number="teamForm.status_id"><option :value="1">Active</option><option :value="2">Inactive</option><option v-if="Number(teamForm.status_id) === 3" :value="3" disabled>Archived (existing)</option></select></label>
          <div v-if="activeFormFields.length" class="bt-extra-fields"><h3 class="bt-subheading">Additional Business Fields</h3><div v-for="field in activeFormFields" :key="field.id" class="bt-field"><label :for="'bt-custom-'+field.id">{{ field.field_label }} <em v-if="field.is_required">*</em></label>
            <textarea v-if="field.data_type === 'textarea'" :id="'bt-custom-'+field.id" v-model="customForm[field.id]" rows="2" />
            <select v-else-if="field.data_type === 'select'" :id="'bt-custom-'+field.id" v-model="customForm[field.id]"><option value="">Select…</option><option v-for="option in safeOptions(field)" :key="option" :value="option">{{ option }}</option></select>
            <select v-else-if="field.data_type === 'multiselect'" :id="'bt-custom-'+field.id" v-model="customForm[field.id]" multiple size="3"><option v-for="option in safeOptions(field)" :key="option" :value="option">{{ option }}</option></select>
            <label v-else-if="field.data_type === 'boolean'" class="bt-inline-checkbox"><input :id="'bt-custom-'+field.id" type="checkbox" v-model="customForm[field.id]" /> Yes</label>
            <input v-else :id="'bt-custom-'+field.id" v-model="customForm[field.id]" :type="fieldInputType(field.data_type)" :step="field.data_type === 'number' ? 'any' : undefined" />
          </div></div>
          <div v-if="saveError" class="bt-banner bt-danger" role="alert">{{ saveError }}</div>
          <div class="bt-modal-actions"><button class="bt-btn" type="button" @click="closeTeamModal">Cancel</button><button class="bt-btn bt-primary" type="submit" :disabled="saving || !configured">{{ saving ? 'Saving…' : modalMode === 'create' ? 'Create Team' : 'Save Changes' }}</button></div>
        </form>
        <div v-if="modalMode === 'view'" class="bt-modal-actions"><button type="button" class="bt-btn" @click="closeTeamModal">Close</button><button v-if="canEdit" type="button" class="bt-btn bt-primary" @click="openEdit(selectedTeam)">Edit Team</button></div>
      </div>
    </div>

    <!-- Field manager, enabled only when DB grants & policies permit -->
    <div v-if="showFieldManager" class="bt-backdrop" @click.self="showFieldManager = false">
      <div class="bt-modal bt-field-modal" role="dialog" aria-modal="true" aria-labelledby="bt-field-modal-title">
        <div class="bt-modal-head"><div><h2 id="bt-field-modal-title">Manage Business Fields</h2><p>Optional fields for business teams</p></div><button class="bt-close" type="button" aria-label="Close" @click="showFieldManager = false">×</button></div>
        <div v-if="!fieldsAccessible" class="bt-banner bt-warning">Custom-field tables are not accessible using the current publishable key. Existing Teams features remain available. Authorized backend access is required before fields can be managed.</div>
        <template v-else>
          <div v-if="allFieldDefinitions.length" class="bt-list"><div v-for="field in allFieldDefinitions" :key="field.id" class="bt-list-row"><div><b>{{ field.field_label }}</b><small>{{ field.field_key }} · {{ field.data_type }} · {{ field.is_active ? 'Active' : 'Inactive' }}</small></div><button v-if="canEdit" type="button" class="bt-btn" :disabled="fieldSaving" @click="toggleField(field)">{{ field.is_active ? 'Deactivate' : 'Activate' }}</button></div></div>
          <p v-else class="bt-muted">No custom business fields have been created.</p>
          <form v-if="canEdit" class="bt-field-creator" @submit.prevent="createField"><h3 class="bt-subheading">Add Custom Field</h3>
            <label class="bt-field"><span>Field Label *</span><input v-model.trim="newField.label" required maxlength="120" placeholder="Example: Business Unit" /></label>
            <label class="bt-field"><span>Field Key *</span><input v-model.trim="newField.key" required pattern="[a-z][a-z0-9_]*" placeholder="business_unit" /><small>Lowercase letters, numbers and underscores; starts with a letter</small></label>
            <label class="bt-field"><span>Data Type *</span><select v-model="newField.type"><option value="text">Text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="date">Date</option><option value="datetime">Date and time</option><option value="select">Dropdown</option><option value="multiselect">Multiple choice</option></select></label>
            <label v-if="['select','multiselect'].includes(newField.type)" class="bt-field"><span>Options (one per line)</span><textarea v-model="newField.optionsText" rows="4" placeholder="Engineering&#10;Operations" /></label>
            <label class="bt-check"><input type="checkbox" v-model="newField.required" /> Required when editing a team</label>
            <label class="bt-check"><input type="checkbox" v-model="newField.showInTable" /> Show in table by default</label>
            <div v-if="fieldError" class="bt-banner bt-danger">{{ fieldError }}</div>
            <div class="bt-modal-actions"><button type="button" class="bt-btn" @click="showFieldManager = false">Close</button><button type="submit" class="bt-btn bt-primary" :disabled="fieldSaving">{{ fieldSaving ? 'Saving…' : 'Create Field' }}</button></div>
          </form>
          <div v-else class="bt-modal-actions"><button type="button" class="bt-btn" @click="showFieldManager = false">Close</button></div>
        </template>
        <div v-if="!fieldsAccessible" class="bt-modal-actions"><button type="button" class="bt-btn" @click="showFieldManager = false">Close</button></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const props = defineProps({ content: { type: Object, required: true } });
const TEAMS_COLUMNS = [
  { key: 'team_code', label: 'Team Code' },
  { key: 'team_name', label: 'Team Name' },
  { key: 'description', label: 'Description' },
  { key: 'members', label: 'Members' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Created Date' },
  { key: 'updated_at', label: 'Updated Date' },
  { key: 'actions', label: 'Actions' },
];
const INITIAL_VISIBLE = ['team_code','team_name','description','members','status','actions'];
const apiUrl = computed(() => String(props.content?.supabaseUrl ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, ''));
const apiKey = computed(() => String(props.content?.supabasePublishableKey ?? '').trim());
const configured = computed(() => /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(apiUrl.value) && !!apiKey.value && !apiKey.value.startsWith('sb_secret_'));
const canEdit = computed(() => props.content?.enableEditing !== false);
const customEnabled = computed(() => props.content?.enableCustomFields !== false);
const showBreadcrumbs = computed(() => props.content?.showBreadcrumbs !== false);
const showMembershipKpi = computed(() => props.content?.showMembershipKpi === true);
const teams = ref([]);
const memberCounts = ref({});
const statuses = ref({ 1: 'Active', 2: 'Inactive', 3: 'Archived' });
const errors = ref({ core: '', memberships: '' });
const notice = ref('');
const loading = ref(false);
const searchTerm = ref('');
const statusFilter = ref('all');
const sortField = ref('team_name');
const sortDir = ref('asc');
const rowsPerPage = ref(10);
const page = ref(1);
const visibleColumnKeys = ref([...INITIAL_VISIBLE]);
const columnOrder = ref(TEAMS_COLUMNS.map(x => x.key));
const showColumnManager = ref(false);
const modalMode = ref('');
const selectedTeam = ref(null);
const teamForm = ref({ team_name: '', description: '', status_id: 1 });
const customForm = ref({});
const saveError = ref('');
const saving = ref(false);
const detailMembers = ref([]);
const detailLoading = ref(false);
const detailError = ref('');
const showFieldManager = ref(false);
const allFieldDefinitions = ref([]);
const customValues = ref({});
const fieldsAccessible = ref(false);
const newField = ref(emptyNewField());
const fieldError = ref('');
const fieldSaving = ref(false);
let loadSerial = 0;

function emptyNewField() { return { label:'', key:'', type:'text', optionsText:'', required:false, showInTable:true }; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeOptions(field) { return safeArray(field?.field_options).filter(x => typeof x === 'string'); }
function statusLabel(id) { return statuses.value[id] ?? String(id ?? '—'); }
function statusClass(id) { return Number(id) === 1 ? 'bt-active' : Number(id) === 2 ? 'bt-inactive' : 'bt-archived'; }
function formattedDate(value) { if (!value) return '—'; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : '—'; }
function initials(value) { return String(value || '?').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase(); }
function fieldInputType(type) { return ({ number:'number', date:'date', datetime:'datetime-local' })[type] || 'text'; }
function cleanError(err) {
  const msg = String(err?.message ?? err ?? 'Unknown error');
  return msg.replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]');
}
function preferenceKey() { return `craHub.businessTeams.columns.v1:${apiUrl.value || 'not-set'}`; }
function restorePreferences() {
  try {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(preferenceKey());
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed?.order)) columnOrder.value = parsed.order.filter(x => typeof x === 'string');
    if (Array.isArray(parsed?.visible)) visibleColumnKeys.value = parsed.visible.filter(x => typeof x === 'string');
    if ([10,25,50,100].includes(parsed?.rows)) rowsPerPage.value = parsed.rows;
  } catch (_) { /* private browsing may block storage */ }
  // Name and Actions must never disappear from the table.
  for (const fixed of ['team_name','actions']) if (!visibleColumnKeys.value.includes(fixed)) visibleColumnKeys.value.push(fixed);
}
function persistPreferences() {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(preferenceKey(), JSON.stringify({ order: columnOrder.value, visible: visibleColumnKeys.value, rows: rowsPerPage.value }));
  } catch (_) { /* storage is optional */ }
}
const activeFields = computed(() => fieldsAccessible.value ? allFieldDefinitions.value.filter(f => f?.is_active) : []);
const activeFormFields = computed(() => activeFields.value.filter(f => f.show_in_form !== false));
const allColumns = computed(() => {
  const candidates = [...TEAMS_COLUMNS, ...activeFields.value.map(f => ({ key: `custom:${f.id}`, label: f.field_label, kind: 'custom', field: f }))];
  const positions = new Map(columnOrder.value.map((k, i) => [k, i]));
  return candidates.sort((a,b) => (positions.get(a.key) ?? 9999) - (positions.get(b.key) ?? 9999));
});
const displayedColumns = computed(() => allColumns.value.filter(c => visibleColumnKeys.value.includes(c.key)));
function setColumnVisible(key, checked) {
  if (['team_name','actions'].includes(key)) return;
  visibleColumnKeys.value = checked ? [...new Set([...visibleColumnKeys.value, key])] : visibleColumnKeys.value.filter(x => x !== key);
  persistPreferences();
}
function moveColumn(index, direction) {
  const keys = allColumns.value.map(c => c.key);
  const swap = index + direction;
  if (swap < 0 || swap >= keys.length) return;
  [keys[index], keys[swap]] = [keys[swap], keys[index]];
  columnOrder.value = keys;
  persistPreferences();
}
function resetColumns() { columnOrder.value = TEAMS_COLUMNS.map(c => c.key); visibleColumnKeys.value = [...INITIAL_VISIBLE, ...activeFields.value.filter(f => f.show_in_table).map(f => `custom:${f.id}`)]; persistPreferences(); }
const filteredTeams = computed(() => {
  const q = searchTerm.value.toLowerCase().trim();
  const arr = teams.value.filter(t => (statusFilter.value === 'all' || String(t.status_id) === statusFilter.value)
    && (!q || [t.team_name, t.team_code, t.description].some(x => String(x ?? '').toLowerCase().includes(q))));
  return arr.sort((a,b) => {
    let result = 0;
    if (sortField.value === 'members') result = (memberCounts.value[a.id] ?? 0) - (memberCounts.value[b.id] ?? 0);
    else if (sortField.value === 'created_at') result = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    else result = String(a[sortField.value] ?? '').localeCompare(String(b[sortField.value] ?? ''), undefined, { sensitivity:'base' });
    return (sortDir.value === 'asc' ? 1 : -1) * result || Number(a.id) - Number(b.id);
  });
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredTeams.value.length / rowsPerPage.value)));
const pagedTeams = computed(() => filteredTeams.value.slice((page.value - 1) * rowsPerPage.value, page.value * rowsPerPage.value));
const totalMemberships = computed(() => Object.values(memberCounts.value).reduce((sum, n) => sum + Number(n || 0), 0));
watch([searchTerm,statusFilter,sortField,sortDir,rowsPerPage], () => { page.value = 1; });
watch(pageCount, count => { if (page.value > count) page.value = count; });
watch(rowsPerPage, persistPreferences);
watch(() => props.content?.defaultPageSize, v => { const n = Number(v); if ([10,25,50,100].includes(n) && rowsPerPage.value !== n) rowsPerPage.value = n; }, { immediate:true });
watch(apiUrl, () => { restorePreferences(); refreshAll(); });
watch(apiKey, refreshAll);
watch(customEnabled, refreshAll);

function endpoint(table, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([name, value]) => { if (value !== undefined && value !== null) qs.set(name, String(value)); });
  return `${table}${qs.toString() ? `?${qs}` : ''}`;
}
async function api(path, { method = 'GET', body, prefer, headers = {} } = {}) {
  if (!configured.value) throw new Error('Configure the Supabase URL and publishable key first.');
  const responseHeaders = { apikey: apiKey.value, Accept:'application/json', ...headers };
  // New sb_publishable_ keys are NOT JWTs: do not send Authorization: Bearer sb_publishable_...
  if (apiKey.value.startsWith('eyJ')) responseHeaders.Authorization = `Bearer ${apiKey.value}`;
  if (body !== undefined) responseHeaders['Content-Type'] = 'application/json';
  if (prefer) responseHeaders.Prefer = prefer;
  let response;
  try {
    response = await fetch(`${apiUrl.value}/rest/v1/${path}`, { method, headers:responseHeaders, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  } catch (_) { throw new Error('Cannot reach Supabase (Failed to fetch). Verify the project URL and browser network/CORS.'); }
  if (!response.ok) {
    let detail = '';
    try { const json = await response.json(); detail = json?.message || json?.details || json?.hint || ''; } catch (_) { detail = response.statusText; }
    throw Object.assign(new Error(`HTTP ${response.status}: ${String(detail).slice(0,260)}`), { status:response.status });
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { throw new Error('Supabase returned unexpected response data.'); }
}
// Data REST API defaults to a maximum of 1000 rows. Read pages to avoid silently truncating results.
async function loadAll(table, params = {}, maxRecords = 20000) {
  const result = [];
  const batchSize = 1000;
  for (let start = 0; start < maxRecords; start += batchSize) {
    const data = await api(endpoint(table, { ...params, offset:start, limit:batchSize }));
    if (!Array.isArray(data)) throw new Error(`Unexpected data from ${table}.`);
    result.push(...data);
    if (data.length < batchSize) return result;
  }
  throw new Error(`${table} exceeds ${maxRecords} rows. Server-side pagination is required.`);
}
async function refreshAll() {
  const requestId = ++loadSerial;
  if (!configured.value) { loading.value=false; teams.value=[]; memberCounts.value={}; allFieldDefinitions.value=[]; fieldsAccessible.value=false; errors.value={core:'',memberships:''}; return; }
  loading.value=true; errors.value={core:'',memberships:''};
  const tasks = await Promise.allSettled([
    loadAll('teams', { select:'id,team_code,team_name,description,status_id,created_at,updated_at', order:'team_name.asc' }),
    loadAll('team_memberships', { select:'team_id,user_id' }),
    loadAll('user_statuses', { select:'id,status_name' }),
  ]);
  if (requestId !== loadSerial) return;
  const [teamResult, memberResult, statusResult] = tasks;
  if (teamResult.status === 'fulfilled') teams.value = teamResult.value;
  else { teams.value=[]; errors.value.core = cleanError(teamResult.reason); }
  if (memberResult.status === 'fulfilled') {
    const map = {};
    for (const record of memberResult.value) {
      const id = String(record?.team_id ?? '');
      if (!id || record?.user_id == null) continue;
      if (!map[id]) map[id] = new Set();
      map[id].add(record.user_id);
    }
    memberCounts.value=Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.size]));
  } else { memberCounts.value={}; errors.value.memberships=cleanError(memberResult.reason); }
  if (statusResult.status === 'fulfilled') statuses.value={...statuses.value, ...Object.fromEntries(statusResult.value.filter(x => x?.id != null).map(x => [x.id, x.status_name]))};
  if (customEnabled.value) await loadCustomFields(requestId);
  else { allFieldDefinitions.value=[]; fieldsAccessible.value=false; customValues.value={}; }
  if (requestId === loadSerial) loading.value=false;
}
async function loadCustomFields(requestId = loadSerial) {
  try {
    const defs = await loadAll('cra_custom_field_definitions', { select:'id,field_key,field_label,data_type,is_required,is_active,show_in_table,show_in_form,display_order,field_options', entity_table:'eq.teams', order:'display_order.asc,id.asc' });
    if (requestId !== loadSerial) return;
    allFieldDefinitions.value = defs;
    fieldsAccessible.value=true;
    // Include new visible custom columns in the user's default display only if no earlier column preference exists.
    let stored = false;
    try { stored = typeof window !== 'undefined' && !!window.localStorage.getItem(preferenceKey()); } catch (_) {}
    if (!stored) {
      visibleColumnKeys.value=[...new Set([...visibleColumnKeys.value, ...defs.filter(f => f.is_active && f.show_in_table).map(f => `custom:${f.id}`)])];
    }
    await loadCustomValues(requestId);
  } catch (_) {
    if (requestId !== loadSerial) return;
    fieldsAccessible.value=false;
    allFieldDefinitions.value=[];
    customValues.value={};
  }
}
async function loadCustomValues(requestId = loadSerial) {
  try {
    if (!activeFields.value.length) { customValues.value={}; return; }
    const records = await loadAll('cra_custom_field_values', { select:'field_definition_id,record_id,field_value' });
    if (requestId !== loadSerial) return;
    const known = new Set(activeFields.value.map(f => String(f.id)));
    const values = {};
    for (const record of records) {
      if (!known.has(String(record?.field_definition_id))) continue;
      if (!values[record.record_id]) values[record.record_id]={};
      values[record.record_id][record.field_definition_id]=record.field_value;
    }
    customValues.value=values;
  } catch (_) {
    if (requestId === loadSerial) { customValues.value={}; fieldsAccessible.value=false; }
  }
}
function rawCustomValue(teamId, field) { return customValues.value?.[teamId]?.[field?.id]; }
function formattedCustomValue(teamId, field) {
  const v = rawCustomValue(teamId, field);
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (field?.data_type === 'datetime') return formattedDate(v);
  return String(v);
}
function defaultCustomValue(field) { return field?.data_type === 'boolean' ? false : field?.data_type === 'multiselect' ? [] : ''; }
function populateCustomForm(team) {
  const result = {};
  for (const field of activeFormFields.value) {
    const v = team ? rawCustomValue(team.id, field) : undefined;
    if (v === undefined || v === null) result[field.id] = defaultCustomValue(field);
    else if (field.data_type === 'datetime' && typeof v === 'string') result[field.id] = v.slice(0,16);
    else result[field.id] = Array.isArray(v) ? [...v] : v;
  }
  customForm.value = result;
}
function openCreate() { if (!canEdit.value) return; selectedTeam.value=null; teamForm.value={team_name:'',description:'',status_id:1}; populateCustomForm(null); saveError.value=''; modalMode.value='create'; }
function openEdit(team) { if (!canEdit.value || !team) return; selectedTeam.value=team; teamForm.value={team_name:team.team_name || '',description:team.description || '',status_id:Number(team.status_id)}; populateCustomForm(team); saveError.value=''; modalMode.value='edit'; }
function closeTeamModal() { if (saving.value) return; modalMode.value=''; selectedTeam.value=null; saveError.value=''; }
async function openView(team) {
  if (!team) return;
  selectedTeam.value=team; detailMembers.value=[]; detailError.value=''; detailLoading.value=true; modalMode.value='view';
  try {
    const links = await loadAll('team_memberships', { select:'user_id', team_id:`eq.${team.id}` });
    const ids = [...new Set(links.map(x => Number(x?.user_id)).filter(Number.isSafeInteger))];
    if (ids.length) detailMembers.value = await loadAll('user_profiles', { select:'id,user_code,full_name,email,job_title,status_id', id:`in.(${ids.join(',')})`, order:'full_name.asc' });
  } catch (err) { detailError.value=cleanError(err); }
  finally { detailLoading.value=false; }
}
function customForStorage(field, input) {
  if (field.data_type === 'boolean') return !!input;
  if (field.data_type === 'multiselect') return safeArray(input).filter(x => typeof x === 'string');
  if (field.data_type === 'number') return input === '' || input == null ? undefined : Number(input);
  if (input == null || String(input).trim() === '') return undefined;
  if (field.data_type === 'datetime') {
    const datetime = new Date(input);
    if (!Number.isFinite(datetime.getTime())) throw new Error(`${field.field_label}: invalid date and time.`);
    return datetime.toISOString();
  }
  return String(input);
}
async function persistCustomFields(teamId) {
  if (!customEnabled.value || !fieldsAccessible.value || !activeFormFields.value.length) return;
  for (const field of activeFormFields.value) {
    const value = customForStorage(field, customForm.value[field.id]);
    const already = rawCustomValue(teamId, field);
    const empty = value === undefined || (Array.isArray(value) && !value.length);
    if (field.is_required && empty) throw new Error(`${field.field_label} is required.`);
    if (empty) {
      if (already !== undefined) await api(endpoint('cra_custom_field_values', { field_definition_id:`eq.${field.id}`, record_id:`eq.${teamId}` }), { method:'DELETE' });
      continue;
    }
    if (field.data_type === 'number' && !Number.isFinite(value)) throw new Error(`${field.field_label}: invalid number.`);
    if (already !== undefined) {
      if (JSON.stringify(value) !== JSON.stringify(already)) await api(endpoint('cra_custom_field_values', { field_definition_id:`eq.${field.id}`, record_id:`eq.${teamId}` }), { method:'PATCH', body:{field_value:value} });
    } else {
      await api('cra_custom_field_values', { method:'POST', body:{field_definition_id:field.id,record_id:teamId,field_value:value} });
    }
  }
}
async function saveTeam() {
  if (!canEdit.value || saving.value) return;
  const name = String(teamForm.value?.team_name ?? '').trim();
  if (!name) { saveError.value='Team Name is required.'; return; }
  // Validate user input before any server mutation; avoid predictable partial writes.
  try {
    for (const field of activeFormFields.value) {
      const value = customForStorage(field, customForm.value[field.id]);
      if (field.is_required && (value === undefined || (Array.isArray(value) && !value.length))) throw new Error(`${field.field_label} is required.`);
      if (field.data_type === 'number' && value !== undefined && !Number.isFinite(value)) throw new Error(`${field.field_label} must be a valid number.`);
    }
  } catch (err) { saveError.value=cleanError(err); return; }
  saving.value=true; saveError.value='';
  let savedTeam = null;
  try {
    const body = { team_name:name, description:String(teamForm.value?.description ?? '').trim() || null };
    if (modalMode.value === 'create') {
      const result = await api('teams', { method:'POST', prefer:'return=representation', body });
      savedTeam = Array.isArray(result) ? result[0] : null;
      if (!savedTeam?.id) throw new Error('Team creation returned no ID. Please refresh before retrying.');
    } else {
      body.status_id = Number(teamForm.value.status_id);
      const result = await api(endpoint('teams', { id:`eq.${selectedTeam.value?.id}` }), { method:'PATCH', prefer:'return=representation', body });
      savedTeam = Array.isArray(result) ? result[0] : null;
      if (!savedTeam?.id) throw new Error('Team update returned no record. Please refresh.');
    }
    await persistCustomFields(savedTeam.id);
    modalMode.value=''; selectedTeam.value=null; notice.value=`Team “${name}” saved successfully.`;
    await refreshAll();
  } catch (err) {
    if (savedTeam?.id) {
      modalMode.value='edit'; selectedTeam.value=savedTeam;
      teamForm.value.status_id = Number(savedTeam.status_id || 1);
      saveError.value=`The team was saved, but additional-field saving or refresh failed: ${cleanError(err)}. This form is now in Edit mode so retrying will not create a duplicate team.`;
    } else saveError.value=cleanError(err);
  } finally { saving.value=false; }
}
function openFieldManager() { showFieldManager.value=true; fieldError.value=''; }
async function createField() {
  if (!fieldsAccessible.value || !canEdit.value || fieldSaving.value) return;
  const key = String(newField.value.key || '').trim().toLowerCase();
  const label = String(newField.value.label || '').trim();
  if (!/^[a-z][a-z0-9_]*$/.test(key) || !label) { fieldError.value='Enter a label and a valid lowercase field key.'; return; }
  const isSelect = ['select','multiselect'].includes(newField.value.type);
  const options = isSelect ? newField.value.optionsText.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : [];
  if (isSelect && (!options.length || new Set(options).size !== options.length)) { fieldError.value='Dropdown options must be non-empty and unique.'; return; }
  fieldSaving.value=true; fieldError.value='';
  try {
    await api('cra_custom_field_definitions', { method:'POST', body:{ entity_table:'teams', field_key:key, field_label:label, data_type:newField.value.type, field_options:options, is_required:!!newField.value.required, is_active:true, show_in_table:!!newField.value.showInTable, show_in_form:true, display_order:allFieldDefinitions.value.length + 1 } });
    newField.value=emptyNewField();
    await refreshAll();
    notice.value=`Custom field “${label}” created.`;
  } catch (err) { fieldError.value=cleanError(err); }
  finally { fieldSaving.value=false; }
}
async function toggleField(field) {
  if (!fieldsAccessible.value || !canEdit.value || fieldSaving.value) return;
  fieldSaving.value=true; fieldError.value='';
  try {
    await api(endpoint('cra_custom_field_definitions', { id:`eq.${field.id}` }), { method:'PATCH', body:{is_active:!field.is_active} });
    await refreshAll();
  } catch (err) { fieldError.value=cleanError(err); }
  finally { fieldSaving.value=false; }
}
onMounted(() => { restorePreferences(); refreshAll(); });
</script>

<style scoped>
.bt-root{box-sizing:border-box;width:100%;min-width:0;max-width:100%;background:#fff;color:#263951;font:14px/1.5 Inter,Arial,Helvetica,sans-serif;padding:24px 24px 28px}.bt-root *, .bt-root *::before,.bt-root *::after{box-sizing:border-box}.bt-root h1,.bt-root h2,.bt-root h3,.bt-root p{margin:0}.bt-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}.bt-crumb{color:#8a99ae;font-size:12px;margin-bottom:8px}.bt-heading h1{font-size:25px;font-weight:750;letter-spacing:-.65px;color:#1d3150}.bt-heading p{color:#8292a8;margin-top:3px;font-size:13px}.bt-toolbar{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding-top:26px}.bt-btn,.bt-root select,.bt-root input,.bt-root textarea{font:inherit;color:inherit;border:1px solid #d8e1ed;border-radius:8px;background:#fff;min-height:36px}.bt-btn{cursor:pointer;padding:8px 13px;white-space:nowrap;font-weight:550}.bt-btn:hover:not(:disabled){background:#f5f8fd}.bt-btn:disabled{opacity:.45;cursor:not-allowed}.bt-primary{background:#2858b9;color:#fff;border-color:#2858b9}.bt-primary:hover:not(:disabled){background:#1e4da8}.bt-root input,.bt-root textarea,.bt-root select{padding:8px 10px;max-width:100%}.bt-root input:focus,.bt-root select:focus,.bt-root textarea:focus,.bt-btn:focus-visible{outline:2px solid #a2bdf2;outline-offset:2px}.bt-banner{border-radius:8px;border:1px solid;margin-top:14px;padding:10px 13px;font-size:13px;overflow-wrap:anywhere}.bt-info{background:#f0f6ff;border-color:#bad0f8;color:#264a7a}.bt-warning{background:#fff9eb;border-color:#efcf91;color:#805a12}.bt-danger{background:#fff3f2;border-color:#ebb9b7;color:#a03937}.bt-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:22px 0 16px}.bt-kpis.bt-four{grid-template-columns:repeat(4,minmax(0,1fr))}.bt-kpi{background:#f7f9fc;border:1px solid #dfe7f2;padding:15px 17px;border-radius:10px;min-width:0}.bt-kpi span,.bt-kpi small{display:block;color:#7488a4;font-size:12px}.bt-kpi strong{display:block;font-size:27px;line-height:1.3;margin:5px 0;font-weight:750;color:#203653}.bt-filters{display:flex;gap:10px;align-items:center;margin:17px 0 14px}.bt-search{flex:1;min-width:120px}.bt-search input{width:100%}.bt-select{min-width:135px}.bt-select select{width:100%}.bt-icon-btn{width:38px;font-size:17px;padding:5px}.bt-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.bt-table-scroll{border:1px solid #dfe6ef;border-radius:9px;overflow-x:auto;max-width:100%;outline-offset:2px}.bt-table{width:100%;min-width:720px;border-collapse:separate;border-spacing:0;text-align:left}.bt-table thead th{background:#f7f9fc;color:#627793;font-size:12px;font-weight:700;white-space:nowrap;border-bottom:1px solid #dce4ef}.bt-table th,.bt-table td{padding:12px 13px;border-bottom:1px solid #e9eef4;vertical-align:middle}.bt-table tbody tr:last-child td{border-bottom:0}.bt-table tbody tr:hover{background:#fbfdff}.bt-team-name{font-weight:650;color:#263f60}.bt-code{font-size:12px;font-weight:600;color:#526b87;white-space:nowrap}.bt-desc{display:inline-block;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;color:#697a91}.bt-pill{font-size:11px;font-weight:700;border-radius:16px;padding:4px 9px;white-space:nowrap}.bt-active{background:#e8f7ed;color:#167545}.bt-inactive{background:#f1f3f7;color:#657388}.bt-archived{background:#fff2db;color:#93600c}.bt-member-link{color:#2760b6;text-decoration:none;background:none;border:none;padding:0;cursor:pointer;font:inherit}.bt-member-link:hover{text-decoration:underline}.bt-row-actions{display:flex;gap:6px;white-space:nowrap}.bt-row-actions button{font:inherit;padding:5px 9px;border-radius:6px;border:1px solid #dce4ed;background:#fff;cursor:pointer;color:#27529a;font-size:12px}.bt-row-actions button:hover{background:#eef4ff}.bt-empty{text-align:center;color:#8a9aaf;padding:52px 18px!important}.bt-footer{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:12px;margin-top:12px;color:#72839d}.bt-pager{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.bt-pager label{display:flex;align-items:center;gap:5px}.bt-pager select{min-height:31px;padding:4px 7px}.bt-pager .bt-btn{min-height:31px;padding:5px 10px}.bt-backdrop{position:fixed;inset:0;background:rgba(20,35,58,.55);z-index:2147480000;display:flex;align-items:center;justify-content:center;padding:20px}.bt-modal{width:min(600px,100%);max-height:min(87vh,850px);overflow-y:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 17px 60px rgba(0,0,0,.2);color:#263951}.bt-column-modal{width:min(490px,100%)}.bt-modal-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin-bottom:20px}.bt-modal-head h2{font-size:20px;color:#213956}.bt-modal-head p{font-size:12px;color:#8292a8;margin-top:4px}.bt-close{border:0;background:none;font:inherit;font-size:25px;line-height:1;color:#75889f;cursor:pointer}.bt-modal-actions{display:flex;justify-content:flex-end;align-items:center;gap:9px;margin-top:22px;flex-wrap:wrap}.bt-helper{font-size:11px;color:#8391a5;margin-right:auto}.bt-list{border:1px solid #e3e9f2;border-radius:8px;overflow:hidden}.bt-list-row{padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #e9eff6}.bt-list-row:last-child{border-bottom:0}.bt-list-row label{display:flex;gap:9px;align-items:center;cursor:pointer}.bt-list-row input[type=checkbox]{min-height:auto}.bt-list-row small{display:block;color:#8795a8;font-size:11px}.bt-move{display:flex;gap:4px}.bt-move button{border:1px solid #dae3ef;border-radius:5px;background:#fff;cursor:pointer;padding:3px 10px}.bt-move button:disabled{opacity:.3;cursor:default}.bt-field{display:block;margin:14px 0;font-weight:600;font-size:13px}.bt-field>span,.bt-field>label{display:block;margin-bottom:6px}.bt-field>input,.bt-field>textarea,.bt-field>select{width:100%;display:block;font-weight:400}.bt-field em{font-style:normal;color:#c74342}.bt-field small{display:block;color:#7b8a9d;font-size:11px;margin-top:4px;font-weight:400}.bt-inline-checkbox{display:flex!important;align-items:center;gap:7px;font-weight:400}.bt-inline-checkbox input{min-height:unset}.bt-subheading{font-size:14px;color:#344f70;margin:18px 0 9px!important}.bt-subheading span{color:#8c9ab0;font-weight:500}.bt-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 20px}.bt-detail-grid>div>span{font-size:11px;display:block;color:#8293a9;margin-bottom:4px}.bt-detail-grid>div>b{font-size:13px;font-weight:650;overflow-wrap:anywhere}.bt-detail-grid .bt-full{grid-column:1/-1}.bt-detail-grid .bt-full p{color:#52657e;white-space:pre-wrap}.bt-member-list{border:1px solid #e1e8f1;border-radius:8px;max-height:270px;overflow:auto}.bt-member{display:flex;gap:11px;align-items:center;padding:11px 12px;border-bottom:1px solid #e8edf4}.bt-member:last-child{border:0}.bt-member>div:nth-child(2){flex:1;min-width:0}.bt-member strong,.bt-member small{display:block}.bt-member small{color:#74859c;font-size:11px}.bt-avatar{width:35px;height:35px;border-radius:50%;background:#e8effa;color:#315a99;font-size:12px;font-weight:750;display:grid;place-items:center;flex:none}.bt-muted{padding:16px;border-radius:8px;background:#f8fafc;color:#8190a3;font-size:13px}.bt-extra-fields,.bt-detail-fields,.bt-field-creator{border-top:1px solid #e5eaf2;margin-top:18px;padding-top:5px}.bt-check{display:flex;align-items:center;gap:8px;font-size:13px;margin:12px 0}.bt-check input{min-height:unset}.bt-root button{transition:background-color .1s ease}.bt-root textarea{resize:vertical}@media(max-width:1050px){.bt-kpis.bt-four{grid-template-columns:repeat(2,minmax(0,1fr))}.bt-toolbar{padding-top:0}}@media(max-width:690px){.bt-root{padding:14px 12px}.bt-toolbar{justify-content:flex-start}.bt-kpis,.bt-kpis.bt-four{grid-template-columns:repeat(2,minmax(0,1fr))}.bt-kpi{padding:12px}.bt-filters{flex-wrap:wrap}.bt-search{flex-basis:100%}.bt-select{flex:1;min-width:110px}.bt-detail-grid{grid-template-columns:1fr}.bt-modal{padding:18px}.bt-backdrop{padding:8px}}
</style>
