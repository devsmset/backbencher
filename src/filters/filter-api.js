const fs = require("fs");
const path = require("path");

const inputFile = path.join(__dirname, "..", "..", "artifacts", "recordings", "recording-raw.json");
const outputFile = path.join(__dirname, "../output/ui-spec.json");

const raw = JSON.parse(fs.readFileSync(inputFile, "utf-8"));

const uiEvents = raw.events.filter(
  e =>
    e.type === "ui_event" &&
    ["click", "input", "change"].includes(e.event)
);

const cleanedUI = uiEvents.map((e, index) => ({
  step: index + 1,
  action: e.event,
  value: e.value || e.valuePreview || null,

  locators: {
    dataId: e.locators?.dataId || null,
    id: e.locators?.id || null,
    xpath: e.locators?.xpath || null,
    css: e.locators?.css || null,
    className: e.locators?.class || null,
    domPath: e.domPath || null
  },

  fallbackOrder: [
    "dataId",
    "id",
    "xpath",
    "css",
    "className",
    "domPath"
  ]
}));

fs.writeFileSync(
  outputFile,
  JSON.stringify(
    {
      meta: {
        generatedAt: new Date().toISOString(),
        totalSteps: cleanedUI.length
      },
      steps: cleanedUI
    },
    null,
    2
  )
);

console.log("✅ UI spec created:", outputFile);
