# Project 2 - Playwright Recorder & Playback System

A comprehensive UI and API recording/playback automation system built with Playwright.

## 📁 Project Structure

```
project_2/
├── src/
│   ├── automation/         # 🤖 Full automation workflows
│   │   ├── full-workflow.js      # Complete: Record → Filter → Dedupe → Execute
│   │   └── process-existing.js   # Process existing recording file
│   │
│   ├── recorders/          # Recording scripts
│   │   └── recorder.js           # UNIFIED RECORDER (all features combined)
│   │
│   ├── playback/           # Playback/replay scripts
│   │   ├── playback.js           # Basic playback engine
│   │   ├── playback-fallback.js  # Playback with fallback locator strategy
│   │   └── playback-filtered.js  # Playback for filtered recordings
│   │
│   ├── filters/            # Event filtering utilities
│   │   ├── filter-api.js         # API event filtering
│   │   ├── filter-events.js      # UI event deduplication
│   │   └── filter-ui.js          # UI specification generator
│   │
│   └── utils/              # Utility functions
│       ├── deduplicate.js        # Remove duplicate actions
│       └── list-recordings.js    # List all recordings
│
├── artifacts/               # 📦 Generated output (not source)
│   ├── recordings/                # Recorded sessions (JSON files)
│   │   ├── recording-*.json            # Raw recordings
│   │   ├── *-filtered.json             # Filtered recordings
│   │   ├── *-final.json                # Final processed recordings
│   │   └── *-deduplicated.json         # Deduplicated recordings
│   ├── screenshots/                # Playback screenshots (per session)
│   ├── test-results/               # Playwright test run output
│   ├── ai-generated/               # AI-generated selenium code + test cases
│   ├── test-cases/                 # Auto-generated test-case markdown
│   └── api-catalog/                # Extracted API endpoint catalog (all-apis.json/.md)
│
├── package.json
├── README.md
└── docs/
    ├── QUICKSTART.md
    ├── SUMMARY.md
    ├── IMPLEMENTATION-SUMMARY.md
    ├── PLAYBACK-UNIFIED.md
    ├── QUICKSTART-PLAYBACK.md
    ├── RECORDER-UNIFIED.md
    ├── PRESENTATION.md
    └── Codeless-Test-Automation-Presentation.pptx
```

## 🚀 Getting Started

### Prerequisites
```bash
npm install
```

## ⚡ Quick Start (Fully Automated)

### Option 1: Complete Automation (Recommended)
Record, filter, deduplicate, and execute in one command:

```bash
npm run automate
```

Or with custom URL:
```bash
node src/automation/full-workflow.js https://your-app-url
```

**This will:**
1. ✅ Open browser for you to record interactions
2. ✅ Press ENTER when done recording
3. ✅ Automatically filter consecutive duplicates
4. ✅ Remove redundant actions
5. ✅ Execute the final optimized recording

### Option 2: Process Existing Recording
Already have a recording? Process and execute it:

```bash
npm run process artifacts/recordings/your-recording.json
```

Or:
```bash
node src/automation/process-existing.js artifacts/recordings/recording-1766507394510.json
```

---

## 📖 Manual Workflow

### Recording a Session

**Latest Recorder (Recommended):**
```bash
npm run record
# or
node src/recorders/recorder.js
# or with custom URL
node src/recorders/recorder.js https://your-app-url
```

### Playing Back a Recording

**With Fallback Strategy (Recommended):**
```bash
npm run playback artifacts/recordings/recording-filename.json
# or
node src/playback/playback-fallback.js artifacts/recordings/recording-filename.json
```

**Other Playback Options:**
```bash
node src/playback/playback.js recording-filename.json                     # Basic playback
node src/playback/playback-filtered.js artifacts/recordings/filtered.json # Filtered playback
```

### Filtering & Processing

**Filter UI Events:**
```bash
npm run filter artifacts/recordings/input.json artifacts/recordings/output.json
# or
node src/filters/filter-events.js artifacts/recordings/recording.json
```

**Deduplicate Actions:**
```bash
npm run deduplicate artifacts/recordings/filtered.json
# or
node src/utils/deduplicate.js artifacts/recordings/recording-filtered.json
```

**Generate UI Specification:**
```bash
node src/filters/filter-ui.js artifacts/recordings/input.json artifacts/recordings/output.json
```

## 📋 Features

### Recorders
- ✅ **One unified recorder** with all features combined
- ✅ Capture UI interactions (clicks, typing, navigation)
- ✅ Record API calls (XHR/Fetch requests & responses)
- ✅ Generate multiple locator strategies (XPath, CSS, ID, text, data-testid, name)
- ✅ Handle SSL/certificate errors automatically
- ✅ Track timestamps and sequence
- ✅ Navigation event tracking

### Playback
- ✅ Replay recorded sessions
- ✅ Fallback locator strategy (try multiple selectors)
- ✅ Wait for elements with configurable timeouts
- ✅ Handle dynamic content
- ✅ SSL/certificate error handling

### Filters & Utils
- ✅ Remove consecutive duplicate events
- ✅ Filter UI-only or API-only events
- ✅ Generate clean UI specifications
- ✅ Deduplicate actions on same elements
- ✅ Create optimized test flows

## 🛠️ Technology Stack

- **Playwright** - Browser automation framework
- **Node.js** - Runtime environment
- **JavaScript** - Programming language

## 📝 Output Format

Recordings are saved as JSON files with the following structure:
```json
{
  "meta": {
    "url": "https://example.com",
    "timestamp": 1766507394510,
    "userAgent": "Mozilla/5.0..."
  },
  "events": [
    {
      "type": "ui_event",
      "action": "click",
      "locators": {
        "xpath": "//button[@id='submit']",
        "css": "#submit",
        "id": "submit",
        "text": "Submit"
      },
      "timestamp": 1766507395123
    },
    {
      "type": "api_call",
      "method": "POST",
      "url": "https://api.example.com/data",
      "status": 200,
      "timestamp": 1766507395456
    }
  ]
}
```

## 🎯 Use Cases

- **Test Automation**: Record user flows and replay them as tests
- **Bug Reproduction**: Capture exact steps to reproduce issues
- **Performance Testing**: Record and replay API interactions
- **Documentation**: Generate UI flow specifications
- **Regression Testing**: Ensure UI consistency across releases

## 📄 License

ISC
