// recorder.js
// A simple Playwright-based recorder for:
//  - UI Events: clicks, text inputs
//  - API Calls: XHR / fetch requests + responses
//
// Output: artifacts/recordings/recording-<timestamp>.json

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright"); // make sure playwright is installed

// ---- helpers ---------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Very simple selector generator from element
function buildDomPath(element) {
  if (!element || !element.tagName) return "unknown";
  let path = "";
  while (element && element.nodeType === 1 && path.length < 300) {
    let selector = element.tagName.toLowerCase();
    if (element.id) {
      selector += `#${element.id}`;
      path = selector + (path ? " > " + path : "");
      break;
    } else {
      // index among siblings
      let index = 1;
      let sibling = element;
      while ((sibling = sibling.previousElementSibling) != null) {
        if (sibling.tagName === element.tagName) {
          index++;
        }
      }
      selector += `:nth-of-type(${index})`;
    }
    path = selector + (path ? " > " + path : "");
    element = element.parentElement;
  }
  return path || "unknown";
}

// ---- main ------------------------------------------------------------

async function main() {
  const recordingsDir = path.join(__dirname, "..", "..", "artifacts", "recordings");
  ensureDir(recordingsDir);

  const browser = await chromium.launch({
    headless: false, // show browser so you can manually interact
    // Extra safety: also tell Chromium to ignore cert errors
    args: ["--ignore-certificate-errors"],
  });

  // 👇 IMPORTANT: ignoreHTTPSErrors handles self-signed / invalid certs
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  const events = [];
  const apiRequestMap = new Map(); // map request -> basic info

  console.log("✅ Recorder started.");
  console.log("1️⃣  Browser will open.");
  console.log("2️⃣  Interact with your app (click, type, etc.).");
  console.log("3️⃣  When finished, return here and press ENTER to stop & save.\n");

  // ---- capture API calls (XHR / fetch) ------------------------------

  page.on("request", async (request) => {
    try {
      const resourceType = request.resourceType();
      const url = request.url();

      // Keep only likely API calls
      const isApi =
        resourceType === "xhr" ||
        resourceType === "fetch" ||
        url.includes("/api/");

      if (!isApi) return;

      const postData = request.postData();
      const e = {
        type: "api_request",
        timestamp: Date.now(),
        method: request.method(),
        url,
        resourceType,
        headers: request.headers(),
        postData,
      };

      events.push(e);
      apiRequestMap.set(request, e);
    } catch (err) {
      console.error("Error in request handler:", err);
    }
  });

  page.on("response", async (response) => {
    try {
      const request = response.request();
      const url = request.url();
      const resourceType = request.resourceType();

      const isApi =
        resourceType === "xhr" ||
        resourceType === "fetch" ||
        url.includes("/api/");

      if (!isApi) return;

      let bodyText = null;
      try {
        bodyText = await response.text();
      } catch (e) {
        // ignore if body not readable
      }

      // Try to parse JSON response (if applicable)
      let jsonBody = null;
      if (bodyText && bodyText.trim().startsWith("{")) {
        try {
          jsonBody = JSON.parse(bodyText);
        } catch (e) {
          // not valid JSON – leave as text
        }
      }

      const apiReqEvent = apiRequestMap.get(request);

      const e = {
        type: "api_response",
        timestamp: Date.now(),
        url,
        status: response.status(),
        headers: response.headers(),
        bodyText: jsonBody ? undefined : bodyText,
        bodyJson: jsonBody || undefined,
        // optional linkage to request
        requestSummary: apiReqEvent
          ? {
              method: apiReqEvent.method,
              postData: apiReqEvent.postData,
            }
          : undefined,
      };

      events.push(e);
    } catch (err) {
      console.error("Error in response handler:", err);
    }
  });

  // ---- capture UI events via injected script ------------------------

  await page.exposeBinding("recordUIEventFromPage", (_source, data) => {
    events.push({
      type: "ui_event",
      timestamp: Date.now(),
      ...data,
    });
  });

  await page.addInitScript(() => {
    // This runs in the browser context
    function buildDomPath(element) {
      if (!element || !element.tagName) return "unknown";
      let path = "";
      while (element && element.nodeType === 1 && path.length < 300) {
        let selector = element.tagName.toLowerCase();
        if (element.id) {
          selector += `#${element.id}`;
          path = selector + (path ? " > " + path : "");
          break;
        } else {
          let index = 1;
          let sibling = element;
          while ((sibling = sibling.previousElementSibling) != null) {
            if (sibling.tagName === element.tagName) {
              index++;
            }
          }
          selector += `:nth-of-type(${index})`;
        }
        path = selector + (path ? " > " + path : "");
        element = element.parentElement;
      }
      return path || "unknown";
    }

    window.addEventListener(
      "click",
      (e) => {
        const target = e.target;
        const domPath = buildDomPath(target);
        const text =
          target && target.innerText
            ? target.innerText.trim().slice(0, 80)
            : "";

        window.recordUIEventFromPage({
          event: "click",
          domPath,
          elementText: text,
        });
      },
      true
    );

    window.addEventListener(
      "change",
      (e) => {
        const target = e.target;
        if (!target || !("value" in target)) return;
        const domPath = buildDomPath(target);
        const value = target.value;

        window.recordUIEventFromPage({
          event: "change",
          domPath,
          value,
        });
      },
      true
    );

    window.addEventListener(
      "input",
      (e) => {
        const target = e.target;
        if (!target || !("value" in target)) return;
        const domPath = buildDomPath(target);
        const value = target.value;

        window.recordUIEventFromPage({
          event: "input",
          domPath,
          valuePreview: value.slice(0, 50),
        });
      },
      true
    );
  });

  // ---- open your app ------------------------------------------------

  const startUrl =
    process.argv[2] || "https://maple-aio-m1.otxlab.net:443/saw/ess?TENANTID=931767119"; // change for your app
  console.log(`🌐 Opening: ${startUrl}`);
  await page.goto(startUrl);

  // ---- wait for user to press ENTER to stop -------------------------

  process.stdin.setEncoding("utf8");
  console.log("\n🔴 Recording... Press ENTER here in terminal to stop & save.\n");

  process.stdin.on("data", async () => {
    // stop on first ENTER
    try {
      const output = {
        meta: {
          startedAt: new Date().toISOString(),
          startUrl,
        },
        events,
      };

      const fileName = `recording-${Date.now()}.json`;
      const filePath = path.join(recordingsDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(output, null, 2), "utf-8");

      console.log(`\n✅ Recording saved to: ${filePath}`);
    } catch (err) {
      console.error("Error while saving recording:", err);
    } finally {
      await browser.close();
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error("Fatal error in recorder:", err);
  process.exit(1);
});
