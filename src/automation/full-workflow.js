/**
 * FULL AUTOMATION WORKFLOW
 * ========================
 * 1. Records UI + API events
 * 2. Filters consecutive duplicate events
 * 3. Removes duplicate actions
 * 4. Executes the final processed recording
 * 
 * Usage: node src/automation/full-workflow.js [start-url]
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { generateTestCases } = require("../utils/generate-test-cases");

// ============ CONFIGURATION ============
const RECORDINGS_DIR = path.join(__dirname, "..", "..", "artifacts", "recordings");
const DEFAULT_URL = "https://maple-aio-2-m1.otxlab.net:443/saw/ess?TENANTID=223791286";

// ============ HELPER FUNCTIONS ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

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
      const parent = element.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (e) => e.tagName === element.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(element) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
    }
    path = selector + (path ? " > " + path : "");
    element = element.parentElement;
  }
  return path || "unknown";
}

// ============ STEP 1: RECORD ============

async function recordSession(startUrl) {
  console.log("\n" + "=".repeat(60));
  console.log("📹 STEP 1: RECORDING SESSION");
  console.log("=".repeat(60));
  
  ensureDir(RECORDINGS_DIR);
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--ignore-certificate-errors",
      "--start-maximized",
      "--start-fullscreen"
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: null,
    screen: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();
  const events = [];
  const apiRequestMap = new Map();
  let popupCounter = 0;

  console.log("✅ Browser opened");
  console.log("🌐 URL:", startUrl);
  console.log("⚡ Interact with the app");
  console.log("⏹️  Press ENTER in terminal to stop recording\n");

  // Global function to log UI events from any page
  await context.exposeFunction("logUIEventGlobal", (eventData) => {
    events.push({
      type: "ui_event",
      ...eventData,
      timestamp: Date.now(),
    });
  });

  // Function to attach event listeners to any page
  async function attachEventListeners(targetPage, pageLabel) {
    await targetPage.addInitScript((label) => {
      const captureEvent = (action, target) => {
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const xpath = getXPath(target);
        const css = getCssSelector(target);
        
        // Capture data-aid attributes
        const dataAidAttr = target.getAttribute("data-aid") || target.getAttribute("data-test-id") || target.getAttribute("data-testid");
        const dataAidData = dataAidAttr ? {
          attr: target.hasAttribute("data-aid") ? "data-aid" : (target.hasAttribute("data-test-id") ? "data-test-id" : "data-testid"),
          value: dataAidAttr,
          xpath: `//${target.tagName.toLowerCase()}[@${target.hasAttribute("data-aid") ? "data-aid" : (target.hasAttribute("data-test-id") ? "data-test-id" : "data-testid")}='${dataAidAttr}']`
        } : null;
        
        if (window.logUIEventGlobal) {
          window.logUIEventGlobal({
            action,
            pageType: label,
            locators: {
              xpath,
              css,
              id: target.id || null,
              tag: target.tagName.toLowerCase(),
              text: target.innerText?.substring(0, 50) || null,
              dataTestId: target.getAttribute("data-testid") || null,
              data: dataAidData,
            },
            value: target.value || null,
            position: {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            },
          });
        }
      };

      function getXPath(element) {
        // Priority 1: Check for unique ID
        if (element.id) return `//*[@id="${element.id}"]`;
        
        // Priority 2: Check for data-aid or data-testid
        const dataAid = element.getAttribute("data-aid") || element.getAttribute("data-test-id") || element.getAttribute("data-testid");
        if (dataAid) {
          const tagName = element.tagName.toLowerCase();
          let xpath = `//${tagName}[@data-aid='${dataAid}']`;
          
          // Check if unique
          try {
            const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (matches.snapshotLength === 1) return xpath;
            
            // If multiple, add index
            for (let i = 0; i < matches.snapshotLength; i++) {
              if (matches.snapshotItem(i) === element) {
                return `(${xpath})[${i + 1}]`;
              }
            }
          } catch (e) {}
        }
        
        // Priority 3: Check for unique name attribute
        const name = element.getAttribute("name");
        if (name) {
          const tagName = element.tagName.toLowerCase();
          const xpath = `//${tagName}[@name='${name}']`;
          try {
            const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (matches.snapshotLength === 1) return xpath;
          } catch (e) {}
        }
        
        // Priority 4: Check for unique class
        if (element.className && typeof element.className === 'string') {
          const classes = element.className.trim().split(/\s+/);
          if (classes.length > 0) {
            const tagName = element.tagName.toLowerCase();
            const classXPath = `//${tagName}[@class='${element.className}']`;
            try {
              const matches = document.evaluate(classXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              if (matches.snapshotLength === 1) return classXPath;
            } catch (e) {}
          }
        }
        
        // Priority 5: Text content for links and buttons
        if ((element.tagName === 'A' || element.tagName === 'BUTTON') && element.innerText) {
          const text = element.innerText.trim();
          if (text && text.length < 50) {
            const tagName = element.tagName.toLowerCase();
            const textXPath = `//${tagName}[normalize-space(text())='${text}']`;
            try {
              const matches = document.evaluate(textXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              if (matches.snapshotLength === 1) return textXPath;
            } catch (e) {}
          }
        }
        
        // Fallback: Build relative path from nearest identifiable parent
        const parts = [];
        let current = element;
        let foundAnchor = false;
        
        while (current && current.nodeType === 1 && parts.length < 8) {
          // Check if we found a good anchor point
          const currentId = current.id;
          const currentDataAid = current.getAttribute("data-aid") || current.getAttribute("data-test-id");
          
          if (currentId || currentDataAid) {
            // Found anchor, build path from here
            const tagName = current.tagName.toLowerCase();
            if (currentId) {
              parts.unshift(`//*[@id='${currentId}']`);
            } else {
              parts.unshift(`//${tagName}[@data-aid='${currentDataAid}']`);
            }
            foundAnchor = true;
            break;
          }
          
          // Build relative segment
          let index = 1;
          let sibling = current.previousSibling;
          while (sibling) {
            if (sibling.nodeType === 1 && sibling.tagName === current.tagName) {
              index++;
            }
            sibling = sibling.previousSibling;
          }
          
          const tagName = current.tagName.toLowerCase();
          const pathIndex = index > 1 ? `[${index}]` : "";
          parts.unshift(`${tagName}${pathIndex}`);
          
          current = current.parentNode;
        }
        
        // Return the path
        if (foundAnchor) {
          return parts.join("/");
        } else {
          return "//" + parts.join("/");
        }
      }

      function getCssSelector(element) {
        if (element.id) return `#${element.id}`;
        
        let path = [];
        while (element && element.nodeType === 1) {
          let selector = element.nodeName.toLowerCase();
          if (element.className) {
            const classes = element.className.split(" ").filter(c => c);
            if (classes.length > 0) {
              selector += "." + classes.join(".");
            }
          }
          path.unshift(selector);
          if (element.id) break;
          element = element.parentElement;
          if (path.length > 5) break;
        }
        return path.join(" > ");
      }

      const inputDebounceMap = new Map();
      const DEBOUNCE_DELAY = 1000;

      document.addEventListener("click", (e) => {
        captureEvent("click", e.target);
      }, true);

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

      document.addEventListener("change", (e) => {
        if (e.target && "value" in e.target) {
          if (inputDebounceMap.has(e.target)) {
            clearTimeout(inputDebounceMap.get(e.target));
            inputDebounceMap.delete(e.target);
          }
          captureEvent("change", e.target);
        }
      }, true);

      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target && "value" in e.target) {
          if (inputDebounceMap.has(e.target)) {
            clearTimeout(inputDebounceMap.get(e.target));
            inputDebounceMap.delete(e.target);
          }
          captureEvent("keypress", e.target, { key: "Enter" });
        }
      }, true);
    }, pageLabel);
  }

  // Attach listeners to main page
  await attachEventListeners(page, "main");

  // Handle new windows/popups
  context.on("page", async (newPage) => {
    popupCounter++;
    const popupLabel = `popup${popupCounter}`;
    
    events.push({
      type: "popup",
      timestamp: Date.now(),
      url: newPage.url() || "(blank)",
      action: "opened",
      popupId: popupLabel
    });
    
    console.log(`🪟 New window opened: ${newPage.url()}`);
    
    // Wait for popup to load
    try {
      await newPage.waitForLoadState("load", { timeout: 10000 });
      console.log(`   ✅ Window loaded`);
    } catch (e) {
      console.log(`   ⚠️  Load timeout`);
    }
    
    // Attach event listeners for future navigations
    await attachEventListeners(newPage, popupLabel);
    
    // CRITICAL: Inject event listeners into the ALREADY-LOADED popup page
    try {
      await newPage.evaluate((label) => {
        // Check if already injected
        if (window.__eventsInjected) return { success: true, alreadyInjected: true };
        
        window.__eventsInjected = true;
        
        const captureEvent = (action, target) => {
          if (!target) return;

          const rect = target.getBoundingClientRect();
          const xpath = getXPath(target);
          const css = getCssSelector(target);
          
          if (window.logUIEventGlobal) {
            window.logUIEventGlobal({
              action,
              pageType: label,
              locators: {
                xpath,
                css,
                id: target.id || null,
                tag: target.tagName.toLowerCase(),
                text: target.innerText?.substring(0, 50) || null,
                dataTestId: target.getAttribute("data-testid") || null,
              },
              value: target.value || null,
              position: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
              },
            });
          }
        };

        function getXPath(element) {
          // Priority 1: Check for unique ID
          if (element.id) return `//*[@id="${element.id}"]`;
          
          // Priority 2: Check for data-aid or data-testid
          const dataAid = element.getAttribute("data-aid") || element.getAttribute("data-test-id") || element.getAttribute("data-testid");
          if (dataAid) {
            const tagName = element.tagName.toLowerCase();
            let xpath = `//${tagName}[@data-aid='${dataAid}']`;
            
            // Check if unique
            try {
              const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              if (matches.snapshotLength === 1) return xpath;
              
              // If multiple, add index
              for (let i = 0; i < matches.snapshotLength; i++) {
                if (matches.snapshotItem(i) === element) {
                  return `(${xpath})[${i + 1}]`;
                }
              }
            } catch (e) {}
          }
          
          // Priority 3: Check for unique name attribute
          const name = element.getAttribute("name");
          if (name) {
            const tagName = element.tagName.toLowerCase();
            const xpath = `//${tagName}[@name='${name}']`;
            try {
              const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              if (matches.snapshotLength === 1) return xpath;
            } catch (e) {}
          }
          
          // Priority 4: Text content for links and buttons
          if ((element.tagName === 'A' || element.tagName === 'BUTTON') && element.innerText) {
            const text = element.innerText.trim();
            if (text && text.length < 50) {
              const tagName = element.tagName.toLowerCase();
              const textXPath = `//${tagName}[normalize-space(text())='${text}']`;
              try {
                const matches = document.evaluate(textXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (matches.snapshotLength === 1) return textXPath;
              } catch (e) {}
            }
          }
          
          // Fallback: Build from nearest anchor
          const parts = [];
          let current = element;
          let foundAnchor = false;
          
          while (current && current.nodeType === 1 && parts.length < 8) {
            const currentId = current.id;
            const currentDataAid = current.getAttribute("data-aid") || current.getAttribute("data-test-id");
            
            if (currentId || currentDataAid) {
              const tagName = current.tagName.toLowerCase();
              if (currentId) {
                parts.unshift(`//*[@id='${currentId}']`);
              } else {
                parts.unshift(`//${tagName}[@data-aid='${currentDataAid}']`);
              }
              foundAnchor = true;
              break;
            }
            
            let index = 1;
            let sibling = current.previousSibling;
            while (sibling) {
              if (sibling.nodeType === 1 && sibling.tagName === current.tagName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            
            const tagName = current.tagName.toLowerCase();
            const pathIndex = index > 1 ? `[${index}]` : "";
            parts.unshift(`${tagName}${pathIndex}`);
            
            current = current.parentNode;
          }
          
          return foundAnchor ? parts.join("/") : "//" + parts.join("/");
        }

        function getCssSelector(element) {
          if (element.id) return `#${element.id}`;
          
          let path = [];
          while (element && element.nodeType === 1) {
            let selector = element.nodeName.toLowerCase();
            if (element.className) {
              const classes = element.className.split(" ").filter(c => c);
              if (classes.length > 0) {
                selector += "." + classes.join(".");
              }
            }
            path.unshift(selector);
            if (element.id) break;
            element = element.parentElement;
            if (path.length > 5) break;
          }
          return path.join(" > ");
        }

        const inputDebounceMap = new Map();
        const DEBOUNCE_DELAY = 1000;

        document.addEventListener("click", (e) => {
          captureEvent("click", e.target);
        }, true);

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

        document.addEventListener("change", (e) => {
          if (e.target && "value" in e.target) {
            if (inputDebounceMap.has(e.target)) {
              clearTimeout(inputDebounceMap.get(e.target));
              inputDebounceMap.delete(e.target);
            }
            captureEvent("change", e.target);
          }
        }, true);

        document.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && e.target && "value" in e.target) {
            if (inputDebounceMap.has(e.target)) {
              clearTimeout(inputDebounceMap.get(e.target));
              inputDebounceMap.delete(e.target);
            }
            captureEvent("keypress", e.target, { key: "Enter" });
          }
        }, true);
        
        return { success: true };
      }, popupLabel);
      
      console.log(`   ✅ Recording enabled in ${popupLabel}`);
    } catch (error) {
      console.log(`   ❌ Failed to inject event listeners: ${error.message}`);
    }
    
    // Track popup close
    newPage.on("close", () => {
      events.push({
        type: "popup",
        timestamp: Date.now(),
        action: "closed",
        popupId: popupLabel
      });
      console.log(`🪟 Window closed: ${popupLabel}`);
    });
    
    // Track popup navigation
    newPage.on("framenavigated", (frame) => {
      if (frame === newPage.mainFrame()) {
        events.push({
          type: "popup_navigation",
          timestamp: Date.now(),
          url: frame.url(),
          popupId: popupLabel
        });
        console.log(`🪟 Popup navigated: ${frame.url()}`);
      }
    });
  });

  // Capture API calls
  page.on("request", async (request) => {
    try {
      const resourceType = request.resourceType();
      const url = request.url();
      
      if (resourceType === "xhr" || resourceType === "fetch") {
        const method = request.method();
        let postData = null;
        try {
          postData = request.postData();
        } catch (e) {
          // Ignore if can't get post data
        }
        
        apiRequestMap.set(request, {
          type: "api_call",
          method,
          url,
          postData,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error("Error capturing request:", err.message);
    }
  });

  page.on("response", async (response) => {
    try {
      const request = response.request();
      if (apiRequestMap.has(request)) {
        const info = apiRequestMap.get(request);
        const status = response.status();
        let responseBody = null;
        
        try {
          responseBody = await response.text();
        } catch (e) {
          // Ignore if can't get response body
        }

        events.push({
          ...info,
          status,
          responseBody: responseBody ? responseBody.substring(0, 1000) : null,
        });
        
        apiRequestMap.delete(request);
      }
    } catch (err) {
      console.error("Error capturing response:", err.message);
    }
  });

  console.log("🚀 Navigating to URL...");
  await page.goto(startUrl, { waitUntil: "networkidle", timeout: 60000 });
  console.log("⏳ Waiting for page to fully load...");
  await page.waitForTimeout(5000);
  console.log("✅ Page loaded - Ready to record\n");

  // Wait for user to press ENTER
  await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });

  await browser.close();

  // Save recording
  const timestamp = Date.now();
  const filename = `recording-${timestamp}.json`;
  const filepath = path.join(RECORDINGS_DIR, filename);
  
  const recording = {
    meta: {
      url: startUrl,
      timestamp,
      userAgent: "Playwright Automation",
      recordedAt: new Date().toISOString(),
    },
    events,
  };

  fs.writeFileSync(filepath, JSON.stringify(recording, null, 2));
  console.log(`\n💾 Recording saved: ${filename}`);
  console.log(`📊 Total events: ${events.length}`);
  
  return filepath;
}

// ============ STEP 2: FILTER EVENTS ============

function filterEvents(inputFile) {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 STEP 2: FILTERING EVENTS");
  console.log("=".repeat(60));
  
  const recording = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const allEvents = recording.events;

  console.log(`📊 Total events: ${allEvents.length}`);

  // Filter only ui_event type
  const uiEvents = allEvents.filter(event => event.type === "ui_event");
  console.log(`🎯 UI events: ${uiEvents.length}`);

  // Keep only the last occurrence of consecutive events with the same action
  const filteredEvents = [];
  
  for (let i = 0; i < uiEvents.length; i++) {
    const currentEvent = uiEvents[i];
    const nextEvent = uiEvents[i + 1];
    
    const isLastInSeries = !nextEvent || 
                          nextEvent.action !== currentEvent.action ||
                          JSON.stringify(nextEvent.locators) !== JSON.stringify(currentEvent.locators);
    
    if (isLastInSeries) {
      filteredEvents.push(currentEvent);
    }
  }

  console.log(`✅ Filtered events: ${filteredEvents.length}`);
  console.log(`📉 Removed: ${uiEvents.length - filteredEvents.length} consecutive duplicates`);

  const outputFile = inputFile.replace(/\.json$/, '-filtered.json');
  const output = {
    meta: {
      ...recording.meta,
      filteredAt: new Date().toISOString(),
      originalEventCount: allEvents.length,
      uiEventCount: uiEvents.length,
      filteredEventCount: filteredEvents.length,
    },
    events: filteredEvents,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved: ${path.basename(outputFile)}`);
  
  return outputFile;
}

// ============ STEP 3: DEDUPLICATE ============

function deduplicateEvents(inputFile) {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 STEP 3: REMOVING DUPLICATES");
  console.log("=".repeat(60));
  
  const recording = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const events = recording.events;

  console.log(`📊 Filtered events: ${events.length}`);

  const deduplicated = [];
  
  for (let i = 0; i < events.length; i++) {
    const currentEvent = events[i];
    const nextEvent = events[i + 1];
    
    if (nextEvent) {
      const currentLocator = JSON.stringify({
        css: currentEvent.locators.css,
        xpath: currentEvent.locators.xpath
      });
      const nextLocator = JSON.stringify({
        css: nextEvent.locators.css,
        xpath: nextEvent.locators.xpath
      });
      
      if (currentLocator === nextLocator) {
        if (currentEvent.action === "input" && nextEvent.action === "input") {
          continue;
        }
        if (currentEvent.action === "input" && nextEvent.action === "change") {
          continue;
        }
        if (currentEvent.action === "change" && nextEvent.action === "click") {
          continue;
        }
        if (currentEvent.action === "click" && 
            currentEvent.locators.tag === "input" &&
            (nextEvent.action === "input" || nextEvent.action === "change")) {
          continue;
        }
      }
    }
    
    deduplicated.push(currentEvent);
  }

  console.log(`✅ Deduplicated events: ${deduplicated.length}`);
  console.log(`📉 Removed: ${events.length - deduplicated.length} duplicate actions`);

  const outputFile = inputFile.replace(/-filtered\.json$/, '-final.json');
  const output = {
    meta: {
      ...recording.meta,
      deduplicatedAt: new Date().toISOString(),
      deduplicatedCount: deduplicated.length,
    },
    events: deduplicated,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved: ${path.basename(outputFile)}`);
  
  return outputFile;
}

// ============ STEP 4: EXECUTE ============

async function executeRecording(recordingFile) {
  console.log("\n" + "=".repeat(60));
  console.log("▶️  STEP 4: EXECUTING FINAL RECORDING");
  console.log("=".repeat(60));
  
  const recording = JSON.parse(fs.readFileSync(recordingFile, "utf8"));
  const events = recording.events;
  const startUrl = recording.meta.url;

  console.log(`📂 Recording: ${path.basename(recordingFile)}`);
  console.log(`📊 Events to execute: ${events.length}`);
  console.log(`🌐 Starting URL: ${startUrl}\n`);

  const browser = await chromium.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--start-maximized',
      '--start-fullscreen'
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: null,
    screen: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  console.log("🚀 Navigating to start URL...");
  await page.goto(startUrl, { waitUntil: "networkidle", timeout: 60000 });
  console.log("⏳ Waiting for page to stabilize...");
  await page.waitForTimeout(6000);
  console.log("✅ Ready to execute actions\n");

  // Helper function to resolve element with smart priority
  async function resolveElement(page, locators) {
    let element;
    let used;

    // 1️⃣ DATA-AID (CSS)
    if (locators?.data?.value) {
      const css = `[${locators.data.attr}="${locators.data.value}"]`;
      try {
        const count = await page.locator(css).count();
        if (count === 1) {
          element = page.locator(css);
          await element.waitFor({ state: "visible", timeout: 4000 });
          used = `data-aid css: ${css}`;
          return { element, used };
        }
      } catch {}
    }

    // 2️⃣ DATA-AID (XPATH)
    if (locators?.data?.xpath) {
      const xpath = locators.data.xpath;
      try {
        const count = await page.locator(`xpath=${xpath}`).count();
        if (count === 1) {
          element = page.locator(`xpath=${xpath}`);
          await element.waitFor({ state: "visible", timeout: 4000 });
          used = `data-aid xpath: ${xpath}`;
          return { element, used };
        }
      } catch {}
    }

    // 3️⃣ PRIMARY XPATH
    if (locators?.xpath) {
      const xpath = locators.xpath;
      try {
        const count = await page.locator(`xpath=${xpath}`).count();
        if (count === 1) {
          element = page.locator(`xpath=${xpath}`);
          await element.waitFor({ state: "visible", timeout: 4000 });
          used = `xpath: ${xpath}`;
          return { element, used };
        }
      } catch {}
    }

    // 4️⃣ FALLBACK XPATH
    if (locators?.xpathFallback?.xpath) {
      const xpath = locators.xpathFallback.xpath;
      try {
        const count = await page.locator(`xpath=${xpath}`).count();
        if (count >= 1) {
          element = page.locator(`xpath=${xpath}`).first();
          await element.waitFor({ state: "visible", timeout: 4000 });
          used = `fallback xpath: ${xpath}`;
          return { element, used };
        }
      } catch {}
    }

    throw new Error("Element not found using data-aid or XPath");
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`\n[${i + 1}/${events.length}] ${event.action.toUpperCase()}`);

    try {
      // Use improved element resolution
      const { element, used } = await resolveElement(page, event.locators);
      console.log(`   ✓ Found element: ${used}`);

      // Perform action
      switch (event.action) {
        case "click":
          await element.click();
          console.log(`   ✓ Clicked`);
          break;

        case "input":
        case "change":
          if (event.value) {
            await element.fill(event.value);
            console.log(`   ✓ Filled: "${event.value}"`);
          }
          break;

        default:
          console.log(`   ⚠ Unknown action: ${event.action}`);
      }

      await page.waitForTimeout(2500);
      successCount++;

    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 EXECUTION SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Successful: ${successCount}/${events.length}`);
  console.log(`❌ Failed: ${failCount}/${events.length}`);
  console.log(`📈 Success rate: ${((successCount/events.length)*100).toFixed(1)}%`);

  console.log("\n⏸️  Browser will remain open. Close it manually when done.");
  
  // Keep browser open for inspection
  await new Promise(() => {});
}

// ============ MAIN WORKFLOW ============

async function main() {
  const startUrl = process.argv[2] || DEFAULT_URL;
  
  console.log("\n" + "=".repeat(60));
  console.log("🤖 FULL AUTOMATION WORKFLOW");
  console.log("=".repeat(60));
  console.log("This will:");
  console.log("  1. Record your UI interactions");
  console.log("  2. Filter consecutive duplicates");
  console.log("  3. Remove redundant actions");
  console.log("  4. Execute the final recording");
  console.log("=".repeat(60));

  try {
    // Step 1: Record
    const recordingFile = await recordSession(startUrl);
    
    // Step 2: Filter
    const filteredFile = filterEvents(recordingFile);
    
    // Step 3: Deduplicate
    const finalFile = deduplicateEvents(filteredFile);

    // Step 4: Generate test cases
    generateTestCases(finalFile);
    
    // Step 5: Execute
    await executeRecording(finalFile);
    
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { recordSession, filterEvents, deduplicateEvents, executeRecording };
