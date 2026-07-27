const fs = require("fs");
const path = require("path");

/**
 * Filters UI events and keeps only the last occurrence of consecutive events with the same action
 * @param {string} inputFile - Path to the recording JSON file
 * @param {string} outputFile - Path to save the filtered JSON file
 */
function filterUIEvents(inputFile, outputFile) {
  // Read the recording file
  const recordingPath = path.resolve(inputFile);
  console.log(`📂 Reading: ${recordingPath}`);
  
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
  const allEvents = recording.events;

  console.log(`📊 Total events: ${allEvents.length}`);

  // Step 1: Filter only ui_event type
  const uiEvents = allEvents.filter(event => event.type === "ui_event");
  console.log(`🎯 UI events: ${uiEvents.length}`);

  // Step 2: Keep only the last occurrence of consecutive events with the same action
  const filteredEvents = [];
  
  for (let i = 0; i < uiEvents.length; i++) {
    const currentEvent = uiEvents[i];
    const nextEvent = uiEvents[i + 1];
    
    // Check if this is the last event or if the next event has a different action
    const isLastInSeries = !nextEvent || 
                          nextEvent.action !== currentEvent.action ||
                          JSON.stringify(nextEvent.locators) !== JSON.stringify(currentEvent.locators);
    
    if (isLastInSeries) {
      filteredEvents.push(currentEvent);
    }
  }

  console.log(`✅ Filtered events: ${filteredEvents.length}`);
  console.log(`📉 Removed: ${uiEvents.length - filteredEvents.length} duplicate consecutive events\n`);

  // Show summary by action type
  const actionCounts = {};
  filteredEvents.forEach(event => {
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
      filteredAt: new Date().toISOString(),
      originalEventCount: allEvents.length,
      uiEventCount: uiEvents.length,
      filteredEventCount: filteredEvents.length
    },
    events: filteredEvents
  };

  // Save to output file
  const outputPath = path.resolve(outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved filtered events to: ${outputPath}`);
}

// Main execution
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.error("❌ Usage: node filter-events.js <input-file> [output-file]");
  console.error("   Example: node filter-events.js artifacts/recordings/recording-1766470612760.json artifacts/recordings/filtered-recording.json");
  process.exit(1);
}

const defaultOutput = inputFile.replace(/\.json$/, '-filtered.json');
const finalOutputFile = outputFile || defaultOutput;

filterUIEvents(inputFile, finalOutputFile);
