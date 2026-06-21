const DEFAULT_CONFIG = { tech: 'golang', geoId: '104246759' };

// Search keyword variants for a technology, to widen recall across FR/EN postings.
function buildSearches(tech) {
  const t = tech.trim();
  return [...new Set([t, `développeur ${t}`, `${t} developer`])];
}

// Keep the job if its title mentions the technology. Short/ambiguous terms
// (≤3 chars, e.g. "go", "r", "c++") must appear as a standalone token so we
// don't match "go" inside "good"; longer terms match as a plain substring.
function titleMatches(title, tech) {
  const t = (title || '').toLowerCase();
  const term = tech.trim().toLowerCase();
  if (!term) return false;
  if (term.length <= 3) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t);
  }
  return t.includes(term);
}

// LinkedIn Voyager API – requires active LinkedIn session in browser
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'checkJobs') {
    runCheck(msg.seenIds || [], msg.csrfToken, msg.config || DEFAULT_CONFIG);
  }
});

// Tell the background worker the listener above is registered, so it only
// sends 'checkJobs' once this document is ready to receive it.
chrome.runtime.sendMessage({ action: 'offscreenReady' });

async function runCheck(seenIds, csrfToken, config) {
  const { tech, geoId } = config;
  try {
    const allJobs = [];

    for (const query of buildSearches(tech)) {
      const jobs = await fetchJobs(query, csrfToken, geoId);
      allJobs.push(...jobs);
    }

    const unique = [...new Map(allJobs.map((j) => [j.id, j])).values()];
    const filtered = unique.filter((j) => titleMatches(j.title, tech));
    const fresh = filtered.filter((j) => !seenIds.includes(j.id));

    chrome.runtime.sendMessage({ action: 'newJobsFound', jobs: filtered, fresh });
  } catch (err) {
    console.error('[LJob] check failed:', err);
    chrome.runtime.sendMessage({ action: 'checkError', error: String(err) });
  }
}

async function fetchJobs(query, csrfToken, geoId) {

  const allJobs = [];
  const PAGE_SIZE = 25;
  const MAX_PAGES = 4; // up to 100 results per query

  for (let page = 0; page < MAX_PAGES; page++) {
    const keywords = encodeURIComponent(query);
    const queryParam = `(origin:JOB_SEARCH_PAGE_KEYWORD_AUTOCOMPLETE,keywords:${keywords},locationUnion:(geoId:${geoId}),selectedFilters:(distance:List(50),timePostedRange:List(r604800)),spellCorrectionEnabled:true)`;
    const url = `https://www.linkedin.com/voyager/api/voyagerJobsDashJobCards?decorationId=com.linkedin.voyager.dash.deco.jobs.search.JobSearchCardsCollection-174&count=${PAGE_SIZE}&q=jobSearch&query=${queryParam}&start=${page * PAGE_SIZE}`;

    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'fr_FR',
        Accept: 'application/vnd.linkedin.normalized+json+2.1',
      },
    });

    if (!resp.ok) {
      console.warn(`[LJob] fetch failed (${resp.status}) for "${query}" page ${page}`);
      break;
    }

    const data = await resp.json();
    const jobs = parseVoyagerResponse(data);
    console.log(`[LJob] parsed ${jobs.length} jobs (page ${page})`);
    allJobs.push(...jobs);

    if (jobs.length < PAGE_SIZE) break;
  }

  return allJobs;
}

function parseVoyagerResponse(data) {
  const jobs = [];

  const included = {};
  for (const item of data.included || []) {
    if (item.entityUrn) included[item.entityUrn] = item;
  }

  for (const element of data.data?.elements || data.elements || []) {
    const cardUrn = element.jobCardUnion?.['*jobPostingCard'];
    if (!cardUrn) continue;

    const card = included[cardUrn];
    if (!card) continue;

    // URN format: urn:li:fsd_jobPostingCard:(4399750819,JOBS_SEARCH)
    const idMatch = cardUrn.match(/\((\d+),/);
    if (!idMatch) continue;

    const id = idMatch[1];
    const title = card.title?.text || card.title || '';
    if (!title) continue;

    jobs.push({
      id,
      title: title.trim(),
      company: card.primaryDescription?.text?.text || card.primaryDescription?.text || '',
      location: card.secondaryDescription?.text?.text || card.secondaryDescription?.text || '',
      url: `https://www.linkedin.com/jobs/view/${id}`,
    });
  }

  return jobs;
}

