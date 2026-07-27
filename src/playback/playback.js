const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function playback(recordingFile) {
  // Load the recording
  const recordingPath = path.join(__dirname, "..", "..", "artifacts", "recordings", recordingFile);
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));

  console.log(`📂 Loading recording: ${recordingFile}`);
  console.log(`📊 Total events: ${recording.events.length}\n`);

  const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-web-security'
    ]
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Navigate to the URL
  const startUrl = "https://maple-aio-2-m1.otxlab.net:443/saw/ess?TENANTID=669062255";
  console.log(`🌐 Navigating to: ${startUrl}`);
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log(`\n▶️  Starting playback...\n`);

  // Play back each event
  for (let i = 0; i < recording.events.length; i++) {
    const event = recording.events[i];
    
    try {
      console.log(`[${i + 1}/${recording.events.length}] ${event.type.toUpperCase()}: ${event.tag} - "${event.text}"`);
      
      if (event.type === "click") {
        // Try to find element by xpath
        const element = await page.locator(`xpath=${event.xpath}`).first();
        
        // Wait for element to be visible and enabled
        await element.waitFor({ state: "visible", timeout: 10000 });
        
        // Check if it's an input field that needs typing first
        if (event.tag === "input" || event.tag === "textarea") {
          await element.click();
          console.log(`   ✓ Clicked input field`);
        } else {
          await element.click();
          console.log(`   ✓ Clicked`);
        }
        
        // Wait a bit between actions for natural flow
        await page.waitForTimeout(1000);
        
      } else {
        console.log(`   ⚠ Skipping unsupported event type: ${event.type}`);
      }
      
    } catch (error) {
      console.error(`   ✗ Error: ${error.message}`);
      console.log(`   ⚠ Continuing with next action...\n`);
    }
  }

  console.log(`\n✅ Playback completed!\n`);
  console.log(`Press Ctrl+C to close the browser or it will close in 10 seconds...`);
  
  await page.waitForTimeout(10000);
  await browser.close();
}

// Run playback
const recordingFile = process.argv[2] || "clicks-1766333162735.json";
playback(recordingFile).catch(console.error);
