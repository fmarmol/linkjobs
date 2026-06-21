const ALARM_NAME = 'ljob-check';
const CHECK_INTERVAL_MINUTES = 30;
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');
const DEFAULT_CONFIG = { tech: 'golang', geoId: '104246759', regionName: 'Île-de-France' };

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.clearAll();
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.1,
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });
  // Preserve any existing config across updates; only seed it if absent.
  const { config } = await chrome.storage.local.get('config');
  chrome.storage.local.set({
    status: 'installed',
    lastCheck: null,
    jobs: [],
    config: config || DEFAULT_CONFIG,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await ensureOffscreenAndCheck();
  }
});

// Allow popup to manually trigger a check
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'forceCheck') {
    ensureOffscreenAndCheck().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'offscreenReady') {
    console.log('[LJob] offscreen ready, triggering check');
    sendCheckJobs();
  }
  if (msg.action === 'newJobsFound') {
    handleNewJobs(msg.jobs, msg.fresh || []);
  }
  if (msg.action === 'checkError') {
    console.error('[LJob] error:', msg.error);
    chrome.storage.local.set({ status: 'Error: ' + msg.error });
  }
  if (msg.action === 'debugInfo') {
    chrome.storage.local.set({ debugInfo: { ...msg.info, ts: Date.now() } });
  }
});

async function ensureOffscreenAndCheck() {
  chrome.storage.local.set({ status: 'checking…' });

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL],
  });

  if (contexts.length === 0) {
    // Newly created: the offscreen doc will send 'offscreenReady' once its
    // message listener is registered, which triggers the check.
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_SCRAPING'],
      justification: 'Fetch and parse LinkedIn job data',
    });
    return;
  }

  // Already alive — trigger immediately.
  await sendCheckJobs();
}

async function getCsrfToken() {
  const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' });
  if (!cookie) return null;
  return cookie.value.replace(/"/g, '');
}

async function sendCheckJobs() {
  const { seenIds = [], config = DEFAULT_CONFIG } = await chrome.storage.local.get(['seenIds', 'config']);
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    console.warn('[LJob] No LinkedIn session — please log in to LinkedIn in this browser');
    chrome.storage.local.set({ status: 'Error: not logged in to LinkedIn' });
    return;
  }
  chrome.runtime.sendMessage({ action: 'checkJobs', seenIds, csrfToken, config }).catch(() => {});
}

async function handleNewJobs(allJobs, fresh) {
  const { seenIds = [], config = DEFAULT_CONFIG } = await chrome.storage.local.get(['seenIds', 'config']);
  const freshIds = fresh.map((j) => j.id);
  const freshSet = new Set(freshIds);

  // Display the full current match set, newly-found jobs first.
  const ordered = [...fresh, ...allJobs.filter((j) => !freshSet.has(j.id))].slice(0, 100);

  await chrome.storage.local.set({
    seenIds: [...new Set([...seenIds, ...allJobs.map((j) => j.id)])],
    freshIds,
    jobs: ordered,
    lastCheck: Date.now(),
    status: fresh.length
      ? `${fresh.length} new job${fresh.length !== 1 ? 's' : ''} found`
      : `${allJobs.length} job${allJobs.length !== 1 ? 's' : ''}, none new`,
  });

  if (fresh.length === 0) return;

  // Notify only about freshly-discovered jobs: up to 3 individual then a summary.
  const preview = fresh.slice(0, 3);
  for (const job of preview) {
    chrome.notifications.create(`ljob-${job.id}`, {
      type: 'basic',
      iconUrl: 'icon48.png',
      title: job.title,
      message: `${job.company} · ${job.location}`,
    });
  }

  if (fresh.length > 3) {
    chrome.notifications.create('ljob-summary', {
      type: 'basic',
      iconUrl: 'icon48.png',
      title: `${fresh.length} new ${config.tech} jobs · ${config.regionName}`,
      message: 'Click to open LinkedIn',
    });
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  const { config = DEFAULT_CONFIG } = await chrome.storage.local.get('config');
  const keywords = encodeURIComponent(config.tech);
  chrome.tabs.create({
    url: `https://www.linkedin.com/jobs/search/?keywords=${keywords}&geoId=${config.geoId}&f_TPR=r604800`,
  });
});
