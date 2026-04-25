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

const PLATFORM_KEYS = Object.keys(PLATFORMS);
const MAX_DAYS = 7;

function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }

  return `${m}m`;
}

function formatTotalTime(seconds) {
  if (seconds <= 0) {
    return "0h 0m";
  }

  return formatTime(seconds);
}

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getLast7Days() {
  return Array.from({ length: MAX_DAYS }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - i);
    return day.toLocaleDateString("en-CA");
  }).reverse();
}

function shortDay(dateKey) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[new Date(`${dateKey}T00:00:00`).getDay()];
}

function createEmptyDayData() {
  return PLATFORM_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
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

function getDayTotal(dayData) {
  return Object.values(dayData).reduce((acc, value) => acc + value, 0);
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
  const totals = days.map((dateKey) => {
    const dayData = sanitizeDayData(screentime[dateKey]);
    return getDayTotal(dayData);
  });
  const maxTotal = Math.max(...totals, 1);

  days.forEach((dateKey, index) => {
    const total = totals[index];
    const heightPct = (total / maxTotal) * 100;
    const fillHeight = Math.max(heightPct * 0.44, total > 0 ? 2 : 0);
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

function updateHeaderDate() {
  const headerDate = document.getElementById("header-date");
  headerDate.textContent = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function flushLiveSession() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "FLUSH_SESSION" }, () => {
      resolve();
    });
  });
}

function pruneScreentime(screentime) {
  const dates = Object.keys(screentime).sort().reverse();
  for (const dateKey of dates.slice(MAX_DAYS)) {
    delete screentime[dateKey];
  }
}

async function resetToday() {
  const confirmed = confirm("Reset today's data?");
  if (!confirmed) {
    return;
  }

  const today = getTodayKey();
  const { screentime: storedScreentime } = await chrome.storage.local.get("screentime");
  const screentime = storedScreentime && typeof storedScreentime === "object" ? storedScreentime : {};

  screentime[today] = createEmptyDayData();
  pruneScreentime(screentime);
  await chrome.storage.local.set({ screentime });

  await init();
}

async function init() {
  await flushLiveSession();

  const { screentime: storedScreentime } = await chrome.storage.local.get("screentime");
  const screentime = storedScreentime && typeof storedScreentime === "object" ? storedScreentime : {};
  const today = getTodayKey();
  const todayData = sanitizeDayData(screentime[today]);

  updateHeaderDate();

  const totalSeconds = getDayTotal(todayData);
  document.getElementById("total-time").textContent = formatTotalTime(totalSeconds);

  renderPlatformList(todayData, totalSeconds);
  renderWeeklyChart(screentime);

  document.getElementById("reset-btn").onclick = () => {
    resetToday().catch((error) => console.error("Failed to reset today's data", error));
  };
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => console.error("Failed to initialize popup", error));
});
