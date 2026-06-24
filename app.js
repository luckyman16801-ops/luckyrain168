import { CENTER, WeatherClient } from "./weather.js";
import { StormCompass } from "./stormCompass.js";

const translations = {
  en: {
    brandSubtitle: "Phnom Penh 100 km rain intelligence",
    navOverview: "Overview",
    navScan: "Risk Scan",
    navRadar: "Radar",
    eyebrow: "Live AI weather operations",
    heroTitle: "Phnom Penh Rain Confidence Command",
    heroText:
      "Real-time Open-Meteo forecasting, 16-direction regional cloud risk scanning, and radar animation for the next 1-3 hours.",
    viewScan: "View regional scan",
    viewRadar: "Open radar",
    confidence: "AI Rain Confidence",
    loading: "Loading live weather intelligence...",
    activeSectors: "active sectors",
    temperature: "Temperature",
    humidity: "Humidity",
    pressure: "Pressure",
    wind: "Wind",
    rainProbability: "Rain probability",
    updated: "Updated",
    scanEyebrow: "100 km radius",
    scanTitle: "Regional Cloud Risk Scan",
    lowRisk: "Low",
    mediumRisk: "Medium",
    highRisk: "High",
    sectorEyebrow: "16 direction scan",
    sectorTitle: "Sector Status",
    radarEyebrow: "RainViewer integration",
    radarTitle: "Live Radar",
    playRadar: "Play radar",
    pauseRadar: "Pause radar",
    satelliteLayer: "Satellite layer",
    forecastEyebrow: "Next 12 hours",
    forecastTitle: "Weather Forecast",
    footer: "Open-Meteo forecast data and RainViewer radar layers. Not for life-safety decisions.",
  },
  km: {
    brandSubtitle: "ប្រព័ន្ធវិភាគភ្លៀង ១០០ គម សម្រាប់ភ្នំពេញ",
    navOverview: "សង្ខេប",
    navScan: "ស្កេនហានិភ័យ",
    navRadar: "រ៉ាដា",
    eyebrow: "ប្រតិបត្តិការអាកាសធាតុ AI ផ្ទាល់",
    heroTitle: "មជ្ឈមណ្ឌលទំនុកចិត្តភ្លៀង ភ្នំពេញ",
    heroText: "ព្យាករណ៍ Open-Meteo ផ្ទាល់ ស្កេនពពក ១៦ ទិស និងរ៉ាដាចលនា សម្រាប់ ១-៣ ម៉ោងខាងមុខ។",
    viewScan: "មើលការស្កេនតំបន់",
    viewRadar: "បើករ៉ាដា",
    confidence: "ទំនុកចិត្តភ្លៀង AI",
    loading: "កំពុងទាញយកទិន្នន័យអាកាសធាតុ...",
    activeSectors: "តំបន់សកម្ម",
    temperature: "សីតុណ្ហភាព",
    humidity: "សំណើម",
    pressure: "សម្ពាធខ្យល់",
    wind: "ខ្យល់",
    rainProbability: "ឱកាសភ្លៀង",
    updated: "ធ្វើបច្ចុប្បន្នភាព",
    scanEyebrow: "កាំ ១០០ គម",
    scanTitle: "ស្កេនហានិភ័យពពកតំបន់",
    lowRisk: "ទាប",
    mediumRisk: "មធ្យម",
    highRisk: "ខ្ពស់",
    sectorEyebrow: "ស្កេន ១៦ ទិស",
    sectorTitle: "ស្ថានភាពតាមទិស",
    radarEyebrow: "ភ្ជាប់ RainViewer",
    radarTitle: "រ៉ាដាផ្ទាល់",
    playRadar: "ចាក់រ៉ាដា",
    pauseRadar: "ផ្អាករ៉ាដា",
    satelliteLayer: "ស្រទាប់ផ្កាយរណប",
    forecastEyebrow: "១២ ម៉ោងបន្ទាប់",
    forecastTitle: "ព្យាករណ៍អាកាសធាតុ",
    footer: "ទិន្នន័យពី Open-Meteo និងស្រទាប់រ៉ាដា RainViewer។ មិនមែនសម្រាប់ការសម្រេចចិត្តសុវត្ថិភាពជីវិត។",
  },
};

const state = {
  language: localStorage.getItem("mrtp-language") || "en",
  model: null,
  compass: null,
  map: null,
  radarFrames: [],
  radarLayer: null,
  radarIndex: 0,
  radarTimer: null,
  satelliteLayer: null,
};

const weatherClient = new WeatherClient();

document.addEventListener("DOMContentLoaded", () => {
  applyLanguage(state.language);
  setupLanguageButtons();
  setupCompass();
  setupRadarWhenReady();
  document.querySelector("#refreshButton").addEventListener("click", () => refreshWeather());
  refreshWeather();
});

async function refreshWeather() {
  setLoading(true);
  try {
    state.model = await weatherClient.loadWeatherModel();
    renderDashboard(state.model);
  } catch (error) {
    console.error(error);
    document.querySelector("#riskSummary").textContent =
      "Weather data is temporarily unavailable. Please try refreshing in a moment.";
  } finally {
    setLoading(false);
  }
}

function setupCompass() {
  const canvas = document.querySelector("#stormCompass");
  state.compass = new StormCompass(canvas);
  state.compass.start();
}

function renderDashboard(model) {
  const { current, confidence, sectors, forecast } = model;
  const ring = document.querySelector(".confidence-ring");
  const riskClass = confidence.level.toLowerCase();

  ring.style.setProperty("--confidence", confidence.score);
  ring.style.setProperty("--ring-color", riskColor(confidence.level));
  document.querySelector("#confidenceValue").textContent = `${confidence.score}%`;
  document.querySelector("#riskLevel").textContent = `${confidence.level} RISK`;
  document.querySelector("#riskLevel").className = `risk-${riskClass}`;
  document.querySelector("#riskSummary").textContent = confidence.summary;
  document.querySelector("#activeSectors").textContent = confidence.activeSectors;

  document.querySelector("#temperature").textContent = `${Math.round(current.temperature)}°C`;
  document.querySelector("#humidity").textContent = `${Math.round(current.humidity)}%`;
  document.querySelector("#pressure").textContent = `${Math.round(current.pressure)} hPa`;
  document.querySelector("#wind").textContent = `${Math.round(current.windSpeed)} km/h ${bearingToCompass(current.windDirection)}`;
  document.querySelector("#rainProbability").textContent = `${Math.round(current.rainProbability)}%`;
  document.querySelector("#updatedAt").textContent = formatTime(model.loadedAt);

  renderSectors(sectors);
  renderForecast(forecast);
  state.compass.update({ sectors, confidence });
}

function renderSectors(sectors) {
  const container = document.querySelector("#sectorList");
  container.replaceChildren(
    ...sectors.map((sector) => {
      const row = document.createElement("div");
      row.className = "sector-row";
      row.innerHTML = `
        <div>
          <strong>${sector.direction}</strong>
          <div class="sector-meta">${sector.status} RISK</div>
        </div>
        <div class="sector-values">
          <span class="pill">Cloud ${sector.cloudCover}%</span>
          <span class="pill">Rain ${sector.rainProbability}%</span>
          <span class="pill risk-${sector.status.toLowerCase()}">Risk ${sector.riskScore}%</span>
        </div>
      `;
      return row;
    })
  );
}

function renderForecast(forecast) {
  const container = document.querySelector("#forecastCards");
  container.replaceChildren(
    ...forecast.map((hour) => {
      const card = document.createElement("div");
      card.className = "forecast-card";
      card.innerHTML = `
        <div>
          <strong>${formatHour(hour.time)}</strong>
          <span>${hour.temperature}°C · Humidity ${hour.humidity}%</span>
        </div>
        <div class="sector-values">
          <span class="pill">Rain ${hour.rainProbability}%</span>
          <span class="pill">Cloud ${hour.cloudCover}%</span>
        </div>
      `;
      return card;
    })
  );
}

function setupRadarWhenReady() {
  const load = () => {
    if (!window.L) {
      window.setTimeout(load, 120);
      return;
    }
    setupRadar();
  };
  load();
}

async function setupRadar() {
  state.map = L.map("radarMap", {
    center: [CENTER.latitude, CENTER.longitude],
    zoom: 8,
    minZoom: 6,
    maxZoom: 12,
    zoomControl: true,
  });

  const base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  state.satelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles &copy; Esri" }
  );

  L.circle([CENTER.latitude, CENTER.longitude], {
    radius: CENTER.radiusKm * 1000,
    color: "#54d9d7",
    fillColor: "#54d9d7",
    fillOpacity: 0.05,
    weight: 1,
  }).addTo(state.map);

  L.marker([CENTER.latitude, CENTER.longitude]).addTo(state.map).bindPopup("MR TP Center · Phnom Penh");
  document.querySelector("#satelliteLayer").addEventListener("change", (event) => {
    if (event.target.checked) {
      state.satelliteLayer.addTo(state.map);
      base.bringToBack();
    } else {
      state.map.removeLayer(state.satelliteLayer);
    }
  });

  document.querySelector("#playRadar").addEventListener("click", toggleRadarPlayback);
  await loadRadarFrames();
}

async function loadRadarFrames() {
  try {
    const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    if (!response.ok) throw new Error(`RainViewer request failed with ${response.status}`);
    const payload = await response.json();
    state.radarFrames = [...(payload.radar?.past || []), ...(payload.radar?.nowcast || [])].slice(-12);
    showRadarFrame(0);
  } catch (error) {
    console.error(error);
  }
}

function toggleRadarPlayback() {
  const button = document.querySelector("#playRadar");
  if (state.radarTimer) {
    window.clearInterval(state.radarTimer);
    state.radarTimer = null;
    button.textContent = translations[state.language].playRadar;
    return;
  }

  state.radarTimer = window.setInterval(() => {
    showRadarFrame((state.radarIndex + 1) % Math.max(1, state.radarFrames.length));
  }, 700);
  button.textContent = translations[state.language].pauseRadar;
}

function showRadarFrame(index) {
  if (!state.radarFrames.length || !state.map) return;
  state.radarIndex = index;
  const frame = state.radarFrames[index];
  const url = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  if (state.radarLayer) {
    state.radarLayer.setUrl(url);
  } else {
    state.radarLayer = L.tileLayer(url, {
      opacity: 0.72,
      zIndex: 40,
      attribution: "Radar &copy; RainViewer",
    }).addTo(state.map);
  }
}

function setupLanguageButtons() {
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });
}

function applyLanguage(language) {
  state.language = translations[language] ? language : "en";
  localStorage.setItem("mrtp-language", state.language);
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    element.textContent = translations[state.language][key] || translations.en[key] || element.textContent;
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.language);
  });
}

function setLoading(isLoading) {
  document.querySelector("#refreshButton").disabled = isLoading;
  document.querySelector("#refreshButton").style.opacity = isLoading ? "0.55" : "1";
}

function bearingToCompass(degrees) {
  const labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return labels[Math.round(((degrees % 360) / 22.5)) % 16];
}

function riskColor(level) {
  return { LOW: "#38d68f", MEDIUM: "#f4b942", HIGH: "#ff5a67" }[level] || "#38d68f";
}

function formatTime(date) {
  return new Intl.DateTimeFormat(state.language === "km" ? "km-KH" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Phnom_Penh",
  }).format(date);
}

function formatHour(value) {
  return new Intl.DateTimeFormat(state.language === "km" ? "km-KH" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Phnom_Penh",
  }).format(parsePhnomPenhTime(value));
}

function parsePhnomPenhTime(value) {
  return new Date(`${value}+07:00`);
}
