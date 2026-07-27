const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/**
 * Playwright automation script to replay filtered UI events
 */
async function playFilteredRecording(recordingFile) {
  // Load the filtered recording
  const recordingPath = path.resolve(recordingFile);
  console.log(`📂 Loading: ${recordingPath}`);
  
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
  const events = recording.events;
  const startUrl = recording.meta.url;

  console.log(`📊 Events to replay: ${events.length}`);
  console.log(`🌐 Starting URL: ${startUrl}\n`);

  // Launch browser with certificate handling
  const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-web-security'
    ],
    slowMo: 500 // Add 500ms delay between actions for visibility
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    // Navigate to the starting URL
    console.log(`🚀 Navigating to: ${startUrl}`);
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000); // Wait for page to stabilize

    console.log(`\n▶️  Starting event playback...\n`);

    // Replay each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventNum = i + 1;

      try {
        console.log(`[${eventNum}/${events.length}] ${event.action.toUpperCase()}`);

        if (event.action === "input") {
          // Handle input events
          const selector = event.locators.css || event.locators.xpath;
          const locator = event.locators.css 
            ? page.locator(event.locators.css)
            : page.locator(`xpath=${event.locators.xpath}`);

          console.log(`   → Filling "${selector}" with: "${event.value}"`);
          
          await locator.waitFor({ state: "visible", timeout: 10000 });
          await locator.fill(event.value);
          console.log(`   ✓ Input completed`);

        } else if (event.action === "keypress") {
          // Handle keypress events
          console.log(`   → Pressing key: ${event.key}`);
          await page.keyboard.press(event.key);
          console.log(`   ✓ Key pressed`);

        } else if (event.action === "click") {
          // Handle click events
          const selector = event.locators.css || event.locators.xpath;
          const locator = event.locators.css 
            ? page.locator(event.locators.css)
            : page.locator(`xpath=${event.locators.xpath}`);

          const displayText = event.locators.text || selector;
          console.log(`   → Clicking: "${displayText}"`);
          
          await locator.waitFor({ state: "visible", timeout: 10000 });
          await locator.click();
          console.log(`   ✓ Clicked`);

        } else {
          console.log(`   ⚠ Unknown action type: ${event.action}`);
        }

        // Wait between actions
        await page.waitForTimeout(1000);

      } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
        console.log(`   ⚠ Continuing with next action...\n`);
      }
    }

    console.log(`\n✅ Playback completed successfully!`);
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
  console.error("❌ Usage: node playback-filtered.js <filtered-recording-file>");
  console.error("   Example: node playback-filtered.js artifacts/recordings/recording-1766470612760-filtered.json");
  process.exit(1);
}

playFilteredRecording(recordingFile).catch(error => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
