# Unified Playback Engine

## Overview

The **Unified Playback Engine** (`playback-unified.js`) combines the best features from all previous playback implementations into a single, robust, and configurable solution.

## Key Features

### 🎯 Multi-Strategy Locator Fallback
- **5 Locator Strategies** (in priority order):
  1. **XPath** - Most precise, generated from DOM structure
  2. **CSS Selector** - Fast and reliable
  3. **ID** - Unique element identifier
  4. **Data-Test-ID** - Test automation attributes
  5. **Text Content** - Fallback for visible text

### 🚫 Anti-Blinking Technology
The blinking you experienced was caused by:
1. Page reloading/navigating too quickly
2. Elements not being fully rendered before interaction
3. Network requests not completing

**Our Solution:**
- **Network Idle Detection** - Waits for all network requests to complete
- **DOM Load State Monitoring** - Ensures DOM is fully loaded
- **Stabilization Delays** - Configurable pauses after navigation (default: 2s)
- **Fixed Viewport** - Prevents window resizing (1920x1080)
- **Smart Action Delays** - 800ms pause between actions for visual stability

### 📸 Screenshot Management
- Captures screenshots on **success** and **error**
- Organized in timestamped session folders
- Configurable full-page or viewport-only capture
- Numbered filenames for easy tracking

### 📊 Statistics & Reporting
- Real-time progress tracking
- Success/failure/skip counts
- Events grouped by type
- Detailed percentage breakdowns

### ⚙️ Highly Configurable

```javascript
const CONFIG = {
  // Timing settings
  slowMo: 300,                    // Delay between Playwright actions
  actionDelay: 800,               // Delay after each action (prevents blinking!)
  navigationTimeout: 90000,       // Initial page load timeout
  elementTimeout: 15000,          // Time to wait for elements
  stabilizationDelay: 2000,       // Wait after navigation (anti-blink!)
  
  // Retry settings
  xpathWaitOnFail: 10000,        // Wait if xpath fails before other locators
  
  // Browser settings
  headless: false,
  
  // Screenshot settings
  captureScreenshots: true,
  screenshotOnSuccess: true,
  screenshotOnError: true,
  fullPageScreenshot: false,
  
  // Wait strategies (anti-blink features!)
  waitForNetworkIdle: true,       // Wait for network to be idle
  waitForLoadState: true,         // Wait for domcontentloaded
};
```

## Usage

### Basic Usage

```bash
# Run with any recording file
npm run playback recordings/recording-1767684263942.json

# Or directly
node src/playback/playback-unified.js recordings/recording-1767684263942.json
```

### With Different Recording Types

```bash
# Raw recordings
npm run playback recordings/recording-1767527991644.json

# Filtered recordings
npm run playback recordings/recording-filtered.json

# Deduplicated recordings
npm run playback recordings/recording-deduplicated.json
```

### Alternative Playback Scripts

```bash
# Use the unified engine (recommended)
npm run playback <file>

# Use fallback engine (legacy)
npm run playback:fallback <file>

# Use filtered engine (for filtered recordings only)
npm run playback:filtered <file>

# Use basic engine (minimal features)
npm run playback:basic <file>
```

## Event Type Support

### ✅ Fully Supported
- ✓ `click` / `ui_click` - Click on elements
- ✓ `input` / `ui_input` - Fill input fields
- ✓ `change` / `ui_change` - Clear and fill fields
- ✓ `keypress` / `ui_keypress` - Keyboard input (Enter, etc.)
- ✓ `navigation` - Page navigation events

### ⊘ Automatically Skipped
- ⊘ `api_request` - Not interactive
- ⊘ `api_response` - Not interactive

## Output Examples

### During Playback

```
======================================================================
🎬 UNIFIED PLAYBACK ENGINE
======================================================================
📂 Loading: recording-1767684263942.json
📊 Total events: 319
🌐 Starting URL: https://example.com
======================================================================

📸 Screenshots: screenshots/session-1767684500000

🚀 Navigating to: https://example.com
⏳ Waiting for page stability...
✅ Page loaded and stable

▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶

[1/319] UI_INPUT
   → Input: "username"
   🔍 Locating element...
   ✓ Located via: xpath
   ✓ Input completed
   📸 success-event-001-ui_input.png

[2/319] UI_CLICK
   → Click: "Login Button"
   🔍 Locating element...
   ✓ Located via: css
   ✓ Click completed
   📸 success-event-002-ui_click.png
```

### Final Summary

```
======================================================================
✅ PLAYBACK COMPLETED
======================================================================
📊 Statistics:
   Total events:     319
   Successful:       25 (89.3%)
   Failed:           3 (10.7%)
   Skipped:          291 (91.2%)

📋 Events by type:
   navigation           11
   api_request          149
   api_response         141
   ui_input            3
   ui_change           3
   ui_keypress         1
   ui_click            11

📸 Screenshots: screenshots/session-1767684500000

⏸️  Browser stays open for 10 seconds...
======================================================================
```

## Why the Blinking Occurred

### Problem Analysis

1. **Too Fast Interactions**
   - Actions were executed immediately after navigation
   - DOM wasn't fully rendered
   - JavaScript was still executing

2. **Network Requests Incomplete**
   - API calls still in progress
   - Dynamic content loading
   - AJAX requests not finished

3. **No Stabilization Period**
   - No pause after page load
   - Immediate element selection
   - Race conditions with page scripts

### Our Solutions

| Problem | Solution | Config Option |
|---------|----------|---------------|
| Quick interactions | 800ms delay between actions | `actionDelay` |
| Network incomplete | Wait for network idle | `waitForNetworkIdle` |
| DOM not ready | Wait for load state | `waitForLoadState` |
| Page unstable | 2s stabilization delay | `stabilizationDelay` |
| Element not visible | 15s element timeout | `elementTimeout` |
| Xpath not found | 10s wait before fallback | `xpathWaitOnFail` |

## Customization

### Adjust for Faster Playback

```javascript
// Edit CONFIG in playback-unified.js
const CONFIG = {
  slowMo: 100,              // Faster actions
  actionDelay: 300,         // Less delay
  stabilizationDelay: 500,  // Quicker navigation
  // ... other settings
};
```

### Adjust for More Stability

```javascript
const CONFIG = {
  slowMo: 500,              // Slower actions
  actionDelay: 1500,        // More delay
  stabilizationDelay: 4000, // More wait time
  elementTimeout: 30000,    // Longer element wait
  // ... other settings
};
```

### Disable Screenshots

```javascript
const CONFIG = {
  captureScreenshots: false,
  // ... other settings
};
```

## Comparison with Other Playback Files

| Feature | playback.js | playback-filtered.js | playback-fallback.js | **playback-unified.js** |
|---------|-------------|----------------------|----------------------|-------------------------|
| Locator Fallback | ❌ | ✅ (2 strategies) | ✅ (5 strategies) | ✅ (5 strategies) |
| Screenshots | ❌ | ❌ | ✅ | ✅ |
| Network Idle Wait | ❌ | ❌ | ✅ | ✅ (configurable) |
| Anti-Blink Delays | ❌ | ⚠️ (basic) | ⚠️ (basic) | ✅ (advanced) |
| Statistics | ❌ | ❌ | ❌ | ✅ |
| Configurable | ❌ | ❌ | ⚠️ (hardcoded) | ✅ (full config) |
| Event Types | 1 | 3 | 4 | 5+ |
| Error Handling | ⚠️ | ✅ | ✅ | ✅ |
| Viewport Fixed | ❌ | ❌ | ❌ | ✅ |

## Troubleshooting

### Issue: Elements not found

**Solution:** Increase `elementTimeout` or `xpathWaitOnFail`:
```javascript
elementTimeout: 30000,
xpathWaitOnFail: 15000,
```

### Issue: Page still blinking

**Solution:** Increase stabilization and action delays:
```javascript
stabilizationDelay: 4000,
actionDelay: 1500,
```

### Issue: Too slow

**Solution:** Reduce delays and disable network idle:
```javascript
slowMo: 100,
actionDelay: 300,
waitForNetworkIdle: false,
```

### Issue: Screenshot folder fills up

**Solution:** Disable success screenshots:
```javascript
screenshotOnSuccess: false,
screenshotOnError: true,  // Keep error screenshots
```

## Advanced Features

### Session Screenshots
All screenshots are saved in timestamped folders:
```
screenshots/
  session-1767684500000/
    success-event-001-ui_input.png
    success-event-002-ui_click.png
    error-event-015-ui_click.png
    ...
```

### Smart Element Detection
The engine tries locators in order of reliability:
1. First tries XPath (most precise)
2. If fails, waits 10s for page to load
3. Then tries CSS selector
4. Then tries ID
5. Then tries data-test-id
6. Finally tries text content

### Automatic Page Stability
After any navigation or click that might navigate:
1. Waits for `domcontentloaded`
2. Waits for `networkidle` (all requests complete)
3. Adds configurable stabilization delay
4. Only then proceeds to next action

## Best Practices

1. **Always use filtered or deduplicated recordings** for faster playback
2. **Start with default config** and adjust only if needed
3. **Check screenshots** when actions fail to understand why
4. **Monitor the statistics** to see which event types are causing issues
5. **Use network idle wait** for dynamic/AJAX-heavy applications
6. **Increase timeouts** for slow applications or networks

## Future Enhancements

- [ ] Retry logic for failed actions
- [ ] Parallel execution of independent actions
- [ ] Smart wait based on page load metrics
- [ ] Custom action hooks
- [ ] Video recording of playback
- [ ] Diff screenshots for visual regression testing
- [ ] Report generation (HTML/JSON)
- [ ] Integration with CI/CD pipelines

---

**Recommended Usage:** Use `playback-unified.js` as your primary playback engine. The other files are kept for backward compatibility and specific use cases.
