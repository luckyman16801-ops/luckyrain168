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
