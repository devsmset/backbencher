const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/**
 * Playwright automation with fallback locator strategy
 * Tries locators in order: xpath -> css -> id -> dataTestId -> text
 * Captures screenshots for every successful and failed event
 */
async function playWithFallback(recordingFile) {
  const recordingPath = path.resolve(recordingFile);
  console.log(`📂 Loading: ${recordingPath}`);
  
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
  const events = recording.events;
  const startUrl = recording.meta.url;

  console.log(`📊 Events to replay: ${events.length}`);
  console.log(`🌐 Starting URL: ${startUrl}\n`);

  // Create screenshots folder
  const screenshotsDir = path.join(__dirname, "..", "..", "artifacts", "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  
  const sessionTimestamp = Date.now();
  const sessionDir = path.join(screenshotsDir, `session-${sessionTimestamp}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  
  console.log(`📸 Screenshots will be saved to: ${sessionDir}\n`);

  const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-web-security'
    ],
    slowMo: 500
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  /**
   * Find element using xpath only
   * @param {Object} locators - Object containing different locator types
   * @returns {Promise<Locator>} - Playwright locator
   */
  async function findElementWithFallback(locators, eventNum) {
    // Only use xpath strategy
    if (!locators.xpath) {
      throw new Error(`No xpath locator available for event ${eventNum}`);
    }

    const selector = `xpath=${locators.xpath}`;
    
    try {
      const locator = page.locator(selector).first();
      
      // Check if element exists and is visible
      await locator.waitFor({ state: "visible", timeout: 10000 });
      
      console.log(`   ✓ Found using: xpath`);
      return { locator, strategy: 'xpath' };
    } catch (error) {
      console.log(`   ⚠ Xpath failed, waiting 10 seconds for page to load...`);
      await page.waitForTimeout(10000);
      
      // Retry once after waiting
      try {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: "visible", timeout: 10000 });
        console.log(`   ✓ Found using: xpath (after retry)`);
        return { locator, strategy: 'xpath' };
      } catch (retryError) {
        throw new Error(`Could not find element with xpath: ${locators.xpath}`);
      }
    }
  }

  try {
    console.log(`🚀 Navigating to: ${startUrl}`);
    await page.goto(startUrl, { 
      waitUntil: "networkidle", 
      timeout: 90000 
    });
    
    console.log(`⏳ Waiting for page to fully load...`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);
    
    console.log(`✅ Page fully loaded and ready`);
    console.log(`\n▶️  Starting event playback with fallback locators...\n`);

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventNum = i + 1;

      try {
        console.log(`[${eventNum}/${events.length}] ${event.action.toUpperCase()}`);

        if (event.action === "input" || event.action === "change") {
          // Handle input/change events
          const displayValue = event.value ? `"${event.value}"` : '(empty)';
          console.log(`   → Filling with: ${displayValue}`);
          
          console.log(`   🔍 Searching for element...`);
          const result = await findElementWithFallback(event.locators, eventNum);
          
          if (!result) {
            throw new Error("Element not found with any locator");
          }
          
          const { locator, strategy } = result;
          
          if (event.action === "change") {
            // For change events, clear first then fill
            await locator.clear();
          }
          
          if (event.value) {
            await locator.fill(event.value);
          }
          
          console.log(`   ✓ Input completed using ${strategy}`);

        } else if (event.action === "click") {
          // Handle click events
          const displayText = event.locators.text || event.locators.dataTestId || 'element';
          console.log(`   → Clicking: "${displayText}"`);
          
          console.log(`   🔍 Searching for element...`);
          const result = await findElementWithFallback(event.locators, eventNum);
          
          if (!result) {
            throw new Error("Element not found with any locator");
          }
          
          const { locator, strategy } = result;
          
          // Wait for element to be ready for interaction
          await locator.waitFor({ state: "visible", timeout: 500 });
          await locator.click();
          
          console.log(`   ✓ Click completed using ${strategy}`);
          
          // Wait for potential navigation after click
          try {
            await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
            await page.waitForTimeout(1000);
          } catch (navError) {
            // No navigation occurred, continue
          }

        } else if (event.action === "keypress") {
          // Handle keypress events (like Enter)
          console.log(`   → Pressing key: ${event.key}`);
          
          if (event.key === "Enter") {
            await page.keyboard.press("Enter");
            console.log(`   ✓ Enter key pressed`);
            
            // Wait for potential navigation after Enter
            try {
              await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch (navError) {
              // No navigation occurred, continue
            }
          }
        }

        // Take screenshot on SUCCESS
        try {
          const screenshotName = `success-event-${eventNum}-${event.action}.png`;
          const screenshotPath = path.join(sessionDir, screenshotName);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`   📸 Screenshot saved: ${screenshotName}`);
        } catch (ssError) {
          console.log(`   ⚠ Screenshot failed: ${ssError.message}`);
        }

      } catch (error) {
        console.error(`   ✗ Error at event ${eventNum}: ${error.message}`);
        
        // Take screenshot on ERROR
        try {
          const screenshotName = `error-event-${eventNum}-${event.action}.png`;
          const screenshotPath = path.join(sessionDir, screenshotName);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`   📸 Error screenshot saved: ${screenshotName}`);
        } catch (ssError) {
          console.log(`   ⚠ Screenshot failed: ${ssError.message}`);
        }
        
        console.log(`   ⚠ Skipping to next event...\n`);
      }
    }

    console.log(`\n✅ Playback completed!`);
    console.log(`📸 Screenshots saved to: ${sessionDir}`);
    console.log(`\n⏸️  Browser will remain open for 10 seconds for inspection...`);
    
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
  } finally {
    await browser.close();
    console.log(`\n🔚 Browser closed.`);
  }
}

// Main execution
const recordingFile = process.argv[2];

if (!recordingFile) {
  console.error("❌ Usage: node playback-fallback.js <deduplicated-recording-file>");
  console.error("   Example: node playback-fallback.js artifacts/recordings/recording-1766507394510-deduplicated.json");
  process.exit(1);
}

playWithFallback(recordingFile).catch(error => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
