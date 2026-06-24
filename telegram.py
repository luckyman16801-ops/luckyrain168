#!/usr/bin/env python3
"""MR TP AI Weather Telegram alert runner.

This script is designed for GitHub Actions. It reads Telegram credentials from
environment variables, evaluates Open-Meteo weather risk around Phnom Penh, and
sends a LOW, MEDIUM, or HIGH alert without hardcoded secrets.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


CENTER_LATITUDE = 11.5689
CENTER_LONGITUDE = 104.9156
RADIUS_KM = 100
TIMEZONE = "Asia/Phnom_Penh"
DIRECTIONS = [
    ("N", 0),
    ("NNE", 22.5),
    ("NE", 45),
    ("ENE", 67.5),
    ("E", 90),
    ("ESE", 112.5),
    ("SE", 135),
    ("SSE", 157.5),
    ("S", 180),
    ("SSW", 202.5),
    ("SW", 225),
    ("WSW", 247.5),
    ("W", 270),
    ("WNW", 292.5),
    ("NW", 315),
    ("NNW", 337.5),
]


@dataclass(frozen=True)
class SectorRisk:
    direction: str
    cloud_cover: int
    rain_probability: int
    risk_score: int
    status: str


def main() -> int:
    token = require_env("TELEGRAM_BOT_TOKEN")
    chat_id = require_env("TELEGRAM_CHAT_ID")
    minimum_level = os.getenv("ALERT_MIN_LEVEL", "LOW").upper()

    try:
        model = build_weather_model()
        if level_rank(model["level"]) >= level_rank(minimum_level):
            send_telegram(token, chat_id, format_message(model))
        print(json.dumps(model, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f"weather alert failed: {exc}", file=sys.stderr)
        return 1


def build_weather_model() -> dict[str, Any]:
    center_forecast = fetch_forecast(CENTER_LATITUDE, CENTER_LONGITUDE)
    current = normalize_current(center_forecast)
    sectors = []

    for direction, bearing in DIRECTIONS:
        lat, lon = destination_point(CENTER_LATITUDE, CENTER_LONGITUDE, bearing, RADIUS_KM)
        forecast = fetch_forecast(lat, lon)
        sectors.append(build_sector_risk(direction, bearing, forecast, current))

    confidence = calculate_confidence(current, sectors)
    return {
        "location": "Phnom Penh",
        "level": confidence["level"],
        "confidence": confidence["score"],
        "active_sectors": confidence["active_sectors"],
        "current": current,
        "sectors": [sector.__dict__ for sector in sectors],
    }


def fetch_forecast(latitude: float, longitude: float) -> dict[str, Any]:
    params = urllib.parse.urlencode(
        {
            "latitude": f"{latitude:.5f}",
            "longitude": f"{longitude:.5f}",
            "timezone": TIMEZONE,
            "forecast_days": "2",
            "current": "temperature_2m,relative_humidity_2m,precipitation_probability,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m",
            "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m",
        }
    )
    return request_json(f"https://api.open-meteo.com/v1/forecast?{params}")


def request_json(url: str, attempts: int = 3) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(url, timeout=25) as response:
                if response.status >= 400:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(2 * attempt)
    raise RuntimeError(f"request failed after {attempts} attempts: {last_error}")


def normalize_current(forecast: dict[str, Any]) -> dict[str, float]:
    current = forecast["current"]
    hourly = forecast["hourly"]
    current_index = nearest_time_index(hourly["time"], current["time"])
    previous_index = max(0, current_index - 3)
    return {
        "temperature": number(current.get("temperature_2m")),
        "humidity": number(current.get("relative_humidity_2m")),
        "rain_probability": number(current.get("precipitation_probability")),
        "cloud_cover": number(current.get("cloud_cover")),
        "pressure": number(current.get("surface_pressure")),
        "pressure_trend": number(current.get("surface_pressure")) - number(hourly["surface_pressure"][previous_index]),
        "wind_speed": number(current.get("wind_speed_10m")),
        "wind_direction": number(current.get("wind_direction_10m")),
    }


def build_sector_risk(direction: str, bearing: float, forecast: dict[str, Any], current: dict[str, float]) -> SectorRisk:
    hourly = forecast["hourly"]
    now = nearest_time_index(hourly["time"], forecast["current"]["time"])
    indexes = safe_window(now, len(hourly["time"]), 4)
    cloud_cover = average(number(hourly["cloud_cover"][index]) for index in indexes)
    rain_probability = average(number(hourly["precipitation_probability"][index]) for index in indexes)
    humidity = average(number(hourly["relative_humidity_2m"][index]) for index in indexes)
    wind_speed = average(number(hourly["wind_speed_10m"][index]) for index in indexes)
    directional_influence = bearing_similarity(current["wind_direction"], bearing)
    risk_score = clamp(
        round(
            cloud_cover * 0.32
            + rain_probability * 0.38
            + humidity * 0.12
            + wind_speed_score(wind_speed) * 0.08
            + directional_influence * 0.1
        ),
        0,
        100,
    )
    return SectorRisk(
        direction=direction,
        cloud_cover=round(cloud_cover),
        rain_probability=round(rain_probability),
        risk_score=risk_score,
        status=risk_level(risk_score),
    )


def nearest_time_index(times: list[str], target: str) -> int:
    if not times:
        return 0
    if target in times:
        return times.index(target)

    target_minutes = time_to_minutes(target)
    distances = [abs(time_to_minutes(value) - target_minutes) for value in times]
    return distances.index(min(distances))


def safe_window(start: int, total: int, length: int) -> range:
    end = min(total, start + length)
    if end <= start:
        return range(max(0, total - 1), total)
    return range(start, end)


def time_to_minutes(value: str) -> int:
    try:
        date_part, time_part = value.split("T", 1)
        year, month, day = [int(part) for part in date_part.split("-")]
        hour, minute = [int(part) for part in time_part[:5].split(":")]
        return (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute
    except (ValueError, AttributeError):
        return 0


def calculate_confidence(current: dict[str, float], sectors: list[SectorRisk]) -> dict[str, Any]:
    active_sectors = len([sector for sector in sectors if sector.risk_score >= 41])
    avg_cloud = average(sector.cloud_cover for sector in sectors)
    avg_rain = average(sector.rain_probability for sector in sectors)
    wind_alignment = max(
        sector.risk_score * (bearing_similarity(current["wind_direction"], DIRECTIONS[index][1]) / 100)
        for index, sector in enumerate(sectors)
    )
    score = clamp(
        round(
            avg_cloud * 0.18
            + avg_rain * 0.28
            + current["humidity"] * 0.16
            + pressure_trend_score(current["pressure_trend"]) * 0.12
            + wind_speed_score(current["wind_speed"]) * 0.08
            + wind_alignment * 0.08
            + (active_sectors / len(DIRECTIONS)) * 100 * 0.1
        ),
        0,
        100,
    )
    return {"score": score, "level": risk_level(score), "active_sectors": active_sectors}


def format_message(model: dict[str, Any]) -> str:
    icon = {"LOW": "🟢", "MEDIUM": "🟠", "HIGH": "🔴"}[model["level"]]
    lead_time = "Potential rain within 1-3 hours." if model["level"] != "LOW" else "Low regional rain signal at this time."
    top_sectors = sorted(model["sectors"], key=lambda item: item["risk_score"], reverse=True)[:3]
    sector_line = ", ".join(f'{item["direction"]} {item["risk_score"]}%' for item in top_sectors)
    return (
        "🌦 MR TP AI WEATHER\n\n"
        "📍 Phnom Penh\n\n"
        "Regional Cloud Risk Scan\n\n"
        f"{icon} {model['level']} RISK\n\n"
        f"Confidence: {model['confidence']}%\n"
        f"Active sectors: {model['active_sectors']}/16\n"
        f"Top sectors: {sector_line}\n\n"
        f"{lead_time}"
    )


def send_telegram(token: str, chat_id: str, text: str) -> None:
    payload = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}).encode()
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    for attempt in range(1, 4):
        try:
            request = urllib.request.Request(url, data=payload, method="POST")
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status >= 400:
                    raise RuntimeError(f"Telegram HTTP {response.status}")
                return
        except (urllib.error.URLError, RuntimeError, TimeoutError) as exc:
            if attempt == 3:
                raise RuntimeError(f"Telegram send failed: {exc}") from exc
            time.sleep(2 * attempt)


def destination_point(latitude: float, longitude: float, bearing_deg: float, distance_km: float) -> tuple[float, float]:
    earth_radius_km = 6371.0088
    angular_distance = distance_km / earth_radius_km
    bearing = math.radians(bearing_deg)
    lat1 = math.radians(latitude)
    lon1 = math.radians(longitude)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), ((math.degrees(lon2) + 540) % 360) - 180


def pressure_trend_score(trend: float) -> int:
    if trend <= -2.5:
        return 100
    if trend <= -1:
        return 72
    if trend < 0:
        return 52
    return 24


def wind_speed_score(speed: float) -> int:
    if speed >= 38:
        return 100
    if speed >= 24:
        return 78
    if speed >= 12:
        return 48
    return 24


def bearing_similarity(a: float, b: float) -> float:
    diff = abs(((a - b + 540) % 360) - 180)
    return clamp(100 - (diff / 180) * 100, 0, 100)


def risk_level(score: int) -> str:
    if score >= 71:
        return "HIGH"
    if score >= 41:
        return "MEDIUM"
    return "LOW"


def level_rank(level: str) -> int:
    return {"LOW": 1, "MEDIUM": 2, "HIGH": 3}.get(level.upper(), 1)


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def average(values: Any) -> float:
    numbers = [float(value) for value in values if isinstance(value, (int, float))]
    return sum(numbers) / len(numbers) if numbers else 0.0


def number(value: Any) -> float:
    try:
        result = float(value)
        return result if math.isfinite(result) else 0.0
    except (TypeError, ValueError):
        return 0.0


def clamp(value: float, minimum: int, maximum: int) -> int:
    return int(min(maximum, max(minimum, value)))


if __name__ == "__main__":
    raise SystemExit(main())
