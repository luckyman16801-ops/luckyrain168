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
  const currentIndex = nearestTimeIndex(hourly.time, current.time);
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
  const nowIndex = nearestTimeIndex(hour.time, forecast.current.time);
  const lookahead = sliceWindow(nowIndex, 4, hour.time.length);
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
  const start = nearestTimeIndex(hour.time, forecast.current.time);
  return sliceWindow(start, 12, hour.time.length).map((index) => ({
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

function nearestTimeIndex(times, target) {
  if (!Array.isArray(times) || !times.length) return 0;
  const exact = times.indexOf(target);
  if (exact >= 0) return exact;

  const targetMinutes = timeToMinutes(target);
  const distances = times.map((value) => Math.abs(timeToMinutes(value) - targetMinutes));
  return distances.indexOf(Math.min(...distances));
}

function sliceWindow(start, length, total = Number.POSITIVE_INFINITY) {
  const end = Math.min(total, start + length);
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
}

function timeToMinutes(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return 0;
  const [, year, month, day, hour, minute] = match.map(Number);
  return (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;
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
