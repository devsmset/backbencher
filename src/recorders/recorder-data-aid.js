/**
 * DATA-AID FOCUSED RECORDER
 * =========================
 * Captures only XPath and data-aid attributes for automation
 * Simplified recording format focusing on reliable selectors
 * 
 * Usage: node src/recorders/recorder-data-aid.js [url]
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const readline = require("readline");

// ============ CONFIGURATION ============

const DEFAULT_URL = "https://maple-aio-2-m1.otxlab.net:443/saw/ess?TENANTID=669062255";
const RECORDINGS_DIR = path.join(__dirname, "..", "..", "artifacts", "recordings");

// ============ HELPERS ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============ MAIN RECORDER ============

async function record(startUrl) {
  ensureDir(RECORDINGS_DIR);

  const events = [];
  let saved = false;

  console.log("\n" + "=".repeat(70));
  console.log("🎯 DATA-AID FOCUSED RECORDER - Started");
  console.log("=".repeat(70));
  console.log(`🌐 URL: ${startUrl}`);
  console.log("✅ Browser will open");
  console.log("👉 Interact with your application (click elements)");
  console.log("⏹️  Press ENTER in this terminal to stop & save recording");
  console.log("=".repeat(70) + "\n");

  // ============ LAUNCH BROWSER ============

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
      "--disable-web-security"
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  let popupCounter = 0;

  // ============ GLOBAL EVENT LOGGER ============

  await context.exposeFunction("logDataAidEvent", (eventData) => {
    events.push({
      timestamp: Date.now(),
      ...eventData,
    });

    // Console logging
    const pagePrefix = eventData.pageType !== "main" ? `[${eventData.pageType}] ` : "";
    const dataAidInfo = eventData.dataAid ? ` [data-aid="${eventData.dataAid}"]` : "";
    console.log(`🖱️  ${pagePrefix}${eventData.action.toUpperCase()}${dataAidInfo}`);
    if (eventData.xpath) {
      console.log(`   XPath: ${eventData.xpath}`);
    }
  });

  // ============ ATTACH EVENT LISTENERS ============

  async function attachDataAidListeners(targetPage, pageLabel) {
    await targetPage.addInitScript((label) => {
      // Get data-aid attribute (supports both data-aid and data-testid)
      function getDataAid(element) {
        if (!element) return null;
        
        // Check data-aid first
        let dataAid = element.getAttribute("data-aid");
        if (dataAid) return dataAid;
        
        // Fallback to data-test-id
        dataAid = element.getAttribute("data-test-id");
        if (dataAid) return dataAid;
        
        // Fallback to data-testid
        dataAid = element.getAttribute("data-testid");
        return dataAid || null;
      }

      // Generate XPath with data-aid if available
      function getDataAidXPath(element) {
        if (!element || element.nodeType !== 1) return null;

        // If element has data-aid, create XPath using it
        const dataAid = getDataAid(element);
        if (dataAid) {
          // Get tag name
          const tagName = element.tagName.toLowerCase();
          
          // Build XPath with data-aid
          let xpath = `//${tagName}[@data-aid='${dataAid}']`;
          
          // Check if this selector is unique
          const matches = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          
          // If multiple matches, add index
          if (matches.snapshotLength > 1) {
            // Find the index of current element
            for (let i = 0; i < matches.snapshotLength; i++) {
              if (matches.snapshotItem(i) === element) {
                xpath = `(${xpath})[${i + 1}]`;
                break;
              }
            }
          }
          
          return xpath;
        }

        // If no data-aid, build traditional XPath
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }

        const parts = [];
        let currentElement = element;
        
        while (currentElement && currentElement.nodeType === 1) {
          // Check for data-aid in parent chain
          const parentDataAid = getDataAid(currentElement);
          if (parentDataAid) {
            const tagName = currentElement.tagName.toLowerCase();
            parts.unshift(`${tagName}[@data-aid='${parentDataAid}']`);
            break;
          }

          let index = 1;
          let sibling = currentElement.previousSibling;
          
          while (sibling) {
            if (sibling.nodeType === 1 && sibling.tagName === currentElement.tagName) {
              index++;
            }
            sibling = sibling.previousSibling;
          }
          
          const tagName = currentElement.tagName.toLowerCase();
          const xpathIndex = index > 1 ? `[${index}]` : "";
          parts.unshift(`${tagName}${xpathIndex}`);
          
          currentElement = currentElement.parentNode;
          
          // Limit depth
          if (parts.length > 10) break;
        }
        
        return "//" + parts.join("/");
      }

      // Capture click event
      function captureClick(target) {
        if (!target) return;

        const dataAid = getDataAid(target);
        const xpath = getDataAidXPath(target);

        if (window.logDataAidEvent) {
          window.logDataAidEvent({
            action: "click",
            pageType: label,
            xpath: xpath,
            dataAid: dataAid,
            tagName: target.tagName.toLowerCase(),
            text: target.innerText?.substring(0, 100) || null,
            className: target.className || null,
          });
        }
      }

      // Capture input/change events
      function captureInput(target) {
        if (!target || !("value" in target)) return;

        const dataAid = getDataAid(target);
        const xpath = getDataAidXPath(target);

        if (window.logDataAidEvent) {
          window.logDataAidEvent({
            action: "input",
            pageType: label,
            xpath: xpath,
            dataAid: dataAid,
            tagName: target.tagName.toLowerCase(),
            value: target.value || null,
          });
        }
      }

      // Event listeners
      const inputDebounceMap = new Map();
      const DEBOUNCE_DELAY = 1000;

      document.addEventListener("click", (e) => {
        captureClick(e.target);
      }, true);

      document.addEventListener("change", (e) => {
        if (e.target && "value" in e.target) {
          if (inputDebounceMap.has(e.target)) {
            clearTimeout(inputDebounceMap.get(e.target));
            inputDebounceMap.delete(e.target);
          }
          captureInput(e.target);
        }
      }, true);

      document.addEventListener("input", (e) => {
        if (e.target && "value" in e.target) {
          const target = e.target;
          
          if (inputDebounceMap.has(target)) {
            clearTimeout(inputDebounceMap.get(target));
          }
          
          const timeoutId = setTimeout(() => {
            captureInput(target);
            inputDebounceMap.delete(target);
          }, DEBOUNCE_DELAY);
          
          inputDebounceMap.set(target, timeoutId);
        }
      }, true);

    }, pageLabel);
  }

  // Attach to main page
  await attachDataAidListeners(page, "main");

  // ============ HANDLE POPUP WINDOWS ============

  context.on("page", async (newPage) => {
    popupCounter++;
    const popupLabel = `popup${popupCounter}`;
    
    events.push({
      type: "popup_opened",
      timestamp: Date.now(),
      url: newPage.url(),
      popupId: popupLabel
    });
    
    console.log(`\n🪟 New window opened: ${newPage.url()}`);
    
    try {
      await newPage.waitForLoadState("load", { timeout: 10000 });
      console.log(`   ✅ Window loaded`);
    } catch (e) {
      console.log(`   ⚠️  Load timeout`);
    }
    
    // Attach listeners to popup
    await attachDataAidListeners(newPage, popupLabel);
    
    // Inject into already-loaded page
    try {
      await newPage.evaluate((label) => {
        if (window.__dataAidInjected) return;
        window.__dataAidInjected = true;
        
        // (Copy of the same event capture logic from addInitScript)
        function getDataAid(element) {
          if (!element) return null;
          let dataAid = element.getAttribute("data-aid");
          if (dataAid) return dataAid;
          dataAid = element.getAttribute("data-test-id");
          if (dataAid) return dataAid;
          dataAid = element.getAttribute("data-testid");
          return dataAid || null;
        }

        function getDataAidXPath(element) {
          if (!element || element.nodeType !== 1) return null;
          const dataAid = getDataAid(element);
          if (dataAid) {
            const tagName = element.tagName.toLowerCase();
            let xpath = `//${tagName}[@data-aid='${dataAid}']`;
            const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (matches.snapshotLength > 1) {
              for (let i = 0; i < matches.snapshotLength; i++) {
                if (matches.snapshotItem(i) === element) {
                  xpath = `(${xpath})[${i + 1}]`;
                  break;
                }
              }
            }
            return xpath;
          }
          if (element.id) return `//*[@id="${element.id}"]`;
          const parts = [];
          let currentElement = element;
          while (currentElement && currentElement.nodeType === 1) {
            const parentDataAid = getDataAid(currentElement);
            if (parentDataAid) {
              const tagName = currentElement.tagName.toLowerCase();
              parts.unshift(`${tagName}[@data-aid='${parentDataAid}']`);
              break;
            }
            let index = 1;
            let sibling = currentElement.previousSibling;
            while (sibling) {
              if (sibling.nodeType === 1 && sibling.tagName === currentElement.tagName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            const tagName = currentElement.tagName.toLowerCase();
            const xpathIndex = index > 1 ? `[${index}]` : "";
            parts.unshift(`${tagName}${xpathIndex}`);
            currentElement = currentElement.parentNode;
            if (parts.length > 10) break;
          }
          return "//" + parts.join("/");
        }

        function captureClick(target) {
          if (!target) return;
          const dataAid = getDataAid(target);
          const xpath = getDataAidXPath(target);
          if (window.logDataAidEvent) {
            window.logDataAidEvent({
              action: "click",
              pageType: label,
              xpath: xpath,
              dataAid: dataAid,
              tagName: target.tagName.toLowerCase(),
              text: target.innerText?.substring(0, 100) || null,
              className: target.className || null,
            });
          }
        }

        function captureInput(target) {
          if (!target || !("value" in target)) return;
          const dataAid = getDataAid(target);
          const xpath = getDataAidXPath(target);
          if (window.logDataAidEvent) {
            window.logDataAidEvent({
              action: "input",
              pageType: label,
              xpath: xpath,
              dataAid: dataAid,
              tagName: target.tagName.toLowerCase(),
              value: target.value || null,
            });
          }
        }

        const inputDebounceMap = new Map();
        const DEBOUNCE_DELAY = 1000;

        document.addEventListener("click", (e) => captureClick(e.target), true);
        document.addEventListener("change", (e) => {
          if (e.target && "value" in e.target) {
            if (inputDebounceMap.has(e.target)) {
              clearTimeout(inputDebounceMap.get(e.target));
              inputDebounceMap.delete(e.target);
            }
            captureInput(e.target);
          }
        }, true);
        document.addEventListener("input", (e) => {
          if (e.target && "value" in e.target) {
            const target = e.target;
            if (inputDebounceMap.has(target)) {
              clearTimeout(inputDebounceMap.get(target));
            }
            const timeoutId = setTimeout(() => {
              captureInput(target);
              inputDebounceMap.delete(target);
            }, DEBOUNCE_DELAY);
            inputDebounceMap.set(target, timeoutId);
          }
        }, true);
      }, popupLabel);
      
      console.log(`   ✅ Recording enabled in ${popupLabel}`);
    } catch (error) {
      console.log(`   ❌ Failed to inject: ${error.message}`);
    }
    
    newPage.on("close", () => {
      events.push({
        type: "popup_closed",
        timestamp: Date.now(),
        popupId: popupLabel
      });
      console.log(`🪟 Window closed: ${popupLabel}\n`);
    });
  });

  // ============ START RECORDING ============

  console.log("🚀 Navigating to URL...\n");
  
  try {
    await page.goto(startUrl, { 
      waitUntil: "domcontentloaded",
      timeout: 30000 
    });
    console.log("✅ Page loaded successfully\n");
  } catch (error) {
    console.log(`⚠️  Page load timeout (continuing anyway): ${error.message}\n`);
  }

  // ============ SAVE & EXIT ============

  async function saveAndExit() {
    if (saved) return;
    saved = true;

    console.log("\n" + "=".repeat(70));
    console.log("💾 Saving recording...");

    const timestamp = Date.now();
    const filename = `recording-data-aid-${timestamp}.json`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    // Filter only click and input events
    const actionEvents = events.filter(e => e.action === "click" || e.action === "input");

    const recording = {
      meta: {
        url: startUrl,
        timestamp: timestamp,
        recordedAt: new Date().toISOString(),
        recorderType: "data-aid-focused",
        totalEvents: events.length,
        actionEvents: actionEvents.length,
      },
      events: actionEvents,
    };

    fs.writeFileSync(filepath, JSON.stringify(recording, null, 2));

    // Event summary
    const withDataAid = actionEvents.filter(e => e.dataAid).length;
    const withoutDataAid = actionEvents.filter(e => !e.dataAid).length;

    console.log("=".repeat(70));
    console.log("✅ Recording saved successfully!");
    console.log("=".repeat(70));
    console.log(`📁 File: ${filename}`);
    console.log(`📊 Total action events: ${actionEvents.length}`);
    console.log(`   With data-aid: ${withDataAid}`);
    console.log(`   Without data-aid: ${withoutDataAid}`);
    console.log("=".repeat(70) + "\n");

    await browser.close();
    process.exit(0);
  }

  // Wait for ENTER key
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", () => {
    rl.close();
    saveAndExit();
  });

  // Handle CTRL+C
  process.on("SIGINT", saveAndExit);
}

// ============ RUN ============

async function main() {
  const startUrl = process.argv[2] || DEFAULT_URL;
  
  try {
    await record(startUrl);
  } catch (error) {
    console.error("\n❌ Recorder error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  main();
}

module.exports = { record };
