/**
 * UNIFIED RECORDER
 * ================
 * Complete UI + API recorder with all features:
 * - Multiple locator strategies (XPath, CSS, ID, data-testid, text)
 * - SSL/certificate handling
 * - API request/response capture
 * - Input value capture
 * - Navigation tracking
 * - Click, input, change, and keypress events
 * 
 * Usage: node src/recorders/recorder.js [url]
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const readline = require("readline");
const { generateTestCases } = require("../utils/generate-test-cases");

// ============ CONFIGURATION ============


const DEFAULT_URL = "https://maple-aio-2-m1.otxlab.net:443/saw/ess?TENANTID=223791286";
const RECORDINGS_DIR = path.join(__dirname, "..", "..", "artifacts", "recordings");

// ============ HELPERS ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeValue(value) {
  // Add password masking if needed in future
  return value;
}

// ============ MAIN RECORDER ============

async function record(startUrl) {
  ensureDir(RECORDINGS_DIR);

  const events = [];
  const apiRequestMap = new Map();
  let saved = false;

  console.log("\n" + "=".repeat(70));
  console.log("🎥 UNIFIED RECORDER - Started");
  console.log("=".repeat(70));
  console.log(`🌐 URL: ${startUrl}`);
  console.log("✅ Browser will open");
  console.log("👉 Interact with your application (click, type, navigate)");
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

  // ============ API CAPTURE ============

  page.on("request", async (request) => {
    try {
      const resourceType = request.resourceType();
      const url = request.url();

      // Capture XHR/Fetch or /api/ endpoints
      const isApi = 
        resourceType === "xhr" || 
        resourceType === "fetch" || 
        url.includes("/api/");

      if (!isApi) return;

      let postData = null;
      try {
        postData = request.postData();
      } catch (e) {
        // Post data not available
      }

      const requestEvent = {
        type: "api_request",
        timestamp: Date.now(),
        method: request.method(),
        url: url,
        resourceType: resourceType,
        headers: request.headers(),
        postData: postData,
      };

      events.push(requestEvent);
      apiRequestMap.set(request, requestEvent);

      console.log(`📤 API Request: ${request.method()} ${url.substring(0, 80)}`);
    } catch (error) {
      console.error("Error capturing request:", error.message);
    }
  });

  page.on("response", async (response) => {
    try {
      const request = response.request();
      
      if (!apiRequestMap.has(request)) return;

      const status = response.status();
      let responseBody = null;

      try {
        const text = await response.text();
        // Try to parse as JSON
        if (text && text.startsWith("{") || text.startsWith("[")) {
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text.substring(0, 1000); // Limit size
          }
        } else {
          responseBody = text ? text.substring(0, 1000) : null;
        }
      } catch (e) {
        // Response body not available
      }

      const responseEvent = {
        type: "api_response",
        timestamp: Date.now(),
        url: request.url(),
        status: status,
        responseBody: responseBody,
      };

      events.push(responseEvent);
      apiRequestMap.delete(request);

      console.log(`📥 API Response: ${status} ${request.url().substring(0, 80)}`);
    } catch (error) {
      console.error("Error capturing response:", error.message);
    }
  });

  // ============ UI EVENT CAPTURE ============

  // Global event logger for all pages (main and popups)
  await context.exposeFunction('logUIEvent', (eventData) => {
    events.push({
      type: "ui_event",
      timestamp: Date.now(),
      ...eventData,
    });

    // Console logging for UI events
    const action = eventData.action.toUpperCase();
    const preview = eventData.value 
      ? ` = "${eventData.value.substring(0, 30)}"` 
      : "";
    const pagePrefix = eventData.pageType !== "main" ? `[${eventData.pageType}] ` : "";
    console.log(`🖱️  ${pagePrefix}${action}${preview}`);
  });

  // Function to attach UI event listeners to a page
  async function attachUIListeners(targetPage, pageLabel = "main") {
    // Note: exposeFunction is now at context level, so all pages can use it

    await targetPage.addInitScript((label) => {
    // ============ LOCATOR GENERATORS ============

    function getXPath(element) {
      if (!element || element.nodeType !== 1) return null;
      if (element.id) return `//*[@id="${element.id}"]`;
      
      const parts = [];
      while (element && element.nodeType === 1) {
        let index = 1;
        let sibling = element.previousSibling;
        
        while (sibling) {
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            index++;
          }
          sibling = sibling.previousSibling;
        }
        
        const tagName = element.tagName.toLowerCase();
        const xpathIndex = index > 1 ? `[${index}]` : "";
        parts.unshift(`${tagName}${xpathIndex}`);
        
        element = element.parentNode;
      }
      
      return "/" + parts.join("/");
    }

    function getCssSelector(element) {
      if (!element) return null;
      if (element.id) return `#${element.id}`;
      
      const path = [];
      let currentElement = element;
      
      while (currentElement && currentElement.nodeType === 1 && path.length < 5) {
        let selector = currentElement.tagName.toLowerCase();
        
        // Add classes if available
        if (currentElement.className && typeof currentElement.className === 'string') {
          const classes = currentElement.className.trim().split(/\\s+/).filter(c => c);
          if (classes.length > 0) {
            selector += "." + classes.slice(0, 3).join(".");
          }
        }
        
        // Add nth-of-type if needed
        if (!element.id && currentElement.parentElement) {
          const siblings = Array.from(currentElement.parentElement.children).filter(
            (e) => e.tagName === currentElement.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(currentElement) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }
        
        path.unshift(selector);
        
        if (currentElement.id) break;
        currentElement = currentElement.parentElement;
      }
      
      return path.join(" > ");
    }

    function getTextContent(element) {
      if (!element) return null;
      return element.innerText ? element.innerText.trim().substring(0, 50) : null;
    }

    function getDataTestId(element) {
      if (!element) return null;
      return element.getAttribute("data-testid") || element.getAttribute("data-test-id");
    }

    function getName(element) {
      if (!element) return null;
      return element.getAttribute("name");
    }

    // ============ EVENT CAPTURE ============

    function captureEvent(action, target, extraData = {}) {
      if (!target) return;

      const rect = target.getBoundingClientRect();
      
      // Use the global logUIEvent function with pageType in the data
      if (window.logUIEvent) {
        window.logUIEvent({
          action: action,
          pageType: label,
          locators: {
            xpath: getXPath(target),
            css: getCssSelector(target),
            id: target.id || null,
            tag: target.tagName.toLowerCase(),
            text: getTextContent(target),
            dataTestId: getDataTestId(target),
            name: getName(target),
          },
          value: target.value || null,
          position: {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          },
          ...extraData,
        });
      }
    }

    // Debounce map for input events
    const inputDebounceMap = new Map();
    const DEBOUNCE_DELAY = 1000; // Wait 1 second after last keystroke

    // Click events
    document.addEventListener("click", (e) => {
      captureEvent("click", e.target);
    }, true);

    // Input events (typing) - DEBOUNCED to capture complete text
    document.addEventListener("input", (e) => {
      if (e.target && "value" in e.target) {
        const target = e.target;
        
        // Clear existing timeout for this element
        if (inputDebounceMap.has(target)) {
          clearTimeout(inputDebounceMap.get(target));
        }
        
        // Set new timeout to capture after user stops typing
        const timeoutId = setTimeout(() => {
          captureEvent("input", target);
          inputDebounceMap.delete(target);
        }, DEBOUNCE_DELAY);
        
        inputDebounceMap.set(target, timeoutId);
      }
    }, true);

    // Change events (captures immediately when field loses focus or form submitted)
    document.addEventListener("change", (e) => {
      if (e.target && "value" in e.target) {
        // Clear any pending input debounce for this element
        if (inputDebounceMap.has(e.target)) {
          clearTimeout(inputDebounceMap.get(e.target));
          inputDebounceMap.delete(e.target);
        }
        // Capture the change event immediately
        captureEvent("change", e.target);
      }
    }, true);

    // Key press events (Enter key) - also captures input immediately
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target && "value" in e.target) {
        // Clear any pending input debounce
        if (inputDebounceMap.has(e.target)) {
          clearTimeout(inputDebounceMap.get(e.target));
          inputDebounceMap.delete(e.target);
        }
        // Capture the current value before Enter
        captureEvent("keypress", e.target, { key: "Enter" });
      }
    }, true);
  }, pageLabel); // Pass the label as a parameter to the script
  }

  // Attach UI listeners to main page
  await attachUIListeners(page, "main");

  // ============ NAVIGATION TRACKING ============

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      events.push({
        type: "navigation",
        timestamp: Date.now(),
        url: url,
      });
      console.log(`🧭 Navigation: ${url}`);
    }
  });

  // ============ NEW WINDOW/POPUP HANDLING ============

  let popupCounter = 0;
  
  context.on("page", async (newPage) => {
    popupCounter++;
    const popupLabel = `popup${popupCounter}`;
    
    events.push({
      type: "popup",
      timestamp: Date.now(),
      url: newPage.url(),
      action: "opened",
      popupId: popupLabel
    });
    console.log(`🪟 New window opened: ${newPage.url()}`);

    // Wait for new window to load completely
    try {
      await newPage.waitForLoadState("load", { timeout: 10000 });
      console.log(`   ⏳ Window loaded`);
    } catch (e) {
      console.log(`   ⚠ Window load timeout (continuing anyway)`);
    }

    // Attach UI listeners for future navigations (via addInitScript)
    await attachUIListeners(newPage, popupLabel);
    
    // Wait a bit more for any dynamic content
    await newPage.waitForTimeout(1000);
    
    // CRITICAL: Inject event capture script into the already-loaded window
    try {
      const injectionResult = await newPage.evaluate((label) => {
        // ============ LOCATOR GENERATORS ============

        function getXPath(element) {
          if (!element || element.nodeType !== 1) return null;
          if (element.id) return `//*[@id="${element.id}"]`;
          
          const parts = [];
          while (element && element.nodeType === 1) {
            let index = 1;
            let sibling = element.previousSibling;
            
            while (sibling) {
              if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            
            const tagName = element.tagName.toLowerCase();
            const xpathIndex = index > 1 ? `[${index}]` : "";
            parts.unshift(`${tagName}${xpathIndex}`);
            
            element = element.parentNode;
          }
          
          return "/" + parts.join("/");
        }

        function getCssSelector(element) {
          if (!element) return null;
          if (element.id) return `#${element.id}`;
          
          const path = [];
          let currentElement = element;
          
          while (currentElement && currentElement.nodeType === 1 && path.length < 5) {
            let selector = currentElement.tagName.toLowerCase();
            
            if (currentElement.className && typeof currentElement.className === 'string') {
              const classes = currentElement.className.trim().split(/\s+/).filter(c => c);
              if (classes.length > 0) {
                selector += "." + classes.slice(0, 3).join(".");
              }
            }
            
            if (!element.id && currentElement.parentElement) {
              const siblings = Array.from(currentElement.parentElement.children).filter(
                (e) => e.tagName === currentElement.tagName
              );
              if (siblings.length > 1) {
                const index = siblings.indexOf(currentElement) + 1;
                selector += `:nth-of-type(${index})`;
              }
            }
            
            path.unshift(selector);
            
            if (currentElement.id) break;
            currentElement = currentElement.parentElement;
          }
          
          return path.join(" > ");
        }

        function getTextContent(element) {
          if (!element) return null;
          return element.innerText ? element.innerText.trim().substring(0, 50) : null;
        }

        function getDataTestId(element) {
          if (!element) return null;
          return element.getAttribute("data-testid") || element.getAttribute("data-test-id");
        }

        function getName(element) {
          if (!element) return null;
          return element.getAttribute("name");
        }

        // ============ EVENT CAPTURE ============

        function captureEvent(action, target, extraData = {}) {
          if (!target) return;

          const rect = target.getBoundingClientRect();
          
          if (window.logUIEvent) {
            window.logUIEvent({
              action: action,
              pageType: label,
              locators: {
                xpath: getXPath(target),
                css: getCssSelector(target),
                id: target.id || null,
                tag: target.tagName.toLowerCase(),
                text: getTextContent(target),
                dataTestId: getDataTestId(target),
                name: getName(target),
              },
              value: target.value || null,
              position: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
              },
              ...extraData,
            });
          }
        }

        const inputDebounceMap = new Map();
        const DEBOUNCE_DELAY = 1000;

        // Verify logUIEvent is available
        if (!window.logUIEvent) {
          console.error(`[${label}] logUIEvent not available!`);
          return { success: false, error: "logUIEvent not found" };
        }

        // Click events
        document.addEventListener("click", (e) => {
          captureEvent("click", e.target);
        }, true);

        // Input events - DEBOUNCED
        document.addEventListener("input", (e) => {
          if (e.target && "value" in e.target) {
            const target = e.target;
            
            if (inputDebounceMap.has(target)) {
              clearTimeout(inputDebounceMap.get(target));
            }
            
            const timeoutId = setTimeout(() => {
              captureEvent("input", target);
              inputDebounceMap.delete(target);
            }, DEBOUNCE_DELAY);
            
            inputDebounceMap.set(target, timeoutId);
          }
        }, true);

        // Change events
        document.addEventListener("change", (e) => {
          if (e.target && "value" in e.target) {
            if (inputDebounceMap.has(e.target)) {
              clearTimeout(inputDebounceMap.get(e.target));
              inputDebounceMap.delete(e.target);
            }
            captureEvent("change", e.target);
          }
        }, true);

        // Key press events
        document.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && e.target && "value" in e.target) {
            if (inputDebounceMap.has(e.target)) {
              clearTimeout(inputDebounceMap.get(e.target));
              inputDebounceMap.delete(e.target);
            }
            captureEvent("keypress", e.target, { key: "Enter" });
          }
        }, true);
        
        console.log(`✅ Event listeners injected into ${label}`);
        return { success: true, label: label };
      }, popupLabel);
      
      if (injectionResult.success) {
        console.log(`   ✅ Recording enabled in new window (${popupLabel})`);
      } else {
        console.log(`   ❌ Injection failed: ${injectionResult.error}`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not inject listeners: ${error.message}`);
    }

    // Track navigation in the new window
    newPage.on("framenavigated", (frame) => {
      if (frame === newPage.mainFrame()) {
        const url = frame.url();
        events.push({
          type: "popup_navigation",
          timestamp: Date.now(),
          url: url,
          popupId: popupLabel
        });
        console.log(`🪟 Popup navigation: ${url}`);
      }
    });

    // Track when popup closes
    newPage.on("close", () => {
      events.push({
        type: "popup",
        timestamp: Date.now(),
        action: "closed",
        popupId: popupLabel
      });
      console.log(`🪟 Window closed`);
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
    const filename = `recording-${timestamp}.json`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    const recording = {
      meta: {
        url: startUrl,
        timestamp: timestamp,
        recordedAt: new Date().toISOString(),
        userAgent: await page.evaluate(() => navigator.userAgent).catch(() => "unknown"),
        totalEvents: events.length,
      },
      events: events,
    };

    fs.writeFileSync(filepath, JSON.stringify(recording, null, 2));

    try {
      generateTestCases(filepath);
    } catch (error) {
      console.log(`⚠️  Test case generation failed: ${error.message}`);
    }

    // Event summary
    const eventCounts = {};
    events.forEach(e => {
      const key = e.type === 'ui_event' ? `ui_${e.action}` : e.type;
      eventCounts[key] = (eventCounts[key] || 0) + 1;
    });

    console.log("=".repeat(70));
    console.log("✅ Recording saved successfully!");
    console.log("=".repeat(70));
    console.log(`📁 File: ${filename}`);
    console.log(`📊 Total events: ${events.length}`);
    console.log("\n📋 Event breakdown:");
    Object.entries(eventCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    console.log("=".repeat(70));
    console.log("\n💡 Next steps:");
    console.log(`   Process & Execute: npm run process artifacts/recordings/${filename}`);
    console.log(`   Just Playback:     npm run playback artifacts/recordings/${filename}`);
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
