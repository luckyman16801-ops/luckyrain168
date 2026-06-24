export const CENTER = Object.freeze({
  name: "Phnom Penh, Cambodia",
  latitude: 11.5689,
  longitude: 104.9156,
  radiusKm: 100,
});

export const DIRECTIONS = Object.freeze([
  { label: "N", bearing: 0 },
  { label: "NNE", bearing: 22.5 },
  { label: "NE", bearing: 45 },
  { label: "ENE", bearing: 67.5 },
  { label: "E", bearing: 90 },
  { label: "ESE", bearing: 112.5 },
  { label: "SE", bearing: 135 },
  { label: "SSE", bearing: 157.5 },
  { label: "S", bearing: 180 },
  { label: "SSW", bearing: 202.5 },
  { label: "SW", bearing: 225 },
  { label: "WSW", bearing: 247.5 },
  { label: "W", bearing: 270 },
  { label: "WNW", bearing: 292.5 },
  { label: "NW", bearing: 315 },
  { label: "NNW", bearing: 337.5 },
]);

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation_probability",
  "cloud_cover",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
].join(",");

export class WeatherClient {
  constructor(fetchImpl = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async loadWeatherModel() {
    const locations = buildScanLocations(CENTER);
    const responses = await Promise.all(
      locations.map((location) => this.fetchForecast(location.latitude, location.longitude))
    );
    const [centerForecast, ...sectorForecasts] = responses;
    const current = normalizeCurrent(centerForecast);
    const sectors = sectorForecasts.map((forecast, index) =>
      buildSectorRisk(DIRECTIONS[index], forecast, current)
    );
    const confidence = calculateRainConfidence(current, sectors);

    return {
      center: CENTER,
      current,
      sectors,
      confidence,
      forecast: buildHourlyForecast(centerForecast),
      loadedAt: new Date(),
    };
  }

  async fetchForecast(latitude, longitude) {
    assertCoordinate(latitude, "latitude", -90, 90);
    assertCoordinate(longitude, "longitude", -180, 180);

    const params = new URLSearchParams({
      latitude: latitude.toFixed(5),
      longitude: longitude.toFixed(5),
      timezone: "Asia/Phnom_Penh",
      forecast_days: "2",
      current: FORECAST_FIELDS,
      hourly: FORECAST_FIELDS,
    });

    const response = await this.fetchImpl(`${OPEN_METEO_URL}?${params}`);
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.current || !payload.hourly) {
      throw new Error("Open-Meteo response did not include current and hourly weather data");
    }
    return payload;
  }
}

export function buildScanLocations(center) {
  return [
    center,
    ...DIRECTIONS.map((direction) => ({
      ...destinationPoint(center.latitude, center.longitude, direction.bearing, center.radiusKm),
      direction: direction.label,
    })),
  ];
}

export function destinationPoint(latitude, longitude, bearingDeg, distanceKm) {
  const earthRadiusKm = 6371.0088;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(latitude);
  const lon1 = toRadians(longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: toDegrees(lat2),
    longitude: ((toDegrees(lon2) + 540) % 360) - 180,
  };
}

export function calculateRainConfidence(current, sectors) {
  const activeSectors = sectors.filter((sector) => sector.riskScore >= 41).length;
  const pressureTrend = pressureTrendScore(current.pressureTrend);
  const windAlignment = directionalSectorScore(current.windDirection, sectors);
  const avgCloudCover = average(sectors.map((sector) => sector.cloudCover));
  const avgRainProbability = average(sectors.map((sector) => sector.rainProbability));

  const score =
    avgCloudCover * 0.18 +
    avgRainProbability * 0.28 +
    current.humidity * 0.16 +
    pressureTrend * 0.12 +
    windSpeedScore(current.windSpeed) * 0.08 +
    windAlignment * 0.08 +
    (activeSectors / DIRECTIONS.length) * 100 * 0.1;

  const confidence = clamp(Math.round(score), 0, 100);
  return {
    score: confidence,
    level: riskLevel(confidence),
    activeSectors,
    summary: buildSummary(confidence),
  };
}

function normalizeCurrent(forecast) {
  const current = forecast.current;
  const hourly = forecast.hourly;
  const currentIndex = Math.max(0, hourly.time.indexOf(current.time));
  const previousIndex = Math.max(0, currentIndex - 3);

  return {
    time: current.time,
    temperature: numberOrZero(current.temperature_2m),
    humidity: numberOrZero(current.relative_humidity_2m),
    rainProbability: numberOrZero(current.precipitation_probability),
    cloudCover: numberOrZero(current.cloud_cover),
    pressure: numberOrZero(current.surface_pressure),
    pressureTrend:
      numberOrZero(current.surface_pressure) - numberOrZero(hourly.surface_pressure?.[previousIndex]),
    windSpeed: numberOrZero(current.wind_speed_10m),
    windDirection: numberOrZero(current.wind_direction_10m),
  };
}

function buildSectorRisk(direction, forecast, current) {
  const hour = forecast.hourly;
  const nowIndex = Math.max(0, hour.time.indexOf(forecast.current.time));
  const lookahead = sliceWindow(nowIndex, 4);
  const cloudCover = average(lookahead.map((index) => numberOrZero(hour.cloud_cover?.[index])));
  const rainProbability = average(
    lookahead.map((index) => numberOrZero(hour.precipitation_probability?.[index]))
  );
  const humidity = average(lookahead.map((index) => numberOrZero(hour.relative_humidity_2m?.[index])));
  const pressure = average(lookahead.map((index) => numberOrZero(hour.surface_pressure?.[index])));
  const windSpeed = average(lookahead.map((index) => numberOrZero(hour.wind_speed_10m?.[index])));
  const windDirection = average(lookahead.map((index) => numberOrZero(hour.wind_direction_10m?.[index])));
  const directionalInfluence = bearingSimilarity(current.windDirection, direction.bearing);

  const riskScore = clamp(
    Math.round(
      cloudCover * 0.32 +
        rainProbability * 0.38 +
        humidity * 0.12 +
        windSpeedScore(windSpeed) * 0.08 +
        directionalInfluence * 0.1
    ),
    0,
    100
  );

  return {
    direction: direction.label,
    bearing: direction.bearing,
    cloudCover: Math.round(cloudCover),
    rainProbability: Math.round(rainProbability),
    humidity: Math.round(humidity),
    pressure: Math.round(pressure),
    windSpeed: Math.round(windSpeed),
    windDirection: Math.round(windDirection),
    riskScore,
    status: riskLevel(riskScore),
  };
}

function buildHourlyForecast(forecast) {
  const hour = forecast.hourly;
  const start = Math.max(0, hour.time.indexOf(forecast.current.time));
  return sliceWindow(start, 12).map((index) => ({
    time: hour.time[index],
    temperature: Math.round(numberOrZero(hour.temperature_2m?.[index])),
    humidity: Math.round(numberOrZero(hour.relative_humidity_2m?.[index])),
    rainProbability: Math.round(numberOrZero(hour.precipitation_probability?.[index])),
    cloudCover: Math.round(numberOrZero(hour.cloud_cover?.[index])),
  }));
}

function pressureTrendScore(trend) {
  if (trend <= -2.5) return 100;
  if (trend <= -1) return 72;
  if (trend < 0) return 52;
  return 24;
}

function windSpeedScore(speed) {
  if (speed >= 38) return 100;
  if (speed >= 24) return 78;
  if (speed >= 12) return 48;
  return 24;
}

function directionalSectorScore(windDirection, sectors) {
  if (!Number.isFinite(windDirection)) return 0;
  return Math.max(...sectors.map((sector) => sector.riskScore * (bearingSimilarity(windDirection, sector.bearing) / 100)));
}

function bearingSimilarity(a, b) {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return clamp(100 - (diff / 180) * 100, 0, 100);
}

function riskLevel(score) {
  if (score >= 71) return "HIGH";
  if (score >= 41) return "MEDIUM";
  return "LOW";
}

function buildSummary(score) {
  if (score >= 71) return "Potential rain within 1-3 hours. Monitor radar and prepare for active showers.";
  if (score >= 41) return "Rain ingredients are present. Conditions may strengthen within the next few hours.";
  return "Rain signal is limited across the 100 km scan. Continue normal monitoring.";
}

function sliceWindow(start, length) {
  return Array.from({ length }, (_, offset) => start + offset);
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function assertCoordinate(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}
