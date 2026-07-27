/**
 * ═══════════════════════════════════════════════════════════════════
 *  AI-Powered Test Generator — Ollama + DeepSeek-Coder 6.7B
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Reads a final recording JSON, sends it to a LOCAL Ollama instance
 *  running deepseek-coder:6.7b, and generates:
 *    1. Selenium automation code  (Java / Python — configurable)
 *    2. Structured test cases     (Markdown)
 *
 *  Prerequisites:
 *    1. Install Ollama        → https://ollama.com/download
 *    2. Pull the model        → ollama pull deepseek-coder:6.7b
 *    3. Ollama must be running (it starts automatically after install)
 *
 *  Usage:
 *    node src/ai/generate-with-copilot.js <recording-final.json>
 *    node src/ai/generate-with-copilot.js artifacts/recordings/recording-1772470716758-final.json
 *    node src/ai/generate-with-copilot.js artifacts/recordings/recording-1772470716758-final.json --lang java
 *
 *  No API keys needed — everything runs 100% locally.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

// ── Directories ──────────────────────────────────────────────────
const OUTPUT_DIR = path.join(__dirname, "..", "..", "artifacts", "ai-generated");
const RECORDINGS_DIR = path.join(__dirname, "..", "..", "artifacts", "recordings");

// ── Configuration ────────────────────────────────────────────────
const CONFIG = {
  // Ollama local server
  ollamaHost: "127.0.0.1",
  ollamaPort: 11434,
  model: "deepseek-coder:6.7b",

  // Output language for Selenium code: "java" | "python"
  seleniumLang: "python",

  // Temperature (0 = deterministic, 1 = creative)
  temperature: 0.2,

  // Context window (num_ctx) — increase if responses get cut off
  numCtx: 8192,
};

// ── Helpers ──────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveRecordingPath(input) {
  if (!input) {
    console.error("\n❌ Usage: node src/ai/generate-with-copilot.js <recording-file.json>\n");
    process.exit(1);
  }
  const candidates = [
    input,
    path.resolve(process.cwd(), input),
    path.join(RECORDINGS_DIR, path.basename(input)),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  console.error(`\n❌ File not found: ${input}\n`);
  process.exit(1);
}

/**
 * Check if Ollama is running and the model is available.
 */
function checkOllama() {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: CONFIG.ollamaHost, port: CONFIG.ollamaPort, path: "/api/tags", method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              const models = (json.models || []).map((m) => m.name);
              resolve({ running: true, models });
            } catch {
              resolve({ running: true, models: [] });
            }
          } else {
            resolve({ running: false, models: [] });
          }
        });
      }
    );
    req.on("error", () => resolve({ running: false, models: [] }));
    req.end();
  });
}

/**
 * Call Ollama /api/chat (streaming: false) — returns full response.
 */
function callOllama(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CONFIG.model,
      messages,
      stream: false,
      options: {
        temperature: CONFIG.temperature,
        num_ctx: CONFIG.numCtx,
      },
    });

    const options = {
      hostname: CONFIG.ollamaHost,
      port: CONFIG.ollamaPort,
      path: "/api/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            const content = json.message?.content;
            if (content) {
              // Log generation stats if available
              if (json.eval_count) {
                const tokensPerSec = json.eval_count / (json.eval_duration / 1e9);
                console.log(`   ⚡ ${json.eval_count} tokens in ${(json.eval_duration / 1e9).toFixed(1)}s (${tokensPerSec.toFixed(1)} tok/s)`);
              }
              resolve(content);
            } else {
              reject(new Error(`Empty response from Ollama:\n${data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Ollama response: ${e.message}\n${data.substring(0, 500)}`));
          }
        } else {
          reject(new Error(`Ollama returned ${res.statusCode}:\n${data.substring(0, 500)}`));
        }
      });
    });

    req.on("error", (err) => {
      if (err.code === "ECONNREFUSED") {
        reject(new Error(
          "Cannot connect to Ollama. Make sure it's running:\n" +
          "   1. Install: https://ollama.com/download\n" +
          "   2. Start:   ollama serve\n" +
          "   3. Pull:    ollama pull deepseek-coder:6.7b"
        ));
      } else {
        reject(err);
      }
    });

    req.write(body);
    req.end();
  });
}

// ── Prompt builders ──────────────────────────────────────────────

function buildSeleniumPrompt(recording, lang) {
  const meta = recording.meta;
  const events = recording.events;
  const eventsJson = JSON.stringify(events, null, 2);

  return [
    {
      role: "system",
      content: `You are an expert test automation engineer. You write clean, production-ready Selenium WebDriver automation code.
You always include proper waits (WebDriverWait / explicit waits), page object patterns where appropriate, and handle edge cases.
Output ONLY the code — no explanations, no markdown fences.`,
    },
    {
      role: "user",
      content: `Generate a complete, runnable Selenium WebDriver automation script in **${lang}** for the following recorded browser interactions.

## Application Details
- **Base URL**: ${meta.url}
- **Recorded At**: ${meta.recordedAt}
- **Total Actions**: ${events.length}

## Requirements
1. Use Selenium WebDriver with explicit waits (WebDriverWait)
2. Use multiple locator strategies as fallback (the recording provides xpath, css, id per element)
3. Implement a helper function that tries locators in priority order: id → css → xpath → text
4. Add proper setup (browser launch) and teardown (browser quit)
5. Add comments explaining each action step
6. Handle login flow, navigation, clicks, inputs, and logout
7. Add assertions where logical (e.g., after login verify page loaded, after navigation verify URL changed)
8. Include error handling with try/catch blocks

## Recorded Events (JSON)
\`\`\`json
${eventsJson}
\`\`\`

Generate the **complete** ${lang} script. Include all imports, driver setup, test execution, and teardown.`,
    },
  ];
}

function buildTestCasePrompt(recording) {
  const meta = recording.meta;
  const events = recording.events;
  const eventsJson = JSON.stringify(events, null, 2);

  return [
    {
      role: "system",
      content: `You are a senior QA engineer who writes thorough, professional test case documentation.
You classify user actions into logical business workflows (Login, Navigation, CRUD operations, Verification, Logout).
Your test cases follow industry standards with IDs, priorities, preconditions, clear steps, expected results, and test data.
Output in clean Markdown format.`,
    },
    {
      role: "user",
      content: `Analyze the following recorded browser interactions and generate **comprehensive test cases** in structured Markdown.

## Application Details
- **Base URL**: ${meta.url}
- **Recorded At**: ${meta.recordedAt}
- **Total Actions**: ${events.length}

## Requirements for Test Cases
1. Group actions into logical test cases by business intent (Login, Navigation, Entity Management, Settings, Logout)
2. Each test case must include:
   - **Test Case ID** (TC-001, TC-002, etc.)
   - **Title** (descriptive business-level title)
   - **Priority** (Critical / High / Medium / Low)
   - **Type** (Functional / Navigation / Workflow / Security)
   - **Objective** (what is being verified)
   - **Preconditions** (what must be true before the test)
   - **Test Steps** (numbered, detailed, include selectors)
   - **Expected Results** (specific, verifiable outcomes)
   - **Test Data** (usernames, passwords, values used)
3. Add a Test Suite Summary at the top with:
   - Total test cases generated
   - Priority breakdown
   - Key workflows covered
4. Add a Test Environment section with application details
5. Identify and suggest **negative test cases** and **edge cases** based on the recorded workflow

## Recorded Events (JSON)
\`\`\`json
${eventsJson}
\`\`\`

Generate the **complete** test case document in Markdown.`,
    },
  ];
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  🤖 AI Test Generator — Ollama + DeepSeek-Coder 6.7B");
  console.log("══════════════════════════════════════════════════════════\n");

  // Parse args
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith("--"));
  const langArg = args.find((a) => a.startsWith("--lang"));
  if (langArg) {
    const lang = langArg.split("=")[1] || args[args.indexOf(langArg) + 1];
    if (lang && ["python", "java"].includes(lang.toLowerCase())) {
      CONFIG.seleniumLang = lang.toLowerCase();
    }
  }

  // Resolve file
  const filePath = resolveRecordingPath(fileArg);
  const recording = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const baseName = path.basename(filePath, ".json").replace(/-(filtered|final|deduplicated)$/, "");

  console.log(`📂 Recording : ${path.basename(filePath)}`);
  console.log(`🌐 URL       : ${recording.meta.url}`);
  console.log(`📊 Events    : ${recording.events.length}`);
  console.log(`🔧 Language  : ${CONFIG.seleniumLang}`);
  console.log(`🤖 Model     : ${CONFIG.model}`);
  console.log(`🖥️  Ollama    : http://${CONFIG.ollamaHost}:${CONFIG.ollamaPort}`);
  console.log("");

  // ── Check Ollama is running ──
  console.log("🔍 Checking Ollama connection...");
  const { running, models } = await checkOllama();

  if (!running) {
    console.error("\n❌ Ollama is not running!\n");
    console.error("   Start it with one of these:");
    console.error("   • Open the Ollama app (it runs in the system tray)");
    console.error("   • Run: ollama serve\n");
    process.exit(1);
  }

  console.log("✅ Ollama is running");

  // Check if model is pulled
  const modelBase = CONFIG.model.split(":")[0];
  const hasModel = models.some((m) => m.startsWith(modelBase));

  if (!hasModel) {
    console.log(`\n⏳ Model "${CONFIG.model}" not found locally. Pulling now...`);
    console.log(`   This is a one-time download (~3.8 GB). Run manually if needed:`);
    console.log(`   ollama pull ${CONFIG.model}\n`);

    // Attempt to pull
    try {
      await pullModel(CONFIG.model);
      console.log(`✅ Model pulled successfully\n`);
    } catch (err) {
      console.error(`\n❌ Failed to pull model: ${err.message}`);
      console.error(`   Pull manually: ollama pull ${CONFIG.model}\n`);
      process.exit(1);
    }
  } else {
    console.log(`✅ Model "${CONFIG.model}" is available`);
  }

  console.log("");
  ensureDir(OUTPUT_DIR);

  // ── Step 1: Generate Selenium Code ──
  console.log("─────────────────────────────────────────────────────────");
  console.log("📝 Step 1/2 — Generating Selenium automation code...");
  console.log("   (this may take 1-3 minutes on first run)");
  console.log("─────────────────────────────────────────────────────────");

  try {
    const seleniumMessages = buildSeleniumPrompt(recording, CONFIG.seleniumLang);
    const seleniumCode = await callOllama(seleniumMessages);

    // Clean up — remove markdown fences if present
    const cleanCode = seleniumCode
      .replace(/^```(?:python|java|javascript)?\n?/gm, "")
      .replace(/\n?```\s*$/gm, "")
      .trim();

    const ext = CONFIG.seleniumLang === "java" ? "java" : "py";
    const seleniumFile = path.join(OUTPUT_DIR, `${baseName}-selenium.${ext}`);
    fs.writeFileSync(seleniumFile, cleanCode, "utf-8");

    console.log(`✅ Selenium code saved : ${path.relative(process.cwd(), seleniumFile)}`);
    console.log(`   Lines: ${cleanCode.split("\n").length}`);
    console.log("");
  } catch (err) {
    console.error(`❌ Failed to generate Selenium code: ${err.message}\n`);
  }

  // ── Step 2: Generate Test Cases ──
  console.log("─────────────────────────────────────────────────────────");
  console.log("📝 Step 2/2 — Generating test cases with AI...");
  console.log("   (this may take 1-3 minutes)");
  console.log("─────────────────────────────────────────────────────────");

  try {
    const testCaseMessages = buildTestCasePrompt(recording);
    const testCases = await callOllama(testCaseMessages);

    const testCaseFile = path.join(OUTPUT_DIR, `${baseName}-ai-test-cases.md`);
    fs.writeFileSync(testCaseFile, testCases.trim(), "utf-8");

    console.log(`✅ Test cases saved    : ${path.relative(process.cwd(), testCaseFile)}`);
    console.log(`   Lines: ${testCases.split("\n").length}`);
    console.log("");
  } catch (err) {
    console.error(`❌ Failed to generate test cases: ${err.message}\n`);
  }

  // ── Summary ──
  console.log("══════════════════════════════════════════════════════════");
  console.log("  ✅ GENERATION COMPLETE");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  📁 Output directory : ${path.relative(process.cwd(), OUTPUT_DIR)}/`);
  console.log(`  📄 Selenium code    : ${baseName}-selenium.${CONFIG.seleniumLang === "java" ? "java" : "py"}`);
  console.log(`  📄 Test cases       : ${baseName}-ai-test-cases.md`);
  console.log("══════════════════════════════════════════════════════════\n");
}

/**
 * Pull a model from Ollama (one-time download).
 */
function pullModel(model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: model, stream: false });
    const options = {
      hostname: CONFIG.ollamaHost,
      port: CONFIG.ollamaPort,
      path: "/api/pull",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
        // Print progress dots
        process.stdout.write(".");
      });
      res.on("end", () => {
        console.log("");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Pull failed (${res.statusCode}): ${data.substring(0, 300)}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

main().catch((err) => {
  console.error("\n❌ Unexpected error:", err.message);
  process.exit(1);
});
