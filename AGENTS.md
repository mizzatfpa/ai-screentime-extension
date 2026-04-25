# AGENTS.md — AI Screentime Tracker Chrome Extension

## Project Overview

Build a Chrome Extension that silently tracks how much time a user spends on AI chat platforms (ChatGPT, Gemini, Claude, Grok) and presents the data in a clean, minimalist dashboard popup.

---

## Goals

- Track active tab time on supported AI domains
- Distinguish per-platform time (ChatGPT, Gemini, Claude, Grok)
- Show a daily and weekly summary in a popup dashboard
- Reset data daily at midnight (local time)
- Store data locally using `chrome.storage.local` — no external server
- UI: minimal, clean, monochrome-first design with subtle accent colors per platform

---

## Directory Structure

```
ai-screentime/
├── manifest.json
├── background/
│   └── background.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   └── content.js
├── assets/
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
└── AGENTS.md
```

---

## Manifest Configuration

**File:** `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "AI Screentime",
  "version": "1.0.0",
  "description": "Track your time on ChatGPT, Gemini, Claude, and Grok.",
  "permissions": [
    "tabs",
    "storage",
    "alarms",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "https://x.ai/*",
    "https://grok.com/*"
  ],
  "background": {
    "service_worker": "background/background.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon16.png",
      "32": "assets/icons/icon32.png",
      "48": "assets/icons/icon48.png",
      "128": "assets/icons/icon128.png"
    }
  },
  "icons": {
    "16": "assets/icons/icon16.png",
    "32": "assets/icons/icon32.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

**Rules:**
- Use Manifest V3 (MV3), not V2.
- Do not use `background.scripts` or `background.page` — those are MV2.
- Use `service_worker` under `background`.
- Do not request unnecessary permissions.

---

## Platform Configuration

Define this as a shared config object used in both `background.js` and `popup.js`.

```js
// Inline in background.js and popup.js (or extract to a shared module if needed)
const PLATFORMS = {
  chatgpt: {
    label: "ChatGPT",
    domains: ["chatgpt.com", "chat.openai.com"],
    color: "#10a37f", // OpenAI green
  },
  gemini: {
    label: "Gemini",
    domains: ["gemini.google.com"],
    color: "#4285f4", // Google blue
  },
  claude: {
    label: "Claude",
    domains: ["claude.ai"],
    color: "#d97706", // Anthropic amber
  },
  grok: {
    label: "Grok",
    domains: ["grok.com", "x.ai"],
    color: "#6366f1", // xAI indigo
  },
};
```

**Rules:**
- Match platform by checking if the active tab's hostname includes any of the listed `domains`.
- Use `new URL(tab.url).hostname` for safe hostname extraction.
- Never hardcode URLs directly in tracking logic — always reference `PLATFORMS`.

---

## Background Service Worker

**File:** `background/background.js`

### Responsibilities
- Listen to tab activation, tab URL updates, and window focus changes.
- Track which platform is currently active and for how long.
- Write time increments to `chrome.storage.local` every 10 seconds.
- Register a daily alarm to reset today's data at midnight.

### Storage Schema

```js
// chrome.storage.local key structure
{
  "screentime": {
    "2025-04-25": {        // Date key: YYYY-MM-DD (local date)
      "chatgpt": 3200,     // Seconds spent on each platform
      "gemini": 540,
      "claude": 1800,
      "grok": 0
    },
    "2025-04-24": { ... }
  }
}
```

- Store up to 7 days of history.
- Prune entries older than 7 days on each write.
- Use `new Date().toLocaleDateString('en-CA')` for `YYYY-MM-DD` format (ISO-safe).

### Tracking Logic

```js
// Pseudocode — implement fully in background.js

let activeSession = {
  platformKey: null,   // e.g. "chatgpt"
  startTime: null,     // Date.now() timestamp
};

// Called whenever tab or window focus changes
function handleFocusChange(tabUrl) {
  // 1. Flush current session (save elapsed time to storage)
  flushSession();

  // 2. Identify new platform
  const platform = detectPlatform(tabUrl);

  // 3. Start new session if on a tracked platform
  if (platform) {
    activeSession = { platformKey: platform, startTime: Date.now() };
  } else {
    activeSession = { platformKey: null, startTime: null };
  }
}

// detectPlatform: returns platform key or null
function detectPlatform(url) {
  if (!url || !url.startsWith("http")) return null;
  try {
    const hostname = new URL(url).hostname;
    for (const [key, config] of Object.entries(PLATFORMS)) {
      if (config.domains.some(d => hostname.includes(d))) return key;
    }
  } catch (e) {}
  return null;
}

// flushSession: write elapsed seconds to storage
async function flushSession() {
  if (!activeSession.platformKey || !activeSession.startTime) return;
  const elapsed = Math.floor((Date.now() - activeSession.startTime) / 1000);
  if (elapsed <= 0) return;

  const today = getTodayKey();
  const data = await chrome.storage.local.get("screentime");
  const screentime = data.screentime || {};
  if (!screentime[today]) {
    screentime[today] = { chatgpt: 0, gemini: 0, claude: 0, grok: 0 };
  }
  screentime[today][activeSession.platformKey] += elapsed;

  // Prune old days
  const days = Object.keys(screentime).sort().reverse();
  if (days.length > 7) {
    days.slice(7).forEach(d => delete screentime[d]);
  }

  await chrome.storage.local.set({ screentime });
  activeSession.startTime = Date.now(); // reset start for ongoing session
}
```

### Event Listeners to Implement

| Event | Action |
|---|---|
| `chrome.tabs.onActivated` | Get new tab URL, call `handleFocusChange` |
| `chrome.tabs.onUpdated` | If `changeInfo.status === "complete"` and tab is active, call `handleFocusChange` |
| `chrome.windows.onFocusChanged` | If `windowId === chrome.windows.WINDOW_ID_NONE`, flush session. Else get active tab and call `handleFocusChange` |
| `chrome.alarms.onAlarm` | On alarm named `"flush"`, call `flushSession` |
| Service worker startup | Set up a repeating alarm every 10 seconds named `"flush"` |

**Rules:**
- Always call `flushSession()` before switching sessions.
- Always reset `activeSession.startTime = Date.now()` after flushing (so time is not double-counted).
- Do not use `setInterval` in service workers — use `chrome.alarms` instead.
- Use `chrome.tabs.query({ active: true, currentWindow: true })` to get the current active tab.

---

## Popup UI

### popup.html

**Structure:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Screentime</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <span class="header-title">AI Screentime</span>
      <span class="header-date" id="header-date"></span>
    </header>

    <!-- Total time card -->
    <div class="total-card">
      <div class="total-label">Today's Total</div>
      <div class="total-time" id="total-time">0h 0m</div>
    </div>

    <!-- Per-platform breakdown -->
    <div class="platform-list" id="platform-list">
      <!-- Injected by popup.js -->
    </div>

    <!-- Weekly chart -->
    <div class="weekly-section">
      <div class="section-label">Last 7 Days</div>
      <div class="bar-chart" id="bar-chart">
        <!-- Injected by popup.js -->
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <button class="reset-btn" id="reset-btn">Reset Today</button>
    </footer>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

---

### popup.css — Design Specification

**Design Direction:** Refined utilitarian minimalism. Tight typographic hierarchy. Monochrome base with single-pixel platform color accents. No shadows, no rounded excess, no gradients. Every element earns its space.

```css
/* ============================================================
   DESIGN TOKENS
   ============================================================ */
:root {
  --bg: #0e0e0e;
  --surface: #1a1a1a;
  --border: #2a2a2a;
  --text-primary: #f0f0f0;
  --text-secondary: #787878;
  --text-muted: #444;
  --accent: #f0f0f0;
  --danger: #e54d2e;
  --radius: 4px;
  --font-mono: "JetBrains Mono", "Fira Code", "Courier New", monospace;
  --font-sans: "Inter", system-ui, sans-serif;
}

/* ============================================================
   RESET & BASE
   ============================================================ */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  width: 320px;
  min-height: 460px;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ============================================================
   LAYOUT
   ============================================================ */
.container {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}

/* ============================================================
   HEADER
   ============================================================ */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.header-date {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

/* ============================================================
   TOTAL CARD
   ============================================================ */
.total-card {
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border);
}

.total-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.total-time {
  font-family: var(--font-mono);
  font-size: 36px;
  font-weight: 400;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1;
}

/* ============================================================
   PLATFORM LIST
   ============================================================ */
.platform-list {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.platform-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.platform-row-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.platform-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.platform-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.platform-bar-track {
  height: 2px;
  background: var(--border);
  border-radius: 1px;
  overflow: hidden;
}

.platform-bar-fill {
  height: 100%;
  border-radius: 1px;
  transition: width 0.4s ease;
}

/* ============================================================
   WEEKLY CHART
   ============================================================ */
.weekly-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.section-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 56px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.bar-col-inner {
  width: 100%;
  background: var(--surface);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
  /* height is set dynamically via inline style */
  min-height: 2px;
  max-height: 44px;
  transition: height 0.3s ease;
}

.bar-col-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #3a3a3a;
  border-radius: 2px;
  transition: height 0.4s ease;
}

.bar-col-fill.is-today {
  background: var(--text-primary);
}

.bar-col-day {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.bar-col-day.is-today {
  color: var(--text-secondary);
}

/* ============================================================
   FOOTER
   ============================================================ */
.footer {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
}

.reset-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 11px;
  padding: 5px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: color 0.15s, border-color 0.15s;
}

.reset-btn:hover {
  color: var(--danger);
  border-color: var(--danger);
}
```

**Design Rules (strictly follow):**
- Background: `#0e0e0e` (near-black, not pure black)
- Surface: `#1a1a1a`
- Borders: `1px solid #2a2a2a` — used as section dividers, never box-shadows
- Typography: Monospace for time values, sans-serif for labels
- Platform accent colors: only used in the progress bar fill, nowhere else
- No drop shadows anywhere
- No card elevation (no `box-shadow`)
- No gradients
- No emoji or icon fonts — text labels only
- Popup width: exactly `320px`
- Do not use rounded corners larger than `4px`
- The total time number must be the largest visual element (`36px`)

---

### popup.js — Logic Specification

**Responsibilities:**
- Read data from `chrome.storage.local`
- Flush the current live session from the background worker before rendering (send a message)
- Render today's total time
- Render per-platform rows with progress bars
- Render the 7-day bar chart
- Handle "Reset Today" button

**Helper Functions:**

```js
// Format seconds into "Xh Ym" or "Xm Ys"
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Get today's date key: YYYY-MM-DD
function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

// Get last 7 day keys including today
function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toLocaleDateString("en-CA");
  }).reverse(); // oldest first
}

// Short day label: "Mon", "Tue", etc.
function shortDay(dateKey) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[new Date(dateKey + "T00:00:00").getDay()];
}
```

**Render Flow:**

```js
// On DOMContentLoaded:
// 1. Send message to background to flush current session
// 2. Read chrome.storage.local
// 3. Render header date
// 4. Render total time card
// 5. Render per-platform rows
// 6. Render weekly bar chart
// 7. Attach reset button listener

async function init() {
  // 1. Flush live session
  await chrome.runtime.sendMessage({ type: "FLUSH_SESSION" });

  // 2. Load data
  const data = await chrome.storage.local.get("screentime");
  const screentime = data.screentime || {};
  const today = getTodayKey();
  const todayData = screentime[today] || { chatgpt: 0, gemini: 0, claude: 0, grok: 0 };

  // 3. Render header date
  document.getElementById("header-date").textContent = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });

  // 4. Total time
  const totalSeconds = Object.values(todayData).reduce((a, b) => a + b, 0);
  document.getElementById("total-time").textContent = formatTime(totalSeconds);

  // 5. Per-platform rows
  renderPlatformList(todayData, totalSeconds);

  // 6. Weekly bar chart
  renderWeeklyChart(screentime);

  // 7. Reset button
  document.getElementById("reset-btn").addEventListener("click", async () => {
    const confirmed = confirm("Reset today's data?");
    if (!confirmed) return;
    const data = await chrome.storage.local.get("screentime");
    const st = data.screentime || {};
    st[today] = { chatgpt: 0, gemini: 0, claude: 0, grok: 0 };
    await chrome.storage.local.set({ screentime: st });
    init();
  });
}

function renderPlatformList(todayData, totalSeconds) {
  const container = document.getElementById("platform-list");
  container.innerHTML = "";

  for (const [key, config] of Object.entries(PLATFORMS)) {
    const seconds = todayData[key] || 0;
    const pct = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;

    const row = document.createElement("div");
    row.className = "platform-row";
    row.innerHTML = `
      <div class="platform-row-header">
        <span class="platform-name">${config.label}</span>
        <span class="platform-time">${formatTime(seconds)}</span>
      </div>
      <div class="platform-bar-track">
        <div class="platform-bar-fill" style="width: ${pct}%; background: ${config.color};"></div>
      </div>
    `;
    container.appendChild(row);
  }
}

function renderWeeklyChart(screentime) {
  const container = document.getElementById("bar-chart");
  container.innerHTML = "";
  const days = getLast7Days();
  const today = getTodayKey();

  // Find max total across all 7 days for scaling
  const totals = days.map(d => {
    const day = screentime[d] || {};
    return Object.values(day).reduce((a, b) => a + b, 0);
  });
  const maxTotal = Math.max(...totals, 1);

  days.forEach((dateKey, i) => {
    const total = totals[i];
    const heightPct = (total / maxTotal) * 100;
    const fillHeight = Math.max(heightPct * 0.44, total > 0 ? 2 : 0); // max 44px
    const isToday = dateKey === today;

    const col = document.createElement("div");
    col.className = "bar-col";
    col.innerHTML = `
      <div class="bar-col-inner" style="height: 44px;">
        <div class="bar-col-fill ${isToday ? "is-today" : ""}" style="height: ${fillHeight}px;"></div>
      </div>
      <div class="bar-col-day ${isToday ? "is-today" : ""}">${shortDay(dateKey)}</div>
    `;
    container.appendChild(col);
  });
}

document.addEventListener("DOMContentLoaded", init);
```

---

## Background Message Handler

In `background.js`, add a listener so the popup can trigger a flush before reading:

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FLUSH_SESSION") {
    flushSession().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
});
```

---

## Content Script (Optional)

**File:** `content/content.js`

The content script is optional for this extension. Tracking is done entirely via the background service worker using tab events. Only add content script if you later need to:
- Detect page idle state (no user interaction for N seconds)
- Track sub-page navigation within a SPA (e.g., different conversations on claude.ai)

If added, inject via `chrome.scripting.executeScript` from the background — do not use `content_scripts` in the manifest unless needed for all page loads.

---

## Edge Cases & Rules

### Time Tracking
- If the user switches to a non-tracked tab, flush and stop the session immediately.
- If the browser window loses focus (`WINDOW_ID_NONE`), flush and pause the session.
- If the user reopens the same platform tab, start a fresh session (do not accumulate silently).
- Do not count time if the tab is loading (`status !== "complete"`).
- Cap any single flush increment at 30 seconds to prevent runaway counts from sleep/suspend.

### Storage
- Never write `null` or `undefined` to storage — always initialize platform keys with `0`.
- Always prune storage to a maximum of 7 days.
- Use `chrome.storage.local` only — never `localStorage`, `IndexedDB`, or remote storage.

### Popup
- If `screentime` has no data for today, show `0h 0m` — do not show errors or empty states.
- The "Reset Today" confirmation must use `confirm()` — no custom modals.
- Do not auto-refresh the popup — it reads data once on open (after flush).

### Manifest & Permissions
- Do not request `"tabs"` permission without justification — it is used to read `tab.url`.
- `"activeTab"` alone is not sufficient for background tracking — `"tabs"` is required.
- Do not add `"history"`, `"bookmarks"`, or any unneeded permissions.

---

## Testing Checklist

Before marking complete, verify:

- [ ] Open ChatGPT, wait 30s, open popup — shows ~30s for ChatGPT
- [ ] Switch to Gemini, wait 1m, open popup — ChatGPT shows ~30s, Gemini shows ~1m
- [ ] Close browser, reopen — data persists from `chrome.storage.local`
- [ ] Open a non-tracked tab (e.g., GitHub) — timer pauses, reopening AI tab resumes
- [ ] Click "Reset Today" — clears only today's data, yesterday's data remains
- [ ] Week chart shows all 7 days; today's bar is white, others are gray
- [ ] Platform progress bars are proportional to total time
- [ ] No console errors in background service worker or popup

---

## Implementation Order

1. `manifest.json` — set up extension shell
2. `background/background.js` — implement `PLATFORMS`, `detectPlatform`, `flushSession`, all event listeners, alarm setup, and message handler
3. `popup/popup.css` — implement full stylesheet per spec above
4. `popup/popup.html` — implement structure per spec above
5. `popup/popup.js` — implement `init`, `renderPlatformList`, `renderWeeklyChart`, helpers
6. Test with all 4 platforms
7. Load unpacked in `chrome://extensions` with Developer Mode enabled

---

## Out of Scope

Do not implement the following unless explicitly requested:

- Notifications or alerts when time limits are reached
- Site blocking or parental controls
- Sync across devices (`chrome.storage.sync`)
- Export to CSV or JSON
- Per-conversation tracking within a platform
- OAuth or user accounts
- Any remote analytics or telemetry