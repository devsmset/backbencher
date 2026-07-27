const fs = require("fs");
const path = require("path");

/**
 * Filters UI events and creates a clean UI specification
 * @param {string} inputFile - Path to the recording JSON file
 * @param {string} outputFile - Path to save the UI spec JSON file
 */
function filterUIEvents(inputFile, outputFile) {
  // Read the recording file
  const recordingPath = path.resolve(inputFile);
  console.log(`📂 Reading: ${recordingPath}`);
  
  const raw = JSON.parse(fs.readFileSync(recordingPath, "utf-8"));
  const allEvents = raw.events;

  console.log(`📊 Total events: ${allEvents.length}`);

  // Filter UI events
  const uiEvents = allEvents.filter(
    e =>
      e.type === "ui_event" &&
      ["click", "input", "change"].includes(e.event)
  );

  console.log(`🎯 UI events (click, input, change): ${uiEvents.length}`);

  // Create cleaned UI specification
  const cleanedUI = uiEvents.map((e, index) => ({
    step: index + 1,
    action: e.event,
    value: e.value || e.valuePreview || null,

    locators: {
      dataId: e.locators?.dataId || null,
      id: e.locators?.id || null,
      xpath: e.locators?.xpath || null,
      css: e.locators?.css || null,
      className: e.locators?.class || null,
      domPath: e.domPath || null
    },

    fallbackOrder: [
      "dataId",
      "id",
      "xpath",
      "css",
      "className",
      "domPath"
    ]
  }));

  console.log(`✅ Cleaned UI steps: ${cleanedUI.length}\n`);

  // Show summary by action type
  const actionCounts = {};
  cleanedUI.forEach(step => {
    actionCounts[step.action] = (actionCounts[step.action] || 0) + 1;
  });
  
  console.log("📋 Action breakdown:");
  Object.entries(actionCounts).forEach(([action, count]) => {
    console.log(`   ${action}: ${count}`);
  });

  // Create output object
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalSteps: cleanedUI.length,
      originalEventCount: allEvents.length,
      uiEventCount: uiEvents.length
    },
    steps: cleanedUI
  };

  // Save to output file
  const outputPath = path.resolve(outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 UI spec created: ${outputPath}`);
}

// Main execution
const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.error("❌ Usage: node filter-ui.js <input-file> [output-file]");
  console.error("   Example: node filter-ui.js artifacts/recordings/recording-raw.json output/ui-spec.json");
  process.exit(1);
}

const defaultOutput = inputFile.replace(/\.json$/, '-ui-spec.json');
const finalOutputFile = outputFile || defaultOutput;

filterUIEvents(inputFile, finalOutputFile);
