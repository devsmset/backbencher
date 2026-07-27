# Session Recorder + API Call Filter

A minimal Playwright-based tool that:
1. Opens a browser and records a manual session (UI interactions + API calls), saving it to a JSON file on completion.
2. Filters a recorded session down to just its API calls (request + matching response), ordered by timestamp.

## 📁 Project Structure

```
project_2/
├── src/
│   ├── recorders/
│   │   └── recorder.js       # Records UI + API events, saves session JSON on ENTER
│   └── filters/
│       └── filter-api.js     # Extracts API calls from a recording, ordered by timestamp
│
├── recordings/                # Recorded sessions (JSON files)
│   ├── recording-*.json            # Raw recordings (all events)
│   └── *-api-calls.json            # Filtered output (API calls only)
│
├── package.json
└── README.md
```

## 🚀 Getting Started

```bash
npm install
```

## 1. Record a session

```bash
npm run record
# or with a custom URL
node src/recorders/recorder.js https://your-app-url
```

This opens a browser. Interact with the app manually (click, type, navigate). When done, press **ENTER** in the terminal to stop and save the session to `recordings/recording-<timestamp>.json`.

## 2. Filter out the API calls

```bash
npm run filter recordings/recording-<timestamp>.json
```

This reads the recording, keeps only the API request/response events, pairs each request with its response, sorts them chronologically by timestamp, and writes `recordings/recording-<timestamp>-api-calls.json`.

## 📝 Output Formats

**Raw recording** (`recording-<timestamp>.json`):
```json
{
  "meta": { "url": "...", "timestamp": 1766507394510, "userAgent": "..." },
  "events": [
    { "type": "navigation", "timestamp": 1766507394600, "url": "..." },
    { "type": "api_request", "timestamp": 1766507394700, "method": "GET", "url": "..." },
    { "type": "api_response", "timestamp": 1766507394800, "url": "...", "status": 200 },
    { "type": "ui_event", "timestamp": 1766507395123, "action": "click", "locators": { "...": "..." } }
  ]
}
```

**Filtered API calls** (`recording-<timestamp>-api-calls.json`):
```json
{
  "meta": { "sourceFile": "recording-<timestamp>.json", "totalApiCalls": 2 },
  "apiCalls": [
    { "method": "GET", "url": "...", "requestTimestamp": 1766507394700, "status": 200, "responseTimestamp": 1766507394800 }
  ]
}
```

## 🛠️ Technology Stack

- **Playwright** - Browser automation framework
- **Node.js** - Runtime environment

## 📄 License

ISC

