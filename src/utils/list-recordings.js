/**
 * LIST RECORDINGS
 * Lists all recordings in the recordings folder with details
 */

const fs = require("fs");
const path = require("path");

const RECORDINGS_DIR = path.join(__dirname, "..", "..", "artifacts", "recordings");

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function listRecordings() {
  console.log("\n" + "=".repeat(80));
  console.log("📋 AVAILABLE RECORDINGS");
  console.log("=".repeat(80));

  if (!fs.existsSync(RECORDINGS_DIR)) {
    console.log("❌ No recordings folder found");
    return;
  }

  const files = fs.readdirSync(RECORDINGS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log("📭 No recordings found");
    console.log("\nRun: npm run automate");
    return;
  }

  console.log(`Found ${files.length} recording(s):\n`);

  const groups = {};
  
  files.forEach(filename => {
    const match = filename.match(/recording-(\d+)(-\w+)?\.json/);
    if (match) {
      const timestamp = match[1];
      const type = match[2] || '-raw';
      if (!groups[timestamp]) {
        groups[timestamp] = {};
      }
      groups[timestamp][type] = filename;
    } else {
      if (!groups['other']) groups['other'] = {};
      groups['other']['-raw'] = filename;
    }
  });

  Object.keys(groups).sort().reverse().forEach((timestamp, index) => {
    const group = groups[timestamp];
    
    console.log(`\n[${index + 1}] ${timestamp === 'other' ? 'Other Files' : formatDate(parseInt(timestamp))}`);
    console.log("─".repeat(80));
    
    const order = ['-raw', '-filtered', '-final', '-deduplicated', '-ui-spec'];
    
    order.forEach(type => {
      if (group[type]) {
        const filepath = path.join(RECORDINGS_DIR, group[type]);
        const stats = fs.statSync(filepath);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        const eventCount = data.events?.length || 0;
        
        let icon = '📄';
        let label = 'Raw Recording';
        
        if (type === '-filtered') { icon = '🔍'; label = 'Filtered'; }
        else if (type === '-final') { icon = '✨'; label = 'Final (Ready to Execute)'; }
        else if (type === '-deduplicated') { icon = '🔄'; label = 'Deduplicated'; }
        else if (type === '-ui-spec') { icon = '📋'; label = 'UI Specification'; }
        
        console.log(`   ${icon} ${label}`);
        console.log(`      File: ${group[type]}`);
        console.log(`      Events: ${eventCount} | Size: ${formatBytes(stats.size)}`);
        
        if (data.meta?.url) {
          const url = data.meta.url.length > 60 
            ? data.meta.url.substring(0, 60) + '...' 
            : data.meta.url;
          console.log(`      URL: ${url}`);
        }
      }
    });
  });

  console.log("\n" + "=".repeat(80));
  console.log("💡 QUICK COMMANDS");
  console.log("=".repeat(80));
  console.log("Process & Execute:  npm run process artifacts/recordings/<filename>");
  console.log("Just Playback:      npm run playback artifacts/recordings/<filename>");
  console.log("New Recording:      npm run automate");
  console.log("=".repeat(80) + "\n");
}

listRecordings();
