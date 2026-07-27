/**
 * API CALL FILTER
 * ===============
 * Reads a recording JSON produced by the recorder and extracts only the
 * API calls (api_request / api_response events), pairing each request with
 * its matching response and ordering the result chronologically by timestamp.
 *
 * Usage: node src/filters/filter-api.js <recording.json> [output.json]
 */

const fs = require("fs");
const path = require("path");

function filterApiCalls(inputFile, outputFile) {
  const recordingPath = path.resolve(inputFile);
  const recording = JSON.parse(fs.readFileSync(recordingPath, "utf8"));
  const allEvents = Array.isArray(recording.events) ? recording.events : [];

  const requests = allEvents.filter((e) => e.type === "api_request");
  const responses = allEvents.filter((e) => e.type === "api_response");
  const usedResponses = new Set();

  const apiCalls = requests.map((req) => {
    const response = responses.find(
      (res) =>
        !usedResponses.has(res) &&
        res.url === req.url &&
        res.timestamp >= req.timestamp
    );

    if (response) {
      usedResponses.add(response);
    }

    return {
      method: req.method,
      url: req.url,
      requestTimestamp: req.timestamp,
      requestHeaders: req.headers || null,
      postData: req.postData || null,
      status: response ? response.status : null,
      responseBody: response ? response.responseBody : null,
      responseTimestamp: response ? response.timestamp : null,
    };
  });

  apiCalls.sort((a, b) => a.requestTimestamp - b.requestTimestamp);

  const result = {
    meta: {
      sourceFile: path.basename(recordingPath),
      sessionUrl: recording.meta ? recording.meta.url : null,
      filteredAt: new Date().toISOString(),
      totalApiCalls: apiCalls.length,
    },
    apiCalls,
  };

  const outputPath = path.resolve(
    outputFile ||
      path.join(
        path.dirname(recordingPath),
        `${path.basename(recordingPath, ".json")}-api-calls.json`
      )
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`📂 Read: ${recordingPath}`);
  console.log(`📊 Total events: ${allEvents.length}`);
  console.log(`🔎 API calls found: ${apiCalls.length}`);
  console.log(`✅ Saved: ${outputPath}`);

  return outputPath;
}

// ============ RUN ============

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (require.main === module) {
  if (!inputFile) {
    console.error("❌ Please provide a recording file to filter.");
    console.error("   Example: node src/filters/filter-api.js recordings/recording-1766507394510.json");
    process.exit(1);
  }

  try {
    filterApiCalls(inputFile, outputFile);
  } catch (error) {
    console.error("❌ Error filtering API calls:", error.message);
    process.exit(1);
  }
}

module.exports = { filterApiCalls };
