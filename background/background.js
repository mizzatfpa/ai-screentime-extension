const PLATFORMS = {
  chatgpt: {
    label: "ChatGPT",
    domains: ["chatgpt.com", "chat.openai.com"],
    color: "#10a37f"
  },
  gemini: {
    label: "Gemini",
    domains: ["gemini.google.com"],
    color: "#4285f4"
  },
  claude: {
    label: "Claude",
    domains: ["claude.ai"],
    color: "#d97706"
  },
  grok: {
    label: "Grok",
    domains: ["grok.com", "x.ai"],
    color: "#6366f1"
  }
};

const FLUSH_ALARM = "flush";
const DAILY_RESET_ALARM = "daily-reset";
const PLATFORM_KEYS = Object.keys(PLATFORMS);
const MAX_DAYS = 7;
const MAX_FLUSH_SECONDS = 30;
const FLUSH_PERIOD_MINUTES = 1 / 6;

let activeSession = {
  platformKey: null,
  startTime: null
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function createEmptyDayData() {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function getNextMidnightTimestamp() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

function detectPlatform(url) {
  if (!url || !url.startsWith("http")) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;
    for (const [platformKey, config] of Object.entries(PLATFORMS)) {
      if (config.domains.some((domain) => hostname.includes(domain))) {
        return platformKey;
      }
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function sanitizeDayData(dayData) {
  const normalized = createEmptyDayData();
  if (!dayData || typeof dayData !== "object") {
    return normalized;
  }

  for (const key of PLATFORM_KEYS) {
    const value = Number(dayData[key]);
    normalized[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  return normalized;
}

function pruneScreentime(screentime) {
  const days = Object.keys(screentime).sort().reverse();
  if (days.length <= MAX_DAYS) {
    return screentime;
  }

  for (const day of days.slice(MAX_DAYS)) {
    delete screentime[day];
  }

  return screentime;
}

async function flushSession() {
  if (!activeSession.platformKey || !activeSession.startTime) {
    return;
  }

  const elapsedRaw = Math.floor((Date.now() - activeSession.startTime) / 1000);
  if (elapsedRaw <= 0) {
    return;
  }

  const elapsed = Math.min(elapsedRaw, MAX_FLUSH_SECONDS);
  const today = getTodayKey();
  const { screentime: storedScreentime } = await chrome.storage.local.get("screentime");
  const screentime = storedScreentime && typeof storedScreentime === "object" ? storedScreentime : {};

  screentime[today] = sanitizeDayData(screentime[today]);
  screentime[today][activeSession.platformKey] += elapsed;

  pruneScreentime(screentime);
  await chrome.storage.local.set({ screentime });

  activeSession.startTime = Date.now();
}

async function resetTodayData() {
  const today = getTodayKey();
  const { screentime: storedScreentime } = await chrome.storage.local.get("screentime");
  const screentime = storedScreentime && typeof storedScreentime === "object" ? storedScreentime : {};

  screentime[today] = createEmptyDayData();
  pruneScreentime(screentime);

  await chrome.storage.local.set({ screentime });
}

async function handleFocusChange(tab) {
  await flushSession();

  if (!tab || !tab.url || tab.status !== "complete") {
    activeSession = { platformKey: null, startTime: null };
    return;
  }

  const platformKey = detectPlatform(tab.url);
  if (platformKey) {
    activeSession = { platformKey, startTime: Date.now() };
    return;
  }

  activeSession = { platformKey: null, startTime: null };
}

async function handleWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushSession();
    activeSession = { platformKey: null, startTime: null };
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, windowId });
  await handleFocusChange(tabs[0] || null);
}

async function initializeTracking() {
  await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_PERIOD_MINUTES });
  await chrome.alarms.create(DAILY_RESET_ALARM, { when: getNextMidnightTimestamp() });

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  await handleFocusChange(tabs[0] || null);
}

chrome.runtime.onInstalled.addListener(() => {
  initializeTracking().catch((error) => console.error("Initialization failed", error));
});

chrome.runtime.onStartup.addListener(() => {
  initializeTracking().catch((error) => console.error("Startup init failed", error));
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs
    .get(activeInfo.tabId)
    .then((tab) => handleFocusChange(tab))
    .catch((error) => console.error("Tab activation handling failed", error));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active) {
    return;
  }

  handleFocusChange(tab).catch((error) => console.error("Tab update handling failed", error));
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  handleWindowFocusChanged(windowId).catch((error) => console.error("Window focus handling failed", error));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    flushSession().catch((error) => console.error("Flush alarm failed", error));
    return;
  }

  if (alarm.name === DAILY_RESET_ALARM) {
    resetTodayData()
      .then(() => chrome.alarms.create(DAILY_RESET_ALARM, { when: getNextMidnightTimestamp() }))
      .catch((error) => console.error("Daily reset failed", error));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "FLUSH_SESSION") {
    flushSession()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
