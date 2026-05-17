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
let selectedDateKey = getTodayKey();
let currentScreentime = {};

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

function formatDateLabel(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatSelectedDayLabel(dateKey) {
  if (dateKey === getTodayKey()) {
    return "Today";
  }

  return `${shortDay(dateKey)} ${formatDateLabel(dateKey)}`;
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

function getPlatformIcon(platformKey) {
  if (platformKey === "chatgpt") {
    return `
      <span class="platform-logo platform-logo--chatgpt" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <g fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M24 8c5.6 0 8.8 3.1 9.8 7.4l-9.7 5.6-9.9-5.7C15.4 11.1 18.8 8 24 8Z"/>
            <path d="M37.4 17.5c2.8 4.8 1.6 9.1-1.6 12.1l-9.8-5.7v-11.4c4.3-1 8.8.4 11.4 5Z"/>
            <path d="M35.1 33.8c-2.8 4.8-7.1 6-11.3 4.7V27.2l9.8-5.7c3 3.1 4 7.7 1.5 12.3Z"/>
            <path d="M23.8 40c-5.6 0-8.8-3.1-9.8-7.4l9.7-5.6 9.9 5.7c-1.2 4.2-4.6 7.3-9.8 7.3Z"/>
            <path d="M10.6 30.5C7.8 25.7 9 21.4 12.2 18.4l9.8 5.7v11.4c-4.3 1-8.8-.4-11.4-5Z"/>
            <path d="M12.9 14.2c2.8-4.8 7.1-6 11.3-4.7v11.3l-9.8 5.7c-3-3.1-4-7.7-1.5-12.3Z"/>
          </g>
        </svg>
      </span>
    `;
  }

  if (platformKey === "gemini") {
    return `
      <span class="platform-logo platform-logo--gemini" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <path fill="currentColor" d="M24 2c3.1 11.2 10.8 18.9 22 22-11.2 3.1-18.9 10.8-22 22C20.9 34.8 13.2 27.1 2 24 13.2 20.9 20.9 13.2 24 2Z"/>
        </svg>
      </span>
    `;
  }

  if (platformKey === "claude") {
    return `<span class="platform-logo platform-logo--claude" aria-hidden="true">AI</span>`;
  }

  return `
    <span class="platform-logo platform-logo--grok" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <circle cx="24" cy="24" r="13" fill="none" stroke="#fff" stroke-width="4"/>
        <path d="M12 36 36 12" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
        <path d="M29 12h7v7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  `;
}

function getSelectedDayIndex(days = getLast7Days()) {
  const selectedIndex = days.indexOf(selectedDateKey);
  return selectedIndex === -1 ? days.length - 1 : selectedIndex;
}

function clampSelectedDate() {
  const days = getLast7Days();
  const selectedIndex = getSelectedDayIndex(days);
  selectedDateKey = days[selectedIndex];
}

function renderDayControls() {
  const days = getLast7Days();
  const selectedIndex = getSelectedDayIndex(days);
  const prevButton = document.getElementById("prev-day-btn");
  const nextButton = document.getElementById("next-day-btn");

  document.getElementById("selected-day-label").textContent = formatSelectedDayLabel(selectedDateKey);
  prevButton.disabled = selectedIndex <= 0;
  nextButton.disabled = selectedIndex >= days.length - 1;
}

function selectDay(dateKey) {
  const days = getLast7Days();
  if (!days.includes(dateKey)) {
    return;
  }

  selectedDateKey = dateKey;
  renderDashboard();
}

function navigateSelectedDay(offset) {
  const days = getLast7Days();
  const selectedIndex = getSelectedDayIndex(days);
  const nextIndex = selectedIndex + offset;
  if (nextIndex < 0 || nextIndex >= days.length) {
    return;
  }

  selectDay(days[nextIndex]);
}

function renderPlatformList(dayData, totalSeconds) {
  const container = document.getElementById("platform-list");
  container.innerHTML = "";

  for (const [key, config] of Object.entries(PLATFORMS)) {
    const seconds = dayData[key] || 0;
    const pct = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;

    const row = document.createElement("div");
    row.className = "platform-row";
    row.innerHTML = `
      ${getPlatformIcon(key)}
      <div class="platform-content">
        <span class="platform-name">${config.label}</span>
        <span class="platform-time">${formatTime(seconds)}</span>
        <div class="platform-bar-track">
          <div class="platform-bar-fill" style="width: ${pct}%; background: ${config.color};"></div>
        </div>
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
    const fillHeight = Math.max(heightPct * 0.82, total > 0 ? 10 : 0);
    const isToday = dateKey === today;
    const isSelected = dateKey === selectedDateKey;

    const col = document.createElement("button");
    col.type = "button";
    col.className = `bar-col${isSelected ? " is-selected" : ""}`;
    col.setAttribute("aria-label", `View ${formatDateLabel(dateKey)}`);
    col.innerHTML = `
      <div class="bar-col-inner">
        <div class="bar-col-fill ${isToday ? "is-today" : ""}" style="height: ${fillHeight}px;"></div>
      </div>
      <div class="bar-col-day ${isToday ? "is-today" : ""}">${shortDay(dateKey)}</div>
    `;
    col.addEventListener("click", () => selectDay(dateKey));
    container.appendChild(col);
  });
}

function updateHeaderDate(dateKey) {
  const headerDate = document.getElementById("header-date");
  headerDate.textContent = formatDateLabel(dateKey);
}

function renderDashboard() {
  clampSelectedDate();

  const selectedDayData = sanitizeDayData(currentScreentime[selectedDateKey]);
  const totalSeconds = getDayTotal(selectedDayData);
  const isToday = selectedDateKey === getTodayKey();

  updateHeaderDate(selectedDateKey);
  renderDayControls();
  document.getElementById("total-label").textContent = isToday ? "Today's Total" : "Day Total";
  document.getElementById("total-time").textContent = formatTotalTime(totalSeconds);

  renderPlatformList(selectedDayData, totalSeconds);
  renderWeeklyChart(currentScreentime);
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
  currentScreentime = storedScreentime && typeof storedScreentime === "object" ? storedScreentime : {};
  renderDashboard();

  document.getElementById("prev-day-btn").onclick = () => navigateSelectedDay(-1);
  document.getElementById("next-day-btn").onclick = () => navigateSelectedDay(1);
  document.getElementById("reset-btn").onclick = () => {
    resetToday().catch((error) => console.error("Failed to reset today's data", error));
  };
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => console.error("Failed to initialize popup", error));
});
