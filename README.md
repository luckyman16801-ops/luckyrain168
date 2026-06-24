# MR TP AI Weather

Production-ready static weather monitoring dashboard for Phnom Penh, Cambodia.

## Features

- Professional dark responsive dashboard for desktop and mobile
- Khmer and English language switcher
- Open-Meteo current weather and 12-hour forecast
- 100 km regional cloud risk scan around Phnom Penh
- 16 direction sector model: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW
- AI rain confidence engine using cloud cover, rain probability, humidity, pressure trend, wind speed, wind direction, and active sectors
- Storm Compass Pro animated canvas visualization
- RainViewer radar animation with optional satellite layer
- GitHub Actions Telegram alerts every 10 minutes
- No hardcoded credentials

## Deploy To GitHub Pages

1. Commit these files to the repository root.
2. In GitHub, open **Settings > Pages**.
3. Set the source to the main branch and root folder.
4. Save. GitHub Pages will serve `index.html` directly.

## Telegram Secrets

Add these in **Settings > Secrets and variables > Actions > New repository secret**:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Do not commit secret values into the repository.

## Weather Alert Workflow

The workflow is located at `.github/workflows/weather.yml`.

It runs every 10 minutes and can also be started manually from the GitHub Actions tab. The Python alert engine uses only the standard library, so no dependency installation is required.

## Risk Levels

- `LOW RISK`: 0-40%
- `MEDIUM RISK`: 41-70%
- `HIGH RISK`: 71-100%

## Architecture

- `index.html`: accessible static shell for GitHub Pages
- `styles.css`: responsive professional dark theme
- `app.js`: dashboard state, rendering, language switching, and radar integration
- `weather.js`: Open-Meteo integration, 16-sector scan, and AI confidence model
- `stormCompass.js`: animated radar-style compass canvas
- `telegram.py`: GitHub Actions Telegram alert engine
- `.github/workflows/weather.yml`: scheduled alert workflow

## Monitoring Center

The application uses a Phnom Penh center point near St 134:

- Latitude: `11.5689`
- Longitude: `104.9156`
- Radius: `100 km`

## Security

- Telegram credentials are read from GitHub Secrets only.
- Browser code contains no private tokens.
- API calls validate coordinates and handle failed responses.
- GitHub Actions job has read-only repository permissions.

## Local Preview

Because the app uses ES modules, preview it with any static web server from the repository root.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
