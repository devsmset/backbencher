const pptxgen = require("pptxgenjs");
const path = require("path");

const pptx = new pptxgen();

// ── Theme colors ──
const DARK_BG = "0B1120";
const ACCENT = "3B82F6";    // blue-500
const ACCENT2 = "8B5CF6";   // purple-500
const GREEN = "10B981";
const RED = "EF4444";
const ORANGE = "F59E0B";
const WHITE = "FFFFFF";
const LIGHT_GRAY = "94A3B8";
const MID_GRAY = "334155";
const CARD_BG = "1E293B";

// ── Master layout defaults ──
pptx.author = "Project 2 Team";
pptx.company = "OTX Lab";
pptx.subject = "Codeless Test Automation Product Presentation";
pptx.title = "Codeless Test Automation with Intelligent Recording & Replay";
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5

function addBackground(slide) {
  slide.background = { color: DARK_BG };
}

function addFooter(slide, slideNum) {
  slide.addText(`${slideNum}`, {
    x: 12.4, y: 7.0, w: 0.7, h: 0.3,
    fontSize: 9, color: LIGHT_GRAY, align: "right",
  });
}

// ════════════════════════════════════════════════
// SLIDE 1 — Title
// ════════════════════════════════════════════════
let slide = pptx.addSlide();
addBackground(slide);
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: DARK_BG } });
// Accent line
slide.addShape(pptx.ShapeType.rect, { x: 3.5, y: 2.6, w: 6.33, h: 0.06, fill: { color: ACCENT } });
slide.addText("Codeless Test Automation", {
  x: 0.5, y: 1.5, w: 12.33, h: 1.0,
  fontSize: 40, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center",
});
slide.addText("with Intelligent Recording & Replay", {
  x: 0.5, y: 2.8, w: 12.33, h: 0.7,
  fontSize: 24, fontFace: "Segoe UI Light", color: ACCENT, align: "center",
});
slide.addText("An AI-Powered Approach to End-to-End QA Automation", {
  x: 0.5, y: 4.0, w: 12.33, h: 0.5,
  fontSize: 16, fontFace: "Segoe UI", color: LIGHT_GRAY, align: "center",
});
slide.addText("March 2026", {
  x: 0.5, y: 5.5, w: 12.33, h: 0.4,
  fontSize: 14, fontFace: "Segoe UI", color: MID_GRAY, align: "center",
});

// ════════════════════════════════════════════════
// SLIDE 2 — Agenda
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 2);
slide.addText("Agenda", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 32, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 2.0, h: 0.05, fill: { color: ACCENT } });

const agendaItems = [
  { num: "01", title: "Problem Statement", desc: "The cost and fragility of manual QA today" },
  { num: "02", title: "Proposed Solution", desc: "Record, Replay, and Auto-Generate test cases" },
  { num: "03", title: "Key Innovation (AI)", desc: "Intelligent automation at every stage" },
  { num: "04", title: "Benefits", desc: "Faster, cheaper, more reliable testing" },
];

agendaItems.forEach((item, i) => {
  const y = 1.8 + i * 1.3;
  // Number circle
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 1.2, y: y, w: 0.7, h: 0.7,
    fill: { color: ACCENT }, line: { color: ACCENT, width: 0 },
  });
  slide.addText(item.num, {
    x: 1.2, y: y, w: 0.7, h: 0.7,
    fontSize: 18, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
  });
  slide.addText(item.title, {
    x: 2.3, y: y - 0.05, w: 9, h: 0.4,
    fontSize: 20, fontFace: "Segoe UI", bold: true, color: WHITE,
  });
  slide.addText(item.desc, {
    x: 2.3, y: y + 0.35, w: 9, h: 0.35,
    fontSize: 14, fontFace: "Segoe UI", color: LIGHT_GRAY,
  });
});

// ════════════════════════════════════════════════
// SLIDE 3 — Section: Problem Statement
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 3);
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 2.8, w: 13.33, h: 2.0, fill: { color: ACCENT, transparency: 85 } });
slide.addText("01", {
  x: 0.7, y: 1.5, w: 2, h: 1,
  fontSize: 60, fontFace: "Segoe UI", bold: true, color: ACCENT, transparency: 40,
});
slide.addText("Problem Statement", {
  x: 0.7, y: 3.0, w: 11.93, h: 1.2,
  fontSize: 40, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
});
slide.addText("The cost and fragility of manual QA today", {
  x: 0.7, y: 4.4, w: 11.93, h: 0.6,
  fontSize: 18, fontFace: "Segoe UI Light", color: LIGHT_GRAY, align: "center",
});

// ════════════════════════════════════════════════
// SLIDE 4 — QA Bottleneck
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 4);
slide.addText("The QA Bottleneck in Modern Software Delivery", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: ACCENT } });

// Left column — stats
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.5, w: 5.7, h: 5.5, rectRadius: 0.15,
  fill: { color: CARD_BG },
});
slide.addText("Manual Testing Is Expensive and Slow", {
  x: 1.1, y: 1.7, w: 5.0, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: ACCENT,
});
const problems = [
  "QA teams spend 60–70% of their time writing,\nmaintaining, and re-running test scripts",
  "A single E2E test scenario involves crafting locators,\nhandling waits, managing test data, and debugging flaky runs",
  "As applications evolve, test maintenance becomes\nthe #1 cost driver — UI changes break hundreds of scripts",
];
problems.forEach((p, i) => {
  slide.addText([
    { text: "●  ", options: { fontSize: 12, color: ACCENT } },
    { text: p, options: { fontSize: 13, color: LIGHT_GRAY } },
  ], { x: 1.1, y: 2.4 + i * 1.2, w: 5.0, h: 1.0, fontFace: "Segoe UI", lineSpacingMultiple: 1.1 });
});

// Right column — challenge table
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.9, y: 1.5, w: 5.7, h: 5.5, rectRadius: 0.15,
  fill: { color: CARD_BG },
});
slide.addText("Traditional Automation Challenges", {
  x: 7.3, y: 1.7, w: 5.0, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: RED,
});

const challenges = [
  { icon: "✕", c: "Flaky selectors", d: "Break on DOM changes" },
  { icon: "✕", c: "Slow authoring", d: "30–60 min per test" },
  { icon: "✕", c: "No business context", d: "Code, not documentation" },
  { icon: "✕", c: "Multi-window gaps", d: "Popups & SSO unsupported" },
  { icon: "✕", c: "API blindness", d: "Hides root causes" },
];
challenges.forEach((ch, i) => {
  const y = 2.4 + i * 0.85;
  slide.addText(ch.icon, { x: 7.3, y, w: 0.4, h: 0.4, fontSize: 16, color: RED, fontFace: "Segoe UI", bold: true });
  slide.addText(ch.c, { x: 7.8, y, w: 2.4, h: 0.4, fontSize: 14, color: WHITE, fontFace: "Segoe UI", bold: true });
  slide.addText(ch.d, { x: 10.2, y, w: 2.2, h: 0.4, fontSize: 12, color: LIGHT_GRAY, fontFace: "Segoe UI" });
});

// ════════════════════════════════════════════════
// SLIDE 5 — The Real Problem (quote)
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 5);
slide.addText("The Core Gap", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 2.0, h: 0.05, fill: { color: ACCENT } });

// Quote box
slide.addShape(pptx.ShapeType.roundRect, {
  x: 1.5, y: 1.8, w: 10.33, h: 4.8, rectRadius: 0.2,
  fill: { color: CARD_BG }, line: { color: ACCENT, width: 2 },
});
// Quote mark
slide.addText('"', {
  x: 1.8, y: 1.6, w: 1, h: 1.2,
  fontSize: 72, color: ACCENT, fontFace: "Georgia", bold: true,
});
slide.addText(
  "There is no tool today that lets a non-developer\nperform a workflow once and instantly get:", {
  x: 2.5, y: 2.2, w: 8.5, h: 1.0,
  fontSize: 18, fontFace: "Segoe UI", color: WHITE, italic: true, lineSpacingMultiple: 1.3,
});

const gapItems = [
  "A fully executable regression test",
  "A human-readable QA test case document",
  "Coverage of both UI interactions AND API contracts",
  "Resilience against DOM changes through multi-locator strategies",
];
gapItems.forEach((item, i) => {
  slide.addText([
    { text: "→  ", options: { fontSize: 16, color: ACCENT, bold: true } },
    { text: item, options: { fontSize: 16, color: LIGHT_GRAY } },
  ], { x: 3.0, y: 3.5 + i * 0.6, w: 8, h: 0.5, fontFace: "Segoe UI" });
});

// ════════════════════════════════════════════════
// SLIDE 6 — Section: Proposed Solution
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 6);
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 2.8, w: 13.33, h: 2.0, fill: { color: GREEN, transparency: 85 } });
slide.addText("02", {
  x: 0.7, y: 1.5, w: 2, h: 1,
  fontSize: 60, fontFace: "Segoe UI", bold: true, color: GREEN, transparency: 40,
});
slide.addText("Proposed Solution", {
  x: 0.7, y: 3.0, w: 11.93, h: 1.2,
  fontSize: 40, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
});
slide.addText("Record, Replay, and Auto-Generate — Zero Code Required", {
  x: 0.7, y: 4.4, w: 11.93, h: 0.6,
  fontSize: 18, fontFace: "Segoe UI Light", color: LIGHT_GRAY, align: "center",
});

// ════════════════════════════════════════════════
// SLIDE 7 — Pipeline
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 7);
slide.addText("How It Works — The Pipeline", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 2.5, h: 0.05, fill: { color: GREEN } });

// Pipeline boxes
const stages = [
  { label: "RECORD", sub: "Browser", color: ACCENT },
  { label: "FILTER", sub: "Clean Up", color: ACCENT2 },
  { label: "DEDUPLICATE", sub: "Optimize", color: GREEN },
  { label: "GENERATE", sub: "Test Cases", color: ORANGE },
  { label: "PLAYBACK", sub: "Replay", color: "06B6D4" },
];

stages.forEach((s, i) => {
  const x = 0.7 + i * 2.5;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: 1.8, w: 2.1, h: 1.4, rectRadius: 0.12,
    fill: { color: s.color, transparency: 80 },
    line: { color: s.color, width: 2 },
  });
  slide.addText(s.label, {
    x, y: 1.9, w: 2.1, h: 0.7,
    fontSize: 14, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
  });
  slide.addText(s.sub, {
    x, y: 2.5, w: 2.1, h: 0.5,
    fontSize: 11, fontFace: "Segoe UI", color: LIGHT_GRAY, align: "center",
  });
  // Arrow
  if (i < stages.length - 1) {
    slide.addText("→", {
      x: x + 2.1, y: 2.1, w: 0.4, h: 0.7,
      fontSize: 24, color: LIGHT_GRAY, align: "center", valign: "middle", fontFace: "Segoe UI",
    });
  }
});

// One command callout
slide.addShape(pptx.ShapeType.roundRect, {
  x: 3.5, y: 3.6, w: 6.33, h: 0.8, rectRadius: 0.1,
  fill: { color: GREEN, transparency: 75 }, line: { color: GREEN, width: 1.5 },
});
slide.addText("One Command:   npm run automate", {
  x: 3.5, y: 3.6, w: 6.33, h: 0.8,
  fontSize: 18, fontFace: "Consolas", bold: true, color: WHITE, align: "center", valign: "middle",
});

// Steps
const steps = [
  "Opens a browser — you interact naturally with your application",
  "Captures every click, input, navigation, and API call in real time",
  "Filters noise and deduplicates redundant actions automatically",
  "Generates structured QA test case documents (Markdown)",
  "Replays the optimized recording with screenshots on every step",
];
steps.forEach((step, i) => {
  slide.addText([
    { text: `${i + 1}.  `, options: { fontSize: 13, color: GREEN, bold: true } },
    { text: step, options: { fontSize: 13, color: LIGHT_GRAY } },
  ], { x: 1.5, y: 4.7 + i * 0.5, w: 10, h: 0.45, fontFace: "Segoe UI" });
});

// ════════════════════════════════════════════════
// SLIDE 8 — What Gets Captured
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 8);
slide.addText("What Gets Captured", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 2.0, h: 0.05, fill: { color: GREEN } });

// 3 cards side by side
const captureCards = [
  {
    title: "UI Interactions",
    color: ACCENT,
    items: ["Clicks, inputs, dropdowns, keypresses", "Multi-window & popup interactions", "Navigation & route changes"],
  },
  {
    title: "API Layer",
    color: ACCENT2,
    items: ["Every XHR / Fetch request & response", "Request headers, body, status codes", "Response payloads"],
  },
  {
    title: "Element Locators (6+)",
    color: GREEN,
    items: ["XPath • CSS Selector • Element ID", "data-aid / data-testid", "name attribute • Text content"],
  },
];

captureCards.forEach((card, i) => {
  const x = 0.7 + i * 4.2;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: 1.5, w: 3.8, h: 4.0, rectRadius: 0.15,
    fill: { color: CARD_BG }, line: { color: card.color, width: 1.5 },
  });
  slide.addText(card.title, {
    x, y: 1.7, w: 3.8, h: 0.6,
    fontSize: 16, fontFace: "Segoe UI", bold: true, color: card.color, align: "center",
  });
  slide.addShape(pptx.ShapeType.rect, { x: x + 0.6, y: 2.3, w: 2.6, h: 0.03, fill: { color: card.color, transparency: 50 } });
  card.items.forEach((item, j) => {
    slide.addText([
      { text: "●  ", options: { color: card.color, fontSize: 11 } },
      { text: item, options: { color: LIGHT_GRAY, fontSize: 12 } },
    ], { x: x + 0.3, y: 2.6 + j * 0.7, w: 3.2, h: 0.6, fontFace: "Segoe UI" });
  });
});

// Resilience callout
slide.addShape(pptx.ShapeType.roundRect, {
  x: 1.5, y: 5.8, w: 10.33, h: 0.8, rectRadius: 0.1,
  fill: { color: ACCENT, transparency: 85 }, line: { color: ACCENT, width: 1 },
});
slide.addText("If one locator breaks, the engine cascades to the next — making tests resilient to UI changes.", {
  x: 1.5, y: 5.8, w: 10.33, h: 0.8,
  fontSize: 14, fontFace: "Segoe UI", italic: true, color: WHITE, align: "center", valign: "middle",
});

// ════════════════════════════════════════════════
// SLIDE 9 — Automatic Test Case Generation
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 9);
slide.addText("Automatic Test Case Generation", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: GREEN } });

// Example test case card
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.5, w: 6.0, h: 5.5, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: ACCENT, width: 1.5 },
});
slide.addText("TC-001: User Login", {
  x: 1.1, y: 1.7, w: 5.2, h: 0.45,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: ACCENT,
});
slide.addText("Priority: Critical  |  Type: Functional", {
  x: 1.1, y: 2.15, w: 5.2, h: 0.35,
  fontSize: 11, fontFace: "Segoe UI", color: ORANGE,
});
slide.addShape(pptx.ShapeType.rect, { x: 1.1, y: 2.55, w: 5.2, h: 0.02, fill: { color: MID_GRAY } });

slide.addText("Objective", { x: 1.1, y: 2.7, w: 5.2, h: 0.35, fontSize: 12, fontFace: "Segoe UI", bold: true, color: GREEN });
slide.addText("Verify user can log in with valid credentials", { x: 1.1, y: 3.0, w: 5.2, h: 0.35, fontSize: 11, fontFace: "Segoe UI", color: LIGHT_GRAY });

slide.addText("Test Steps", { x: 1.1, y: 3.5, w: 5.2, h: 0.35, fontSize: 12, fontFace: "Segoe UI", bold: true, color: GREEN });
const tcSteps = [
  '1. Navigate to login page',
  '2. Enter username "test-tenant"',
  '3. Click "Next"',
  '4. Enter password',
  '5. Press "Sign in"',
];
tcSteps.forEach((s, i) => {
  slide.addText(s, { x: 1.3, y: 3.85 + i * 0.4, w: 5.0, h: 0.35, fontSize: 11, fontFace: "Segoe UI", color: LIGHT_GRAY });
});

slide.addText("Expected Results", { x: 1.1, y: 5.9, w: 5.2, h: 0.3, fontSize: 12, fontFace: "Segoe UI", bold: true, color: GREEN });
slide.addText("• User authenticated  • Redirected to dashboard", { x: 1.1, y: 6.2, w: 5.2, h: 0.3, fontSize: 11, fontFace: "Segoe UI", color: LIGHT_GRAY });

// Right side — summary
slide.addShape(pptx.ShapeType.roundRect, {
  x: 7.3, y: 1.5, w: 5.3, h: 5.5, rectRadius: 0.15,
  fill: { color: CARD_BG },
});
slide.addText("What You Get Automatically", {
  x: 7.6, y: 1.7, w: 4.7, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: ORANGE,
});
slide.addShape(pptx.ShapeType.rect, { x: 7.6, y: 2.2, w: 4.7, h: 0.02, fill: { color: MID_GRAY } });

const autoFeatures = [
  "8–12 structured test cases\nper recording",
  "Test case IDs, Priority levels,\nand Type classifications",
  "Objective, Preconditions,\nStep-by-step instructions",
  "Expected Results &\ncaptured Test Data",
  "Test Execution Summary\nwith coverage breakdown",
];
autoFeatures.forEach((f, i) => {
  slide.addText([
    { text: "✓  ", options: { color: GREEN, fontSize: 14, bold: true } },
    { text: f, options: { color: LIGHT_GRAY, fontSize: 12 } },
  ], { x: 7.8, y: 2.5 + i * 0.9, w: 4.5, h: 0.8, fontFace: "Segoe UI", lineSpacingMultiple: 1.1 });
});

// ════════════════════════════════════════════════
// SLIDE 10 — Section: Key Innovation
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 10);
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 2.8, w: 13.33, h: 2.0, fill: { color: ACCENT2, transparency: 85 } });
slide.addText("03", {
  x: 0.7, y: 1.5, w: 2, h: 1,
  fontSize: 60, fontFace: "Segoe UI", bold: true, color: ACCENT2, transparency: 40,
});
slide.addText("Key Innovation — AI & Intelligent Automation", {
  x: 0.7, y: 3.0, w: 11.93, h: 1.2,
  fontSize: 36, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
});
slide.addText("Intelligence built into every stage of the pipeline", {
  x: 0.7, y: 4.4, w: 11.93, h: 0.6,
  fontSize: 18, fontFace: "Segoe UI Light", color: LIGHT_GRAY, align: "center",
});

// ════════════════════════════════════════════════
// SLIDE 11 — Intent Classification
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 11);
slide.addText("1. Intelligent Intent Classification", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: ACCENT2 } });

slide.addText("The system doesn't just replay clicks — it understands what the user was trying to do.", {
  x: 0.7, y: 1.4, w: 11.93, h: 0.5,
  fontSize: 14, fontFace: "Segoe UI", italic: true, color: LIGHT_GRAY,
});

// Intent mapping table
const intents = [
  { pattern: '#username + #password + "Sign in"', intent: "Login Flow", color: GREEN },
  { pattern: 'Click "Agent Interface" / "Service Catalog"', intent: "Navigation", color: ACCENT },
  { pattern: '"Add" button → fill fields → "Save"', intent: "Create / CRUD Operation", color: ACCENT2 },
  { pattern: 'Click "Build" / "Operate"', intent: "Phase Transition", color: ORANGE },
  { pattern: 'Click "Request"', intent: "Service Request Submission", color: "06B6D4" },
  { pattern: 'Click "Logout"', intent: "Logout / Cleanup", color: RED },
];

// Table header
slide.addShape(pptx.ShapeType.roundRect, {
  x: 1.0, y: 2.2, w: 11.33, h: 0.6, rectRadius: 0.08,
  fill: { color: ACCENT2, transparency: 60 },
});
slide.addText("Detected Pattern", { x: 1.2, y: 2.2, w: 5.5, h: 0.6, fontSize: 14, fontFace: "Segoe UI", bold: true, color: WHITE, valign: "middle" });
slide.addText("Classified Intent", { x: 7.0, y: 2.2, w: 5.0, h: 0.6, fontSize: 14, fontFace: "Segoe UI", bold: true, color: WHITE, valign: "middle" });

intents.forEach((item, i) => {
  const y = 2.9 + i * 0.65;
  if (i % 2 === 0) {
    slide.addShape(pptx.ShapeType.rect, { x: 1.0, y, w: 11.33, h: 0.6, fill: { color: CARD_BG } });
  }
  slide.addText(item.pattern, { x: 1.2, y, w: 5.5, h: 0.6, fontSize: 12, fontFace: "Consolas", color: LIGHT_GRAY, valign: "middle" });
  slide.addText(item.intent, { x: 7.0, y, w: 5.0, h: 0.6, fontSize: 13, fontFace: "Segoe UI", bold: true, color: item.color, valign: "middle" });
});

// Callout
slide.addShape(pptx.ShapeType.roundRect, {
  x: 1.5, y: 6.4, w: 10.33, h: 0.7, rectRadius: 0.08,
  fill: { color: ACCENT2, transparency: 85 }, line: { color: ACCENT2, width: 1 },
});
slide.addText("Transforms raw DOM events into meaningful business-level test cases — without needing an LLM or cloud API.", {
  x: 1.5, y: 6.4, w: 10.33, h: 0.7,
  fontSize: 13, fontFace: "Segoe UI", italic: true, color: WHITE, align: "center", valign: "middle",
});

// ════════════════════════════════════════════════
// SLIDE 12 — Semantic Deduplication
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 12);
slide.addText("2. Semantic Event Deduplication", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: ACCENT2 } });

// Before card
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.5, w: 5.7, h: 4.5, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: RED, width: 1.5 },
});
slide.addText("Raw Recording (50+ events)", {
  x: 1.0, y: 1.7, w: 5.1, h: 0.45,
  fontSize: 16, fontFace: "Segoe UI", bold: true, color: RED,
});
const rawEvents = [
  'click #username',
  'input "t"',
  'input "te"',
  'input "tes"',
  'input "test"',
  'change "test"',
  'click #password',
  'input "A" → "Ad" → "Adm"',
  'change "Admin_1234"',
  'click #submit',
];
rawEvents.forEach((e, i) => {
  slide.addText(e, { x: 1.3, y: 2.3 + i * 0.35, w: 4.8, h: 0.32, fontSize: 11, fontFace: "Consolas", color: LIGHT_GRAY });
});

// Arrow between
slide.addText("→", {
  x: 6.2, y: 3.2, w: 0.8, h: 1.0,
  fontSize: 40, fontFace: "Segoe UI", color: GREEN, bold: true, align: "center", valign: "middle",
});

// After card
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.9, y: 1.5, w: 5.7, h: 4.5, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: GREEN, width: 1.5 },
});
slide.addText("After Deduplication (3 actions)", {
  x: 7.2, y: 1.7, w: 5.1, h: 0.45,
  fontSize: 16, fontFace: "Segoe UI", bold: true, color: GREEN,
});
const dedupEvents = [
  { text: 'input #username = "test"', y: 2.5 },
  { text: 'change #password = "Admin_1234"', y: 3.2 },
  { text: 'click #submit', y: 3.9 },
];
dedupEvents.forEach((e) => {
  slide.addText([
    { text: "✓  ", options: { color: GREEN, fontSize: 14, bold: true } },
    { text: e.text, options: { color: WHITE, fontSize: 13 } },
  ], { x: 7.4, y: e.y, w: 4.9, h: 0.5, fontFace: "Consolas" });
});

// Rules
slide.addText("Intelligent Rules Applied:", {
  x: 0.7, y: 6.2, w: 12, h: 0.35,
  fontSize: 14, fontFace: "Segoe UI", bold: true, color: ACCENT2,
});
const rules = [
  "input → input on same element → keep the last value",
  "input → change on same element → keep change (committed value)",
  "click on <input> → typing → drop the click (just focusing)",
];
rules.forEach((r, i) => {
  slide.addText([
    { text: "●  ", options: { color: ACCENT2, fontSize: 11 } },
    { text: r, options: { color: LIGHT_GRAY, fontSize: 11 } },
  ], { x: 1.0, y: 6.55 + i * 0.32, w: 11, h: 0.3, fontFace: "Segoe UI" });
});

// ════════════════════════════════════════════════
// SLIDE 13 — Multi-Strategy Locator
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 13);
slide.addText("3. Multi-Strategy Locator Intelligence", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: ACCENT2 } });

// Cascading fallback visualization
const locators = [
  { name: "XPath", desc: "Most precise DOM path", color: ACCENT },
  { name: "CSS Selector", desc: "Fast, class-based matching", color: ACCENT2 },
  { name: "Element ID", desc: "Unique identifier", color: GREEN },
  { name: "data-testid", desc: "Test automation attribute", color: ORANGE },
  { name: "Text Content", desc: "Visual text fallback", color: "06B6D4" },
];

locators.forEach((loc, i) => {
  const y = 1.6 + i * 1.05;
  // Left label
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.5, y, w: 3.5, h: 0.75, rectRadius: 0.1,
    fill: { color: loc.color, transparency: 75 }, line: { color: loc.color, width: 1.5 },
  });
  slide.addText(`Attempt ${i + 1}:  ${loc.name}`, {
    x: 1.5, y, w: 3.5, h: 0.75,
    fontSize: 14, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
  });
  // Arrow right
  slide.addText("→", {
    x: 5.1, y, w: 0.6, h: 0.75,
    fontSize: 20, fontFace: "Segoe UI", color: loc.color, align: "center", valign: "middle",
  });
  // Status
  slide.addText("Found? Execute  ✓", {
    x: 5.7, y, w: 3, h: 0.75,
    fontSize: 13, fontFace: "Segoe UI", color: GREEN, valign: "middle",
  });
  // Fail arrow down
  if (i < locators.length - 1) {
    slide.addText("↓ Failed", {
      x: 2.5, y: y + 0.7, w: 1.5, h: 0.35,
      fontSize: 10, fontFace: "Segoe UI", color: RED,
    });
  }
  // Description
  slide.addText(loc.desc, {
    x: 9.0, y, w: 3.5, h: 0.75,
    fontSize: 12, fontFace: "Segoe UI", color: LIGHT_GRAY, valign: "middle",
  });
});

// Self-healing callout
slide.addShape(pptx.ShapeType.roundRect, {
  x: 1.5, y: 6.8, w: 10.33, h: 0.5, rectRadius: 0.08,
  fill: { color: GREEN, transparency: 85 },
});
slide.addText("Self-healing approach — dramatically reduces test flakiness", {
  x: 1.5, y: 6.8, w: 10.33, h: 0.5,
  fontSize: 13, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
});

// ════════════════════════════════════════════════
// SLIDE 14 — Smart Stability + Data-Attribute
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 14);
slide.addText("4. Smart Stability & 5. Data-Attribute Aware Recording", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 24, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 4.0, h: 0.05, fill: { color: ACCENT2 } });

// Left — Anti-flakiness
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.5, w: 5.7, h: 5.5, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: "06B6D4", width: 1.5 },
});
slide.addText("Anti-Flakiness Engine", {
  x: 1.0, y: 1.7, w: 5.1, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: "06B6D4",
});

const stabilityItems = [
  { s: "Network Idle Detection", d: "Waits for all API calls to finish" },
  { s: "DOM Load State Monitoring", d: "Ensures page is fully rendered" },
  { s: "Stabilization Delays", d: "Configurable pause after navigation" },
  { s: "Input Debouncing", d: "Captures final value, not keystrokes" },
  { s: "Fixed Viewport", d: "Prevents layout shifts from resizing" },
];
stabilityItems.forEach((item, i) => {
  const y = 2.4 + i * 0.85;
  slide.addText([
    { text: "✓  ", options: { color: GREEN, fontSize: 13, bold: true } },
    { text: item.s, options: { color: WHITE, fontSize: 13, bold: true } },
  ], { x: 1.2, y, w: 5.0, h: 0.4, fontFace: "Segoe UI" });
  slide.addText(item.d, { x: 1.6, y: y + 0.3, w: 4.6, h: 0.35, fontSize: 11, fontFace: "Segoe UI", color: LIGHT_GRAY });
});

// Right — Data-attribute aware
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.9, y: 1.5, w: 5.7, h: 5.5, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: ORANGE, width: 1.5 },
});
slide.addText("Data-Attribute Aware Recording", {
  x: 7.2, y: 1.7, w: 5.1, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: ORANGE,
});

const dataAidItems = [
  "Detects data-aid / data-testid attributes automatically",
  "For elements without data-aid, anchors XPaths\nto nearest parent that has one",
  "Produces stable, meaningful locators\neven in deeply nested DOM",
];
dataAidItems.forEach((item, i) => {
  slide.addText([
    { text: "●  ", options: { color: ORANGE, fontSize: 12 } },
    { text: item, options: { color: LIGHT_GRAY, fontSize: 12 } },
  ], { x: 7.4, y: 2.5 + i * 1.1, w: 4.9, h: 0.9, fontFace: "Segoe UI", lineSpacingMultiple: 1.2 });
});

// Example
slide.addShape(pptx.ShapeType.roundRect, {
  x: 7.2, y: 5.2, w: 5.1, h: 1.3, rectRadius: 0.1,
  fill: { color: DARK_BG }, line: { color: ORANGE, width: 1 },
});
slide.addText('Element: <span> inside <div data-aid="catalog-row">', {
  x: 7.4, y: 5.3, w: 4.7, h: 0.4,
  fontSize: 10, fontFace: "Consolas", color: LIGHT_GRAY,
});
slide.addText("//*[@data-aid='catalog-row']//span[text()='My Service']", {
  x: 7.4, y: 5.8, w: 4.7, h: 0.4,
  fontSize: 10, fontFace: "Consolas", color: ORANGE, bold: true,
});

// ════════════════════════════════════════════════
// SLIDE 15 — Section: Benefits
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 15);
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 2.8, w: 13.33, h: 2.0, fill: { color: ORANGE, transparency: 85 } });
slide.addText("04", {
  x: 0.7, y: 1.5, w: 2, h: 1,
  fontSize: 60, fontFace: "Segoe UI", bold: true, color: ORANGE, transparency: 40,
});
slide.addText("Benefits", {
  x: 0.7, y: 3.0, w: 11.93, h: 1.2,
  fontSize: 40, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
});
slide.addText("Faster, cheaper, more reliable testing", {
  x: 0.7, y: 4.4, w: 11.93, h: 0.6,
  fontSize: 18, fontFace: "Segoe UI Light", color: LIGHT_GRAY, align: "center",
});

// ════════════════════════════════════════════════
// SLIDE 16 — Quantifiable Impact
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 16);
slide.addText("Quantifiable Impact", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 2.5, h: 0.05, fill: { color: ORANGE } });

// Time savings comparison
const savings = [
  { activity: "Write one E2E test", trad: "30–60 min", ours: "2–3 min", factor: "~20x faster" },
  { activity: "Generate test documentation", trad: "1–2 hours", ours: "Automatic", factor: "Zero effort" },
  { activity: "Fix a broken selector", trad: "15–30 min", ours: "Self-healing", factor: "Near zero" },
  { activity: "Onboard new QA member", trad: "Days", ours: "Minutes", factor: "No code needed" },
];

// Table header
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.5, w: 11.93, h: 0.7, rectRadius: 0.08,
  fill: { color: ORANGE, transparency: 60 },
});
const headers = [
  { text: "Activity", x: 0.9, w: 3.8 },
  { text: "Traditional", x: 4.7, w: 2.5 },
  { text: "Our Solution", x: 7.2, w: 2.8 },
  { text: "Improvement", x: 10.0, w: 2.4 },
];
headers.forEach(h => {
  slide.addText(h.text, { x: h.x, y: 1.5, w: h.w, h: 0.7, fontSize: 14, fontFace: "Segoe UI", bold: true, color: WHITE, valign: "middle" });
});

savings.forEach((row, i) => {
  const y = 2.3 + i * 0.75;
  if (i % 2 === 0) slide.addShape(pptx.ShapeType.rect, { x: 0.7, y, w: 11.93, h: 0.7, fill: { color: CARD_BG } });
  slide.addText(row.activity, { x: 0.9, y, w: 3.8, h: 0.7, fontSize: 13, fontFace: "Segoe UI", color: WHITE, valign: "middle" });
  slide.addText(row.trad, { x: 4.7, y, w: 2.5, h: 0.7, fontSize: 13, fontFace: "Segoe UI", color: RED, valign: "middle" });
  slide.addText(row.ours, { x: 7.2, y, w: 2.8, h: 0.7, fontSize: 13, fontFace: "Segoe UI", bold: true, color: GREEN, valign: "middle" });
  slide.addText(row.factor, { x: 10.0, y, w: 2.4, h: 0.7, fontSize: 12, fontFace: "Segoe UI", color: ORANGE, valign: "middle" });
});

// Cost reduction callout
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 5.5, w: 11.93, h: 1.6, rectRadius: 0.15,
  fill: { color: CARD_BG },
});
slide.addText("Cost Reduction", {
  x: 1.1, y: 5.6, w: 11, h: 0.45,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: GREEN,
});
const costItems = [
  "80–90% reduction in test authoring time",
  "Eliminates the need for QA engineers to write Playwright/Selenium code",
  "Reduces maintenance burden through multi-locator resilience",
];
costItems.forEach((c, i) => {
  slide.addText([
    { text: "✓  ", options: { color: GREEN, fontSize: 13, bold: true } },
    { text: c, options: { color: LIGHT_GRAY, fontSize: 13 } },
  ], { x: 1.3, y: 6.1 + i * 0.35, w: 10.5, h: 0.3, fontFace: "Segoe UI" });
});

// ════════════════════════════════════════════════
// SLIDE 17 — Benefits by audience
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 17);
slide.addText("Key Benefits — By Audience", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: ORANGE } });

const audienceCards = [
  {
    title: "For QA Teams",
    color: ACCENT,
    items: [
      "Zero-code test creation",
      "Auto-generated documentation",
      "Screenshot evidence per step",
      "Resilient multi-locator playback",
    ],
  },
  {
    title: "For Developers",
    color: ACCENT2,
    items: [
      "Dual UI + API capture",
      "Fast bug reproduction",
      "CI/CD ready (headless mode)",
      "Comprehensive execution stats",
    ],
  },
  {
    title: "For Managers",
    color: ORANGE,
    items: [
      "Human-readable test cases",
      "Faster release cycles",
      "Full traceability",
      "No-code onboarding",
    ],
  },
];

audienceCards.forEach((card, i) => {
  const x = 0.7 + i * 4.2;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: 1.5, w: 3.8, h: 5.2, rectRadius: 0.15,
    fill: { color: CARD_BG }, line: { color: card.color, width: 1.5 },
  });
  // Header bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x + 0.1, y: 1.6, w: 3.6, h: 0.7, rectRadius: 0.1,
    fill: { color: card.color, transparency: 70 },
  });
  slide.addText(card.title, {
    x, y: 1.6, w: 3.8, h: 0.7,
    fontSize: 16, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
  });
  card.items.forEach((item, j) => {
    slide.addText([
      { text: "✓  ", options: { color: card.color, fontSize: 13, bold: true } },
      { text: item, options: { color: LIGHT_GRAY, fontSize: 13 } },
    ], { x: x + 0.3, y: 2.6 + j * 0.9, w: 3.2, h: 0.7, fontFace: "Segoe UI" });
  });
});

// ════════════════════════════════════════════════
// SLIDE 18 — Competitive Differentiation
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 18);
slide.addText("Competitive Differentiation", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 3.0, h: 0.05, fill: { color: ORANGE } });

const compCols = [
  { label: "Capability", w: 2.6, x: 0.9 },
  { label: "Selenium IDE", w: 1.8, x: 3.5 },
  { label: "Playwright\nCodegen", w: 1.8, x: 5.3 },
  { label: "Cypress\nStudio", w: 1.8, x: 7.1 },
  { label: "Our Solution", w: 2.6, x: 8.9 },
];
// Header
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.4, w: 11.0, h: 0.7, rectRadius: 0.06,
  fill: { color: ACCENT, transparency: 60 },
});
compCols.forEach(col => {
  slide.addText(col.label, { x: col.x, y: 1.4, w: col.w, h: 0.7, fontSize: 11, fontFace: "Segoe UI", bold: true, color: WHITE, valign: "middle", align: "center" });
});

const compRows = [
  { cap: "Record & replay", vals: ["✓", "✓", "✓", "✓"] },
  { cap: "Multi-locator fallback", vals: ["✕", "✕", "✕", "✓  6+ strategies"] },
  { cap: "API call capture", vals: ["✕", "✕", "✕", "✓  Full req/resp"] },
  { cap: "Auto test case docs", vals: ["✕", "✕", "✕", "✓  Structured MD"] },
  { cap: "Multi-window/popup", vals: ["✕", "Partial", "✕", "✓  Full support"] },
  { cap: "Smart deduplication", vals: ["✕", "✕", "✕", "✓  Semantic"] },
  { cap: "Intent classification", vals: ["✕", "✕", "✕", "✓  Business-level"] },
  { cap: "Anti-flakiness engine", vals: ["✕", "Partial", "Partial", "✓  Comprehensive"] },
];

compRows.forEach((row, i) => {
  const y = 2.2 + i * 0.6;
  if (i % 2 === 0) slide.addShape(pptx.ShapeType.rect, { x: 0.7, y, w: 11.0, h: 0.56, fill: { color: CARD_BG } });
  slide.addText(row.cap, { x: 0.9, y, w: 2.6, h: 0.56, fontSize: 11, fontFace: "Segoe UI", color: WHITE, valign: "middle" });
  row.vals.forEach((v, j) => {
    const isOurs = j === 3;
    const colX = [3.5, 5.3, 7.1, 8.9][j];
    const colW = [1.8, 1.8, 1.8, 2.6][j];
    let color = v.startsWith("✓") ? GREEN : v === "Partial" ? ORANGE : RED;
    if (isOurs && v.startsWith("✓")) color = GREEN;
    slide.addText(v, { x: colX, y, w: colW, h: 0.56, fontSize: isOurs ? 11 : 12, fontFace: "Segoe UI", color, valign: "middle", align: "center", bold: isOurs });
  });
});

// ════════════════════════════════════════════════
// SLIDE 19 — Vision & Roadmap
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
addFooter(slide, 19);
slide.addText("Vision & Roadmap", {
  x: 0.7, y: 0.4, w: 11.93, h: 0.8,
  fontSize: 28, fontFace: "Segoe UI", bold: true, color: WHITE,
});
slide.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.1, w: 2.5, h: 0.05, fill: { color: ACCENT } });

// Current state
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.7, y: 1.5, w: 5.7, h: 5.2, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: GREEN, width: 1.5 },
});
slide.addText("Current State (MVP)", {
  x: 1.0, y: 1.7, w: 5.1, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: GREEN,
});
const mvpItems = [
  "Full recording pipeline\n(Record → Filter → Deduplicate → Playback)",
  "Automatic test case generation\n(structured Markdown)",
  "Multi-locator resilience\n(6+ strategies per element)",
  "Multi-window support\n(popups, new tabs, SSO)",
  "Screenshot capture per action\n(success & failure)",
];
mvpItems.forEach((item, i) => {
  slide.addText([
    { text: "✓  ", options: { color: GREEN, fontSize: 13, bold: true } },
    { text: item, options: { color: LIGHT_GRAY, fontSize: 12 } },
  ], { x: 1.2, y: 2.3 + i * 0.85, w: 4.9, h: 0.75, fontFace: "Segoe UI", lineSpacingMultiple: 1.1 });
});

// Future
slide.addShape(pptx.ShapeType.roundRect, {
  x: 6.9, y: 1.5, w: 5.7, h: 5.2, rectRadius: 0.15,
  fill: { color: CARD_BG }, line: { color: ACCENT, width: 1.5 },
});
slide.addText("Future Enhancements", {
  x: 7.2, y: 1.7, w: 5.1, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", bold: true, color: ACCENT,
});
const futureItems = [
  { label: "LLM Integration", desc: "AI-powered test descriptions" },
  { label: "Visual Regression", desc: "Screenshot diff across runs" },
  { label: "CI/CD Plugin", desc: "GitHub Actions / Jenkins" },
  { label: "Dashboard & Reporting", desc: "Web UI for management" },
  { label: "Cross-Browser", desc: "Firefox & WebKit support" },
  { label: "Self-Healing with ML", desc: "ML-based locator prediction" },
];
futureItems.forEach((item, i) => {
  slide.addText([
    { text: "→  ", options: { color: ACCENT, fontSize: 13, bold: true } },
    { text: item.label, options: { color: WHITE, fontSize: 13, bold: true } },
  ], { x: 7.4, y: 2.3 + i * 0.75, w: 4.9, h: 0.35, fontFace: "Segoe UI" });
  slide.addText(item.desc, { x: 7.8, y: 2.6 + i * 0.75, w: 4.5, h: 0.3, fontSize: 11, fontFace: "Segoe UI", color: LIGHT_GRAY });
});

// ════════════════════════════════════════════════
// SLIDE 20 — Thank You
// ════════════════════════════════════════════════
slide = pptx.addSlide();
addBackground(slide);
// Accent bar
slide.addShape(pptx.ShapeType.rect, { x: 4.0, y: 2.2, w: 5.33, h: 0.06, fill: { color: ACCENT } });
slide.addText("Thank You", {
  x: 0.5, y: 2.5, w: 12.33, h: 1.2,
  fontSize: 48, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center",
});
slide.addShape(pptx.ShapeType.rect, { x: 4.0, y: 3.8, w: 5.33, h: 0.06, fill: { color: ACCENT } });

// Tagline
slide.addShape(pptx.ShapeType.roundRect, {
  x: 2.0, y: 4.3, w: 9.33, h: 1.2, rectRadius: 0.15,
  fill: { color: ACCENT, transparency: 85 }, line: { color: ACCENT, width: 1.5 },
});
slide.addText("Record once.  Test forever.  No code required.", {
  x: 2.0, y: 4.3, w: 9.33, h: 1.2,
  fontSize: 22, fontFace: "Segoe UI", bold: true, color: WHITE, align: "center", valign: "middle",
});

slide.addText("A codeless, intelligent test automation system that turns any manual workflow\ninto a resilient, documented, and replayable regression test — in seconds.", {
  x: 1.5, y: 5.8, w: 10.33, h: 0.9,
  fontSize: 14, fontFace: "Segoe UI Light", color: LIGHT_GRAY, align: "center", lineSpacingMultiple: 1.4,
});

slide.addText("Questions?", {
  x: 0.5, y: 6.8, w: 12.33, h: 0.5,
  fontSize: 18, fontFace: "Segoe UI", color: MID_GRAY, align: "center",
});

// ── Save ──
const outputPath = path.join(__dirname, "docs", "Codeless-Test-Automation-Presentation.pptx");
pptx.writeFile({ fileName: outputPath })
  .then(() => console.log(`\n✅ Presentation saved: ${outputPath}`))
  .catch(err => console.error("Error:", err));
