const statusEl = document.getElementById('status');
const lastCheckEl = document.getElementById('lastCheck');
const jobList = document.getElementById('jobList');
const checkBtn = document.getElementById('checkBtn');
const techInput = document.getElementById('techInput');
const regionSelect = document.getElementById('regionSelect');
const saveBtn = document.getElementById('saveBtn');

// Region presets → LinkedIn geoId. geoIds are stable LinkedIn identifiers;
// add more by copying the geoId from a LinkedIn jobs search URL.
const REGIONS = [
  { name: 'Île-de-France', geoId: '104246759' },
  { name: 'France', geoId: '105015875' },
  { name: 'United Kingdom', geoId: '101165590' },
  { name: 'Germany', geoId: '101282230' },
  { name: 'Worldwide', geoId: '92000000' },
];

const DEFAULT_CONFIG = { tech: 'golang', geoId: '104246759', regionName: 'Île-de-France' };

regionSelect.innerHTML = REGIONS
  .map((r) => `<option value="${r.geoId}">${escHtml(r.name)}</option>`)
  .join('');

async function loadConfig() {
  const { config = DEFAULT_CONFIG } = await chrome.storage.local.get('config');
  techInput.value = config.tech;
  // Fall back to the first preset if the stored geoId isn't in the list.
  regionSelect.value = REGIONS.some((r) => r.geoId === config.geoId)
    ? config.geoId
    : REGIONS[0].geoId;
}

saveBtn.addEventListener('click', async () => {
  const tech = techInput.value.trim();
  if (!tech) {
    techInput.focus();
    return;
  }
  const region = REGIONS.find((r) => r.geoId === regionSelect.value) || REGIONS[0];
  const config = { tech, geoId: region.geoId, regionName: region.name };

  // New search criteria: clear the seen/displayed state so results refresh cleanly.
  await chrome.storage.local.set({ config, seenIds: [], freshIds: [], jobs: [] });

  saveBtn.disabled = true;
  saveBtn.textContent = 'Searching…';
  await chrome.runtime.sendMessage({ action: 'forceCheck' });
  setTimeout(async () => {
    await render();
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save & search';
  }, 5000);
});

async function render() {
  const { jobs = [], lastCheck, status = '' } = await chrome.storage.local.get([
    'jobs',
    'lastCheck',
    'status',
  ]);

  statusEl.textContent = status;
  lastCheckEl.textContent = lastCheck
    ? `Last check: ${new Date(lastCheck).toLocaleTimeString('fr-FR')}`
    : 'Never checked';

  if (jobs.length === 0) {
    jobList.innerHTML = '<div class="empty">No matching jobs found yet.<br>Check runs every 30 min — or hit “Check now”.</div>';
    return;
  }

  const { freshIds = [] } = await chrome.storage.local.get('freshIds');

  jobList.innerHTML = jobs
    .map((job) => {
      const isNew = freshIds.includes(job.id);
      return `
        <div class="job-card">
          <a class="job-title" href="${escHtml(job.url)}" target="_blank">
            ${escHtml(job.title)}${isNew ? '<span class="new-badge">NEW</span>' : ''}
          </a>
          <div class="job-meta">
            <span class="job-company">${escHtml(job.company)}</span>
            ${job.location ? ` · ${escHtml(job.location)}` : ''}
          </div>
        </div>`;
    })
    .join('');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

checkBtn.addEventListener('click', async () => {
  checkBtn.disabled = true;
  checkBtn.textContent = 'Checking…';
  await chrome.runtime.sendMessage({ action: 'forceCheck' });
  // Re-render after a few seconds to pick up results
  setTimeout(async () => {
    await render();
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check now';
  }, 5000);
});

// Listen for storage changes to live-update popup
chrome.storage.onChanged.addListener(render);

loadConfig();
render();
