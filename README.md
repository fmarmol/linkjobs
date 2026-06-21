# LJob – LinkedIn Job Monitor

A Chrome extension that quietly monitors LinkedIn in the background and notifies
you when new jobs matching a **technology** and **region** are posted. Configure
what to look for from the popup; the extension checks every 30 minutes and shows
a desktop notification when something new turns up.

It reuses your existing LinkedIn session in the browser — no login, no scraping
of pages you can see, no external server. Everything runs locally inside Chrome.

## Requirements

- Google Chrome (or a Chromium-based browser supporting Manifest V3 extensions).
- An active LinkedIn session in that browser — you must be **logged in to
  LinkedIn** for job lookups to work.

There is **no build step**. The extension is plain HTML/CSS/JavaScript and loads
as-is.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `ljob` folder.
4. The LJob icon appears in your toolbar. Pin it for easy access.

To apply code changes later, return to `chrome://extensions` and click the
reload ↻ icon on the LJob card.

## Use

Click the toolbar icon to open the popup.

### Configure the search

In the **settings bar** at the top:

- **Technology** — the keyword to match, e.g. `golang`, `rust`, `python`, `go`.
  It is used both to search LinkedIn and to filter job titles. Short or
  ambiguous terms (`go`, `r`, `c++`) are matched as standalone words, so `go`
  won't match inside "good".
- **Region** — pick from the preset dropdown (Île-de-France, France, United
  Kingdom, Germany, Worldwide).

Click **Save & search**. This stores your settings, clears previous results, and
runs an immediate check. Results appear in the list below.

### Reading results

- Each card shows the job **title**, **company**, and **location**, and links to
  the LinkedIn posting.
- A **NEW** badge marks jobs discovered in the most recent check.
- The header shows the current **status**; the meta row shows the **last check**
  time and a **Check now** button to trigger a check on demand.

### Notifications

When new matching jobs appear, you get desktop notifications (up to 3 individual
ones plus a summary). Clicking a notification opens the corresponding LinkedIn
jobs search. The background check runs automatically every **30 minutes**.

### Troubleshooting

The header **status** line reports what happened on the last check:

- `Error: not logged in to LinkedIn` → log in to LinkedIn in this browser.
- `N jobs, none new` → the search ran fine; nothing new since last time.
- Empty list after a check → try a different technology keyword, or LinkedIn may
  be rate-limiting (open the service worker console from `chrome://extensions` →
  **Inspect views: service worker** to see any `403`/`429` warnings).

## How it works

| File            | Role                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| `manifest.json` | Manifest V3 config, permissions, CSP.                                      |
| `background.js` | Service worker: 30-min alarm, config storage, notifications, coordination. |
| `offscreen.js`  | Offscreen document: fetches LinkedIn's Voyager API and filters by title.   |
| `popup.html/js` | UI: search settings, job list, status, debug panel.                        |

The flow: an alarm (or **Check now**) wakes the service worker, which ensures an
offscreen document exists and hands it your config. The offscreen document calls
LinkedIn's Voyager job-search API (authenticated with your session cookie),
filters the titles by technology, and sends matches back. The worker stores them
and fires notifications for anything new.

## Customizing region presets

The region dropdown is defined by the `REGIONS` array in `popup.js`, mapping a
display name to a LinkedIn **geoId**. To add or correct a region:

1. Run a jobs search on linkedin.com for the location you want.
2. Copy the `geoId=` value from the resulting URL.
3. Add an entry to `REGIONS`, e.g. `{ name: 'Amsterdam', geoId: '102011674' }`.

> **Note:** a wrong geoId fails silently — LinkedIn returns no/incorrect results
> rather than an error. Verify each geoId against a real LinkedIn search.

## Permissions

- `alarms` — schedule the periodic 30-minute check.
- `notifications` — desktop notifications for new jobs.
- `storage` — persist config, seen jobs, and results locally.
- `offscreen` — run the API fetch/filter outside the ephemeral service worker.
- `cookies` — read the LinkedIn `JSESSIONID` cookie for the CSRF token.
- `host_permissions: https://www.linkedin.com/*` — call the LinkedIn API.

No data leaves your browser; there is no backend.

## Notes & limitations

- Depends on LinkedIn's private Voyager API, which can change without notice and
  may rate-limit automated requests.
- Searches the last 7 days within ~50 km of the selected region.
- Intended for personal use; respect LinkedIn's Terms of Service.

## License

Released under the [MIT License](LICENSE). © 2026 Florent Marmol.
