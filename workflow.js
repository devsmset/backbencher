const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateTestCases } = require('./src/utils/generate-test-cases');

/**
 * AUTOMATED WORKFLOW
 * 
 * This script automates the entire flow:
 * 1. Takes a recording file
 * 2. Filters events using filter-events.js
 * 3. Deduplicates using deduplicate.js
 * 4. Generates test cases
 * 5. Runs playback using playback-unified.js
 */

console.log("\n" + "=".repeat(70));
console.log("🚀 AUTOMATED WORKFLOW");
console.log("=".repeat(70));

// Get the recording file from command line argument
const recordingFile = process.argv[2];

if (!recordingFile) {
  console.error("\n❌ Error: No recording file provided");
  console.error("\n📖 Usage: node workflow.js <recording-file>");
  console.error("   Example: node workflow.js artifacts/recordings/recording-1767715508509.json\n");
  process.exit(1);
}

// Verify the recording file exists
if (!fs.existsSync(recordingFile)) {
  console.error(`\n❌ Error: Recording file not found: ${recordingFile}\n`);
  process.exit(1);
}

console.log(`\n📂 Input Recording: ${recordingFile}\n`);

try {
  // Step 1: Filter events
  console.log("=".repeat(70));
  console.log("STEP 1: FILTERING EVENTS");
  console.log("=".repeat(70));
  
  const filterCommand = `node src/filters/filter-events.js "${recordingFile}"`;
  console.log(`\n⚙️  Running: ${filterCommand}\n`);
  execSync(filterCommand, { stdio: 'inherit' });
  
  // Calculate filtered file name
  const filteredFile = recordingFile.replace(/\.json$/, '-filtered.json');
  
  if (!fs.existsSync(filteredFile)) {
    throw new Error(`Filtered file not created: ${filteredFile}`);
  }
  
  console.log(`\n✅ Filtered file created: ${filteredFile}\n`);
  
  // Step 2: Deduplicate
  console.log("=".repeat(70));
  console.log("STEP 2: DEDUPLICATING EVENTS");
  console.log("=".repeat(70));
  
  const deduplicateCommand = `node src/utils/deduplicate.js "${filteredFile}"`;
  console.log(`\n⚙️  Running: ${deduplicateCommand}\n`);
  execSync(deduplicateCommand, { stdio: 'inherit' });
  
  // Calculate deduplicated file name
  const deduplicatedFile = filteredFile.replace(/-filtered\.json$/, '-deduplicated.json');
  
  if (!fs.existsSync(deduplicatedFile)) {
    throw new Error(`Deduplicated file not created: ${deduplicatedFile}`);
  }
  
  console.log(`\n✅ Deduplicated file created: ${deduplicatedFile}\n`);
  
  // Step 3: Generate test cases
  generateTestCases(deduplicatedFile);

  // Step 4: Playback
  console.log("=".repeat(70));
  console.log("STEP 3: RUNNING PLAYBACK");
  console.log("=".repeat(70));
  
  const playbackCommand = `node src/playback/playback-unified.js "${deduplicatedFile}"`;
  console.log(`\n⚙️  Running: ${playbackCommand}\n`);
  execSync(playbackCommand, { stdio: 'inherit' });
  
  console.log("\n" + "=".repeat(70));
  console.log("✅ WORKFLOW COMPLETED SUCCESSFULLY");
  console.log("=".repeat(70));
  console.log(`\n📁 Generated Files:`);
  console.log(`   - Filtered: ${filteredFile}`);
  console.log(`   - Deduplicated: ${deduplicatedFile}`);
  console.log("=".repeat(70) + "\n");
  
} catch (error) {
  console.error("\n" + "=".repeat(70));
  console.error("❌ WORKFLOW FAILED");
  console.error("=".repeat(70));
  console.error(`\n${error.message}\n`);
  process.exit(1);
}
