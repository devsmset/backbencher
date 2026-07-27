const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const recordingsDir = path.join(projectRoot, "artifacts", "recordings");
const outputJsonPath = path.join(projectRoot, "artifacts", "api-catalog", "all-apis.json");
const outputMdPath = path.join(projectRoot, "artifacts", "api-catalog", "all-apis.md");

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function normalizeEndpoint(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return rawUrl;
  }
}

function queryParamNames(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return Array.from(new Set([...u.searchParams.keys()])).sort();
  } catch {
    return [];
  }
}

function main() {
  if (!fs.existsSync(recordingsDir)) {
    throw new Error(`Recordings directory not found: ${recordingsDir}`);
  }

  const files = fs
    .readdirSync(recordingsDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const uniqueMap = new Map();
  const filesWithApi = new Set();

  for (const fileName of files) {
    const fullPath = path.join(recordingsDir, fileName);
    const data = safeReadJson(fullPath);

    if (!data || !Array.isArray(data.events)) {
      continue;
    }

    let fileHasApi = false;

    for (const event of data.events) {
      if (event?.type !== "api_call") {
        continue;
      }

      const method = String(event.method || "UNKNOWN").toUpperCase();
      const url = String(event.url || "");
      if (!url) {
        continue;
      }

      const endpoint = normalizeEndpoint(url);
      const key = `${method} ${endpoint}`;
      const params = queryParamNames(url);

      fileHasApi = true;

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          method,
          endpoint,
          queryParams: params,
          sampleUrls: [url],
          sources: [fileName]
        });
      } else {
        const item = uniqueMap.get(key);

        for (const p of params) {
          if (!item.queryParams.includes(p)) {
            item.queryParams.push(p);
          }
        }
        item.queryParams.sort();

        if (!item.sampleUrls.includes(url) && item.sampleUrls.length < 5) {
          item.sampleUrls.push(url);
        }

        if (!item.sources.includes(fileName)) {
          item.sources.push(fileName);
        }
      }
    }

    if (fileHasApi) {
      filesWithApi.add(fileName);
    }
  }

  const apis = Array.from(uniqueMap.values()).sort((a, b) => {
    if (a.endpoint === b.endpoint) {
      return a.method.localeCompare(b.method);
    }
    return a.endpoint.localeCompare(b.endpoint);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      recordingFilesScanned: files.length,
      recordingFilesWithApiCalls: filesWithApi.size,
      uniqueApis: apis.length,
      dedupeRule: "method + origin + pathname (query values ignored)"
    },
    apis
  };

  fs.writeFileSync(outputJsonPath, JSON.stringify(output, null, 2), "utf8");

  const mdLines = [];
  mdLines.push("# API Catalog From Recordings");
  mdLines.push("");
  mdLines.push(`Generated: ${output.generatedAt}`);
  mdLines.push("");
  mdLines.push(`- Recording files scanned: ${output.summary.recordingFilesScanned}`);
  mdLines.push(`- Recording files with API calls: ${output.summary.recordingFilesWithApiCalls}`);
  mdLines.push(`- Unique APIs: ${output.summary.uniqueApis}`);
  mdLines.push(`- Dedupe rule: ${output.summary.dedupeRule}`);
  mdLines.push("");

  for (const api of apis) {
    mdLines.push(`## ${api.method} ${api.endpoint}`);
    mdLines.push(`- Query params: ${api.queryParams.length ? api.queryParams.join(", ") : "none"}`);
    mdLines.push(`- Seen in files: ${api.sources.length}`);
    mdLines.push(`- Sample URL: ${api.sampleUrls[0]}`);
    mdLines.push("");
  }

  fs.writeFileSync(outputMdPath, mdLines.join("\n"), "utf8");

  console.log(`Scanned ${files.length} recording files`);
  console.log(`Unique APIs: ${apis.length}`);
  console.log(`Wrote: ${outputJsonPath}`);
  console.log(`Wrote: ${outputMdPath}`);
}

main();
