const fs = require("fs");
const path = require("path");

/**
 * Removes duplicate actions from filtered recording
 * Keeps only meaningful final actions for each element
 * @param {string} inputFile - Path to the filtered recording JSON file
 * @param {string} outputFile - Path to save the deduplicated JSON file
 */
function removeDuplicateActions(inputFile, outputFile) {
  const recordingPath = path.resolve(inputFile);
  console.log(`📂 Reading: ${recordingPath}`);
  
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
  const events = recording.events;

  console.log(`📊 Total filtered events: ${events.length}`);

  const deduplicated = [];
  
  for (let i = 0; i < events.length; i++) {
    const currentEvent = events[i];
    const nextEvent = events[i + 1];
    
    // Skip this event if the next event is on the same element
    if (nextEvent) {
      const currentLocator = JSON.stringify({
        css: currentEvent.locators.css,
        xpath: currentEvent.locators.xpath
      });
      const nextLocator = JSON.stringify({
        css: nextEvent.locators.css,
        xpath: nextEvent.locators.xpath
      });
      
      // If same element, check action priority
      if (currentLocator === nextLocator) {
        // Skip intermediate input events if there's a change event coming
        if (currentEvent.action === "input" && nextEvent.action === "input") {
          continue; // Skip, keep the next one
        }
        if (currentEvent.action === "input" && nextEvent.action === "change") {
          continue; // Skip input, keep change
        }
        // Skip change if click follows (the click is the actual action)
        if (currentEvent.action === "change" && nextEvent.action === "click") {
          continue; // Skip change, keep click
        }
        // Skip click on input field if input/change follows
        if (currentEvent.action === "click" && 
            currentEvent.locators.tag === "input" &&
            (nextEvent.action === "input" || nextEvent.action === "change")) {
          continue; // Skip click on input, keep the input/change
        }
      }
    }
    
    deduplicated.push(currentEvent);
  }

  console.log(`✅ Deduplicated events: ${deduplicated.length}`);
  console.log(`📉 Removed: ${events.length - deduplicated.length} duplicate actions\n`);

  // Show summary by action type
  const actionCounts = {};
  deduplicated.forEach(event => {
    actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
  });
  
  console.log("📋 Event breakdown:");
  Object.entries(actionCounts).forEach(([action, count]) => {
    console.log(`   ${action}: ${count}`);
  });

  // Create output object
  const output = {
    meta: {
      ...recording.meta,
      deduplicatedAt: new Date().toISOString(),
      originalFilteredCount: events.length,
      deduplicatedCount: deduplicated.length
    },
    events: deduplicated
  };

  // Save to output file
  const outputPath = path.resolve(outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved deduplicated events to: ${outputPath}`);
}

// Main execution
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.error("❌ Usage: node deduplicate.js <filtered-file> [output-file]");
  console.error("   Example: node deduplicate.js artifacts/recordings/recording-1766507394510-filtered.json");
  process.exit(1);
}

const defaultOutput = inputFile.replace(/-filtered\.json$/, '-deduplicated.json');
const finalOutputFile = outputFile || defaultOutput;

removeDuplicateActions(inputFile, finalOutputFile);
