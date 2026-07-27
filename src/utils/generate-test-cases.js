const fs = require("fs");
const path = require("path");

const TEST_CASES_DIR = path.join(__dirname, "..", "..", "artifacts", "test-cases");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDate(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function extractTenantId(url) {
  if (!url) return null;
  const match = url.match(/TENANTID=([^&]+)/i);
  return match ? match[1] : null;
}

function extractBrowser(userAgent) {
  if (!userAgent) return null;
  const match = userAgent.match(/(Chrome|Edge|Firefox|Safari)\/([\d.]+)/i);
  return match ? `${match[1]} ${match[2]}` : null;
}

function extractOs(userAgent) {
  if (!userAgent) return null;
  const match = userAgent.match(/\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(";").map((part) => part.trim());
  return parts.length > 0 ? parts[0] : null;
}

function getBaseName(filePath) {
  const base = path.basename(filePath, ".json");
  return base.replace(/-(filtered|final|deduplicated)$/, "");
}

function getElementLabel(event) {
  const locators = event.locators || {};
  if (locators.text && locators.text.trim()) return locators.text.trim();
  if (locators.id) return `#${locators.id}`;
  if (locators.name) return locators.name;
  if (locators.dataTestId) return `[data-testid=\"${locators.dataTestId}\"]`;
  if (locators.css) return locators.css;
  if (locators.xpath) return locators.xpath;
  return "element";
}

function getSelectorHint(event) {
  const locators = event.locators || {};
  if (locators.id) return `#${locators.id}`;
  if (locators.dataTestId) return `[data-testid=\"${locators.dataTestId}\"]`;
  if (locators.css) return locators.css;
  if (locators.xpath) return locators.xpath;
  return null;
}

function buildStep(event) {
  const label = getElementLabel(event);
  const selector = getSelectorHint(event);
  const suffix = selector ? ` (${selector})` : "";

  switch (event.action) {
    case "click":
      return `Click on ${label}${suffix}`;
    case "input":
    case "change":
      if (event.value) {
        return `Enter "${event.value}" in ${label}${suffix}`;
      }
      return `Enter value in ${label}${suffix}`;
    case "keypress":
      if (event.key) {
        return `Press ${event.key} in ${label}${suffix}`;
      }
      return `Press key in ${label}${suffix}`;
    default:
      return `Perform ${event.action} on ${label}${suffix}`;
  }
}

function collectTestData(event, map) {
  const locators = event.locators || {};
  if (!event.value) return;

  const key = locators.id || locators.name || locators.text || "field";
  if (!map.has(key)) {
    map.set(key, event.value);
  }
}

function classifyEvent(event, knownLabels) {
  const locators = event.locators || {};
  const text = (locators.text || "").toLowerCase();
  const id = (locators.id || "").toLowerCase();
  const name = (locators.name || "").toLowerCase();
  const css = (locators.css || "").toLowerCase();

  if (["input", "change", "keypress"].includes(event.action)) {
    if (id.includes("username") || name.includes("username")) return "login";
    if (id.includes("password") || name.includes("password")) return "login";
  }

  if (text.includes("sign in") || id === "submit") return "login";
  if (text.includes("agent interface")) return "nav-agent";
  if (text.includes("service catalog")) return "nav-service-catalog";
  if (text.includes("service portal")) return "nav-service-portal";
  if (text.includes("request")) return "request";
  if (text.includes("log out") || text.includes("logout")) return "logout";
  if (text === "build") return "phase-build";
  if (text === "operate") return "phase-operate";
  if (text === "add" || css.includes("icon-add") || css.includes("add-text")) return "create-start";
  if (text === "save" || id.includes("dialog-button")) return "save";

  if (locators.text && knownLabels.has(locators.text.trim())) return "view-offering";

  return "generic";
}

function buildCaseTemplate(intent, index, context) {
  const label = context.lastLabel || "offering";
  const templates = {
    login: {
      title: "User Login",
      priority: "Critical",
      type: "Functional",
      objective: "Verify that a user can successfully log in to the application with valid credentials.",
      preconditions: [
        "Application is accessible",
        "User account exists with valid credentials",
      ],
      expected: [
        "User is successfully authenticated",
        "User is redirected to the main dashboard",
      ],
    },
    "nav-agent": {
      title: "Navigate to Agent Interface",
      priority: "High",
      type: "Navigation",
      objective: "Verify that user can navigate to the Agent Interface.",
      preconditions: ["User is logged in"],
      expected: ["Agent Interface opens successfully"],
    },
    "nav-service-catalog": {
      title: "Navigate to Service Catalog",
      priority: "High",
      type: "Navigation",
      objective: "Verify that user can navigate to Service Catalog.",
      preconditions: ["User is logged in"],
      expected: ["Service Catalog page loads successfully"],
    },
    "create-offering": {
      title: `Create Service Offering ${context.createCount}`,
      priority: "High",
      type: "Functional - Create",
      objective: "Verify that user can create a new service offering.",
      preconditions: ["User has permission to create offerings"],
      expected: [
        "Create form opens successfully",
        "Offering is saved successfully",
      ],
    },
    "view-offering": {
      title: "View Offering Details",
      priority: "Medium",
      type: "Functional - Read",
      objective: "Verify that user can view details of a created offering.",
      preconditions: [`At least one offering exists with label "${label}"`],
      expected: ["Offering details page opens"],
    },
    "phase-build": {
      title: "Build Phase of Offering",
      priority: "Critical",
      type: "Functional - Workflow",
      objective: "Verify that user can move an offering to BUILD phase.",
      preconditions: ["Offering is created and in initial state"],
      expected: ["Offering transitions to BUILD phase successfully"],
    },
    "phase-operate": {
      title: "Operate Phase of Offering",
      priority: "Critical",
      type: "Functional - Workflow",
      objective: "Verify that user can move an offering to OPERATE phase.",
      preconditions: ["Offering is in BUILD phase"],
      expected: ["Offering transitions to OPERATE phase successfully"],
    },
    "nav-service-portal": {
      title: "Navigate to Service Portal",
      priority: "High",
      type: "Navigation",
      objective: "Verify that user can navigate to Service Portal.",
      preconditions: ["User is logged in"],
      expected: ["Service Portal page loads successfully"],
    },
    request: {
      title: "Initiate Service Request",
      priority: "Critical",
      type: "Functional - Request",
      objective: "Verify that user can initiate a service request for an offering.",
      preconditions: ["Offering is selected"],
      expected: ["Request form opens successfully"],
    },
    logout: {
      title: "User Logout",
      priority: "High",
      type: "Functional",
      objective: "Verify that user can successfully log out from the application.",
      preconditions: ["User is logged in"],
      expected: ["User is logged out successfully"],
    },
    generic: {
      title: `Recorded Interaction ${index}`,
      priority: "Medium",
      type: "Functional",
      objective: "Verify that the recorded interaction can be completed successfully.",
      preconditions: ["Application is accessible"],
      expected: ["Interaction completes without errors"],
    },
  };

  return templates[intent] || templates.generic;
}

function generateTestCases(recordingFile) {
  if (!recordingFile) {
    throw new Error("Recording file path is required.");
  }
  if (!fs.existsSync(recordingFile)) {
    throw new Error(`Recording file not found: ${recordingFile}`);
  }

  ensureDir(TEST_CASES_DIR);

  const recording = JSON.parse(fs.readFileSync(recordingFile, "utf8"));
  const events = (recording.events || []).filter((event) => event.type === "ui_event");
  const meta = recording.meta || {};

  const baseName = getBaseName(recordingFile);
  const outputFile = path.join(TEST_CASES_DIR, `${baseName}-test-cases.md`);

  const knownLabels = new Set();
  let loginUser = null;
  let loginPassword = null;

  const cases = [];
  let current = null;
  let genericIndex = 1;
  let createCount = 0;
  let caseIndex = 1;

  function closeCase() {
    if (!current || current.steps.length === 0) return;
    cases.push(current);
    current = null;
  }

  function startCase(intent, context) {
    closeCase();
    current = {
      intent,
      context,
      steps: [],
      data: new Map(),
    };
  }

  let inCreateFlow = false;
  let inLoginFlow = false;
  let inPhaseFlow = false;

  for (const event of events) {
    const locators = event.locators || {};
    const idLower = (locators.id || "").toLowerCase();
    const nameLower = (locators.name || "").toLowerCase();
    const textLower = (locators.text || "").toLowerCase();

    if (event.value && (idLower.includes("displaylabel") || nameLower.includes("displaylabel"))) {
      knownLabels.add(event.value);
    }

    if (event.value && idLower.includes("username")) loginUser = event.value;
    if (event.value && idLower.includes("password")) loginPassword = event.value;

    const intent = classifyEvent(event, knownLabels);

    if (inCreateFlow) {
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      if (intent === "save") {
        closeCase();
        inCreateFlow = false;
      }
      continue;
    }

    if (inLoginFlow) {
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      if (textLower.includes("sign in") || idLower === "submit") {
        closeCase();
        inLoginFlow = false;
      }
      continue;
    }

    if (inPhaseFlow) {
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      if (intent === "save") {
        closeCase();
        inPhaseFlow = false;
      }
      continue;
    }

    if (intent === "create-start") {
      createCount += 1;
      startCase("create-offering", { createCount, lastLabel: event.value || null });
      inCreateFlow = true;
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      continue;
    }

    if (intent === "login") {
      startCase("login", {});
      inLoginFlow = true;
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      continue;
    }

    if (intent === "phase-build" || intent === "phase-operate") {
      startCase(intent, {});
      inPhaseFlow = true;
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      continue;
    }

    if (["nav-agent", "nav-service-catalog", "nav-service-portal", "request", "logout", "view-offering"].includes(intent)) {
      const context = { lastLabel: event.locators?.text || null };
      startCase(intent, context);
      current.steps.push(buildStep(event));
      collectTestData(event, current.data);
      closeCase();
      continue;
    }

    if (!current || current.intent !== "generic") {
      startCase("generic", { index: genericIndex++ });
    }

    current.steps.push(buildStep(event));
    collectTestData(event, current.data);

    if (current.steps.length >= 5) {
      closeCase();
    }
  }

  closeCase();

  const formattedCases = cases.map((testCase) => {
    const context = {
      createCount: testCase.context?.createCount,
      lastLabel: testCase.context?.lastLabel,
    };
    const template = buildCaseTemplate(testCase.intent, caseIndex, context);
    const dataItems = Array.from(testCase.data.entries()).map(([key, value]) => `${key}: ${value}`);
    const testData = dataItems.length > 0 ? dataItems : null;
    const caseNumber = String(caseIndex).padStart(3, "0");
    caseIndex += 1;

    return {
      number: caseNumber,
      title: template.title,
      priority: template.priority,
      type: template.type,
      objective: template.objective,
      preconditions: template.preconditions,
      steps: testCase.steps,
      expected: template.expected,
      testData,
    };
  });

  const priorityCounts = {};
  const typeCounts = {};

  formattedCases.forEach((testCase) => {
    priorityCounts[testCase.priority] = (priorityCounts[testCase.priority] || 0) + 1;
    const typeKey = testCase.type.split(" - ")[0];
    typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;
  });

  const workflows = [];
  const intents = new Set(cases.map((c) => c.intent));

  if (intents.has("login") || intents.has("logout")) workflows.push("Authentication Flow");
  if (intents.has("create-offering") || intents.has("phase-build") || intents.has("phase-operate")) {
    workflows.push("Service Catalog Management");
  }
  if (intents.has("request")) workflows.push("Service Request Flow");
  if (intents.has("nav-service-catalog") || intents.has("nav-service-portal")) workflows.push("Navigation Flow");

  const appName = (() => {
    try {
      const url = new URL(meta.url || "");
      return url.hostname || "Web Application";
    } catch {
      return "Web Application";
    }
  })();

  const tenantId = extractTenantId(meta.url);
  const browser = extractBrowser(meta.userAgent);
  const os = extractOs(meta.userAgent);

  const lines = [];
  lines.push(`# Test Cases - Recorded Workflow`);
  lines.push(`**Generated from**: ${path.basename(recordingFile)}`);
  lines.push(`**Date**: ${formatDate(meta.recordedAt || meta.deduplicatedAt)}`);
  lines.push(`**Base URL**: ${meta.url || ""}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Test Suite Overview");
  lines.push("This test suite is auto-generated from recorded user interactions.");
  lines.push("");
  lines.push("---");

  formattedCases.forEach((testCase) => {
    lines.push("");
    lines.push(`## TC-${testCase.number}: ${testCase.title}`);
    lines.push(`**Priority**: ${testCase.priority}`);
    lines.push(`**Type**: ${testCase.type}`);
    lines.push("");
    lines.push("### Objective");
    lines.push(testCase.objective);
    lines.push("");
    lines.push("### Preconditions");
    testCase.preconditions.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### Test Steps");
    testCase.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    lines.push("");
    lines.push("### Expected Results");
    testCase.expected.forEach((item) => lines.push(`- ${item}`));

    if (testCase.testData) {
      lines.push("");
      lines.push("### Test Data");
      testCase.testData.forEach((item) => lines.push(`- ${item}`));
    }

    lines.push("");
    lines.push("---");
  });

  lines.push("");
  lines.push("## Test Execution Summary");
  lines.push("");
  lines.push(`### Total Test Cases: ${formattedCases.length}`);
  lines.push("");
  lines.push("### Priority Breakdown");
  Object.keys(priorityCounts).forEach((key) => {
    lines.push(`- ${key}: ${priorityCounts[key]}`);
  });
  lines.push("");
  lines.push("### Test Category Breakdown");
  Object.keys(typeCounts).forEach((key) => {
    lines.push(`- ${key}: ${typeCounts[key]}`);
  });

  if (workflows.length > 0) {
    lines.push("");
    lines.push("### Key Workflows Covered");
    workflows.forEach((flow, index) => lines.push(`${index + 1}. ${flow}`));
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Test Environment Details");
  lines.push(`- **Application**: ${appName}`);
  if (tenantId) lines.push(`- **Test Tenant**: ${tenantId}`);
  if (loginUser) lines.push(`- **Test User**: ${loginUser}`);
  if (browser) lines.push(`- **Browser**: ${browser}`);
  if (os) lines.push(`- **OS**: ${os}`);

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Notes");
  lines.push("- All test cases are based on recorded user interactions");
  lines.push("- XPath, CSS selectors, and element IDs are provided for automation");
  lines.push("- Test data values are captured from the recording");
  lines.push("- Consider replacing placeholder values with meaningful test data");

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Automation Guidelines");
  lines.push("- UI interactions include multiple locator strategies where available");
  lines.push("- Page type indicators help identify context switches (main, popup)");
  lines.push("- Timestamps show the actual flow timing for performance baseline");
  lines.push("- Consider adding explicit waits for page loads and transitions");

  fs.writeFileSync(outputFile, lines.join("\n"));
  console.log(`\nTest cases generated: ${outputFile}`);

  return outputFile;
}

if (require.main === module) {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: node src/utils/generate-test-cases.js <recording-file.json>");
    process.exit(1);
  }

  try {
    generateTestCases(inputFile);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { generateTestCases };
