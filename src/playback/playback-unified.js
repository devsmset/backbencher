const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/**
 * UNIFIED PLAYBACK ENGINE
 * 
 * Features:
 * - Multi-strategy locator fallback (xpath -> css -> id -> dataTestId -> text)
 * - Screenshot capture for success/failure events
 * - Smart wait strategies to prevent blinking
 * - Handles all event types: click, input, change, keypress, navigation, API
 * - Network idle detection for stable page loads
 * - Configurable timing and retry logic
 */

// Configuration
const CONFIG = {
  // Timing settings
  slowMo: 300,                    // Delay between Playwright actions (ms)
  actionDelay: 800,               // Delay after each successful action (ms)
  navigationTimeout: 90000,       // Initial page load timeout (ms)
  elementTimeout: 15000,          // Time to wait for elements (ms)
  stabilizationDelay: 2000,       // Wait after navigation for page stability (ms)
  
  // Retry settings
  xpathWaitOnFail: 10000,        // Wait time if xpath fails before trying other locators (ms)
  
  // Browser settings
  headless: false,
  
  // Screenshot settings
  captureScreenshots: true,
  screenshotOnSuccess: true,
  screenshotOnError: true,
  fullPageScreenshot: false,
  
  // Wait strategies
  waitForNetworkIdle: true,       // Wait for network to be idle on page load
  waitForLoadState: true,         // Wait for domcontentloaded after navigation
};

/**
 * Main playback function
 */
async function unifiedPlayback(recordingFile) {
  const recordingPath = path.resolve(recordingFile);
  console.log("\n" + "=".repeat(70));
  console.log("🎬 UNIFIED PLAYBACK ENGINE");
  console.log("=".repeat(70));
  console.log(`📂 Loading: ${path.basename(recordingPath)}`);
  
  // Load recording
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
  const events = recording.events;
  const startUrl = recording.meta.url;

  console.log(`📊 Total events: ${events.length}`);
  console.log(`🌐 Starting URL: ${startUrl}`);
  console.log("=".repeat(70) + "\n");

  // Setup screenshot directory
  let sessionDir;
  if (CONFIG.captureScreenshots) {
    const screenshotsDir = path.join(__dirname, "..", "..", "artifacts", "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    const sessionTimestamp = Date.now();
    sessionDir = path.join(screenshotsDir, `session-${sessionTimestamp}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    console.log(`📸 Screenshots: ${sessionDir}\n`);
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-web-security',
      '--start-maximized'
    ],
    slowMo: CONFIG.slowMo
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: null // Use actual window size, no fixed viewport
  });

  const page = await context.newPage();

  // Track popup windows and active page
  let popupPage = null;
  let activePage = page; // Track which page to use for actions
  
  context.on("page", async (newPage) => {
    popupPage = newPage;
    activePage = newPage; // Switch to popup automatically
    console.log(`\n🪟 New window detected: ${newPage.url()}`);
    console.log(`   ↪️  Switching context to popup window`);
    
    // Wait for popup to load
    await newPage.waitForLoadState("domcontentloaded").catch(() => {});
    
    // Handle popup close - switch back to main page
    newPage.on("close", () => {
      console.log(`\n🪟 Popup window closed`);
      console.log(`   ↪️  Switching context back to main window`);
      activePage = page;
      popupPage = null;
    });
  });

  // Statistics
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    byType: {}
  };

  /**
   * Find element using multiple locator strategies with fallback
   */
  async function findElementWithFallback(locators, eventNum) {
    const strategies = [
      { 
        name: 'xpath', 
        selector: locators.xpath ? `xpath=${locators.xpath}` : null,
        priority: 1 
      },
      { 
        name: 'css', 
        selector: locators.css,
        priority: 2 
      },
      { 
        name: 'id', 
        selector: locators.id ? `#${locators.id}` : null,
        priority: 3 
      },
      { 
        name: 'dataTestId', 
        selector: locators.dataTestId ? `[data-test-id="${locators.dataTestId}"]` : null,
        priority: 4 
      },
      { 
        name: 'text', 
        selector: locators.text ? `text=${locators.text}` : null,
        priority: 5 
      }
    ];

    // Filter out null selectors and sort by priority
    const availableStrategies = strategies
      .filter(s => s.selector !== null)
      .sort((a, b) => a.priority - b.priority);

    for (const strategy of availableStrategies) {
      try {
        const locator = activePage.locator(strategy.selector).first();
        
        // Check if element exists and is visible
        await locator.waitFor({ 
          state: "visible", 
          timeout: CONFIG.elementTimeout 
        });
        
        console.log(`   ✓ Located via: ${strategy.name}`);
        return { locator, strategy: strategy.name };
        
      } catch (error) {
        console.log(`   ⚠ ${strategy.name} failed, trying next...`);
        
        // If xpath failed (primary locator), wait for page to load
        if (strategy.name === 'xpath' && CONFIG.xpathWaitOnFail > 0) {
          console.log(`   ⏳ Waiting ${CONFIG.xpathWaitOnFail}ms for page...`);
          await activePage.waitForTimeout(CONFIG.xpathWaitOnFail);
        }
        
        continue;
      }
    }

    throw new Error(`Element not found with any locator strategy`);
  }

  /**
   * Take screenshot with error handling
   */
  async function captureScreenshot(eventNum, action, status) {
    if (!CONFIG.captureScreenshots) return;
    
    if (status === 'success' && !CONFIG.screenshotOnSuccess) return;
    if (status === 'error' && !CONFIG.screenshotOnError) return;
    
    try {
      const screenshotName = `${status}-event-${String(eventNum).padStart(3, '0')}-${action}.png`;
      const screenshotPath = path.join(sessionDir, screenshotName);
      await activePage.screenshot({ 
        path: screenshotPath, 
        fullPage: CONFIG.fullPageScreenshot 
      });
      console.log(`   📸 ${screenshotName}`);
    } catch (error) {
      console.log(`   ⚠ Screenshot failed: ${error.message}`);
    }
  }

  /**
   * Wait for page stability after navigation
   */
  async function waitForPageStability() {
    try {
      if (CONFIG.waitForLoadState) {
        await activePage.waitForLoadState("domcontentloaded", { timeout: 10000 });
      }
      
      if (CONFIG.waitForNetworkIdle) {
        await activePage.waitForLoadState("networkidle", { timeout: 10000 });
      }
      
      // Additional stabilization delay
      if (CONFIG.stabilizationDelay > 0) {
        await activePage.waitForTimeout(CONFIG.stabilizationDelay);
      }
    } catch (error) {
      // Timeout is acceptable, continue
      console.log(`   ⏳ Navigation detection timed out, continuing...`);
    }
  }

  try {
    // Initial navigation
    console.log(`🚀 Navigating to: ${startUrl}`);
    await page.goto(startUrl, { 
      waitUntil: CONFIG.waitForNetworkIdle ? "networkidle" : "domcontentloaded",
      timeout: CONFIG.navigationTimeout 
    });
    
    console.log(`⏳ Waiting for page stability...`);
    await waitForPageStability();
    console.log(`✅ Page loaded and stable`);
    console.log(`\n${"▶".repeat(35)}\n`);

    // Process each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventNum = i + 1;
      stats.total++;

      // Track event type statistics
      const eventType = event.type || event.action;
      stats.byType[eventType] = (stats.byType[eventType] || 0) + 1;

      try {
        const action = event.action || event.type;
        console.log(`\n[${eventNum}/${events.length}] ${action.toUpperCase()}`);

        // Handle different event types
        if (action === "input" || action === "ui_input") {
          await handleInputEvent(event, eventNum);
          
        } else if (action === "change" || action === "ui_change") {
          await handleChangeEvent(event, eventNum);
          
        } else if (action === "click" || action === "ui_click") {
          await handleClickEvent(event, eventNum);
          
        } else if (action === "keypress" || action === "ui_keypress") {
          await handleKeypressEvent(event, eventNum);
          
        } else if (action === "navigation") {
          await handleNavigationEvent(event, eventNum);
          
        } else if (action === "popup") {
          await handlePopupEvent(event, eventNum);
          
        } else if (action === "popup_navigation") {
          await handlePopupNavigationEvent(event, eventNum);
          
        } else {
          // Skip unsupported events (api_request, api_response, etc.)
          console.log(`   ⊘ Skipped (not interactive)`);
          stats.skipped++;
          continue;
        }

        stats.success++;
        await captureScreenshot(eventNum, action, 'success');
        
        // Delay between actions to prevent blinking
        if (CONFIG.actionDelay > 0) {
          await page.waitForTimeout(CONFIG.actionDelay);
        }

      } catch (error) {
        stats.failed++;
        console.error(`   ✗ Error: ${error.message}`);
        await captureScreenshot(eventNum, event.action || event.type, 'error');
        console.log(`   ⚠ Continuing...\n`);
      }
    }

    // Summary
    console.log(`\n${"=".repeat(70)}`);
    console.log(`✅ PLAYBACK COMPLETED`);
    console.log(`=".repeat(70)`);
    console.log(`📊 Statistics:`);
    console.log(`   Total events:     ${stats.total}`);
    console.log(`   Successful:       ${stats.success} (${((stats.success/stats.total)*100).toFixed(1)}%)`);
    console.log(`   Failed:           ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)`);
    console.log(`   Skipped:          ${stats.skipped} (${((stats.skipped/stats.total)*100).toFixed(1)}%)`);
    console.log(`\n📋 Events by type:`);
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`   ${type.padEnd(20)} ${count}`);
    });
    
    if (CONFIG.captureScreenshots) {
      console.log(`\n📸 Screenshots: ${sessionDir}`);
    }
    
    console.log(`\n⏸️  Browser stays open for 10 seconds...`);
    console.log(`=".repeat(70)\n`);
    
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error(`\n❌ FATAL ERROR: ${error.message}`);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log(`\n🔚 Browser closed.\n`);
  }

  /**
   * Handle input events
   */
  async function handleInputEvent(event, eventNum) {
    const value = event.value || event.text || "";
    console.log(`   → Input: "${value}"`);
    
    console.log(`   🔍 Locating element...`);
    const result = await findElementWithFallback(event.locators || {}, eventNum);
    
    const { locator } = result;
    await locator.fill(value);
    console.log(`   ✓ Input completed`);
  }

  /**
   * Handle change events (clear + fill)
   */
  async function handleChangeEvent(event, eventNum) {
    const value = event.value || event.text || "";
    console.log(`   → Change to: "${value}"`);
    
    console.log(`   🔍 Locating element...`);
    const result = await findElementWithFallback(event.locators || {}, eventNum);
    
    const { locator } = result;
    await locator.clear();
    if (value) {
      await locator.fill(value);
    }
    console.log(`   ✓ Change completed`);
  }

  /**
   * Handle click events
   */
  async function handleClickEvent(event, eventNum) {
    const displayText = (event.locators && event.locators.text) || 
                       (event.locators && event.locators.dataTestId) || 
                       event.text || 
                       'element';
    console.log(`   → Click: "${displayText}"`);
    
    console.log(`   🔍 Locating element...`);
    const result = await findElementWithFallback(event.locators || {}, eventNum);
    
    const { locator } = result;
    
    // Ensure element is ready for interaction
    await locator.waitFor({ state: "visible", timeout: 1000 });
    
    // Track if popup opens after click
    const popupPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 3000);
      context.once("page", () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
    
    await locator.click();
    console.log(`   ✓ Click completed`);
    
    // Wait to see if popup opened
    const popupOpened = await popupPromise;
    if (popupOpened) {
      console.log(`   🪟 Popup window opened after click`);
      await activePage.waitForLoadState("domcontentloaded").catch(() => {});
    } else {
      // Check for navigation on same page after click
      await waitForPageStability();
    }
  }

  /**
   * Handle keypress events
   */
  async function handleKeypressEvent(event, eventNum) {
    const key = event.key || "Enter";
    console.log(`   → Press: ${key}`);
    
    await activePage.keyboard.press(key);
    console.log(`   ✓ Keypress completed`);
    
    // Check for navigation after keypress
    if (key === "Enter") {
      await waitForPageStability();
    }
  }

  /**
   * Handle navigation events
   */
  async function handleNavigationEvent(event, eventNum) {
    const url = event.url;
    console.log(`   → Navigate to: ${url}`);
    
    await activePage.goto(url, { 
      waitUntil: CONFIG.waitForNetworkIdle ? "networkidle" : "domcontentloaded",
      timeout: CONFIG.navigationTimeout 
    });
    
    await waitForPageStability();
    console.log(`   ✓ Navigation completed`);
  }

  /**
   * Handle popup window events
   */
  async function handlePopupEvent(event, eventNum) {
    if (event.action === "opened") {
      console.log(`   → New window opened: ${event.url || '(blank)'}`);
      
      // Wait for popup to be created
      await activePage.waitForTimeout(2000);
      
      if (popupPage) {
        console.log(`   ✓ Popup window detected and active`);
      } else {
        console.log(`   ⚠ No popup window detected (may have been blocked)`);
      }
    } else if (event.action === "closed") {
      console.log(`   → Window closed`);
      popupPage = null;
      activePage = page; // Switch back to main page
      console.log(`   ✓ Popup closed, context switched to main window`);
    }
  }

  /**
   * Handle popup navigation events
   */
  async function handlePopupNavigationEvent(event, eventNum) {
    const url = event.url;
    console.log(`   → Popup navigated to: ${url}`);
    
    if (popupPage && !popupPage.isClosed()) {
      await popupPage.waitForLoadState("domcontentloaded").catch(() => {});
      console.log(`   ✓ Popup navigation tracked`);
    } else {
      console.log(`   ⚠ No active popup window`);
    }
  }
}

// Main execution
const recordingFile = process.argv[2];

if (!recordingFile) {
  console.error("\n❌ ERROR: No recording file specified\n");
  console.error("Usage:");
  console.error("  node playback-unified.js <recording-file>\n");
  console.error("Examples:");
  console.error("  node playback-unified.js artifacts/recordings/recording-1767527991644.json");
  console.error("  node playback-unified.js artifacts/recordings/recording-filtered.json");
  console.error("  node playback-unified.js artifacts/recordings/recording-deduplicated.json\n");
  process.exit(1);
}

if (!fs.existsSync(recordingFile)) {
  console.error(`\n❌ ERROR: File not found: ${recordingFile}\n`);
  process.exit(1);
}

unifiedPlayback(recordingFile).catch(error => {
  console.error("\n❌ UNHANDLED ERROR:", error.message);
  console.error(error.stack);
  process.exit(1);
});
