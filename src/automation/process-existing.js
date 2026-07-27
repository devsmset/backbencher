/**
 * PROCESS EXISTING RECORDING
 * ===========================
 * Takes an existing recording file and:
 * 1. Filters consecutive duplicate events
 * 2. Removes duplicate actions
 * 3. Executes the final processed recording
 * 
 * Usage: node src/automation/process-existing.js <recording-file.json>
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { generateTestCases } = require("../utils/generate-test-cases");

// ============ STEP 1: FILTER EVENTS ============

function filterEvents(inputFile) {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 STEP 1: FILTERING EVENTS");
  console.log("=".repeat(60));
  
  const recording = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const allEvents = recording.events;

  console.log(`📊 Total events: ${allEvents.length}`);

  // Filter only ui_event type
  const uiEvents = allEvents.filter(event => event.type === "ui_event");
  console.log(`🎯 UI events: ${uiEvents.length}`);

  // Keep only the last occurrence of consecutive events with the same action
  const filteredEvents = [];
  
  for (let i = 0; i < uiEvents.length; i++) {
    const currentEvent = uiEvents[i];
    const nextEvent = uiEvents[i + 1];
    
    const isLastInSeries = !nextEvent || 
                          nextEvent.action !== currentEvent.action ||
                          JSON.stringify(nextEvent.locators) !== JSON.stringify(currentEvent.locators);
    
    if (isLastInSeries) {
      filteredEvents.push(currentEvent);
    }
  }

  console.log(`✅ Filtered events: ${filteredEvents.length}`);
  console.log(`📉 Removed: ${uiEvents.length - filteredEvents.length} consecutive duplicates`);

  const outputFile = inputFile.replace(/\.json$/, '-filtered.json');
  const output = {
    meta: {
      ...recording.meta,
      filteredAt: new Date().toISOString(),
      originalEventCount: allEvents.length,
      uiEventCount: uiEvents.length,
      filteredEventCount: filteredEvents.length,
    },
    events: filteredEvents,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved: ${path.basename(outputFile)}`);
  
  return outputFile;
}

// ============ STEP 2: DEDUPLICATE ============

function deduplicateEvents(inputFile) {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 STEP 2: REMOVING DUPLICATES");
  console.log("=".repeat(60));
  
  const recording = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const events = recording.events;

  console.log(`📊 Filtered events: ${events.length}`);

  const deduplicated = [];
  
  for (let i = 0; i < events.length; i++) {
    const currentEvent = events[i];
    const nextEvent = events[i + 1];
    
    if (nextEvent) {
      const currentLocator = JSON.stringify({
        css: currentEvent.locators.css,
        xpath: currentEvent.locators.xpath
      });
      const nextLocator = JSON.stringify({
        css: nextEvent.locators.css,
        xpath: nextEvent.locators.xpath
      });
      
      if (currentLocator === nextLocator) {
        if (currentEvent.action === "input" && nextEvent.action === "input") {
          continue;
        }
        if (currentEvent.action === "input" && nextEvent.action === "change") {
          continue;
        }
        if (currentEvent.action === "change" && nextEvent.action === "click") {
          continue;
        }
        if (currentEvent.action === "click" && 
            currentEvent.locators.tag === "input" &&
            (nextEvent.action === "input" || nextEvent.action === "change")) {
          continue;
        }
      }
    }
    
    deduplicated.push(currentEvent);
  }

  console.log(`✅ Deduplicated events: ${deduplicated.length}`);
  console.log(`📉 Removed: ${events.length - deduplicated.length} duplicate actions`);

  const outputFile = inputFile.replace(/-filtered\.json$/, '-final.json');
  const output = {
    meta: {
      ...recording.meta,
      deduplicatedAt: new Date().toISOString(),
      deduplicatedCount: deduplicated.length,
    },
    events: deduplicated,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved: ${path.basename(outputFile)}`);
  
  return outputFile;
}

// ============ STEP 3: EXECUTE ============

async function executeRecording(recordingFile) {
  console.log("\n" + "=".repeat(60));
  console.log("▶️  STEP 3: EXECUTING FINAL RECORDING");
  console.log("=".repeat(60));
  
  const recording = JSON.parse(fs.readFileSync(recordingFile, "utf8"));
  const events = recording.events;
  const startUrl = recording.meta.url;

  console.log(`📂 Recording: ${path.basename(recordingFile)}`);
  console.log(`📊 Events to execute: ${events.length}`);
  console.log(`🌐 Starting URL: ${startUrl}\n`);

  const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ['--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  console.log("🚀 Navigating to start URL...");
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`\n[${i + 1}/${events.length}] ${event.action.toUpperCase()}`);

    try {
      // Try locators in priority order
      const locators = [
        event.locators.id ? `#${event.locators.id}` : null,
        event.locators.dataTestId ? `[data-testid="${event.locators.dataTestId}"]` : null,
        event.locators.css,
        event.locators.xpath,
      ].filter(Boolean);

      let element = null;
      let usedLocator = null;

      for (const locator of locators) {
        try {
          const isXPath = locator.startsWith('/');
          element = isXPath 
            ? await page.locator(`xpath=${locator}`).first()
            : await page.locator(locator).first();
          
          await element.waitFor({ state: 'visible', timeout: 5000 });
          usedLocator = locator;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!element) {
        throw new Error("Element not found with any locator");
      }

      console.log(`   ✓ Found element: ${usedLocator.substring(0, 60)}...`);

      // Perform action
      switch (event.action) {
        case "click":
          await element.click();
          console.log(`   ✓ Clicked`);
          break;

        case "input":
        case "change":
          if (event.value) {
            await element.fill(event.value);
            console.log(`   ✓ Filled: "${event.value}"`);
          }
          break;

        default:
          console.log(`   ⚠ Unknown action: ${event.action}`);
      }

      await page.waitForTimeout(500);
      successCount++;

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 EXECUTION SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Successful: ${successCount}/${events.length}`);
  console.log(`❌ Failed: ${failCount}/${events.length}`);
  console.log(`📈 Success rate: ${((successCount/events.length)*100).toFixed(1)}%`);

  console.log("\n⏸️  Browser will remain open. Close it manually when done.");
  
  // Keep browser open for inspection
  await new Promise(() => {});
}

// ============ MAIN ============

async function main() {
  const inputFile = process.argv[2];
  
  if (!inputFile) {
    console.error("❌ Usage: node process-existing.js <recording-file.json>");
    console.error("   Example: node process-existing.js artifacts/recordings/recording-1766507394510.json");
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🔧 PROCESS EXISTING RECORDING");
  console.log("=".repeat(60));
  console.log(`📂 Input: ${path.basename(inputFile)}`);
  console.log("This will:");
  console.log("  1. Filter consecutive duplicates");
  console.log("  2. Remove redundant actions");
  console.log("  3. Execute the final recording");
  console.log("=".repeat(60));

  try {
    // Step 1: Filter
    const filteredFile = filterEvents(inputFile);
    
    // Step 2: Deduplicate
    const finalFile = deduplicateEvents(filteredFile);

    // Step 3: Generate test cases
    generateTestCases(finalFile);
    
    // Step 4: Execute
    await executeRecording(finalFile);
    
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main();
