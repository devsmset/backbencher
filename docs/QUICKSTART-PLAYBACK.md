# Quick Start - Unified Playback

## 🎬 Record and Play in 3 Steps

### 1️⃣ Record Your Actions
```bash
npm run record
# Or: node src/recorders/recorder.js
```
- Browser opens automatically
- Interact with your application
- Press **ENTER** in terminal to stop
- Recording saved to `recordings/` folder

### 2️⃣ (Optional) Process Recording
```bash
# Filter out API calls (recommended for faster playback)
npm run filter recordings/recording-1767684263942.json

# Remove duplicate actions (further optimization)
npm run deduplicate recordings/recording-1767684263942-filtered.json
```

### 3️⃣ Playback
```bash
# Use the unified playback engine (recommended - no blinking!)
npm run playback recordings/recording-1767684263942.json

# Or use processed file for faster playback
npm run playback recordings/recording-1767684263942-filtered-deduplicated.json
```

---

## 🔧 Fixing the Blinking Issue

The **blinking** was caused by:
- ❌ Actions executing too fast
- ❌ Page not fully loaded
- ❌ Network requests incomplete

The **unified playback** fixes this with:
- ✅ `actionDelay: 800` - Pause between actions
- ✅ `stabilizationDelay: 2000` - Wait after page load
- ✅ `waitForNetworkIdle: true` - Wait for all requests to complete
- ✅ Fixed viewport size - No window resizing

---

## 📊 Common Commands

```bash
# List all recordings
npm run list

# Record new session
npm run record

# Playback (unified - recommended)
npm run playback <recording-file>

# Playback (other engines)
npm run playback:fallback <recording-file>
npm run playback:filtered <recording-file>
npm run playback:basic <recording-file>

# Process recordings
npm run filter <recording-file>
npm run deduplicate <filtered-file>

# Full automation workflow
npm run automate
npm run process <recording-file>
```

---

## 🎯 Customizing Playback Speed

Edit `src/playback/playback-unified.js`:

### For Slower (More Stable)
```javascript
const CONFIG = {
  slowMo: 500,              // Slower Playwright actions
  actionDelay: 1500,        // More pause between actions
  stabilizationDelay: 4000, // More wait after navigation
  // ...
};
```

### For Faster
```javascript
const CONFIG = {
  slowMo: 100,              // Faster Playwright actions
  actionDelay: 300,         // Less pause between actions
  stabilizationDelay: 500,  // Less wait after navigation
  waitForNetworkIdle: false, // Skip network idle wait
  // ...
};
```

---

## 📸 Screenshots

Screenshots are automatically saved to:
```
screenshots/session-<timestamp>/
  success-event-001-ui_input.png
  success-event-002-ui_click.png
  error-event-015-ui_click.png
```

Disable if not needed:
```javascript
const CONFIG = {
  captureScreenshots: false,
  // ...
};
```

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| Elements not found | Increase `elementTimeout: 30000` |
| Still blinking | Increase `stabilizationDelay: 4000` and `actionDelay: 1500` |
| Too slow | Reduce delays, set `waitForNetworkIdle: false` |
| Playback stops | Check error screenshots in `screenshots/` folder |

---

## 📁 Project Structure

```
project_2/
├── src/
│   ├── recorders/
│   │   └── recorder.js              # Record UI + API events
│   ├── playback/
│   │   ├── playback-unified.js      # ⭐ USE THIS (no blinking!)
│   │   ├── playback-fallback.js     # Legacy with screenshots
│   │   ├── playback-filtered.js     # Legacy for filtered only
│   │   └── playback.js              # Basic legacy
│   ├── filters/
│   │   └── filter-events.js         # Remove API events
│   ├── utils/
│   │   ├── deduplicate.js           # Remove duplicate actions
│   │   └── list-recordings.js       # List all recordings
│   └── automation/
│       ├── full-workflow.js         # Full automation
│       └── process-existing.js      # Process recordings
├── recordings/                       # Recorded sessions
├── screenshots/                      # Playback screenshots
├── package.json
├── QUICKSTART.md
├── PLAYBACK-UNIFIED.md              # ⭐ Detailed guide
└── README.md
```

---

**👉 TIP:** Always use `playback-unified.js` (via `npm run playback`) for the best experience with no blinking!
