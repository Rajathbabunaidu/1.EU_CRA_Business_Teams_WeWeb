// Dependency-free, mock-only smoke test for the WeWeb component's Supabase calls.
// Run: npm run test:smoke. This is NOT a WeWeb compiler or live backend test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const vue = fs.readFileSync(new URL('../src/wwElement.vue', import.meta.url), 'utf8');
const script = vue.match(/<script setup>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Vue script exists');
const stub = `
const computed = f => ({ get value(){return f()} });
const ref = v => ({ value:v });
const onMounted = () => {};
const watch = () => {};
const defineProps = () => ({content:{supabaseUrl:'https://test-ref.supabase.co',supabasePublishableKey:'sb_publishable_TEST_ONLY',enableCustomFields:true,enableEditing:true}});
`;
const code = `${stub}\n${script.replace(/import \{[^}]+\} from 'vue';?/, '')}\nexport { api, refreshAll, teams, memberCounts, errors, fieldsAccessible, configured, openCreate, saveTeam, teamForm, selectedTeam, modalMode, pagedTeams, filteredTeams, rowsPerPage, openView, detailMembers };`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-teams-test-'));
try {
  const output = path.join(temp, 'component.mjs');
  fs.writeFileSync(output, code);
  const component = await import(pathToFileURL(output).href);
  assert.equal(component.configured.value, true);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.apikey, 'sb_publishable_TEST_ONLY');
    assert.equal(options.headers.Authorization, undefined, 'Publishable key must NOT be a JWT bearer');
    const u = new URL(url);
    if (u.pathname.endsWith('/cra_custom_field_definitions')) return { ok:false, status:403, json:async()=>({message:'permission denied'}) };
    let records = [];
    if (u.pathname.endsWith('/teams') && options.method === 'POST') records = [{id:99,team_code:'TEAM-00099',team_name:'New Team',description:null,status_id:1}];
    else if (u.pathname.endsWith('/teams')) records = [{id:7,team_code:'TEAM-00007',team_name:'Product Security Team (PST)',status_id:1},{id:15,team_code:'TEAM-00015',team_name:'Test',status_id:1}];
    else if (u.pathname.endsWith('/team_memberships')) records = u.searchParams.get('team_id') ? [{user_id:9}] : [{team_id:7,user_id:9},{team_id:7,user_id:13},{team_id:7,user_id:20},{team_id:7,user_id:43}];
    else if (u.pathname.endsWith('/user_statuses')) records = [{id:1,status_name:'Active'},{id:2,status_name:'Inactive'},{id:3,status_name:'Archived'}];
    else if (u.pathname.endsWith('/user_profiles')) records = [{id:9,user_code:'USR-00009',full_name:'Vivek',status_id:1}];
    return { ok:true, status:200, text:async()=>JSON.stringify(records) };
  };
  await component.refreshAll();
  assert.equal(component.teams.value.length, 2, 'Core teams load');
  assert.equal(component.memberCounts.value['7'], 4, 'Unique member count');
  assert.equal(component.fieldsAccessible.value, false, 'Restricted custom fields are optional');
  assert.equal(component.errors.value.core, '', 'Restricted fields must not break team table');
  assert.equal(component.pagedTeams.value.length, 2, 'Table rows available');
  await component.openView(component.teams.value[0]);
  assert.equal(component.detailMembers.value[0].full_name, 'Vivek', 'Read-only member detail loads');
  component.openCreate();
  component.teamForm.value.team_name = 'New Team';
  await component.saveTeam();
  assert.equal(component.modalMode.value, '', 'Create closes on success');
  assert.ok(calls.some(x => x.options.method === 'POST' && x.url.includes('/teams')), 'Create endpoint called');
  console.log('PASS: URL/key settings, apikey header, teams, member count, restricted-field fallback, member details, create workflow.');
} finally { fs.rmSync(temp, { recursive:true, force:true }); }
