/* Copyright 2026 - Gebruik vrij voor educatie mits expliciete naamsvermelding */
/* Auteur: Robbe Wulgaert / aiindeklas.be */
"use strict";

const LEGACY_DEFAULT_CODE = [
  "# Python in de Klas",
  "print('Hallo, wereld!')",
  "",
  "# Probeer ook interactieve input:",
  "# naam = input('Wat is je naam? ')",
  "# print('Welkom,', naam)",
].join("\n");
const DEFAULT_CODE = "";

const CATALOG_URL = "content/catalog.json";

const FALLBACK_CATALOG = {
  chapters: [
    {
      id: "fallback",
      title: "Sandbox",
      order: 1,
      subchapters: [
        {
          id: "fallback/sandbox",
          title: "Vrij oefenen",
          order: 1,
          exercises: [
            {
              id: "fallback/sandbox/oefening-1",
              title: "Sandbox",
              order: 1,
              type: "theory",
              evaluable: false,
              descriptionPath: null,
              testsPath: null,
              testsFormat: null,
              starterPath: null,
            },
          ],
        },
      ],
    },
  ],
};

const STORAGE = {
  code: "pik-code",
  theme: "pik-theme",
  attempts: "pik-attempts",
  workMs: "pik-work-ms",
  selection: "pik-selection",
  evalStatus: "pik-eval",
  starterVersion: "pik-starter-version",
  snapshotsPrefix: "pik-snapshots",
  snapshotsIndex: "pik-snapshots-index",
};

const APP_VERSION = "20260603-1";

function readBooleanQueryParam(name, fallback = false) {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null) {
    return fallback;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "ja", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "nee", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readContentCacheMode() {
  if (readBooleanQueryParam("freshContent", false)) {
    return "no-store";
  }
  const raw = new URLSearchParams(window.location.search).get("contentCache");
  const normalized = String(raw || "default").trim().toLowerCase();
  return ["default", "no-store", "reload", "no-cache", "force-cache"].includes(normalized)
    ? normalized
    : "default";
}

const CONTENT_FETCH_CACHE = readContentCacheMode();

const state = {
  editor: null,
  papyros: null,
  catalog: null,
  currentChapterIdx: 0,
  currentSubchapterIdx: 0,
  currentExerciseIdx: 0,
  running: false,
  inputPromptOpen: false,
  awaitingInput: false,
  pendingInputs: [],
  inputSwAvailable: false,
  inputSwIssue: "",
  inputChannelBroken: false,
  liveOutputTimer: null,
  toastTimer: null,
  timerRunning: false,
  timerLastStart: 0,
  assignmentRenderToken: 0,
  testsCache: {},
  expandedChapters: new Set(),
  expandedSubchapters: new Set(),
  currentInputPrompt: "",
  loadStats: null,
};

const PAPYROS_VERSION = "4.0.7";
const PAPYROS_MODULE_URL = `https://unpkg.com/@dodona/papyros@${PAPYROS_VERSION}/dist/frontend/state/Papyros.js?module`;
const PAPYROS_BACKEND_MANAGER_URL = `https://unpkg.com/@dodona/papyros@${PAPYROS_VERSION}/dist/communication/BackendManager.js?module`;
const PAPYROS_BACKEND_MANAGER_FALLBACK_URL = `https://cdn.jsdelivr.net/npm/@dodona/papyros@${PAPYROS_VERSION}/dist/communication/BackendManager.js/+esm`;
const SYNC_MESSAGE_MODULE_URL = "https://esm.sh/sync-message@0.0.12/es2022/sync-message.bundle.mjs";
const COMLINK_BRIDGE_MODULE_URL = "https://esm.sh/comlink@4.4.2/es2022/comlink.bundle.mjs";
const PYTHON_WORKER_FILENAME = "papyros-python-worker.js";
const JAVASCRIPT_WORKER_FILENAME = "papyros-javascript-worker.js";
let papyrosModulePromise = null;
const INPUT_SW_FILENAME = "input-sw.js";
const ENABLE_INPUT_SW_AUTODETECT = true;
const DEFAULT_RUNTIME_INPUT_PLACEHOLDER = "Typ een antwoord en druk Enter";
const INPUT_SW_AUTO_RELOAD_KEY = "pik-input-sw-auto-reload";

const ui = {};

function byId(id) {
  return document.getElementById(id);
}

function isLegacyPlaceholderCode(value) {
  if (typeof value !== "string") {
    return false;
  }
  return value.trim() === LEGACY_DEFAULT_CODE.trim();
}

function hasSectionPlaceholders(value) {
  if (typeof value !== "string") {
    return false;
  }
  return (
    value.includes("# Invoer") &&
    value.includes("# Verwerking") &&
    value.includes("# Uitvoer")
  );
}

function shouldRefreshStoredStarter(storedCode, starterCode, exercise) {
  if (!exercise || !exercise.starterPath || typeof storedCode !== "string") {
    return false;
  }
  if (!hasSectionPlaceholders(starterCode) || hasSectionPlaceholders(storedCode)) {
    return false;
  }

  const exerciseId = exercise.id || getCurrentExerciseId();
  const attempts = getStoredInt(toScopedStorageKey(STORAGE.attempts, exerciseId));
  const workMs = getStoredInt(toScopedStorageKey(STORAGE.workMs, exerciseId));
  if (attempts > 0 || workMs > 60_000) {
    return false;
  }

  return (
    storedCode.trim() === "" ||
    isLegacyPlaceholderCode(storedCode) ||
    String(exerciseId).startsWith("00-Hoofdstuk 1 - Gent als dataset/")
  );
}

function ensureNodeCompatGlobals() {
  const g = globalThis;

  if (typeof g.global === "undefined") {
    g.global = g;
  }

  if (typeof g.process === "undefined") {
    g.process = {
      env: {},
      argv: [],
      version: "",
      versions: {},
      browser: true,
      platform: "browser",
      cwd: () => "/",
      nextTick: (callback, ...args) => Promise.resolve().then(() => callback(...args)),
    };
  }
}

function cacheUiRefs() {
  ui.exerciseProgress = byId("exercise-progress");
  ui.menuChapters = byId("menu-chapters");
  ui.courseMenu = byId("course-menu");
  ui.menuTab = byId("menu-tab");
  ui.closeMenu = byId("close-menu");
  ui.helpModal = byId("help-modal");
  ui.helpBtn = byId("help-btn");
  ui.closeHelp = byId("close-help");
  ui.opdrachtTitel = byId("opdracht-titel");
  ui.opdrachtTekst = byId("opdracht-tekst");
  ui.codeEditor = byId("code-editor");
  ui.runtimeInput = byId("runtime-input");
  ui.runtimeInputSend = byId("runtime-input-send");
  ui.runtimeInputStatus = byId("runtime-input-status");
  ui.assignmentTitle = byId("assignment-title");
  ui.assignmentMarkdown = byId("assignment-markdown");
  ui.metrics = byId("metrics");
  ui.runtimeStatus = byId("runtime-status");
  ui.consoleOutput = byId("console-output");
  ui.richOutput = byId("rich-output");
  ui.runButton = byId("run-code");
  ui.resetProgress = byId("reset-progress");
  ui.exportPdf = byId("export-pdf");
  ui.toggleTheme = byId("toggle-theme");
  ui.toast = byId("toast");
  ui.askModal = byId("ask-modal");
  ui.askModalMsg = byId("ask-modal-msg");
  ui.askModalInput = byId("ask-modal-input");
  ui.askModalOk = byId("ask-modal-ok");
  ui.evalModal = byId("eval-modal");
  ui.evalModalTitle = byId("eval-modal-title");
  ui.evalModalPill = byId("eval-modal-pill");
  ui.evalModalSummary = byId("eval-modal-summary");
  ui.evalModalCases = byId("eval-modal-cases");
  ui.evalModalOk = byId("eval-modal-ok");
  ui.closeEvalModal = byId("close-eval-modal");
  ui.pdfModal = byId("pdf-modal");
  ui.closePdfModal = byId("close-pdf-modal");
  ui.pdfFirstName = byId("pdf-first-name");
  ui.pdfLastName = byId("pdf-last-name");
  ui.pdfClassName = byId("pdf-class-name");
  ui.pdfCancel = byId("pdf-cancel");
  ui.pdfConfirm = byId("pdf-confirm");
  ui.resetModal = byId("reset-modal");
  ui.resetCurrent = byId("reset-current");
  ui.resetAll = byId("reset-all");
  ui.resetCancel = byId("reset-cancel");
  ui.mainLayout = byId("main-layout");
  ui.editorPane = byId("editor-pane");
  ui.splitter = byId("splitter");
  ui.courseLoading = byId("course-loading");
  ui.courseLoadingMessage = byId("course-loading-message");
  ui.courseLoadingDetail = byId("course-loading-detail");
  ui.courseLoadingBar = byId("course-loading-bar");
}

function setLoadingStatus(message, detail = "", progress = null) {
  if (!ui.courseLoading) {
    return;
  }
  if (ui.courseLoadingMessage && message) {
    ui.courseLoadingMessage.textContent = message;
  }
  if (ui.courseLoadingDetail) {
    ui.courseLoadingDetail.textContent = detail;
  }
  if (ui.courseLoadingBar && Number.isFinite(progress)) {
    const clamped = Math.max(6, Math.min(100, progress));
    ui.courseLoadingBar.style.width = `${clamped}%`;
  }
}

function hideLoadingOverlay() {
  if (!ui.courseLoading) {
    return;
  }
  ui.courseLoading.classList.add("is-hidden");
  ui.courseLoading.setAttribute("aria-busy", "false");
}

function showLoadingError(message, detail = "") {
  if (!ui.courseLoading) {
    return;
  }
  ui.courseLoading.classList.add("has-error");
  ui.courseLoading.classList.remove("is-hidden");
  ui.courseLoading.setAttribute("aria-busy", "false");
  setLoadingStatus(message, detail, 100);
}

function showFileProtocolError() {
  const detail = [
    "Je opent Parnassos nu als lokaal bestand.",
    "De browser blokkeert dan catalogi, workerbestanden en Pythonmodules.",
    "Start een lokale server in de map parnassos en open daarna:",
    "http://127.0.0.1:8000/platform.html",
  ].join("\n");

  showLoadingError("Open Parnassos via localhost.", detail);
  if (ui.consoleOutput) {
    ui.consoleOutput.textContent = detail;
  }
  setRuntimeStatus("Open via localhost", "error");
}

function isFileProtocol() {
  return (
    typeof window !== "undefined" &&
    window.location &&
    window.location.protocol === "file:"
  );
}

function getCatalog() {
  return state.catalog || FALLBACK_CATALOG;
}

function getCurrentChapter() {
  const catalog = getCatalog();
  return (catalog.chapters && catalog.chapters[state.currentChapterIdx]) || null;
}

function getCurrentSubchapter() {
  const chapter = getCurrentChapter();
  if (!chapter || !Array.isArray(chapter.subchapters)) {
    return null;
  }
  return chapter.subchapters[state.currentSubchapterIdx] || null;
}

function getCurrentExercise() {
  const subchapter = getCurrentSubchapter();
  if (!subchapter || !Array.isArray(subchapter.exercises)) {
    return null;
  }
  return subchapter.exercises[state.currentExerciseIdx] || null;
}

function getCurrentExerciseId() {
  const exercise = getCurrentExercise();
  return exercise && exercise.id ? exercise.id : "fallback/sandbox/oefening-1";
}

function toScopedStorageKey(baseKey, scopeId = getCurrentExerciseId()) {
  return `${baseKey}:${scopeId}`;
}

function getEvalStorageKey(exerciseId) {
  return `${STORAGE.evalStatus}:${exerciseId}`;
}

function getExerciseEvalStatus(exerciseId) {
  if (!exerciseId) {
    return null;
  }
  return localStorage.getItem(getEvalStorageKey(exerciseId));
}

function setExerciseEvalStatus(exerciseId, status) {
  if (!exerciseId) {
    return;
  }
  const key = getEvalStorageKey(exerciseId);
  if (status === "success" || status === "fail") {
    localStorage.setItem(key, status);
    return;
  }
  localStorage.removeItem(key);
}

function getStoredInt(key) {
  const raw = localStorage.getItem(key);
  const parsed = Number.parseInt(raw || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setStoredInt(key, value) {
  localStorage.setItem(key, String(value));
}

function getAttempts() {
  return getStoredInt(toScopedStorageKey(STORAGE.attempts));
}

function setAttempts(value) {
  setStoredInt(toScopedStorageKey(STORAGE.attempts), value);
}

function incrementAttempts() {
  const next = getAttempts() + 1;
  setAttempts(next);
  return next;
}

function getWorkMs() {
  return getStoredInt(toScopedStorageKey(STORAGE.workMs));
}

function setWorkMs(value) {
  setStoredInt(toScopedStorageKey(STORAGE.workMs), value);
}

function addWorkMs(delta) {
  setWorkMs(getWorkMs() + Math.max(0, delta));
}

function dateKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseJsonSafe(rawValue, fallbackValue) {
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallbackValue;
  }
}

function getSnapshotIndexKeys() {
  const raw = localStorage.getItem(STORAGE.snapshotsIndex);
  const parsed = parseJsonSafe(raw || "[]", []);
  return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
}

function writeSnapshotIndexKeys(keys) {
  localStorage.setItem(STORAGE.snapshotsIndex, JSON.stringify(keys));
}

function touchSnapshotIndexKey(key) {
  const keys = getSnapshotIndexKeys().filter((entry) => entry !== key);
  keys.push(key);
  writeSnapshotIndexKeys(keys);
}

function makeSnapshotStorageKey(exerciseId, status, dateKey = dateKeyLocal()) {
  const safeExerciseId = encodeURIComponent(String(exerciseId || "unknown"));
  return `${STORAGE.snapshotsPrefix}:${dateKey}:${safeExerciseId}:${status}:latest`;
}

function summarizeEvaluationResult(evalResult) {
  if (!evalResult || typeof evalResult !== "object") {
    return "";
  }
  if (evalResult.errorMessage && (!Number.isFinite(evalResult.total) || evalResult.total === 0)) {
    return String(evalResult.errorMessage);
  }
  if (Number.isFinite(evalResult.total) && Number.isFinite(evalResult.passedCount)) {
    const total = evalResult.total;
    const passed = evalResult.passedCount;
    const failed = Number.isFinite(evalResult.failedCount)
      ? evalResult.failedCount
      : Math.max(0, total - passed);
    return `${passed}/${total} geslaagd, ${failed} mislukt`;
  }
  if (evalResult.errorMessage) {
    return String(evalResult.errorMessage);
  }
  return "";
}

function getCurrentAssignmentPlainText() {
  if (!ui.assignmentMarkdown) {
    return "";
  }
  return String(ui.assignmentMarkdown.textContent || "").trim();
}

function saveLatestExerciseSnapshot(status, options = {}) {
  if (status !== "success" && status !== "fail") {
    return { ok: false, reason: "invalid-status" };
  }

  const exercise = getCurrentExercise();
  if (!exercise || !exercise.id) {
    return { ok: false, reason: "no-exercise" };
  }

  const chapter = getCurrentChapter();
  const subchapter = getCurrentSubchapter();
  const dateKey = dateKeyLocal(new Date());
  const storageKey = makeSnapshotStorageKey(exercise.id, status, dateKey);
  const evalResult = options.evalResult || null;
  const evalSummary = options.evalSummary || summarizeEvaluationResult(evalResult);

  const record = {
    version: 1,
    savedAt: new Date().toISOString(),
    dateKey,
    chapterIdx: state.currentChapterIdx,
    subchapterIdx: state.currentSubchapterIdx,
    exerciseIdx: state.currentExerciseIdx,
    chapterId: chapter && chapter.id ? chapter.id : "",
    chapterTitle: chapter && chapter.title ? chapter.title : "",
    subchapterId: subchapter && subchapter.id ? subchapter.id : "",
    subchapterTitle: subchapter && subchapter.title ? subchapter.title : "",
    exerciseId: exercise.id,
    exerciseTitle: exercise.title || decodeTitleFromId(exercise.id),
    assignmentTitle: ui.assignmentTitle ? String(ui.assignmentTitle.textContent || "").trim() : "",
    assignmentText: getCurrentAssignmentPlainText(),
    code: state.editor ? state.editor.getValue() : "",
    output: ui.consoleOutput ? String(ui.consoleOutput.textContent || "") : "",
    evalStatus: status,
    evalSummary,
    evalInfo: evalResult,
    attempts: getAttempts(),
    workMs: getWorkMs(),
    pageUrl: window.location.href,
    userAgent: navigator.userAgent || "",
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(record));
    touchSnapshotIndexKey(storageKey);
    return { ok: true, key: storageKey };
  } catch {
    return { ok: false, reason: "quota" };
  }
}

function getSavedSnapshotsForDate(dateKey = dateKeyLocal(new Date())) {
  const prefix = `${STORAGE.snapshotsPrefix}:${dateKey}:`;
  const keys = getSnapshotIndexKeys();
  const pickedByExercise = new Map();

  keys.forEach((key) => {
    if (!key.startsWith(prefix)) {
      return;
    }

    const rawRecord = localStorage.getItem(key);
    if (!rawRecord) {
      return;
    }

    const record = parseJsonSafe(rawRecord, null);
    if (!record || typeof record !== "object" || !record.exerciseId) {
      return;
    }

    const existing = pickedByExercise.get(record.exerciseId);
    if (!existing) {
      pickedByExercise.set(record.exerciseId, record);
      return;
    }

    if (existing.evalStatus !== "success" && record.evalStatus === "success") {
      pickedByExercise.set(record.exerciseId, record);
      return;
    }

    if (existing.evalStatus === record.evalStatus) {
      const existingStamp = String(existing.savedAt || "");
      const incomingStamp = String(record.savedAt || "");
      if (incomingStamp > existingStamp) {
        pickedByExercise.set(record.exerciseId, record);
      }
    }
  });

  const records = Array.from(pickedByExercise.values());
  records.sort((a, b) => {
    if ((a.chapterIdx || 0) !== (b.chapterIdx || 0)) {
      return (a.chapterIdx || 0) - (b.chapterIdx || 0);
    }
    if ((a.subchapterIdx || 0) !== (b.subchapterIdx || 0)) {
      return (a.subchapterIdx || 0) - (b.subchapterIdx || 0);
    }
    if ((a.exerciseIdx || 0) !== (b.exerciseIdx || 0)) {
      return (a.exerciseIdx || 0) - (b.exerciseIdx || 0);
    }
    return String(a.savedAt || "").localeCompare(String(b.savedAt || ""));
  });

  return records;
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(sec / 60);
  const rest = sec % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function updateMetrics() {
  const base = getWorkMs();
  const live = state.timerRunning ? Date.now() - state.timerLastStart : 0;
  ui.metrics.textContent = `Pogingen: ${getAttempts()} | Tijd: ${formatDuration(base + live)}`;
}

function startWorkTimer() {
  if (state.timerRunning) {
    return;
  }
  state.timerRunning = true;
  state.timerLastStart = Date.now();
}

function stopWorkTimer() {
  if (!state.timerRunning) {
    return;
  }
  addWorkMs(Date.now() - state.timerLastStart);
  state.timerRunning = false;
  state.timerLastStart = 0;
}

function resetWorkTimer() {
  state.timerRunning = false;
  state.timerLastStart = 0;
  setWorkMs(0);
}

function showToast(message, ok = true) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `toast ${ok ? "ok" : "error"}`;
  state.toastTimer = setTimeout(() => {
    ui.toast.className = "toast";
  }, 3800);
}

function setRuntimeStatus(text, tone = "idle") {
  ui.runtimeStatus.textContent = text;
  ui.runtimeStatus.className = `status-pill ${tone}`;
}

function setRuntimeInputStatus(text, tone = "idle") {
  if (!ui.runtimeInputStatus) {
    return;
  }
  ui.runtimeInputStatus.textContent = text;
  ui.runtimeInputStatus.className = `runtime-input-status ${tone}`;
}

function setRuntimeInputPlaceholder(text) {
  if (!ui.runtimeInput) {
    return;
  }
  const trimmed = String(text || "").trim();
  ui.runtimeInput.placeholder = trimmed || DEFAULT_RUNTIME_INPUT_PLACEHOLDER;
}

function setRuntimeInputControlsDisabled(disabled) {
  const isDisabled = Boolean(disabled);
  if (ui.runtimeInput) {
    ui.runtimeInput.disabled = isDisabled;
  }
  if (ui.runtimeInputSend) {
    ui.runtimeInputSend.disabled = isDisabled;
  }
}

function isInputChannelTransportError(rawMessage) {
  const message = String(rawMessage || "").toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes("__syncmessageserviceworkerinput__/write") ||
    (message.includes("received status") && message.includes("service worker")) ||
    message.includes("unsupported method ('post')")
  );
}

function markInputChannelBroken(error) {
  const raw = formatErrorDetails(error) || String(error || "Onbekende fout");
  const detail = translateRuntimeError(raw);

  state.inputChannelBroken = true;
  state.awaitingInput = false;
  state.currentInputPrompt = "";
  setRuntimeInputControlsDisabled(true);
  setRuntimeStatus("Inputkanaal fout", "error");

  const statusText = isInputChannelTransportError(raw)
    ? "Invoerkanaal niet beschikbaar. Herlaad de pagina (Ctrl+Shift+R)."
    : `Invoerfout: ${detail}`;
  setRuntimeInputStatus(statusText, "error");
  setRuntimeInputPlaceholder("");

  showToast("Invoer kon niet doorgestuurd worden. Herlaad de pagina.", false);
  console.error("Input channel error:", error);
}

function provideRuntimeInputSafely(io, value) {
  if (!io || typeof io.provideInput !== "function") {
    return Promise.reject(new Error("Invoerkanaal niet beschikbaar."));
  }
  try {
    return Promise.resolve(io.provideInput(value));
  } catch (error) {
    return Promise.reject(error);
  }
}

function extractPromptTextCandidate(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return "";
  }

  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return "";
  }

  return lines[lines.length - 1];
}

function extractInputPromptText(io) {
  const directCandidates = [
    io && io.inputPrompt,
    io && io.prompt,
    io && io.lastPrompt,
    io && io.lastInputPrompt,
    io && io.question,
    io && io.awaitingInputPrompt,
    state.papyros && state.papyros.runner && state.papyros.runner.inputPrompt,
  ];

  for (const candidate of directCandidates) {
    const text = extractPromptTextCandidate(candidate);
    if (text) {
      return text;
    }
  }

  const outputEntries = getPapyrosOutputEntries();
  for (let index = outputEntries.length - 1; index >= 0; index -= 1) {
    const entry = outputEntries[index];
    if (typeof entry === "string") {
      const text = extractPromptTextCandidate(entry);
      if (text) {
        return text;
      }
      continue;
    }

    if (!entry || typeof entry !== "object") {
      continue;
    }

    const type = String(entry.type || entry.channel || "").toLowerCase();
    if (type.includes("image")) {
      continue;
    }

    const content = entry.content ?? entry.text ?? entry.message ?? entry.value;
    const text = extractPromptTextCandidate(content);
    if (text) {
      return text;
    }
  }

  return "";
}

function refreshRuntimeInputStatus() {
  if (state.inputChannelBroken) {
    setRuntimeInputPlaceholder("");
    setRuntimeInputStatus("Invoerkanaal niet beschikbaar. Herlaad de pagina (Ctrl+Shift+R).", "error");
    return;
  }

  if (state.awaitingInput) {
    const prompt = String(state.currentInputPrompt || "").trim();
    setRuntimeInputPlaceholder(prompt);
    if (prompt) {
      setRuntimeInputStatus(`Programma wacht op invoer: ${prompt}`, "waiting");
    } else {
      setRuntimeInputStatus("Programma wacht op invoer. Vul hierboven een antwoord in.", "waiting");
    }
    return;
  }

  setRuntimeInputPlaceholder("");
  if (state.pendingInputs.length > 0) {
    setRuntimeInputStatus(`Invoer in wachtrij: ${state.pendingInputs.length}`, "queued");
    return;
  }
  setRuntimeInputStatus("Geen open input-vraag.", "idle");
}

async function submitRuntimeInputValue() {
  if (!ui.runtimeInput) {
    return;
  }

  if (state.inputChannelBroken) {
    setRuntimeInputStatus("Invoerkanaal niet beschikbaar. Herlaad de pagina (Ctrl+Shift+R).", "error");
    return;
  }

  const value = ui.runtimeInput.value;
  ui.runtimeInput.value = "";

  const io = state.papyros && state.papyros.io;
  if (state.awaitingInput && io && typeof io.provideInput === "function") {
    try {
      await provideRuntimeInputSafely(io, value);
      state.awaitingInput = false;
      state.currentInputPrompt = "";
      setRuntimeInputPlaceholder("");
      setRuntimeInputStatus("Invoer verzonden naar programma.", "sent");
      renderLiveOutputFromPapyros();
    } catch (error) {
      ui.runtimeInput.value = value;
      markInputChannelBroken(error);
    }
    return;
  }

  state.pendingInputs.push(value);
  setRuntimeInputStatus(`Invoer in wachtrij: ${state.pendingInputs.length}`, "queued");
  renderLiveOutputFromPapyros();
}

function decodeTitleFromId(id) {
  const raw = String(id || "")
    .split("/")
    .pop()
    .replace(/^\d+[\s\-_]+/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return raw || "Oefening";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolvePossiblyRelativeUrl(rawUrl, basePath) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return value;
  }
  if (
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)
  ) {
    return value;
  }

  try {
    const base = new URL(basePath || window.location.href, window.location.href);
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

function getYouTubeEmbedUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl, window.location.href);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (host.endsWith("youtube.com")) {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      const id = parsed.pathname.split("/")[2];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.pathname.startsWith("/embed/")) {
      return parsed.href;
    }
  }

  if (host.endsWith("youtube-nocookie.com") && parsed.pathname.startsWith("/embed/")) {
    return parsed.href;
  }

  return null;
}

function preprocessCourseMarkdown(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const cleaned = lines
    .map((line) => line.replace(/(?:\s*\{:\s*[^}]*\}\s*)+$/g, ""))
    .filter((line) => {
    const trimmed = line.trim();
    // Kramdown attribute list syntax, e.g. {: .callout.callout-info}
    if (/^\{\:\s*[^}]*\}\s*$/.test(trimmed)) {
      return false;
    }
    return true;
  });
  return cleaned.join("\n");
}

function markdownToRenderedHtml(markdown) {
  const source = preprocessCourseMarkdown(markdown);

  // Preferred path: render markdown + sanitize.
  if (
    window.marked &&
    typeof window.marked.parse === "function" &&
    window.DOMPurify &&
    typeof window.DOMPurify.sanitize === "function"
  ) {
    const rawHtml = window.marked.parse(source, {
      gfm: true,
      breaks: true,
      mangle: false,
      headerIds: false,
    });
    return window.DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: [
        "allow",
        "allowfullscreen",
        "frameborder",
        "scrolling",
        "loading",
        "referrerpolicy",
      ],
    });
  }

  // Safe fallback if one of the libs is unavailable.
  return `<pre>${escapeHtml(source)}</pre>`;
}

function enhanceRenderedAssignmentMedia(container, basePath) {
  if (!container) {
    return;
  }

  container.querySelectorAll("[src]").forEach((node) => {
    const src = node.getAttribute("src");
    if (!src) {
      return;
    }
    node.setAttribute("src", resolvePossiblyRelativeUrl(src, basePath));
  });

  container.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) {
      return;
    }
    const absoluteHref = resolvePossiblyRelativeUrl(href, basePath);
    anchor.setAttribute("href", absoluteHref);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });

  container.querySelectorAll("img").forEach((img) => {
    img.classList.add("assignment-media-image");
    if (!img.getAttribute("loading")) {
      img.setAttribute("loading", "lazy");
    }
    if (!img.getAttribute("decoding")) {
      img.setAttribute("decoding", "async");
    }
  });

  container.querySelectorAll("iframe").forEach((iframe) => {
    const src = iframe.getAttribute("src") || "";
    const embed = getYouTubeEmbedUrl(src);
    if (!embed) {
      const link = document.createElement("a");
      link.href = src;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Externe media openen";
      iframe.replaceWith(link);
      return;
    }

    iframe.classList.add("assignment-media-iframe");
    iframe.setAttribute("src", embed);
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  });

  container.querySelectorAll("a[href]").forEach((anchor) => {
    if (anchor.closest("pre, code")) {
      return;
    }

    const href = anchor.getAttribute("href") || "";
    const embed = getYouTubeEmbedUrl(href);
    if (!embed) {
      return;
    }

    const figure = document.createElement("div");
    figure.className = "assignment-media-embed";

    const iframe = document.createElement("iframe");
    iframe.className = "assignment-media-iframe";
    iframe.src = embed;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("allowfullscreen", "");

    const link = document.createElement("a");
    link.className = "assignment-media-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open video in nieuw tabblad";

    figure.appendChild(iframe);
    figure.appendChild(link);

    const parent = anchor.parentElement;
    const canReplaceParent =
      parent &&
      parent.tagName === "P" &&
      parent.textContent &&
      parent.textContent.trim() === anchor.textContent.trim();

    if (canReplaceParent) {
      parent.replaceWith(figure);
    } else {
      anchor.replaceWith(figure);
    }
  });
}

function renderAssignmentMarkdown(markdown, basePath = null) {
  if (!ui.assignmentMarkdown) {
    return;
  }
  ui.assignmentMarkdown.innerHTML = markdownToRenderedHtml(markdown);
  enhanceRenderedAssignmentMedia(ui.assignmentMarkdown, basePath);
}

async function fetchTextFile(relativePath) {
  if (!relativePath) {
    return null;
  }
  const url = new URL(relativePath, window.location.href);
  url.searchParams.set("v", APP_VERSION);
  const response = await fetch(url.href, { cache: CONTENT_FETCH_CACHE });
  if (!response.ok) {
    return null;
  }
  return response.text();
}

async function resolveStarterCode(exercise) {
  if (!exercise || !exercise.starterPath) {
    return DEFAULT_CODE;
  }
  try {
    const text = await fetchTextFile(exercise.starterPath);
    return text && text.trim().length > 0 ? text : DEFAULT_CODE;
  } catch {
    return DEFAULT_CODE;
  }
}

async function renderAssignmentInfo() {
  const chapter = getCurrentChapter();
  const subchapter = getCurrentSubchapter();
  const exercise = getCurrentExercise();
  const renderToken = ++state.assignmentRenderToken;

  if (!exercise) {
    if (ui.assignmentTitle) {
      ui.assignmentTitle.textContent = "Geen oefening gevonden";
    }
    renderAssignmentMarkdown(
      "# Geen oefening gevonden\n\nControleer `content/catalog.json` en je folderstructuur."
    );
    return;
  }

  const chapterTitle = chapter ? chapter.title : "Python";
  const exerciseTitle = exercise.title || decodeTitleFromId(exercise.id);

  if (ui.opdrachtTitel) {
    ui.opdrachtTitel.textContent = chapterTitle;
  }
  if (ui.opdrachtTekst) {
    ui.opdrachtTekst.textContent = exerciseTitle;
  }
  if (ui.assignmentTitle) {
    ui.assignmentTitle.textContent = exerciseTitle;
  }

  let markdown = null;
  try {
    markdown = await fetchTextFile(exercise.descriptionPath);
  } catch {
    markdown = null;
  }

  if (renderToken !== state.assignmentRenderToken) {
    return;
  }

  const fallbackMarkdown = [
    "# Beschrijving niet gevonden",
    "",
    `ID: ${exercise.id || "onbekend"}`,
    "",
    "Verwacht bestand:",
    "- description/description.nl.md",
    "- of description/description.md",
  ].join("\n");

  renderAssignmentMarkdown(
    markdown && markdown.trim().length > 0 ? markdown.trim() : fallbackMarkdown,
    exercise.descriptionPath
  );
}

function clearOutputPanels() {
  ui.consoleOutput.textContent = "";
  if (ui.richOutput) {
    ui.richOutput.innerHTML = "";
    ui.richOutput.hidden = true;
  }
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.body.classList.toggle("dark", isDark);
  localStorage.setItem(STORAGE.theme, isDark ? "dark" : "light");
}

function toggleTheme() {
  const current = localStorage.getItem(STORAGE.theme) || "light";
  setTheme(current === "dark" ? "light" : "dark");
}

function restoreTheme() {
  const stored = localStorage.getItem(STORAGE.theme);
  if (stored === "dark" || stored === "light") {
    setTheme(stored);
    return;
  }
  setTheme("light");
}

function persistSelection() {
  const chapter = getCurrentChapter();
  const subchapter = getCurrentSubchapter();
  const exercise = getCurrentExercise();

  if (!chapter || !subchapter || !exercise) {
    return;
  }

  localStorage.setItem(
    STORAGE.selection,
    JSON.stringify({
      chapterId: chapter.id,
      subchapterId: subchapter.id,
      exerciseId: exercise.id,
    })
  );
}

function restoreSelectionFromStorage() {
  const catalog = getCatalog();
  if (!catalog || !Array.isArray(catalog.chapters) || catalog.chapters.length === 0) {
    state.currentChapterIdx = 0;
    state.currentSubchapterIdx = 0;
    state.currentExerciseIdx = 0;
    return;
  }

  const fallbackSelection = {
    chapter: 0,
    subchapter: 0,
    exercise: 0,
  };

  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE.selection) || "null");
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.chapterId || !parsed.subchapterId || !parsed.exerciseId) {
    state.currentChapterIdx = fallbackSelection.chapter;
    state.currentSubchapterIdx = fallbackSelection.subchapter;
    state.currentExerciseIdx = fallbackSelection.exercise;
    return;
  }

  const chapterIdx = catalog.chapters.findIndex((chapter) => chapter.id === parsed.chapterId);
  if (chapterIdx < 0) {
    state.currentChapterIdx = fallbackSelection.chapter;
    state.currentSubchapterIdx = fallbackSelection.subchapter;
    state.currentExerciseIdx = fallbackSelection.exercise;
    return;
  }

  const chapter = catalog.chapters[chapterIdx];
  const subchapterIdx = (chapter.subchapters || []).findIndex(
    (subchapter) => subchapter.id === parsed.subchapterId
  );
  if (subchapterIdx < 0) {
    state.currentChapterIdx = chapterIdx;
    state.currentSubchapterIdx = 0;
    state.currentExerciseIdx = 0;
    return;
  }

  const subchapter = chapter.subchapters[subchapterIdx];
  const exerciseIdx = (subchapter.exercises || []).findIndex(
    (exercise) => exercise.id === parsed.exerciseId
  );

  state.currentChapterIdx = chapterIdx;
  state.currentSubchapterIdx = subchapterIdx;
  state.currentExerciseIdx = exerciseIdx >= 0 ? exerciseIdx : 0;
}

function chapterAccordionKey(chapterIdx) {
  return `chapter:${chapterIdx}`;
}

function subchapterAccordionKey(chapterIdx, subchapterIdx) {
  return `chapter:${chapterIdx}:subchapter:${subchapterIdx}`;
}

function initializeMenuAccordionState() {
  state.expandedChapters.clear();
  state.expandedSubchapters.clear();
  state.expandedChapters.add(chapterAccordionKey(state.currentChapterIdx));
  state.expandedSubchapters.add(
    subchapterAccordionKey(state.currentChapterIdx, state.currentSubchapterIdx)
  );
}

function ensureMenuAccordionForCurrentSelection() {
  state.expandedChapters.add(chapterAccordionKey(state.currentChapterIdx));
  state.expandedSubchapters.add(
    subchapterAccordionKey(state.currentChapterIdx, state.currentSubchapterIdx)
  );
}

function isChapterExpanded(chapterIdx) {
  return state.expandedChapters.has(chapterAccordionKey(chapterIdx));
}

function isSubchapterExpanded(chapterIdx, subchapterIdx) {
  return state.expandedSubchapters.has(subchapterAccordionKey(chapterIdx, subchapterIdx));
}

function toggleChapterAccordion(chapterIdx) {
  const chapterKey = chapterAccordionKey(chapterIdx);
  if (state.expandedChapters.has(chapterKey)) {
    state.expandedChapters.delete(chapterKey);
    const prefix = `${chapterKey}:subchapter:`;
    for (const key of Array.from(state.expandedSubchapters)) {
      if (key.startsWith(prefix)) {
        state.expandedSubchapters.delete(key);
      }
    }
  } else {
    state.expandedChapters.add(chapterKey);
  }
  renderChapterMenu();
}

async function handleSubchapterAccordionClick(chapterIdx, subchapterIdx) {
  const chapterKey = chapterAccordionKey(chapterIdx);
  const subchapterKey = subchapterAccordionKey(chapterIdx, subchapterIdx);
  const isExpanded = state.expandedSubchapters.has(subchapterKey);
  const isCurrent =
    chapterIdx === state.currentChapterIdx &&
    subchapterIdx === state.currentSubchapterIdx;

  if (!isExpanded) {
    state.expandedChapters.add(chapterKey);
    state.expandedSubchapters.add(subchapterKey);
    await switchSubchapter(chapterIdx, subchapterIdx);
    return;
  }

  if (!isCurrent) {
    await switchSubchapter(chapterIdx, subchapterIdx);
    return;
  }

  state.expandedSubchapters.delete(subchapterKey);
  renderChapterMenu();
}

function renderProgress() {
  const subchapter = getCurrentSubchapter();
  ui.exerciseProgress.innerHTML = "";
  if (!subchapter || !Array.isArray(subchapter.exercises)) {
    return;
  }

  subchapter.exercises.forEach((exercise, index) => {
    const button = document.createElement("button");
    button.className = `exercise-btn${index === state.currentExerciseIdx ? " current" : ""}`;
    if (exercise.type === "theory") {
      button.classList.add("theory");
    }
    const evalStatus = getExerciseEvalStatus(exercise.id);
    if (evalStatus === "success") {
      button.classList.add("is-success");
    } else if (evalStatus === "fail") {
      button.classList.add("is-fail");
    }
    button.type = "button";
    button.textContent = String(index + 1);
    button.title =
      (exercise.type === "theory" ? "[Theorie] " : "") +
      (exercise.title || decodeTitleFromId(exercise.id));
    button.addEventListener("click", () => {
      if (index === state.currentExerciseIdx) {
        return;
      }
      switchExercise(index);
    });
    ui.exerciseProgress.appendChild(button);
  });
}

function renderChapterMenu() {
  const catalog = getCatalog();
  ui.menuChapters.innerHTML = "";

  (catalog.chapters || []).forEach((chapter, chapterIndex) => {
    const chapterGroup = document.createElement("li");
    chapterGroup.className = "menu-chapter-group";

    const chapterToggle = document.createElement("button");
    const chapterExpanded = isChapterExpanded(chapterIndex);
    chapterToggle.type = "button";
    chapterToggle.className = "menu-accordion-btn menu-chapter-toggle";
    chapterToggle.setAttribute("aria-expanded", String(chapterExpanded));
    chapterToggle.innerHTML = [
      `<span class="menu-toggle-symbol">${chapterExpanded ? "−" : "+"}</span>`,
      `<span class="menu-toggle-label">${chapter.title}</span>`,
    ].join("");
    chapterToggle.addEventListener("click", () => {
      toggleChapterAccordion(chapterIndex);
    });
    chapterGroup.appendChild(chapterToggle);

    if (chapterExpanded) {
      const subchapterList = document.createElement("ul");
      subchapterList.className = "menu-subchapter-list";

      (chapter.subchapters || []).forEach((subchapter, subchapterIndex) => {
        const subchapterGroup = document.createElement("li");
        subchapterGroup.className = "menu-subchapter-group";

        const isActiveSubchapter =
          chapterIndex === state.currentChapterIdx &&
          subchapterIndex === state.currentSubchapterIdx;
        const subchapterExpanded = isSubchapterExpanded(chapterIndex, subchapterIndex);
        const exerciseCount = (subchapter.exercises || []).length;

        const subchapterToggle = document.createElement("button");
        subchapterToggle.type = "button";
        subchapterToggle.className =
          `menu-accordion-btn menu-subchapter-toggle${isActiveSubchapter ? " active" : ""}`;
        subchapterToggle.setAttribute("aria-expanded", String(subchapterExpanded));
        subchapterToggle.innerHTML = [
          `<span class="menu-toggle-symbol">${subchapterExpanded ? "−" : "+"}</span>`,
          `<span class="menu-toggle-label">${subchapter.title}</span>`,
          `<span class="menu-toggle-count">${exerciseCount}</span>`,
        ].join("");
        subchapterToggle.addEventListener("click", () => {
          void handleSubchapterAccordionClick(chapterIndex, subchapterIndex);
        });
        subchapterGroup.appendChild(subchapterToggle);

        if (subchapterExpanded) {
          const exerciseList = document.createElement("ul");
          exerciseList.className = "menu-exercise-list";

          (subchapter.exercises || []).forEach((exercise, exerciseIndex) => {
            const exerciseItem = document.createElement("li");
            const exerciseButton = document.createElement("button");
            const isActiveExercise =
              isActiveSubchapter && exerciseIndex === state.currentExerciseIdx;

            exerciseButton.type = "button";
            exerciseButton.className = `menu-exercise-item${isActiveExercise ? " active" : ""}`;

            if (exercise.type === "theory") {
              exerciseButton.classList.add("theory");
            }

            const evalStatus = getExerciseEvalStatus(exercise.id);
            if (evalStatus === "success") {
              exerciseButton.classList.add("is-success");
            } else if (evalStatus === "fail") {
              exerciseButton.classList.add("is-fail");
            }

            exerciseButton.textContent =
              `${exerciseIndex + 1}. ` + (exercise.title || decodeTitleFromId(exercise.id));

            exerciseButton.addEventListener("click", () => {
              void activateSelection({
                chapterIdx: chapterIndex,
                subchapterIdx: subchapterIndex,
                exerciseIdx: exerciseIndex,
              });
            });

            exerciseItem.appendChild(exerciseButton);
            exerciseList.appendChild(exerciseItem);
          });

          subchapterGroup.appendChild(exerciseList);
        }

        subchapterList.appendChild(subchapterGroup);
      });

      chapterGroup.appendChild(subchapterList);
    }

    ui.menuChapters.appendChild(chapterGroup);
  });
}

function normalizeCatalog(rawCatalog) {
  const chapters = Array.isArray(rawCatalog && rawCatalog.chapters) ? rawCatalog.chapters : [];

  const normalizedChapters = chapters
    .map((chapter, chapterIndex) => {
      const subchapters = Array.isArray(chapter && chapter.subchapters) ? chapter.subchapters : [];
      const normalizedSubchapters = subchapters
        .map((subchapter, subchapterIndex) => {
          const exercises = Array.isArray(subchapter && subchapter.exercises)
            ? subchapter.exercises
            : [];
          const normalizedExercises = exercises
            .map((exercise, exerciseIndex) => {
              const fallbackId = `chapter-${chapterIndex + 1}/subchapter-${subchapterIndex + 1}/exercise-${exerciseIndex + 1}`;
              const id = exercise && exercise.id ? exercise.id : fallbackId;
              const evaluable = Boolean(
                exercise &&
                  (exercise.evaluable === true ||
                    (typeof exercise.testsPath === "string" && exercise.testsPath.length > 0))
              );
              return {
                id,
                title: (exercise && exercise.title) || decodeTitleFromId(id),
                order:
                  exercise && Number.isFinite(Number(exercise.order))
                    ? Number(exercise.order)
                    : exerciseIndex + 1,
                type: exercise && exercise.type === "theory" ? "theory" : evaluable ? "exercise" : "theory",
                evaluable,
                path: (exercise && exercise.path) || null,
                descriptionPath: (exercise && exercise.descriptionPath) || null,
                testsPath: (exercise && exercise.testsPath) || null,
                testsFormat: (exercise && exercise.testsFormat) || null,
                starterPath: (exercise && exercise.starterPath) || null,
              };
            })
            .filter(Boolean);

          if (normalizedExercises.length === 0) {
            return null;
          }

          return {
            id:
              (subchapter && subchapter.id) ||
              `chapter-${chapterIndex + 1}/subchapter-${subchapterIndex + 1}`,
            title: (subchapter && subchapter.title) || `Subhoofdstuk ${subchapterIndex + 1}`,
            order:
              subchapter && Number.isFinite(Number(subchapter.order))
                ? Number(subchapter.order)
                : subchapterIndex + 1,
            path: (subchapter && subchapter.path) || null,
            exercises: normalizedExercises,
          };
        })
        .filter(Boolean);

      if (normalizedSubchapters.length === 0) {
        return null;
      }

      return {
        id: (chapter && chapter.id) || `chapter-${chapterIndex + 1}`,
        title: (chapter && chapter.title) || `Hoofdstuk ${chapterIndex + 1}`,
        order:
          chapter && Number.isFinite(Number(chapter.order))
            ? Number(chapter.order)
            : chapterIndex + 1,
        path: (chapter && chapter.path) || null,
        subchapters: normalizedSubchapters,
      };
    })
    .filter(Boolean);

  if (normalizedChapters.length === 0) {
    return FALLBACK_CATALOG;
  }

  return {
    ...rawCatalog,
    chapters: normalizedChapters,
  };
}

async function loadCatalog() {
  try {
    const startedAt = performance.now();
    setLoadingStatus("Catalogus laden.", CATALOG_URL, 12);
    const url = new URL(CATALOG_URL, window.location.href);
    url.searchParams.set("v", APP_VERSION);
    const response = await fetch(url.href, { cache: CONTENT_FETCH_CACHE });
    if (!response.ok) {
      throw new Error(`Catalog kon niet geladen worden (${response.status}).`);
    }
    const rawCatalog = await response.json();
    state.catalog = normalizeCatalog(rawCatalog);
    const totals = state.catalog && state.catalog.totals ? state.catalog.totals : {};
    state.loadStats = {
      cache: CONTENT_FETCH_CACHE,
      chapterCount: Array.isArray(state.catalog.chapters) ? state.catalog.chapters.length : 0,
      exerciseCount: Number(totals.exercises) || 0,
      evaluableExerciseCount: Number(totals.evaluableExercises) || 0,
      durationMs: Math.round(performance.now() - startedAt),
    };
    setLoadingStatus(
      "Catalogus geladen.",
      `${state.loadStats.exerciseCount || "?"} oefeningen gevonden`,
      32
    );
  } catch (error) {
    state.catalog = FALLBACK_CATALOG;
    state.loadStats = {
      cache: CONTENT_FETCH_CACHE,
      chapterCount: 1,
      exerciseCount: 1,
      evaluableExerciseCount: 0,
      durationMs: 0,
      fallback: true,
    };
    showToast("Catalog niet gevonden, fallback sandbox gebruikt.", false);
  }
}

async function loadCurrentExerciseIntoEditor() {
  const exercise = getCurrentExercise();
  const exerciseId = getCurrentExerciseId();
  const codeStorageKey = toScopedStorageKey(STORAGE.code);
  const starterVersionKey = toScopedStorageKey(STORAGE.starterVersion, exerciseId);
  const stored = localStorage.getItem(codeStorageKey);
  const starter = await resolveStarterCode(exercise);

  let code = stored;
  if (code !== null && !exercise?.starterPath && isLegacyPlaceholderCode(code)) {
    code = DEFAULT_CODE;
    localStorage.setItem(codeStorageKey, code);
  }
  if (code !== null && shouldRefreshStoredStarter(code, starter, exercise)) {
    code = starter;
    localStorage.setItem(codeStorageKey, code);
    localStorage.setItem(starterVersionKey, APP_VERSION);
  }
  if (code === null) {
    code = starter;
    localStorage.setItem(codeStorageKey, code);
    localStorage.setItem(starterVersionKey, APP_VERSION);
  }

  state.editor.setValue(code);
  clearOutputPanels();
  updateMetrics();
}

async function activateSelection({ chapterIdx, subchapterIdx, exerciseIdx }) {
  stopWorkTimer();

  const catalog = getCatalog();
  const safeChapterIdx = Math.min(
    Math.max(chapterIdx, 0),
    Math.max((catalog.chapters || []).length - 1, 0)
  );
  const safeSubchapterIdx = getSafeSubchapterIndex(safeChapterIdx, subchapterIdx);
  const safeExerciseIdx = getSafeExerciseIndex(safeChapterIdx, safeSubchapterIdx, exerciseIdx);

  state.currentChapterIdx = safeChapterIdx;
  state.currentSubchapterIdx = safeSubchapterIdx;
  state.currentExerciseIdx = safeExerciseIdx;
  state.pendingInputs = [];
  state.awaitingInput = false;
  state.currentInputPrompt = "";
  closeEvaluationModal();
  ensureMenuAccordionForCurrentSelection();

  renderChapterMenu();
  renderProgress();
  persistSelection();

  setLoadingStatus("Oefening klaarzetten.", "Beschrijving en startercode laden", 52);
  await Promise.all([
    renderAssignmentInfo(),
    loadCurrentExerciseIntoEditor(),
  ]);
  refreshRuntimeInputStatus();

  startWorkTimer();
  updateMetrics();
}

function getSafeSubchapterIndex(chapterIdx, preferred = 0) {
  const catalog = getCatalog();
  const chapter = (catalog.chapters || [])[chapterIdx];
  if (!chapter || !Array.isArray(chapter.subchapters) || chapter.subchapters.length === 0) {
    return 0;
  }
  return Math.min(Math.max(preferred, 0), chapter.subchapters.length - 1);
}

function getSafeExerciseIndex(chapterIdx, subchapterIdx, preferred = 0) {
  const catalog = getCatalog();
  const chapter = (catalog.chapters || [])[chapterIdx];
  const subchapter = chapter && Array.isArray(chapter.subchapters)
    ? chapter.subchapters[subchapterIdx]
    : null;
  if (!subchapter || !Array.isArray(subchapter.exercises) || subchapter.exercises.length === 0) {
    return 0;
  }
  return Math.min(Math.max(preferred, 0), subchapter.exercises.length - 1);
}

async function switchSubchapter(chapterIdx, subchapterIdx) {
  const safeSubchapter = getSafeSubchapterIndex(chapterIdx, subchapterIdx);
  await activateSelection({
    chapterIdx,
    subchapterIdx: safeSubchapter,
    exerciseIdx: 0,
  });
}

async function switchExercise(exerciseIdx) {
  const safeExercise = getSafeExerciseIndex(
    state.currentChapterIdx,
    state.currentSubchapterIdx,
    exerciseIdx
  );
  await activateSelection({
    chapterIdx: state.currentChapterIdx,
    subchapterIdx: state.currentSubchapterIdx,
    exerciseIdx: safeExercise,
  });
}

function openMenu() {
  ui.courseMenu.classList.add("open");
}

function closeMenu() {
  ui.courseMenu.classList.remove("open");
}

function moveFocusOutsideModal(modalElement) {
  if (!modalElement || !(modalElement instanceof HTMLElement)) {
    return;
  }

  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !modalElement.contains(active)) {
    return;
  }

  const fallbackTargets = [ui.runButton, ui.runtimeInput, ui.helpBtn].filter(
    (node) =>
      node &&
      node instanceof HTMLElement &&
      !node.disabled &&
      node.offsetParent !== null
  );

  if (fallbackTargets.length > 0) {
    fallbackTargets[0].focus();
    return;
  }

  const hadTabIndex = document.body.hasAttribute("tabindex");
  const previousTabIndex = document.body.getAttribute("tabindex");
  if (!hadTabIndex) {
    document.body.setAttribute("tabindex", "-1");
  }
  document.body.focus();
  if (!hadTabIndex) {
    document.body.removeAttribute("tabindex");
  } else if (previousTabIndex !== null) {
    document.body.setAttribute("tabindex", previousTabIndex);
  }
}

function openHelp() {
  ui.helpModal.classList.add("open");
  ui.helpModal.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  moveFocusOutsideModal(ui.helpModal);
  ui.helpModal.classList.remove("open");
  ui.helpModal.setAttribute("aria-hidden", "true");
}

function closeEvaluationModal() {
  if (!ui.evalModal) {
    return;
  }
  moveFocusOutsideModal(ui.evalModal);
  ui.evalModal.classList.remove("open");
  ui.evalModal.setAttribute("aria-hidden", "true");
}

function closePdfModal() {
  if (!ui.pdfModal) {
    return;
  }
  moveFocusOutsideModal(ui.pdfModal);
  ui.pdfModal.classList.remove("open");
  ui.pdfModal.setAttribute("aria-hidden", "true");
}

function openPdfModal() {
  if (!ui.pdfModal) {
    showToast("PDF-exportvenster kon niet geopend worden.", false);
    return;
  }
  ui.pdfModal.classList.add("open");
  ui.pdfModal.setAttribute("aria-hidden", "false");

  if (ui.pdfFirstName) {
    ui.pdfFirstName.focus();
  }
}

function closeResetModal() {
  if (!ui.resetModal) {
    return;
  }
  moveFocusOutsideModal(ui.resetModal);
  ui.resetModal.classList.remove("open");
  ui.resetModal.setAttribute("aria-hidden", "true");
}

function openResetModal() {
  if (!ui.resetModal) {
    showToast("Resetvenster kon niet geopend worden.", false);
    return;
  }
  ui.resetModal.classList.add("open");
  ui.resetModal.setAttribute("aria-hidden", "false");
  if (ui.resetCurrent) {
    ui.resetCurrent.focus();
  }
}

function createEvaluationKv(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "eval-case-kv";

  const key = document.createElement("div");
  key.className = "eval-case-kv-label";
  key.textContent = label;

  const text = document.createElement("pre");
  text.className = "eval-case-text";
  const content = String(value ?? "").trim();
  text.textContent = content.length > 0 ? content : "(leeg)";

  wrap.appendChild(key);
  wrap.appendChild(text);
  return wrap;
}

function createSyntaxEvaluationNode(syntaxDetails) {
  const card = document.createElement("article");
  card.className = "eval-case syntax";

  const head = document.createElement("div");
  head.className = "eval-case-head";

  const title = document.createElement("div");
  title.className = "eval-case-title";
  title.textContent = "Syntaxcheck: eerst herstellen";

  const badge = document.createElement("span");
  badge.className = "eval-case-badge syntax";
  badge.textContent = "Vooraf";

  head.appendChild(title);
  head.appendChild(badge);
  card.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "eval-case-grid";
  grid.appendChild(createEvaluationKv(
    "Probleem",
    syntaxDetails && syntaxDetails.issueTitle ? syntaxDetails.issueTitle : "Onbekende syntaxfout"
  ));

  if (Number.isFinite(syntaxDetails && syntaxDetails.lineNumber)) {
    grid.appendChild(createEvaluationKv(
      "Regel",
      `${syntaxDetails.lineNumber}${syntaxDetails.offset ? `, positie ${syntaxDetails.offset}` : ""}`
    ));
  }

  if (syntaxDetails && syntaxDetails.tip) {
    grid.appendChild(createEvaluationKv("Tip", syntaxDetails.tip));
  }

  if (syntaxDetails && syntaxDetails.pythonMessage) {
    grid.appendChild(createEvaluationKv("Python meldt", syntaxDetails.pythonMessage));
  }

  if (syntaxDetails && syntaxDetails.codeLine) {
    grid.appendChild(createEvaluationKv("Controleer deze regel", syntaxDetails.codeLine));
  }

  card.appendChild(grid);
  return card;
}

function createStyleWarningEvaluationNode(styleWarnings) {
  const warnings = Array.isArray(styleWarnings) ? styleWarnings.filter(Boolean) : [];
  const languageIssues = warnings.flatMap((warning) =>
    Array.isArray(warning.languageIssues) ? warning.languageIssues : []
  );
  const styleIssues = warnings.flatMap((warning) =>
    Array.isArray(warning.styleIssues) ? warning.styleIssues : []
  );

  const card = document.createElement("article");
  card.className = "eval-case style-warning";

  const head = document.createElement("div");
  head.className = "eval-case-head";

  const title = document.createElement("div");
  title.className = "eval-case-title";
  title.textContent = warnings.length > 1 ? "Stijl- en taalcheck" : (warnings[0] && warnings[0].title) || "Stijlcheck";

  const badge = document.createElement("span");
  badge.className = "eval-case-badge style-warning";
  badge.textContent = "Nudge";

  head.appendChild(title);
  head.appendChild(badge);
  card.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "eval-case-grid";
  grid.appendChild(createEvaluationKv(
    "Status",
    warnings
      .map((warning) => String(warning.message || "").trim())
      .filter(Boolean)
      .join("\n\n") || "Je oplossing is correct. Kijk nog even naar je stijl."
  ));

  if (languageIssues.length > 0) {
    grid.appendChild(createEvaluationKv(
      "Leestekens om te controleren",
      languageIssues.slice(0, 6).map((issue) => {
        const expectedEnding = issue.expectedEnding ? `"${issue.expectedEnding}"` : "een afsluitend leesteken";
        const actualEnding = issue.actualEnding ? `"${issue.actualEnding}"` : "geen afsluitend leesteken";
        return `Verwacht ${expectedEnding}, kreeg ${actualEnding}.\nJouw tekst: ${issue.actualLine || "(leeg)"}`;
      }).join("\n\n") +
        (languageIssues.length > 6 ? `\n\n... en ${languageIssues.length - 6} extra regel(s).` : "")
    ));
  }

  if (styleIssues.length > 0) {
    grid.appendChild(createEvaluationKv(
      "Regels om te controleren",
      styleIssues.slice(0, 8).map((issue) =>
        `Regel ${issue.lineNumber}: ${issue.message}\n${issue.codeLine}`
      ).join("\n\n") +
        (styleIssues.length > 8 ? `\n\n... en ${styleIssues.length - 8} extra regel(s).` : "")
    ));
  }

  card.appendChild(grid);
  return card;
}

function createConceptEvaluationNode(conceptDetails) {
  const details = conceptDetails && typeof conceptDetails === "object" ? conceptDetails : {};
  const card = document.createElement("article");
  card.className = "eval-case fail";

  const head = document.createElement("div");
  head.className = "eval-case-head";

  const title = document.createElement("div");
  title.className = "eval-case-title";
  title.textContent = details.title || "Check je aanpak";

  const badge = document.createElement("span");
  badge.className = "eval-case-badge fail";
  badge.textContent = "Aanpassen";

  head.appendChild(title);
  head.appendChild(badge);
  card.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "eval-case-grid";
  grid.appendChild(createEvaluationKv("Wat gebeurt er?", details.message || "Controleer of je de juiste variant van de oefening maakt."));
  if (details.tip) {
    grid.appendChild(createEvaluationKv("Tip", details.tip));
  }
  if (details.codeLine) {
    grid.appendChild(createEvaluationKv("Controleer deze regel", details.codeLine));
  }

  card.appendChild(grid);
  return card;
}

function createEvaluationCaseNode(caseResult) {
  const card = document.createElement("article");
  card.className = `eval-case ${caseResult.passed ? "pass" : "fail"}`;

  const head = document.createElement("div");
  head.className = "eval-case-head";

  const title = document.createElement("div");
  title.className = "eval-case-title";
  title.textContent = `Testcase ${caseResult.index + 1}`;

  const badge = document.createElement("span");
  badge.className = `eval-case-badge ${caseResult.passed ? "pass" : "fail"}`;
  badge.textContent = caseResult.passed ? "Geslaagd" : "Mislukt";

  head.appendChild(title);
  head.appendChild(badge);
  card.appendChild(head);

  const details = document.createElement("details");
  details.open = !caseResult.passed;

  const summary = document.createElement("summary");
  summary.textContent = caseResult.passed ? "Bekijk details" : "Bekijk foutdetails";
  details.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "eval-case-grid";
  grid.appendChild(createEvaluationKv("Invoer (stdin)", caseResult.stdin));
  grid.appendChild(createEvaluationKv("Verwachte uitvoer", caseResult.expected));
  grid.appendChild(createEvaluationKv("Jouw uitvoer", caseResult.actual));

  if (caseResult.runtimeError) {
    grid.appendChild(createEvaluationKv("Runtime-fout", caseResult.runtimeError));
  }

  details.appendChild(grid);
  card.appendChild(details);
  return card;
}

function createAllEvaluationCasesAccordion(caseResults) {
  const results = Array.isArray(caseResults) ? caseResults : [];
  if (results.length === 0) {
    return null;
  }

  const passed = results.filter((item) => item && item.passed).length;
  const failed = Math.max(0, results.length - passed);

  const wrap = document.createElement("details");
  wrap.className = "eval-all-cases";

  const summary = document.createElement("summary");
  summary.textContent = `Toon alle testcases (${results.length}) - ${passed} geslaagd, ${failed} mislukt`;
  wrap.appendChild(summary);

  const content = document.createElement("div");
  content.className = "eval-all-cases-content";

  const list = document.createElement("div");
  list.className = "eval-all-cases-list";

  results.forEach((caseResult) => {
    list.appendChild(createEvaluationCaseNode(caseResult));
  });

  content.appendChild(list);
  wrap.appendChild(content);
  return wrap;
}

function showEvaluationModal(evalResult, exerciseTitle = "") {
  if (
    !ui.evalModal ||
    !ui.evalModalTitle ||
    !ui.evalModalPill ||
    !ui.evalModalSummary ||
    !ui.evalModalCases
  ) {
    return;
  }

  const total = Number.isFinite(evalResult.total) ? evalResult.total : 0;
  const passedCount = Number.isFinite(evalResult.passedCount)
    ? evalResult.passedCount
    : Array.isArray(evalResult.caseResults)
      ? evalResult.caseResults.filter((item) => item.passed).length
      : 0;
  const failedCount = Number.isFinite(evalResult.failedCount)
    ? evalResult.failedCount
    : Math.max(0, total - passedCount);
  const firstFailCase =
    evalResult.firstFailCase ||
    (Array.isArray(evalResult.caseResults)
      ? evalResult.caseResults.find((item) => !item.passed) || null
      : null);
  const caseResults = Array.isArray(evalResult.caseResults) ? evalResult.caseResults : [];
  const syntaxDetails = evalResult.syntaxDetails && typeof evalResult.syntaxDetails === "object"
    ? evalResult.syntaxDetails
    : null;
  const conceptDetails = evalResult.conceptDetails && typeof evalResult.conceptDetails === "object"
    ? evalResult.conceptDetails
    : null;
  const isSyntaxMode = evalResult.mode === "syntax";
  const isConceptMode = evalResult.mode === "concept";

  const headerTitle = exerciseTitle
    ? `Evaluatie: ${exerciseTitle}`
    : "Evaluatieresultaat";
  ui.evalModalTitle.textContent = headerTitle;

  ui.evalModalPill.classList.remove("ok", "fail", "error");
  if (evalResult.success) {
    ui.evalModalPill.classList.add("ok");
    ui.evalModalPill.textContent = "Geslaagd";
  } else if (isSyntaxMode) {
    ui.evalModalPill.classList.add("error");
    ui.evalModalPill.textContent = "Syntaxfout";
  } else if (isConceptMode) {
    ui.evalModalPill.classList.add("error");
    ui.evalModalPill.textContent = "Check je variant";
  } else if (evalResult.errorMessage && total === 0) {
    ui.evalModalPill.classList.add("error");
    ui.evalModalPill.textContent = "Onvolledig";
  } else {
    ui.evalModalPill.classList.add("fail");
    ui.evalModalPill.textContent = "Niet geslaagd";
  }

  if (total > 0) {
    ui.evalModalSummary.textContent =
      `De computer testte je code met ${total} verborgen testcases: ${passedCount} geslaagd, ${failedCount} mislukt.` +
      (evalResult.errorMessage ? ` Opmerking: ${evalResult.errorMessage}` : "");
  } else if (isSyntaxMode) {
    ui.evalModalSummary.textContent =
      evalResult.errorMessage || "Los de syntaxfout hieronder op; daarna starten de testcases automatisch.";
  } else if (isConceptMode) {
    ui.evalModalSummary.textContent =
      evalResult.errorMessage || "Controleer eerst of je de juiste variant van de oefening maakt.";
  } else {
    ui.evalModalSummary.textContent =
      evalResult.errorMessage ||
      "Geen testcase-details beschikbaar voor deze uitvoering.";
  }

  ui.evalModalCases.innerHTML = "";

  if (isSyntaxMode) {
    ui.evalModalCases.appendChild(createSyntaxEvaluationNode(syntaxDetails || null));
  } else if (isConceptMode) {
    ui.evalModalCases.appendChild(createConceptEvaluationNode(conceptDetails || null));
  } else if (evalResult.success && total > 0) {
    const note = document.createElement("div");
    note.className = "eval-case-note";
    note.textContent = "Top. Alle verborgen testcases zijn geslaagd.";
    ui.evalModalCases.appendChild(note);
  } else if (firstFailCase) {
    const note = document.createElement("div");
    note.className = "eval-case-note";
    note.textContent =
      "Eerste foutvoorbeeld hieronder. Je kan alle testcases openen via het overzicht.";
    ui.evalModalCases.appendChild(note);
    ui.evalModalCases.appendChild(createEvaluationCaseNode(firstFailCase));
  } else {
    const note = document.createElement("div");
    note.className = "eval-case-note";
    note.textContent = "Er kon geen foutvoorbeeld samengesteld worden voor deze run.";
    ui.evalModalCases.appendChild(note);
  }

  const allCasesAccordion = createAllEvaluationCasesAccordion(caseResults);
  if (allCasesAccordion) {
    ui.evalModalCases.appendChild(allCasesAccordion);
  }

  ui.evalModal.classList.add("open");
  ui.evalModal.setAttribute("aria-hidden", "false");
}

function askModal(message) {
  return new Promise((resolve) => {
    ui.askModalMsg.textContent = message;
    ui.askModalInput.value = "";
    ui.askModal.classList.add("open");
    ui.askModal.setAttribute("aria-hidden", "false");
    ui.askModalInput.focus();

    const cleanup = (value) => {
      moveFocusOutsideModal(ui.askModal);
      ui.askModal.classList.remove("open");
      ui.askModal.setAttribute("aria-hidden", "true");
      ui.askModalOk.removeEventListener("click", onOk);
      ui.askModalInput.removeEventListener("keydown", onKey);
      ui.askModal.removeEventListener("click", onBackdrop);
      resolve(value);
    };

    const onOk = () => cleanup(ui.askModalInput.value);
    const onKey = (event) => {
      if (event.key === "Enter") {
        onOk();
      } else if (event.key === "Escape") {
        cleanup("");
      }
    };
    const onBackdrop = (event) => {
      if (event.target === ui.askModal) {
        cleanup("");
      }
    };

    ui.askModalOk.addEventListener("click", onOk);
    ui.askModalInput.addEventListener("keydown", onKey);
    ui.askModal.addEventListener("click", onBackdrop);
  });
}

function extractPythonErrorSummary(rawMessage) {
  const lines = String(rawMessage || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^[A-Za-z_][A-Za-z0-9_]*Error:/.test(lines[index])) {
      return lines[index];
    }
  }

  return "";
}

function withPythonErrorSummary(explanation, rawMessage) {
  const summary = extractPythonErrorSummary(rawMessage);
  return summary ? `${explanation}\nPython meldt: ${summary}` : explanation;
}

function translateRuntimeError(rawMessage) {
  const message = String(rawMessage || "Onbekende fout");
  if (message.includes("NameError")) {
    return withPythonErrorSummary("NameError: je gebruikt een variabele die nog niet bestaat.", message);
  }
  if (message.includes("SyntaxError")) {
    return withPythonErrorSummary("SyntaxError: controleer haakjes, dubbele punten en inspringing.", message);
  }
  if (message.includes("IndentationError")) {
    return withPythonErrorSummary("IndentationError: je inspringing klopt niet.", message);
  }
  if (message.includes("TypeError")) {
    return withPythonErrorSummary("TypeError: een datatype wordt verkeerd gebruikt in je code.", message);
  }
  if (message.includes("ModuleNotFoundError")) {
    return withPythonErrorSummary("ModuleNotFoundError: deze module is niet beschikbaar in de browser-runtime.", message);
  }
  if (message.includes("python is not yet supported")) {
    return "Deze Papyros-build ondersteunt Python momenteel niet. Gebruik een build met Python-backend assets.";
  }
  if (message.includes("Cannot define multiple custom elements with the same tag name")) {
    return "Papyros UI-componenten werden dubbel geladen. Herlaad de pagina hard (Ctrl+Shift+R).";
  }
  if (message.includes('the name "md-focus-ring" has already been used with this registry')) {
    return "Er was een conflict bij het registreren van webcomponenten. De pagina probeert dubbel te registreren.";
  }
  if (message.includes("Error launching papyros after registering service worker")) {
    return "Papyros startte niet na service-worker registratie. Controleer worker-bestanden en CDN-assets.";
  }
  if (message.includes("input-sw.js") && message.includes("app-scope")) {
    return message;
  }
  if (message.includes("Papyros inputkanaal kon niet geconfigureerd worden")) {
    return "Papyros kon geen inputkanaal opzetten. Controleer service worker en pagina-scope.";
  }
  if (
    message.includes("__SyncMessageServiceWorkerInput__/write") ||
    message.includes("Received status 501")
  ) {
    return "Invoer kan niet naar de runtime gestuurd worden. Herlaad de pagina (Ctrl+Shift+R).";
  }
  if (message.includes("backend kon niet opstarten")) {
    return message;
  }
  if (message.includes("Failed to construct 'Worker'")) {
    return `De browser kon de Papyros worker niet laden. Details: ${message}`;
  }
  if (message.includes("A bad HTTP response code (404) was received when fetching the script")) {
    return "Een noodzakelijk runtime-script gaf 404 terug. Controleer dat alle Papyros assets bereikbaar zijn.";
  }
  if (message.includes("Kon lokale workerbestanden niet bereiken")) {
    return message;
  }
  if (message.includes("Timeout bij opstarten van de Python-backend")) {
    return message;
  }
  if (message.includes("Runtime is not ready")) {
    return "De Python-runtime is nog niet klaar met laden.";
  }
  if (message.includes("M.resolve is not a function")) {
    return "Er is een module-interopfout opgetreden tijdens het laden van de runtime. Herlaad hard en gebruik de nieuwste app-versie.";
  }
  return message;
}

function formatErrorDetails(error) {
  if (!error) {
    return "";
  }

  const parts = [];
  const seen = new Set();
  let current = error;
  let depth = 0;

  while (current && depth < 4) {
    const msg =
      typeof current === "string"
        ? current
        : current && current.message
          ? String(current.message)
          : String(current);

    if (msg && !seen.has(msg)) {
      seen.add(msg);
      parts.push(msg);
    }

    current = current && typeof current === "object" ? current.cause : null;
    depth += 1;
  }

  return parts.join(" | ");
}

function installCustomElementDefineGuard() {
  if (!window.customElements || window.__pikCustomElementGuardInstalled) {
    return;
  }

  const originalDefine = window.customElements.define.bind(window.customElements);
  window.customElements.define = function patchedDefine(name, constructor, options) {
    if (window.customElements.get(name)) {
      return;
    }
    try {
      originalDefine(name, constructor, options);
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      if (msg.includes("has already been used with this registry")) {
        return;
      }
      throw error;
    }
  };

  window.__pikCustomElementGuardInstalled = true;
}

async function loadPapyrosModule() {
  if (papyrosModulePromise) {
    return papyrosModulePromise;
  }

  papyrosModulePromise = (async () => {
    ensureNodeCompatGlobals();
    installCustomElementDefineGuard();
    const importWithFallback = async (primaryUrl, fallbackUrl = null) => {
      try {
        return await import(primaryUrl);
      } catch (primaryError) {
        if (!fallbackUrl) {
          throw primaryError;
        }
        try {
          return await import(fallbackUrl);
        } catch {
          throw primaryError;
        }
      }
    };
    const [
      papyrosModule,
      backendManagerModule,
      syncMessageModule,
      comlinkBridgeModule,
    ] =
      await Promise.all([
      import(PAPYROS_MODULE_URL),
      importWithFallback(PAPYROS_BACKEND_MANAGER_URL, PAPYROS_BACKEND_MANAGER_FALLBACK_URL),
      import(SYNC_MESSAGE_MODULE_URL),
      import(COMLINK_BRIDGE_MODULE_URL),
    ]);

    const papyros =
      (papyrosModule && papyrosModule.papyros) ||
      (papyrosModule && papyrosModule.default && papyrosModule.default.papyros) ||
      (papyrosModule && papyrosModule.default) ||
      (typeof window !== "undefined" && window.papyros ? window.papyros : null);
    const BackendManager =
      (backendManagerModule && backendManagerModule.BackendManager) ||
      (backendManagerModule && backendManagerModule.default && backendManagerModule.default.BackendManager) ||
      null;
    const BackendManagerFallback = BackendManager;
    const syncMessageGlobal =
      typeof window !== "undefined" && window.syncMessage ? window.syncMessage : null;
    const makeChannel =
      (syncMessageModule && syncMessageModule.makeChannel) ||
      (syncMessageModule && syncMessageModule.default && syncMessageModule.default.makeChannel) ||
      (syncMessageGlobal && syncMessageGlobal.makeChannel) ||
      null;
    const ComlinkProxy =
      (comlinkBridgeModule && comlinkBridgeModule.proxy) ||
      (comlinkBridgeModule && comlinkBridgeModule.default && comlinkBridgeModule.default.proxy) ||
      null;

    if (!papyros) {
      throw new Error("Papyros module geladen, maar geen geldige export gevonden.");
    }
    if (!BackendManager || typeof BackendManager !== "function") {
      throw new Error("Papyros BackendManager kon niet worden geladen.");
    }
    if (!makeChannel || typeof makeChannel !== "function") {
      throw new Error("sync-message makeChannel kon niet worden geladen.");
    }
    if (!ComlinkProxy || typeof ComlinkProxy !== "function") {
      throw new Error("Comlink proxy kon niet worden geladen.");
    }

    return {
      papyros,
      BackendManager,
      BackendManagerFallback,
      makeChannel,
      ComlinkProxy,
    };
  })().catch((error) => {
    papyrosModulePromise = null;
    throw error;
  });

  return papyrosModulePromise;
}

function getAppScopePath() {
  const scopeUrl = new URL("./", window.location.href);
  return scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
}

function getInputServiceWorkerUrl() {
  const url = new URL(INPUT_SW_FILENAME, window.location.href);
  url.searchParams.set("v", APP_VERSION);
  return url;
}

function getWorkerScriptUrl(filename) {
  const url = new URL(filename, window.location.href);
  url.searchParams.set("v", APP_VERSION);
  return url;
}

async function waitForServiceWorkerController(timeoutMs = 3000) {
  if (!("serviceWorker" in navigator)) {
    return false;
  }
  if (navigator.serviceWorker.controller) {
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(value);
    };

    const onChange = () => {
      finish(Boolean(navigator.serviceWorker.controller));
    };

    const timer = setTimeout(() => {
      finish(Boolean(navigator.serviceWorker.controller));
    }, timeoutMs);

    navigator.serviceWorker.addEventListener("controllerchange", onChange);
  });
}

async function probeSyncMessageServiceWorker(scopePath) {
  try {
    // When this page is not yet controlled by a service worker, probing would hit
    // the local dev server and can produce noisy 501 errors. Skip network probing.
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      return false;
    }

    const normalizedScope = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
    const probeUrl = new URL(`${normalizedScope}__SyncMessageServiceWorkerInput__/version`, window.location.href);
    const response = await fetch(probeUrl.href, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const version = (await response.text()).trim();
    return version === "__sync-message-v2__";
  } catch {
    return false;
  }
}

function describeInputSwFailure(reason, scopePath) {
  if (reason === "unsupported") {
    return "De browser ondersteunt geen service workers voor input().";
  }
  if (reason === "no-controller") {
    return (
      `De input service worker is niet actief voor deze pagina-scope (${scopePath}). ` +
      "Herlaad de pagina hard (Ctrl+Shift+R)."
    );
  }
  if (reason === "probe-failed") {
    return (
      "De input service worker antwoordt niet op het sync-kanaal " +
      "(/__SyncMessageServiceWorkerInput__/version)."
    );
  }
  if (reason === "reloading") {
    return "Input service worker wordt geactiveerd. De pagina wordt eenmalig herladen.";
  }
  if (reason === "register-failed") {
    return "Registratie van input-sw.js is mislukt.";
  }
  return "Onbekende fout bij initialiseren van de input service worker.";
}

function maybeTriggerInputSwAutoReload() {
  try {
    if (typeof window === "undefined" || !window.location || !window.sessionStorage) {
      return false;
    }
    const already = window.sessionStorage.getItem(INPUT_SW_AUTO_RELOAD_KEY);
    if (already === "1") {
      return false;
    }
    window.sessionStorage.setItem(INPUT_SW_AUTO_RELOAD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

async function ensureInputServiceWorkerReady(serviceWorkerName, scopePath, timeoutMs = 7000) {
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    await navigator.serviceWorker.register(serviceWorkerName, { scope: scopePath });
  } catch (error) {
    return { ok: false, reason: "register-failed", error };
  }

  try {
    await navigator.serviceWorker.ready;
  } catch {
    // ignore and continue with explicit checks
  }

  const startedAt = Date.now();
  let hasController = Boolean(navigator.serviceWorker.controller);
  let lastProbeOk = false;

  while (Date.now() - startedAt < timeoutMs) {
    hasController = Boolean(navigator.serviceWorker.controller);
    if (hasController) {
      lastProbeOk = await probeSyncMessageServiceWorker(scopePath);
      if (lastProbeOk) {
        try {
          if (window && window.sessionStorage) {
            window.sessionStorage.removeItem(INPUT_SW_AUTO_RELOAD_KEY);
          }
        } catch {
          // no-op
        }
        return { ok: true, reason: "ok" };
      }
    }
    // Wait a bit for install/activate/controllerchange and retry probe.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!hasController) {
    if (maybeTriggerInputSwAutoReload()) {
      return { ok: false, reason: "reloading" };
    }
    return { ok: false, reason: "no-controller" };
  }
  if (!lastProbeOk) {
    return { ok: false, reason: "probe-failed" };
  }
  return { ok: true, reason: "ok" };
}

async function checkLocalBackendWorkers() {
  const workerUrls = [
    getWorkerScriptUrl(PYTHON_WORKER_FILENAME),
    getWorkerScriptUrl(JAVASCRIPT_WORKER_FILENAME),
  ];

  const checks = await Promise.all(
    workerUrls.map(async (url) => {
      let response = await fetch(url.href, { method: "HEAD", cache: "no-store" });
      if (response.status === 405) {
        response = await fetch(url.href, { method: "GET", cache: "no-store" });
      }
      return { url, ok: response.ok };
    })
  );

  const missing = checks.filter((item) => !item.ok).map((item) => item.url.pathname);
  if (missing.length > 0) {
    throw new Error(`Kon lokale workerbestanden niet bereiken: ${missing.join(", ")}`);
  }
}

function findBackendLanguageKey(BackendManager, hint) {
  const keys = [];
  if (BackendManager && BackendManager.createBackendMap instanceof Map) {
    BackendManager.createBackendMap.forEach((_, key) => keys.push(key));
  }
  if (BackendManager && BackendManager.backendMap instanceof Map) {
    BackendManager.backendMap.forEach((_, key) => keys.push(key));
  }

  const uniqueKeys = [...new Set(keys)];
  const normalizedHint = String(hint || "").toLowerCase();

  const exact = uniqueKeys.find((key) => String(key).toLowerCase() === normalizedHint);
  if (exact !== undefined) {
    return exact;
  }

  const contains = uniqueKeys.find((key) => String(key).toLowerCase().includes(normalizedHint));
  if (contains !== undefined) {
    return contains;
  }

  if (normalizedHint === "python") {
    const pyLike = uniqueKeys.find((key) => /py/i.test(String(key)));
    if (pyLike !== undefined) {
      return pyLike;
    }
  }

  if (normalizedHint === "javascript") {
    const jsLike = uniqueKeys.find((key) => /javascript|js/i.test(String(key)));
    if (jsLike !== undefined) {
      return jsLike;
    }
  }

  return normalizedHint === "python" ? "Python" : "JavaScript";
}

function makeWorkerProbeClass() {
  return class WorkerProbe {
    constructor() {
      this._listeners = new Map();
    }

    addEventListener(type, listener) {
      if (!this._listeners.has(type)) {
        this._listeners.set(type, new Set());
      }
      this._listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
      const set = this._listeners.get(type);
      if (!set) {
        return;
      }
      set.delete(listener);
    }

    postMessage() {
      // no-op probe worker
    }

    terminate() {
      // no-op probe worker
    }

    start() {
      // no-op probe worker
    }
  };
}

function resolveBackendClientClasses(BackendManager) {
  if (!BackendManager || typeof BackendManager.getBackend !== "function") {
    throw new Error("BackendManager ontbreekt of ondersteunt geen backend-opvraging.");
  }
  if (typeof window === "undefined" || typeof window.Worker !== "function") {
    throw new Error("Browser Worker API ontbreekt.");
  }

  const pythonLanguage = findBackendLanguageKey(BackendManager, "python");
  const javascriptLanguage = findBackendLanguageKey(BackendManager, "javascript");

  const RealWorker = window.Worker;
  const WorkerProbe = makeWorkerProbeClass();
  let pythonClientClass = null;
  let javascriptClientClass = null;

  window.Worker = WorkerProbe;
  try {
    const pythonBackend = BackendManager.getBackend(pythonLanguage);
    pythonClientClass = pythonBackend && pythonBackend.constructor ? pythonBackend.constructor : null;

    const javascriptBackend = BackendManager.getBackend(javascriptLanguage);
    javascriptClientClass =
      javascriptBackend && javascriptBackend.constructor ? javascriptBackend.constructor : null;
  } finally {
    window.Worker = RealWorker;
    if (BackendManager.backendMap instanceof Map) {
      BackendManager.backendMap.delete(pythonLanguage);
      BackendManager.backendMap.delete(javascriptLanguage);
    }
  }

  if (typeof pythonClientClass !== "function") {
    throw new Error("PyodideClient kon niet afgeleid worden uit de geladen Papyros-backend.");
  }
  if (typeof javascriptClientClass !== "function") {
    throw new Error("SyncClient kon niet afgeleid worden uit de geladen Papyros-backend.");
  }

  return {
    pythonLanguage,
    javascriptLanguage,
    PyodideClientClass: pythonClientClass,
    SyncClientClass: javascriptClientClass,
  };
}

function patchPapyrosInputConfig(papyros, BackendManager, makeChannel, extraBackendManagers = []) {
  if (!papyros || !BackendManager || typeof makeChannel !== "function") {
    return;
  }

  const backendManagers = [BackendManager, ...extraBackendManagers].filter(
    (manager, index, arr) =>
      manager &&
      typeof manager === "function" &&
      typeof manager.registerBackend === "function" &&
      arr.indexOf(manager) === index
  );

  const scopePath = getAppScopePath();
  const swUrl = getInputServiceWorkerUrl();

  papyros.serviceWorkerName = swUrl.pathname;
  papyros.configureInput = async function configureInputPatched() {
    if (typeof SharedArrayBuffer === "undefined") {
      if (!this.serviceWorkerName || !("serviceWorker" in navigator)) {
        return false;
      }
      let swReady = { ok: false, reason: "unsupported" };
      try {
        swReady = await ensureInputServiceWorkerReady(this.serviceWorkerName, scopePath, 9000);
        if (!swReady.ok) {
          state.inputSwAvailable = false;
          state.inputSwIssue = describeInputSwFailure(swReady.reason, scopePath);
          if (swReady.reason !== "reloading" && typeof console !== "undefined" && typeof console.warn === "function") {
            console.warn("input-sw degraded mode:", state.inputSwIssue);
          }
        }
        const channel = makeChannel({ serviceWorker: { scope: scopePath } });
        if (!channel) {
          throw new Error("ServiceWorker inputkanaal kon niet worden gemaakt.");
        }
        backendManagers.forEach((manager) => {
          manager.channel = channel;
        });
        if (swReady.ok) {
          state.inputSwAvailable = true;
          state.inputSwIssue = "";
        }
      } catch (error) {
        const fallbackDetail = describeInputSwFailure("register-failed", scopePath);
        state.inputSwAvailable = false;
        state.inputSwIssue = String((error && error.message) || fallbackDetail);
        // Try to continue in degraded mode: exercises without input() can still run.
        try {
          const channel = makeChannel({ serviceWorker: { scope: scopePath } });
          if (channel) {
            backendManagers.forEach((manager) => {
              manager.channel = channel;
            });
            return true;
          }
        } catch {
          // ignore and fall through to hard failure below
        }
        this.errorHandler(new Error("Error registering service worker", { cause: error }));
        return false;
      }
    } else {
      const channel = makeChannel({ atomics: {} });
      backendManagers.forEach((manager) => {
        manager.channel = channel;
      });
      state.inputSwAvailable = true;
      state.inputSwIssue = "";
    }
    return true;
  };

  papyros.launch = async function launchPatched() {
    const configured = await this.configureInput();
    if (!configured) {
      throw new Error("Papyros inputkanaal kon niet geconfigureerd worden.");
    }
    await this.runner.launch();
    return this;
  };
}

function patchPapyrosBackends(BackendManager) {
  if (!BackendManager || typeof BackendManager.registerBackend !== "function") {
    throw new Error("BackendManager ontbreekt of ondersteunt geen backendregistratie.");
  }

  const {
    pythonLanguage,
    javascriptLanguage,
    PyodideClientClass,
    SyncClientClass,
  } = resolveBackendClientClasses(BackendManager);

  const pythonWorkerUrl = getWorkerScriptUrl(PYTHON_WORKER_FILENAME).href;
  const javascriptWorkerUrl = getWorkerScriptUrl(JAVASCRIPT_WORKER_FILENAME).href;

  BackendManager.removeBackend(pythonLanguage);
  BackendManager.removeBackend(javascriptLanguage);

  BackendManager.registerBackend(
    pythonLanguage,
    () =>
      new PyodideClientClass(
        () =>
          new Worker(pythonWorkerUrl, {
            type: "module",
          }),
        BackendManager.channel
      )
  );

  BackendManager.registerBackend(
    javascriptLanguage,
    () =>
      new SyncClientClass(
        () =>
          new Worker(javascriptWorkerUrl, {
            type: "module",
          }),
        BackendManager.channel
      )
  );
}

function normalizePapyrosContentType(contentType) {
  if (typeof contentType === "string" && contentType.trim()) {
    return contentType;
  }
  if (!contentType || typeof contentType !== "object") {
    return "text/plain";
  }

  const candidates = [
    contentType.contentType,
    contentType.mimeType,
    contentType.mediaType,
    contentType.type,
    contentType.value,
  ];
  const match = candidates.find((value) => typeof value === "string" && value.includes("/"));
  return match || "text/plain";
}

function normalizePapyrosEventForPublish(event) {
  if (!event || typeof event !== "object") {
    return event;
  }

  const normalized = {
    ...event,
    contentType: normalizePapyrosContentType(event.contentType),
  };

  if (normalized.data && typeof normalized.data === "object") {
    try {
      normalized.data = JSON.stringify(normalized.data);
    } catch {
      normalized.data = String(normalized.data);
    }
  }

  return normalized;
}

function patchRunnerLaunch(papyros, BackendManager, comlinkProxy) {
  const runner = papyros && papyros.runner;
  if (!runner || typeof runner !== "object") {
    return;
  }
  if (!BackendManager || typeof BackendManager.getBackend !== "function") {
    return;
  }
  if (typeof comlinkProxy !== "function") {
    return;
  }
  if (runner.__pikLaunchPatched) {
    return;
  }

  runner.launch = async function launchRunnerWithBridgeProxy() {
    if (typeof this.setState === "function") {
      this.setState("loading");
    }

    const backend = BackendManager.getBackend(this.programmingLanguage);
    const self = this;

    this.backend = new Promise(async (resolve, reject) => {
      try {
        const workerProxy = backend.workerProxy;
        await workerProxy.launch(comlinkProxy((event) =>
          BackendManager.publish(normalizePapyrosEventForPublish(event))
        ));
        if (typeof self.updateRunModes === "function") {
          self.updateRunModes();
        }
        resolve(backend);
      } catch (error) {
        reject(error);
      }
    });

    if (typeof this.setState === "function") {
      this.setState("ready");
    }
  };

  runner.__pikLaunchPatched = true;
}

function setRunnerLanguage(language) {
  const runner = state.papyros && state.papyros.runner;
  if (!runner) {
    return false;
  }

  const candidates = [];
  const seen = new Set();

  function addCandidate(value) {
    if (typeof value !== "string") {
      return;
    }
    const cleaned = value.trim();
    if (!cleaned || seen.has(cleaned)) {
      return;
    }
    seen.add(cleaned);
    candidates.push(cleaned);
  }

  function harvestLanguageStrings(source) {
    if (!source) {
      return;
    }

    if (typeof source === "string") {
      addCandidate(source);
      return;
    }

    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (typeof item === "string") {
          addCandidate(item);
        } else if (item && typeof item === "object") {
          addCandidate(item.value);
          addCandidate(item.id);
          addCandidate(item.name);
          addCandidate(item.label);
          addCandidate(item.key);
        }
      });
      return;
    }

    if (source && typeof source === "object") {
      Object.keys(source).forEach((key) => addCandidate(key));
      Object.values(source).forEach((value) => {
        if (typeof value === "string") {
          addCandidate(value);
        } else if (value && typeof value === "object") {
          addCandidate(value.value);
          addCandidate(value.id);
          addCandidate(value.name);
          addCandidate(value.label);
          addCandidate(value.key);
        }
      });
    }
  }

  const possibleSources = [
    state.papyros && state.papyros.constants && state.papyros.constants.programmingLanguages,
    state.papyros && state.papyros.constants && state.papyros.constants.supportedProgrammingLanguages,
    state.papyros && state.papyros.constants && state.papyros.constants.languages,
    runner.supportedProgrammingLanguages,
    runner.languages,
    runner.programmingLanguages,
  ];

  possibleSources.forEach(harvestLanguageStrings);

  const normalized = String(language || "python").trim();
  const normalizedUpper = normalized.toUpperCase();
  const normalizedCapitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();

  addCandidate(normalized);
  addCandidate(normalizedUpper);
  addCandidate(normalizedCapitalized);

  ["python", "Python", "PYTHON", "python3", "Python3", "PYTHON3", "py"].forEach(addCandidate);

  const pythonLikeFirst = [];
  const nonPython = [];
  candidates.forEach((value) => {
    if (/python|py/i.test(value)) {
      pythonLikeFirst.push(value);
    } else {
      nonPython.push(value);
    }
  });
  const ordered = [...pythonLikeFirst, ...nonPython];

  let lastError = null;
  for (const candidate of ordered) {
    try {
      if ("programmingLanguage" in runner) {
        runner.programmingLanguage = candidate;
        return true;
      }
      if ("language" in runner) {
        runner.language = candidate;
        return true;
      }
      if ("lang" in runner) {
        runner.lang = candidate;
        return true;
      }
      if (typeof runner.setProgrammingLanguage === "function") {
        runner.setProgrammingLanguage(candidate);
        return true;
      }
      if (typeof runner.setLanguage === "function") {
        runner.setLanguage(candidate);
        return true;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    window.__pikLastLanguageError = lastError;
  }

  return false;
}

function setRunnerCode(code) {
  const runner = state.papyros && state.papyros.runner;
  if (!runner) {
    return false;
  }

  if ("code" in runner) {
    runner.code = code;
    return true;
  }
  if ("source" in runner) {
    runner.source = code;
    return true;
  }
  if ("document" in runner) {
    runner.document = code;
    return true;
  }
  if (typeof runner.setCode === "function") {
    runner.setCode(code);
    return true;
  }

  return false;
}

function clearPapyrosBuffers() {
  const runnerIo = state.papyros && state.papyros.runner && state.papyros.runner.io;
  const io = state.papyros && state.papyros.io;

  if (runnerIo && Array.isArray(runnerIo.output)) {
    runnerIo.output.length = 0;
  }
  if (io && Array.isArray(io.output)) {
    io.output.length = 0;
  }
  if (runnerIo && typeof runnerIo.clear === "function") {
    runnerIo.clear();
  }
  if (io && typeof io.clear === "function") {
    io.clear();
  }
}

function getPapyrosOutputEntries() {
  if (!state.papyros) {
    return [];
  }
  const runnerOutput =
    state.papyros.runner &&
    state.papyros.runner.io &&
    Array.isArray(state.papyros.runner.io.output)
      ? state.papyros.runner.io.output
      : null;
  const ioOutput =
    state.papyros.io && Array.isArray(state.papyros.io.output)
      ? state.papyros.io.output
      : null;

  // Prefer whichever channel currently has data. Some runtimes write to io.output
  // while runner.io.output exists but remains temporarily empty.
  if (runnerOutput && runnerOutput.length > 0) {
    return runnerOutput;
  }
  if (ioOutput && ioOutput.length > 0) {
    return ioOutput;
  }
  if (runnerOutput) {
    return runnerOutput;
  }
  if (ioOutput) {
    return ioOutput;
  }
  return [];
}

function renderOutputFromPapyros() {
  const entries = getPapyrosOutputEntries();
  if (!entries.length) {
    ui.consoleOutput.textContent = "(geen uitvoer)";
    if (ui.richOutput) {
      ui.richOutput.hidden = true;
    }
    return;
  }

  const textParts = [];
  const images = [];

  entries.forEach((entry) => {
    if (typeof entry === "string") {
      textParts.push(entry);
      return;
    }

    if (!entry || typeof entry !== "object") {
      textParts.push(String(entry));
      return;
    }

    const type = String(entry.type || entry.channel || "").toLowerCase();
    const content = getPapyrosEntryPayload(entry);

    if (typeof content === "string" && (type.includes("image") || content.startsWith("data:image"))) {
      images.push(content);
      return;
    }

    if (typeof content === "string") {
      textParts.push(content);
      return;
    }

    if (content !== undefined && content !== null) {
      textParts.push(String(content));
      return;
    }

    textParts.push(JSON.stringify(entry));
  });

  if (images.length > 0 && !ui.richOutput) {
    textParts.push(`\n(Er werden ${images.length} afbeelding(en) gegenereerd.)`);
  }

  const textOutput = joinConsoleTextPartsForDisplay(textParts);
  ui.consoleOutput.textContent = textOutput.trim().length > 0 ? textOutput.trimEnd() : "(geen tekstuitvoer)";

  if (!ui.richOutput) {
    return;
  }

  if (!images.length) {
    ui.richOutput.hidden = true;
    ui.richOutput.innerHTML = "";
    return;
  }

  ui.richOutput.hidden = false;
  ui.richOutput.innerHTML = "";
  images.forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Uitvoerafbeelding";
    ui.richOutput.appendChild(img);
  });
}

function joinConsoleTextPartsForDisplay(parts) {
  const text = (parts || []).map((part) => String(part ?? "")).join("");
  return formatConsoleTextForDisplay(text);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatConsoleTextForDisplay(text) {
  let value = String(text ?? "").replace(/\r\n/g, "\n");
  [
    "Het getal is hoger dan ",
    "Het getal is lager dan ",
    "Je hebt ",
  ].forEach((marker) => {
    const pattern = new RegExp(`([^\\n])(${escapeRegExp(marker)})`, "g");
    value = value.replace(pattern, "$1\n$2");
  });
  return value;
}

function renderLiveOutputFromPapyros() {
  if (state.liveOutputTimer === null) {
    return;
  }
  if (getPapyrosOutputEntries().length > 0) {
    renderOutputFromPapyros();
  }
}

function stopLiveOutputRendering() {
  if (state.liveOutputTimer !== null) {
    window.clearInterval(state.liveOutputTimer);
    state.liveOutputTimer = null;
  }
}

function startLiveOutputRendering() {
  stopLiveOutputRendering();
  state.liveOutputTimer = window.setInterval(() => {
    if (!state.running) {
      stopLiveOutputRendering();
      return;
    }
    renderLiveOutputFromPapyros();
  }, 120);
}

function getPapyrosEntryPayload(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  return entry.content ?? entry.text ?? entry.message ?? entry.value ?? entry.data;
}

function extractTextOutputFromEntries(entries) {
  const textParts = [];

  (entries || []).forEach((entry) => {
    if (typeof entry === "string") {
      textParts.push(entry);
      return;
    }

    if (!entry || typeof entry !== "object") {
      textParts.push(String(entry));
      return;
    }

    const type = String(entry.type || entry.channel || "").toLowerCase();
    const content = getPapyrosEntryPayload(entry);

    if (typeof content === "string" && (type.includes("image") || content.startsWith("data:image"))) {
      return;
    }

    if (typeof content === "string") {
      textParts.push(content);
      return;
    }

    if (content !== undefined && content !== null) {
      textParts.push(String(content));
    }
  });

  return joinConsoleTextPartsForDisplay(textParts);
}

function isPapyrosErrorEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const markers = [
    entry.type,
    entry.channel,
    entry.stream,
    entry.kind,
    entry.name,
    entry.level,
  ].map((value) => String(value || "").toLowerCase());

  return markers.some((value) =>
    value === "error" ||
    value === "stderr" ||
    value.includes("error") ||
    value.includes("stderr")
  );
}

function looksLikePythonRuntimeError(text) {
  const value = String(text || "");
  if (value.includes("Traceback (most recent call last):")) {
    return true;
  }
  return /\b(?:NameError|TypeError|ValueError|ZeroDivisionError|IndexError|KeyError|AttributeError|ImportError|ModuleNotFoundError|IndentationError|SyntaxError|EOFError):/.test(value);
}

function extractRuntimeErrorFromEntries(entries) {
  const outputEntries = Array.isArray(entries) ? entries : [];

  for (const entry of outputEntries) {
    if (!isPapyrosErrorEntry(entry)) {
      continue;
    }
    const payload = getPapyrosEntryPayload(entry);
    if (payload !== undefined && payload !== null && String(payload).trim().length > 0) {
      return formatPapyrosRuntimeErrorPayload(payload);
    }
    try {
      return JSON.stringify(entry);
    } catch {
      return "Onbekende runtime-fout.";
    }
  }

  const combinedText = extractTextOutputFromEntries(outputEntries);
  return looksLikePythonRuntimeError(combinedText) ? combinedText : "";
}

function formatPapyrosRuntimeErrorPayload(payload) {
  if (payload && typeof payload === "object") {
    return payload.what || payload.traceback || payload.message || payload.name || JSON.stringify(payload);
  }

  const text = String(payload || "");
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return text;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed.what || parsed.traceback || parsed.message || parsed.name || text;
  } catch {
    return text;
  }
}

function normalizeOutputForComparison(text) {
  let value = String(text ?? "");

  // Normalize line endings and spaces from copy/paste contexts.
  value = value.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");

  // Line-level trim prevents accidental leading/trailing spaces per print.
  value = value
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  // Curriculum-friendly tolerance:
  // - newline vs space differences are ignored
  // - repeated spaces are ignored
  value = value.replace(/\s+/g, " ");

  // Also ignore extra spaces before punctuation produced by print(arg1, arg2, ...).
  value = value.replace(/\s+([,.;:!?])/g, "$1");

  return value;
}

function terminalSentencePunctuation(text) {
  const match = String(text || "").trim().match(/[.!?]+$/);
  return match ? match[0] : "";
}

function withoutTerminalSentencePunctuation(text) {
  return String(text || "").trim().replace(/[.!?]+$/g, "").trim();
}

function compareTerminalPunctuation(expectedNorm, actualNorm, expectedRaw, actualRaw) {
  if (expectedNorm === actualNorm) {
    return null;
  }
  const expectedBase = withoutTerminalSentencePunctuation(expectedNorm);
  const actualBase = withoutTerminalSentencePunctuation(actualNorm);
  if (!expectedBase || expectedBase !== actualBase) {
    return null;
  }
  const expectedEnding = terminalSentencePunctuation(expectedNorm);
  const actualEnding = terminalSentencePunctuation(actualNorm);
  if (expectedEnding === actualEnding) {
    return null;
  }
  return {
    expectedEnding,
    actualEnding,
    expectedLine: String(expectedRaw ?? expectedNorm),
    actualLine: String(actualRaw ?? actualNorm),
  };
}

function createLanguagePunctuationWarning(issues) {
  return {
    id: "sentence-punctuation",
    title: "Controleer je leestekens",
    message: "Je oplossing is correct. Kijk nog even of elke zin eindigt met het juiste leesteken.",
    languageIssues: Array.isArray(issues) ? issues : [],
  };
}

function decodeBasicStringEscapes(text) {
  return String(text || "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function extractInputPromptStringsFromCode(code) {
  const source = String(code || "");
  const prompts = [];
  const inputRegex = /\binput\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*\)/g;
  let match = null;
  while ((match = inputRegex.exec(source)) !== null) {
    const prompt = decodeBasicStringEscapes(match[2]).trim();
    if (prompt.length > 0) {
      prompts.push(prompt);
    }
  }
  return [...new Set(prompts)];
}

function stripPromptStringsFromOutput(output, prompts) {
  let value = String(output ?? "");
  (prompts || []).forEach((prompt) => {
    if (!prompt) {
      return;
    }
    value = value.split(prompt).join("");
  });
  return value;
}

function outputsMatchExpected(expected, actual, sourceCode = "") {
  return compareOutputExpected(expected, actual, sourceCode).passed;
}

function compareOutputExpected(expected, actual, sourceCode = "") {
  const expectedNorm = normalizeOutputForComparison(expected);
  const actualNorm = normalizeOutputForComparison(actual);
  if (actualNorm === expectedNorm) {
    return { passed: true, styleWarnings: [] };
  }

  const punctuationIssue = compareTerminalPunctuation(expectedNorm, actualNorm, expected, actual);
  if (punctuationIssue) {
    return {
      passed: true,
      styleWarnings: [createLanguagePunctuationWarning([punctuationIssue])],
    };
  }

  // Tolerance for input("vraag"): prompt texts may be echoed by the runtime.
  const prompts = extractInputPromptStringsFromCode(sourceCode);
  if (prompts.length > 0) {
    const strippedActual = stripPromptStringsFromOutput(actual, prompts);
    const strippedNorm = normalizeOutputForComparison(strippedActual);
    if (strippedNorm === expectedNorm) {
      return { passed: true, styleWarnings: [] };
    }
    const strippedPunctuationIssue = compareTerminalPunctuation(expectedNorm, strippedNorm, expected, strippedActual);
    if (strippedPunctuationIssue) {
      return {
        passed: true,
        styleWarnings: [createLanguagePunctuationWarning([strippedPunctuationIssue])],
      };
    }
    if (expectedNorm.length > 0 && strippedNorm.endsWith(expectedNorm)) {
      return { passed: true, styleWarnings: [] };
    }
  }

  if (expectedNorm.length > 0 && actualNorm.endsWith(expectedNorm)) {
    return { passed: true, styleWarnings: [] };
  }

  return { passed: false, styleWarnings: [] };
}

function stripPythonComments(line) {
  let output = "";
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      output += char;
      continue;
    }

    if (char === "#") {
      break;
    }

    output += char;
  }

  return output;
}

function analyzePythonStyle(code) {
  const issues = [];
  const lines = String(code || "").replace(/\r\n/g, "\n").split("\n");
  const assignmentNamePattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

  lines.forEach((rawLine, index) => {
    const codePart = stripPythonComments(rawLine);
    const trimmed = codePart.trim();
    if (!trimmed) {
      return;
    }

    if (/[;]\s*$/.test(trimmed)) {
      issues.push({
        lineNumber: index + 1,
        codeLine: trimmed,
        message: "Python heeft meestal geen puntkomma op het einde van een regel nodig.",
      });
    }

    const assignmentMatch = codePart.match(assignmentNamePattern);
    if (assignmentMatch && /[A-Z]/.test(assignmentMatch[1])) {
      issues.push({
        lineNumber: index + 1,
        codeLine: trimmed,
        message: "Gebruik bij variabelen liefst snake_case, bijvoorbeeld aantal_leerlingen.",
      });
    }

    if (
      /[^\s<>=!+\-*/%](==|!=|<=|>=|=|[+\-*/%])[^\s=]/.test(codePart) ||
      /[^\s](==|!=|<=|>=|=|[+\-*/%])\s/.test(codePart) ||
      /\s(==|!=|<=|>=|=|[+\-*/%])[^\s=]/.test(codePart)
    ) {
      issues.push({
        lineNumber: index + 1,
        codeLine: trimmed,
        message: "Zet spaties rond operatoren zoals =, +, -, *, /, ==.",
      });
    }
  });

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createPythonStyleWarning(issues) {
  return {
    id: "python-style",
    title: "Controleer je Python-stijl",
    message: "Je oplossing is correct. Kijk nog even naar enkele Python-stijlpunten.",
    styleIssues: Array.isArray(issues) ? issues : [],
  };
}

function isPlainHigherLowerExercise(exercise) {
  const id = String(exercise && exercise.id ? exercise.id : "").toLowerCase();
  return id.endsWith("/01 hoger-lager") && !id.includes("liegen");
}

function findLyingHigherLowerLine(code) {
  const lines = String(code || "").replace(/\r\n/g, "\n").split("\n");
  const pattern = /random\s*\.\s*randint\s*\(\s*1\s*,\s*4\s*\)/;
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) {
    return null;
  }
  return {
    lineNumber: index + 1,
    codeLine: lines[index].trim(),
  };
}

function getExerciseSpecificEvaluationBlocker(exercise, code) {
  if (!isPlainHigherLowerExercise(exercise)) {
    return null;
  }

  const lyingLine = findLyingHigherLowerLine(code);
  if (!lyingLine) {
    return null;
  }

  return {
    title: "Je gebruikt de variant met liegen",
    message:
      "Deze Hoger-Lager-oefening is de gewone versie. De computer mag hier niet af en toe liegen.",
    summary:
      "Deze code gebruikt de variant met liegen in de gewone Hoger-Lager-oefening. Verwijder de extra toevalstrekking met random.randint(1, 4).",
    tip:
      "Gebruik maar één willekeurig getal: het getal dat geraden moet worden. De extra 25%-kans hoort pas bij 'Hoger-Lager maar met liegen'.",
    codeLine: `Regel ${lyingLine.lineNumber}: ${lyingLine.codeLine}`,
  };
}

function stdinToQueue(stdin) {
  const source = String(stdin || "").replace(/\r\n/g, "\n");
  const parts = source.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

const COMMON_PYTHON_SYNTAX_ISSUES = [
  {
    id: "missing_colon",
    title: "Dubbele punt ontbreekt",
    tip: "Zet ':' achter if/elif/else/for/while/def/class/try/except.",
  },
  {
    id: "unclosed_brackets",
    title: "Haakje of bracket niet gesloten",
    tip: "Controleer of elk '(', '[' en '{' ook een sluitend teken heeft.",
  },
  {
    id: "unclosed_string",
    title: "String niet correct afgesloten",
    tip: "Controleer aanhalingstekens: open en sluit met hetzelfde quote-teken.",
  },
  {
    id: "indentation",
    title: "Inspringing is fout",
    tip: "Gebruik consequent 4 spaties per blok en meng geen tabs met spaties.",
  },
  {
    id: "invalid_decimal",
    title: "Getalnotatie is ongeldig",
    tip: "Gebruik in Python een punt als decimaalteken: schrijf 4.5, niet 4,5.",
  },
  {
    id: "print_parentheses",
    title: "Print-oproep is niet correct",
    tip: "Gebruik in Python 3 altijd haakjes: print(...).",
  },
  {
    id: "assignment_in_condition",
    title: "Toekenning in voorwaarde",
    tip: "Gebruik '=' voor toekennen, maar '==' om te vergelijken in een if/while.",
  },
  {
    id: "missing_comma",
    title: "Komma ontbreekt",
    tip: "Controleer argumenten in print(), lijsten en tuples: scheid waarden met komma's.",
  },
  {
    id: "generic",
    title: "Algemene syntaxfout",
    tip: "Lees de regel rustig opnieuw en controleer haakjes, quotes, ':' en komma's.",
  },
];

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForOutputStability(options = {}) {
  const maxWaitMs = Number.isFinite(options.maxWaitMs) ? options.maxWaitMs : 700;
  const stableWindowMs = Number.isFinite(options.stableWindowMs) ? options.stableWindowMs : 90;

  const startedAt = Date.now();
  let lastText = extractTextOutputFromEntries(getPapyrosOutputEntries());
  let lastChangeAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    await wait(25);
    const nextText = extractTextOutputFromEntries(getPapyrosOutputEntries());
    if (nextText !== lastText) {
      lastText = nextText;
      lastChangeAt = Date.now();
      continue;
    }
    if (Date.now() - lastChangeAt >= stableWindowMs) {
      break;
    }
  }
}

function getCodeLineByNumber(code, lineNumber) {
  if (!Number.isFinite(lineNumber) || lineNumber < 1) {
    return "";
  }
  const lines = String(code || "").replace(/\r\n/g, "\n").split("\n");
  return String(lines[lineNumber - 1] || "");
}

function classifyPythonSyntaxIssue(details, code) {
  const msg = String((details && details.msg) || "").toLowerCase();
  const lineText = String((details && details.text) || getCodeLineByNumber(code, details && details.lineno)).toLowerCase();
  const combined = `${msg} ${lineText}`;

  if (combined.includes("expected ':'")) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "missing_colon");
  }
  if (
    combined.includes("was never closed") ||
    combined.includes("unmatched") ||
    combined.includes("unexpected eof while parsing")
  ) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "unclosed_brackets");
  }
  if (combined.includes("unterminated string literal") || combined.includes("eol while scanning string literal")) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "unclosed_string");
  }
  if (
    combined.includes("unexpected indent") ||
    combined.includes("unindent does not match any outer indentation level") ||
    combined.includes("inconsistent use of tabs and spaces")
  ) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "indentation");
  }
  if (combined.includes("invalid decimal literal")) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "invalid_decimal");
  }
  if (combined.includes("missing parentheses in call to 'print'")) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "print_parentheses");
  }
  if (combined.includes("cannot assign to")) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "assignment_in_condition");
  }
  if (
    combined.includes("invalid syntax") &&
    ((lineText.includes("print(") && !lineText.includes(",") && lineText.split(/["']/).length <= 2) || lineText.includes("[") || lineText.includes("("))
  ) {
    return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "missing_comma");
  }
  return COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "generic");
}

function buildSyntaxDebuggerMessage(details, code) {
  const issue = classifyPythonSyntaxIssue(details, code);
  const lineNo = Number.isFinite(Number(details && details.lineno))
    ? Number(details.lineno)
    : null;
  const offset = Number.isFinite(Number(details && details.offset))
    ? Number(details.offset)
    : null;
  const rawLine = getCodeLineByNumber(code, lineNo);
  const safeLine = rawLine.trim();
  const pythonMessage = String((details && details.msg) || "SyntaxError").trim();

  return buildSyntaxDebuggerDataFromParts({
    issue,
    lineNo,
    offset,
    safeLine,
    pythonMessage,
  }).consoleMessage;
}

function buildSyntaxDebuggerData(details, code) {
  const issue = classifyPythonSyntaxIssue(details, code);
  const lineNo = Number.isFinite(Number(details && details.lineno))
    ? Number(details.lineno)
    : null;
  const offset = Number.isFinite(Number(details && details.offset))
    ? Number(details.offset)
    : null;
  const rawLine = getCodeLineByNumber(code, lineNo);
  const safeLine = rawLine.trim();
  const pythonMessage = String((details && details.msg) || "SyntaxError").trim();

  return buildSyntaxDebuggerDataFromParts({
    issue,
    lineNo,
    offset,
    safeLine,
    pythonMessage,
  });
}

function buildSyntaxDebuggerDataFromParts(parts) {
  const issue = parts.issue || COMMON_PYTHON_SYNTAX_ISSUES.find((item) => item.id === "generic");
  const lineNo = Number.isFinite(parts.lineNo) ? parts.lineNo : null;
  const offset = Number.isFinite(parts.offset) ? parts.offset : null;
  const safeLine = String(parts.safeLine || "");
  const pythonMessage = String(parts.pythonMessage || "SyntaxError").trim();

  const lines = [
    `Syntaxfout: ${issue.title}.`,
  ];

  if (lineNo) {
    lines.push(`Regel: ${lineNo}${offset ? `, positie ${offset}` : ""}.`);
  }
  lines.push(`Tip: ${issue.tip}`);
  lines.push(`Python meldt: ${pythonMessage}.`);
  if (safeLine.length > 0) {
    lines.push(`Controleer deze regel: ${safeLine}`);
  }

  return {
    issueId: String(issue.id || "generic"),
    issueTitle: String(issue.title || "Algemene syntaxfout"),
    tip: String(issue.tip || ""),
    summary: "Los de syntaxfout hieronder op; daarna starten de testcases automatisch.",
    pythonMessage,
    lineNumber: lineNo,
    offset,
    codeLine: safeLine,
    consoleMessage: lines.join("\n"),
  };
}

function buildSyntaxPrecheckScript(code) {
  const sourceLiteral = JSON.stringify(String(code || ""));
  return [
    "import ast, json",
    `source = ${sourceLiteral}`,
    "try:",
    "    ast.parse(source)",
    "    print('__PIK_SYNTAX_OK__')",
    "except SyntaxError as e:",
    "    payload = {",
    "        'msg': getattr(e, 'msg', str(e)),",
    "        'lineno': getattr(e, 'lineno', None),",
    "        'offset': getattr(e, 'offset', None),",
    "        'text': ((getattr(e, 'text', '') or '').rstrip('\\n'))",
    "    }",
    "    print('__PIK_SYNTAX_ERROR__' + json.dumps(payload, ensure_ascii=False))",
  ].join("\n");
}

function parseSyntaxPrecheckOutput(rawOutput) {
  const text = String(rawOutput || "");
  const okMarker = "__PIK_SYNTAX_OK__";
  const errMarker = "__PIK_SYNTAX_ERROR__";

  if (text.includes(okMarker)) {
    return { ok: true, details: null };
  }

  const idx = text.lastIndexOf(errMarker);
  if (idx < 0) {
    return { ok: true, details: null };
  }

  let payloadText = text.slice(idx + errMarker.length).trim();
  const jsonStart = payloadText.indexOf("{");
  const jsonEnd = payloadText.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd >= jsonStart) {
    payloadText = payloadText.slice(jsonStart, jsonEnd + 1);
  }

  try {
    const parsed = JSON.parse(payloadText);
    return { ok: false, details: parsed };
  } catch {
    return { ok: false, details: { msg: "SyntaxError", lineno: null, offset: null, text: "" } };
  }
}

async function runPythonSyntaxPrecheck(code) {
  const originalPending = [...state.pendingInputs];
  const originalAwaiting = state.awaitingInput;
  const originalInputPrompt = state.currentInputPrompt;

  try {
    clearPapyrosBuffers();
    state.pendingInputs = [];
    state.awaitingInput = false;
    state.currentInputPrompt = "";
    refreshRuntimeInputStatus();

    const script = buildSyntaxPrecheckScript(code);
    if (!setRunnerCode(script)) {
      return { ok: true, details: null };
    }
    if (!state.papyros.runner || typeof state.papyros.runner.start !== "function") {
      return { ok: true, details: null };
    }

    await state.papyros.runner.start();
    await waitForOutputStability({ maxWaitMs: 800, stableWindowMs: 100 });

    const rawOutput = extractTextOutputFromEntries(getPapyrosOutputEntries());
    return parseSyntaxPrecheckOutput(rawOutput);
  } catch {
    // If precheck itself fails for platform reasons, do not block execution.
    return { ok: true, details: null };
  } finally {
    state.pendingInputs = originalPending;
    state.awaitingInput = originalAwaiting;
    state.currentInputPrompt = originalInputPrompt;
    refreshRuntimeInputStatus();
  }
}

function parseTestsSpec(rawText, formatHint, testsPath) {
  const extensionHint =
    String(formatHint || "")
      .toLowerCase()
      .trim() ||
    String(testsPath || "")
      .split(".")
      .pop()
      .toLowerCase();

  if (extensionHint === "json") {
    return JSON.parse(rawText);
  }

  if ((extensionHint === "yaml" || extensionHint === "yml") && window.jsyaml && typeof window.jsyaml.load === "function") {
    return window.jsyaml.load(rawText);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    if (window.jsyaml && typeof window.jsyaml.load === "function") {
      return window.jsyaml.load(rawText);
    }
  }

  throw new Error("Testsbestand kon niet geparsed worden (JSON/YAML parser).");
}

function extractTestcasesFromSpec(spec) {
  const out = [];

  const extractTextPayload = (value) => {
    if (value == null) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object" && "data" in value) {
      return String(value.data ?? "");
    }
    return String(value ?? "");
  };

  const extractPythonSetup = (before) => {
    if (!before || typeof before !== "object") {
      return "";
    }
    const pythonSetup = before.python;
    if (typeof pythonSetup === "string") {
      return pythonSetup;
    }
    if (pythonSetup && typeof pythonSetup === "object" && "data" in pythonSetup) {
      return String(pythonSetup.data ?? "");
    }
    return "";
  };

  const collectCase = (tc, setupCode = "") => {
    if (!tc || typeof tc !== "object") {
      return;
    }
    out.push({
      stdin: extractTextPayload(tc.stdin ?? tc.input?.stdin),
      stdout: extractTextPayload(tc.stdout ?? tc.output?.stdout),
      setupCode: String(setupCode || ""),
    });
  };

  const collectContext = (ctx) => {
    if (!ctx || typeof ctx !== "object") {
      return;
    }
    const setupCode = extractPythonSetup(ctx.before);
    if (Array.isArray(ctx.testcases)) {
      ctx.testcases.forEach((tc) => collectCase(tc, setupCode));
    }
  };

  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (Array.isArray(node.tabs)) {
      node.tabs.forEach(visit);
    }
    if (Array.isArray(node.contexts)) {
      node.contexts.forEach(collectContext);
    }
    if (Array.isArray(node.testcases)) {
      const setupCode = extractPythonSetup(node.before);
      node.testcases.forEach((tc) => collectCase(tc, setupCode));
    }
  };

  visit(spec);
  return out;
}

function getTestsCacheKey(exercise) {
  if (!exercise) {
    return "none";
  }
  return `${exercise.id || "unknown"}::${exercise.testsPath || ""}`;
}

async function loadExerciseTestcases(exercise) {
  if (!exercise || !exercise.testsPath) {
    return [];
  }

  const cacheKey = getTestsCacheKey(exercise);
  if (state.testsCache[cacheKey]) {
    return state.testsCache[cacheKey];
  }

  const raw = await fetchTextFile(exercise.testsPath);
  if (!raw) {
    throw new Error("Testsbestand kon niet geladen worden.");
  }

  const parsed = parseTestsSpec(raw, exercise.testsFormat, exercise.testsPath);
  const testcases = extractTestcasesFromSpec(parsed);

  state.testsCache[cacheKey] = testcases;
  return testcases;
}

async function runSingleEvaluationCase(code, stdin, setupCode = "") {
  const maxAttempts = 2;
  let lastActual = "";
  const codeToRun = setupCode ? `${setupCode}\n${code}` : code;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    clearPapyrosBuffers();
    state.pendingInputs = stdinToQueue(stdin);
    state.awaitingInput = false;
    state.currentInputPrompt = "";
    refreshRuntimeInputStatus();

    if (!setRunnerCode(codeToRun)) {
      throw new Error("Kon de code niet doorgeven aan Papyros runner.");
    }

    if (!state.papyros.runner || typeof state.papyros.runner.start !== "function") {
      throw new Error("Papyros runner.start() is niet beschikbaar.");
    }

    try {
      await state.papyros.runner.start();
    } catch (error) {
      const runtimeError = extractRuntimeErrorFromEntries(getPapyrosOutputEntries());
      throw new Error(runtimeError || formatErrorDetails(error) || String(error || "Onbekende runtime-fout"));
    }
    await waitForOutputStability();

    const outputEntries = getPapyrosOutputEntries();
    const runtimeError = extractRuntimeErrorFromEntries(outputEntries);
    if (runtimeError) {
      throw new Error(runtimeError);
    }
    const actual = extractTextOutputFromEntries(outputEntries);
    lastActual = actual;
    const normalizedActual = normalizeOutputForComparison(actual);
    if (normalizedActual.length > 0 || attempt === maxAttempts) {
      return actual;
    }

    await wait(40);
  }

  return lastActual;
}

async function evaluateCurrentExercise(code) {
  const exercise = getCurrentExercise();
  if (!exercise || !exercise.evaluable || !exercise.testsPath) {
    return { applicable: false };
  }

  const conceptBlocker = getExerciseSpecificEvaluationBlocker(exercise, code);
  if (conceptBlocker) {
    return {
      applicable: true,
      success: false,
      mode: "concept",
      total: 0,
      passedCount: 0,
      failedCount: 0,
      caseResults: [],
      errorMessage: conceptBlocker.summary,
      conceptDetails: conceptBlocker,
    };
  }

  const testcases = await loadExerciseTestcases(exercise);
  if (!Array.isArray(testcases) || testcases.length === 0) {
    return { applicable: false };
  }

  const originalConsole = ui.consoleOutput.textContent;
  const originalRuntimeText = ui.runtimeStatus.textContent;
  const originalRuntimeClass = ui.runtimeStatus.className;
  const originalPending = [...state.pendingInputs];
  const originalAwaiting = state.awaitingInput;
  const originalInputPrompt = state.currentInputPrompt;

  try {
    let passedCount = 0;
    const caseResults = [];

    for (let index = 0; index < testcases.length; index += 1) {
      const tc = testcases[index];
      try {
        // eslint-disable-next-line no-await-in-loop
        const actual = await runSingleEvaluationCase(code, tc.stdin, tc.setupCode);
        const comparison = compareOutputExpected(tc.stdout, actual, code);
        const passed = comparison.passed;
        const result = {
          index,
          passed,
          stdin: tc.stdin,
          expected: tc.stdout,
          actual,
          runtimeError: "",
          styleWarnings: Array.isArray(comparison.styleWarnings) ? comparison.styleWarnings : [],
        };
        caseResults.push(result);

        if (passed) {
          passedCount += 1;
        }
      } catch (error) {
        const rawMessage = formatErrorDetails(error) || String(error || "Onbekende fout");
        caseResults.push({
          index,
          passed: false,
          stdin: tc.stdin,
          expected: tc.stdout,
          actual: "",
          runtimeError: translateRuntimeError(rawMessage),
          styleWarnings: [],
        });
      }
    }

    const failedCount = Math.max(0, testcases.length - passedCount);
    const firstFailCase = caseResults.find((item) => !item.passed) || null;

    const styleWarnings = [];
    if (failedCount === 0) {
      caseResults.forEach((caseResult) => {
        (caseResult.styleWarnings || []).forEach((warning) => {
          styleWarnings.push(warning);
        });
      });
      const pythonStyle = analyzePythonStyle(code);
      if (!pythonStyle.ok) {
        styleWarnings.push(createPythonStyleWarning(pythonStyle.issues));
      }
    }

    return {
      applicable: true,
      success: failedCount === 0,
      total: testcases.length,
      passedCount,
      failedCount,
      failedIndex: firstFailCase ? firstFailCase.index : -1,
      expected: firstFailCase ? firstFailCase.expected : "",
      actual: firstFailCase ? firstFailCase.actual : "",
      firstFailCase,
      caseResults,
      styleWarnings,
    };
  } finally {
    state.pendingInputs = originalPending;
    state.awaitingInput = originalAwaiting;
    state.currentInputPrompt = originalInputPrompt;
    ui.consoleOutput.textContent = originalConsole;
    ui.runtimeStatus.textContent = originalRuntimeText;
    ui.runtimeStatus.className = originalRuntimeClass;
    refreshRuntimeInputStatus();
  }
}

function setupInputBridge() {
  const io = state.papyros && state.papyros.io;
  if (!io || typeof io.subscribe !== "function") {
    return;
  }

  state.inputChannelBroken = false;
  setRuntimeInputControlsDisabled(false);
  state.awaitingInput = false;
  state.currentInputPrompt = "";
  refreshRuntimeInputStatus();

  io.subscribe(() => {
    renderLiveOutputFromPapyros();

    if (!io.awaitingInput) {
      state.awaitingInput = false;
      state.currentInputPrompt = "";
      refreshRuntimeInputStatus();
      return "";
    }

    state.awaitingInput = true;
    state.currentInputPrompt = extractInputPromptText(io);
    renderLiveOutputFromPapyros();

    if (state.pendingInputs.length > 0 && typeof io.provideInput === "function") {
      const nextValue = state.pendingInputs.shift();
      provideRuntimeInputSafely(io, nextValue)
        .then(() => {
          state.awaitingInput = false;
          state.currentInputPrompt = "";
          refreshRuntimeInputStatus();
          renderLiveOutputFromPapyros();
        })
        .catch((error) => {
          state.pendingInputs.unshift(nextValue);
          markInputChannelBroken(error);
          refreshRuntimeInputStatus();
        });
      return "";
    }

    refreshRuntimeInputStatus();
    return "";
  }, "awaitingInput");
}

async function checkInputServiceWorker() {
  if (!ENABLE_INPUT_SW_AUTODETECT) {
    state.inputSwAvailable = false;
    state.inputSwIssue = "Auto-detectie voor input service worker staat uit.";
    return false;
  }

  try {
    const swUrl = getInputServiceWorkerUrl();
    let response = await fetch(swUrl.href, { method: "HEAD", cache: "no-store" });
    if (response.status === 405) {
      response = await fetch(swUrl.href, { method: "GET", cache: "no-store" });
    }
    if (!response.ok) {
      state.inputSwAvailable = false;
      state.inputSwIssue = "input-sw.js kon niet geladen worden.";
      return false;
    }

    if (!("serviceWorker" in navigator)) {
      state.inputSwAvailable = false;
      state.inputSwIssue = "Deze browser ondersteunt geen service workers.";
      return false;
    }

    const scopePath = getAppScopePath();
    const swReady = await ensureInputServiceWorkerReady(swUrl.pathname, scopePath, 7000);
    if (!swReady.ok) {
      state.inputSwAvailable = false;
      state.inputSwIssue = describeInputSwFailure(swReady.reason, scopePath);
      return false;
    }

    state.inputSwAvailable = true;
    state.inputSwIssue = "";
    return true;
  } catch {
    state.inputSwAvailable = false;
    state.inputSwIssue = "Onbekende fout bij controle van input-sw.js.";
    return false;
  }
}

async function ensureRunnerReady() {
  const runner = state.papyros && state.papyros.runner;
  if (!runner || !runner.backend || typeof runner.start !== "function") {
    throw new Error("Papyros runner werd niet correct geïnitialiseerd.");
  }

  const backend = await Promise.race([
    runner.backend,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout bij opstarten van de Python-backend (worker handshake).")), 45000)
    ),
  ]);
  if (!backend || typeof backend.call !== "function") {
    throw new Error("De backend kon niet opstarten (worker of Python assets niet geladen).");
  }
}

async function initializePapyros() {
  setRuntimeStatus("Python runtime laden...", "busy");
  await checkLocalBackendWorkers();
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
  const hasInputSw = hasSharedArrayBuffer ? true : await checkInputServiceWorker();

  const mod = await loadPapyrosModule();
  state.papyros = mod.papyros;

  if (!state.papyros || typeof state.papyros.launch !== "function") {
    throw new Error("Papyros is geladen, maar launch() ontbreekt.");
  }

  const extraManagers = mod.BackendManagerFallback ? [mod.BackendManagerFallback] : [];
  patchPapyrosInputConfig(state.papyros, mod.BackendManager, mod.makeChannel, extraManagers);
  patchPapyrosBackends(mod.BackendManager);
  if (mod.BackendManagerFallback && mod.BackendManagerFallback !== mod.BackendManager) {
    patchPapyrosBackends(mod.BackendManagerFallback);
  }
  patchRunnerLaunch(state.papyros, mod.BackendManager, mod.ComlinkProxy);

  if (!hasSharedArrayBuffer && !hasInputSw) {
    if (
      !String(state.inputSwIssue || "").includes("wordt geactiveerd") &&
      typeof console !== "undefined" &&
      typeof console.warn === "function"
    ) {
      console.warn(
        "Input service worker niet bevestigd bij opstart.",
        state.inputSwIssue || "(geen detail)"
      );
    }
  }

  await state.papyros.launch();
  await ensureRunnerReady();
  setupInputBridge();
  if (!hasSharedArrayBuffer && !state.inputSwAvailable) {
    setRuntimeStatus("Klaar voor Python (input beperkt)", "ready");
    setRuntimeInputStatus("Inputkanaal nog niet actief. Herlaad hard (Ctrl+Shift+R) als input() faalt.", "error");
    showToast("Runtime gestart met beperkte input-ondersteuning.", false);
    return;
  }
  setRuntimeStatus("Klaar voor Python", "ready");
}

async function runCode() {
  if (state.running) {
    return;
  }
  if (!state.papyros) {
    showToast("Runtime is nog niet klaar. Even geduld.", false);
    return;
  }

  closeEvaluationModal();
  state.running = true;
  ui.runButton.disabled = true;
  ui.runButton.textContent = "Bezig...";
  stopWorkTimer();
  incrementAttempts();
  updateMetrics();
  clearOutputPanels();
  setRuntimeStatus("Code uitvoeren...", "busy");
  state.inputChannelBroken = false;
  setRuntimeInputControlsDisabled(false);
  state.awaitingInput = false;
  state.currentInputPrompt = "";
  refreshRuntimeInputStatus();

  try {
    await ensureRunnerReady();

    const code = state.editor.getValue();
    const exercise = getCurrentExercise();
    localStorage.setItem(toScopedStorageKey(STORAGE.code), code);

    const syntaxPrecheck = await runPythonSyntaxPrecheck(code);
    if (!syntaxPrecheck.ok) {
      const syntaxDetails = buildSyntaxDebuggerData(syntaxPrecheck.details || {}, code);
      const syntaxMessage = syntaxDetails.consoleMessage;
      ui.consoleOutput.textContent = syntaxMessage;
      setRuntimeStatus("Syntaxfout gevonden", "error");
      let evalResult = null;

      if (exercise && exercise.evaluable) {
        setExerciseEvalStatus(exercise.id, "fail");
        renderProgress();
        evalResult = {
          applicable: true,
          success: false,
          mode: "syntax",
          total: 0,
          passedCount: 0,
          failedCount: 0,
          caseResults: [],
          errorMessage: syntaxDetails.summary,
          syntaxDetails,
        };
        const saveResult = saveLatestExerciseSnapshot("fail", {
          evalResult,
          evalSummary: "Syntaxfout - testcases niet gestart",
        });
        if (!saveResult.ok && saveResult.reason === "quota") {
          showToast("Opslaan van resultaten mislukt: lokale opslag is vol.", false);
        }
      }

      if (evalResult) {
        showEvaluationModal(evalResult, exercise.title || decodeTitleFromId(exercise.id));
      }
      showToast("Syntaxfout gevonden. Verbeter je code en probeer opnieuw.", false);
      return;
    }

    clearPapyrosBuffers();
    state.pendingInputs = [];
    state.awaitingInput = false;
    state.currentInputPrompt = "";
    refreshRuntimeInputStatus();

    if (!setRunnerCode(code)) {
      throw new Error("Kon de code niet doorgeven aan Papyros runner.");
    }

    if (!state.papyros.runner || typeof state.papyros.runner.start !== "function") {
      throw new Error("Papyros runner.start() is niet beschikbaar.");
    }

    startLiveOutputRendering();
    try {
      await state.papyros.runner.start();
    } catch (error) {
      const runtimeError = extractRuntimeErrorFromEntries(getPapyrosOutputEntries());
      throw new Error(runtimeError || formatErrorDetails(error) || String(error || "Onbekende runtime-fout"));
    }
    stopLiveOutputRendering();
    await waitForOutputStability({ maxWaitMs: 900, stableWindowMs: 100 });
    renderOutputFromPapyros();
    const liveRuntimeError = extractRuntimeErrorFromEntries(getPapyrosOutputEntries());
    if (liveRuntimeError) {
      throw new Error(liveRuntimeError);
    }

    let toastMessage = "Code uitgevoerd.";
    let toastOk = true;

    if (exercise && exercise.evaluable && exercise.testsPath) {
      setRuntimeStatus("Evaluatie uitvoeren...", "busy");
      try {
        const evalResult = await evaluateCurrentExercise(code);
        if (evalResult.applicable) {
          const exerciseTitle = exercise.title || decodeTitleFromId(exercise.id);
          if (evalResult.success) {
            setExerciseEvalStatus(exercise.id, "success");
            toastMessage = "Code uitgevoerd. Oefening correct.";
            toastOk = true;
            const saveResult = saveLatestExerciseSnapshot("success", {
              evalResult,
              evalSummary: summarizeEvaluationResult(evalResult),
            });
            if (!saveResult.ok && saveResult.reason === "quota") {
              showToast("Opslaan van resultaten mislukt: lokale opslag is vol.", false);
            }
          } else {
            setExerciseEvalStatus(exercise.id, "fail");
            toastMessage = `Code uitgevoerd, maar ${evalResult.failedCount}/${evalResult.total} testcases mislukten.`;
            toastOk = false;
            const saveResult = saveLatestExerciseSnapshot("fail", {
              evalResult,
              evalSummary: summarizeEvaluationResult(evalResult),
            });
            if (!saveResult.ok && saveResult.reason === "quota") {
              showToast("Opslaan van resultaten mislukt: lokale opslag is vol.", false);
            }
          }
          renderProgress();
          showEvaluationModal(evalResult, exerciseTitle);
        }
      } catch (evalError) {
        const evalErrorMessage = String(evalError && evalError.message ? evalError.message : evalError);
        const exerciseTitle = exercise.title || decodeTitleFromId(exercise.id);
        setExerciseEvalStatus(exercise.id, "fail");
        renderProgress();
        const evalResult = {
          applicable: true,
          success: false,
          total: 0,
          passedCount: 0,
          failedCount: 0,
          caseResults: [],
          errorMessage: `Evaluatie kon niet uitgevoerd worden: ${evalErrorMessage}`,
        };
        const saveResult = saveLatestExerciseSnapshot("fail", {
          evalResult,
          evalSummary: evalResult.errorMessage,
        });
        if (!saveResult.ok && saveResult.reason === "quota") {
          showToast("Opslaan van resultaten mislukt: lokale opslag is vol.", false);
        }
        toastMessage = `Code uitgevoerd, maar evaluatie kon niet lopen: ${evalErrorMessage}`;
        toastOk = false;
        showEvaluationModal(
          evalResult,
          exerciseTitle
        );
      }
    }

    setRuntimeStatus("Uitvoering klaar", "ready");
    showToast(toastMessage, toastOk);
  } catch (error) {
    const friendly = translateRuntimeError(error && error.message ? error.message : String(error));
    ui.consoleOutput.textContent = `Fout: ${friendly}`;
    const exercise = getCurrentExercise();
    if (exercise && exercise.evaluable) {
      setExerciseEvalStatus(exercise.id, "fail");
      renderProgress();
      const evalResult = {
        applicable: true,
        success: false,
        total: 0,
        passedCount: 0,
        failedCount: 0,
        caseResults: [],
        errorMessage: `Uitvoering mislukte vóór evaluatie. Runtime-fout: ${friendly}`,
      };
      const saveResult = saveLatestExerciseSnapshot("fail", {
        evalResult,
        evalSummary: evalResult.errorMessage,
      });
      if (!saveResult.ok && saveResult.reason === "quota") {
        showToast("Opslaan van resultaten mislukt: lokale opslag is vol.", false);
      }
      showEvaluationModal(
        evalResult,
        exercise.title || decodeTitleFromId(exercise.id)
      );
    }
    setRuntimeStatus("Uitvoering met fout", "error");
    showToast("Uitvoering mislukte. Bekijk de foutmelding.", false);
  } finally {
    stopLiveOutputRendering();
    state.awaitingInput = false;
    state.currentInputPrompt = "";
    state.running = false;
    ui.runButton.disabled = false;
    ui.runButton.textContent = "Uitvoeren";
    startWorkTimer();
    updateMetrics();
    refreshRuntimeInputStatus();
  }
}

function clearSnapshotsForExercise(exerciseId) {
  if (!exerciseId) {
    return;
  }
  const encodedExerciseId = encodeURIComponent(String(exerciseId));
  const needle = `:${encodedExerciseId}:`;
  const keys = getSnapshotIndexKeys();
  const kept = [];

  keys.forEach((key) => {
    if (key.includes(needle)) {
      localStorage.removeItem(key);
    } else {
      kept.push(key);
    }
  });

  writeSnapshotIndexKeys(kept);
}

function clearAllProgressData() {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    const isScopedExerciseData =
      key.startsWith(`${STORAGE.code}:`) ||
      key.startsWith(`${STORAGE.attempts}:`) ||
      key.startsWith(`${STORAGE.workMs}:`) ||
      key.startsWith(`${STORAGE.evalStatus}:`) ||
      key.startsWith(`${STORAGE.starterVersion}:`);

    const isGlobalProgressData =
      key === STORAGE.selection ||
      key === STORAGE.snapshotsIndex ||
      key.startsWith(`${STORAGE.snapshotsPrefix}:`);

    if (isScopedExerciseData || isGlobalProgressData) {
      localStorage.removeItem(key);
    }
  });
}

async function resetCurrentExerciseProgress() {
  const exercise = getCurrentExercise();
  const exerciseId = getCurrentExerciseId();
  const starter = await resolveStarterCode(exercise);
  state.editor.setValue(starter);
  localStorage.setItem(toScopedStorageKey(STORAGE.code, exerciseId), starter);
  localStorage.setItem(toScopedStorageKey(STORAGE.starterVersion, exerciseId), APP_VERSION);
  localStorage.removeItem(toScopedStorageKey(STORAGE.attempts, exerciseId));
  localStorage.removeItem(toScopedStorageKey(STORAGE.workMs, exerciseId));
  if (exercise && exercise.id) {
    setExerciseEvalStatus(exercise.id, null);
    clearSnapshotsForExercise(exercise.id);
  }
  clearOutputPanels();
  resetWorkTimer();
  updateMetrics();
  renderProgress();
  renderChapterMenu();
  refreshRuntimeInputStatus();
  showToast("Alleen de huidige oefening werd gewist.", true);
}

async function resetAllCourseProgress() {
  clearAllProgressData();

  const starter = await resolveStarterCode(getCurrentExercise());
  state.editor.setValue(starter);
  localStorage.setItem(toScopedStorageKey(STORAGE.code), starter);
  localStorage.setItem(toScopedStorageKey(STORAGE.starterVersion), APP_VERSION);
  persistSelection();

  clearOutputPanels();
  resetWorkTimer();
  updateMetrics();
  renderProgress();
  renderChapterMenu();
  refreshRuntimeInputStatus();
  showToast("De volledige cursusvoortgang werd gewist.", true);
}

function breakLongTokensForPdf(text, chunk = 80) {
  const source = String(text ?? "");
  return source
    .split("\n")
    .map((line) =>
      line.replace(new RegExp(`\\S{${chunk},}`, "g"), (token) => {
        const parts = token.match(new RegExp(`.{1,${chunk}}`, "g")) || [token];
        return parts.join(" ");
      })
    )
    .join("\n");
}

function sanitizePdfFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function drawRubricTable(pdf, startX, startY, color = [82, 0, 255]) {
  const tableWidth = 520;
  const criteriumColWidth = 160;
  const scoreColWidth = 54;
  const headerH = 28;
  const rowH = 44;
  const criteria = [
    "Functioneel",
    "Leesbaar",
    "Programmeerconcept",
    "Wiskundeconcept",
    "Creativiteit",
  ];

  const col1 = startX + criteriumColWidth;
  const col2 = col1 + scoreColWidth;

  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.8);
  pdf.rect(startX, startY, tableWidth, headerH + criteria.length * rowH, "S");

  pdf.setFillColor(...color);
  pdf.rect(startX, startY, tableWidth, headerH, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Criterium", startX + 8, startY + 19);
  pdf.text("Score", col1 + 12, startY + 19);
  pdf.text("Feedback", col2 + 12, startY + 19);

  pdf.setDrawColor(...color);
  pdf.line(col1, startY, col1, startY + headerH + criteria.length * rowH);
  pdf.line(col2, startY, col2, startY + headerH + criteria.length * rowH);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  criteria.forEach((label, index) => {
    const rowY = startY + headerH + index * rowH;
    pdf.line(startX, rowY, startX + tableWidth, rowY);
    pdf.setTextColor(...color);
    pdf.setFont("helvetica", "bold");
    pdf.text(label, startX + 8, rowY + 26);
  });

  return startY + headerH + criteria.length * rowH + 20;
}

function exportSeriesPdf(profile) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("PDF-bibliotheek is niet beschikbaar.", false);
    return;
  }

  const firstName = String((profile && profile.firstName) || "").trim();
  const lastName = String((profile && profile.lastName) || "").trim();
  const className = String((profile && profile.className) || "").trim();

  if (!firstName || !lastName || !className) {
    showToast("Voornaam, familienaam en klas zijn verplicht.", false);
    return;
  }

  const today = dateKeyLocal(new Date());
  const records = getSavedSnapshotsForDate(today);
  if (!records.length) {
    showToast("Geen opgeslagen runs gevonden voor vandaag.", false);
    return;
  }

  const fullName = `${firstName} ${lastName}`.trim();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageHeight = pdf.internal.pageSize.height;
  const margin = 36;
  const contentWidth = 520;
  const COLOR_PURPLE = [82, 0, 255];
  let y = margin;

  function setBodyFont() {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
  }

  function setHeaderFont() {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
  }

  function setLabelFont() {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
  }

  function setCodeFont() {
    pdf.setFont("courier", "normal");
    pdf.setFontSize(10);
  }

  function ensureRoom(heightNeeded) {
    if (y + heightNeeded > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  }

  function addMultilineSection(label, text, code = false) {
    pdf.setTextColor(...COLOR_PURPLE);
    setLabelFont();
    pdf.text(label, margin, y);
    y += 16;

    pdf.setTextColor(0, 0, 0);
    if (code) {
      setCodeFont();
    } else {
      setBodyFont();
    }

    const normalized = breakLongTokensForPdf(String(text || "").trim() || "(leeg)", 80);
    const lines = pdf.splitTextToSize(normalized, contentWidth);
    const lineHeight = code ? 13 : 14;
    let index = 0;
    while (index < lines.length) {
      let fit = Math.floor((pageHeight - y - margin) / lineHeight);
      if (fit < 1) {
        pdf.addPage();
        y = margin;
        continue;
      }
      const chunk = lines.slice(index, index + fit);
      pdf.text(chunk, margin, y);
      y += chunk.length * lineHeight;
      index += fit;
      if (index < lines.length) {
        pdf.addPage();
        y = margin;
      }
    }
    y += 10;
  }

  pdf.setTextColor(...COLOR_PURPLE);
  setHeaderFont();
  pdf.text("Python in de Klas - Reeks export", margin, y);
  y += 28;

  pdf.setTextColor(0, 0, 0);
  setBodyFont();
  pdf.text(`Naam: ${fullName}`, margin, y);
  y += 18;
  pdf.text(`Klas: ${className}`, margin, y);
  y += 18;
  pdf.text(`Datum: ${today}`, margin, y);
  y += 18;
  pdf.text(`Aantal oefeningen: ${records.length}`, margin, y);
  y += 24;

  pdf.setTextColor(...COLOR_PURPLE);
  setLabelFont();
  pdf.text("Inhoud", margin, y);
  y += 16;

  pdf.setTextColor(0, 0, 0);
  setBodyFont();
  const tocLines = records.map((record, index) => {
    const statusLabel = record.evalStatus === "success" ? "geslaagd" : "laatste run niet geslaagd";
    return `${index + 1}. ${record.exerciseTitle || "Oefening"} (${statusLabel})`;
  });
  const tocWrapped = pdf.splitTextToSize(tocLines.join("\n"), contentWidth);
  pdf.text(tocWrapped, margin, y);

  records.forEach((record, index) => {
    pdf.addPage();
    y = margin;

    pdf.setTextColor(...COLOR_PURPLE);
    setHeaderFont();
    pdf.text(`Oefening ${index + 1} / ${records.length}`, margin, y);
    y += 24;

    pdf.setTextColor(0, 0, 0);
    setBodyFont();
    const chapterLine = `${record.chapterTitle || "Hoofdstuk"} > ${record.subchapterTitle || "Subhoofdstuk"}`;
    pdf.text(chapterLine, margin, y);
    y += 16;
    pdf.text(record.exerciseTitle || "Oefening", margin, y);
    y += 18;

    const statusLine =
      record.evalStatus === "success"
        ? "Status: Geslaagd"
        : "Status: Niet geslaagd (laatste mislukte run)";
    pdf.text(statusLine, margin, y);
    y += 16;

    const workLabel = formatDuration(Number(record.workMs || 0));
    pdf.text(`Pogingen: ${Number(record.attempts || 0)} | Tijd: ${workLabel}`, margin, y);
    y += 18;

    if (record.evalSummary) {
      pdf.text(`Evaluatie: ${String(record.evalSummary)}`, margin, y);
      y += 18;
    }

    addMultilineSection("Opdracht:", record.assignmentText || "(geen opdrachttekst bewaard)", false);
    addMultilineSection("Code:", record.code || "(geen code bewaard)", true);
    addMultilineSection("Uitvoer:", record.output || "(geen uitvoer)", true);

    if (record.evalStatus === "fail" && record.evalInfo && typeof record.evalInfo === "object") {
      const failCase = record.evalInfo.firstFailCase || null;
      if (record.evalInfo.errorMessage) {
        addMultilineSection("Evaluatiefout:", String(record.evalInfo.errorMessage), false);
      }
      if (failCase) {
        addMultilineSection("Eerste fout - invoer:", String(failCase.stdin || "(leeg)"), true);
        addMultilineSection("Eerste fout - verwachte uitvoer:", String(failCase.expected || "(leeg)"), true);
        addMultilineSection("Eerste fout - leerlinguitvoer:", String(failCase.actual || "(leeg)"), true);
        if (failCase.runtimeError) {
          addMultilineSection("Eerste fout - runtime:", String(failCase.runtimeError), true);
        }
      }
    }

    ensureRoom(270);
    pdf.setTextColor(...COLOR_PURPLE);
    setLabelFont();
    pdf.text("Beoordeling & feedback leerkracht:", margin, y);
    y += 18;
    y = drawRubricTable(pdf, margin, y, COLOR_PURPLE);

    ensureRoom(95);
    pdf.setTextColor(...COLOR_PURPLE);
    setLabelFont();
    pdf.text("Verificatiegegevens:", margin, y);
    y += 16;

    const savedStamp = record.savedAt ? new Date(record.savedAt).toLocaleString("nl-BE") : "Onbekend";
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Bewaard op: ${savedStamp}`, margin, y);
    y += 12;
    const urlLines = pdf.splitTextToSize(
      breakLongTokensForPdf(`Pagina-URL: ${record.pageUrl || ""}`, 80),
      contentWidth
    );
    pdf.text(urlLines, margin, y);
    y += urlLines.length * 12;
    const uaLines = pdf.splitTextToSize(
      breakLongTokensForPdf(`Browser: ${record.userAgent || ""}`, 80),
      contentWidth
    );
    pdf.text(uaLines, margin, y);
  });

  const parts = [firstName, lastName, className, today]
    .map(sanitizePdfFileName)
    .filter((value) => value.length > 0);
  const fileName = `${parts.join("-")}-python-reeks-export.pdf`;
  pdf.save(fileName);
  showToast("PDF geëxporteerd.", true);
}

function onPdfExportConfirm() {
  const firstName = ui.pdfFirstName ? String(ui.pdfFirstName.value || "").trim() : "";
  const lastName = ui.pdfLastName ? String(ui.pdfLastName.value || "").trim() : "";
  const className = ui.pdfClassName ? String(ui.pdfClassName.value || "").trim() : "";

  if (!firstName || !lastName || !className) {
    showToast("Vul voornaam, familienaam en klas in.", false);
    return;
  }

  closePdfModal();
  exportSeriesPdf({ firstName, lastName, className });
}

function initializeEditor() {
  const codeStorageKey = toScopedStorageKey(STORAGE.code);
  const exercise = getCurrentExercise();
  let startCode = localStorage.getItem(codeStorageKey);
  if (startCode === null) {
    startCode = DEFAULT_CODE;
  }
  if (!exercise?.starterPath && isLegacyPlaceholderCode(startCode)) {
    startCode = DEFAULT_CODE;
    localStorage.setItem(codeStorageKey, startCode);
  }
  state.editor = window.CodeMirror(ui.codeEditor, {
    value: startCode,
    mode: "python",
    lineNumbers: true,
    tabSize: 4,
    indentUnit: 4,
    autofocus: true,
  });

  state.editor.on("change", () => {
    localStorage.setItem(toScopedStorageKey(STORAGE.code), state.editor.getValue());
    startWorkTimer();
    updateMetrics();
  });
}

function setupSplitter() {
  const splitter = ui.splitter;
  if (!splitter) {
    return;
  }

  let dragging = false;
  splitter.addEventListener("mousedown", () => {
    if (window.innerWidth <= 1020) {
      return;
    }
    dragging = true;
    splitter.classList.add("dragging");
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (event) => {
    if (!dragging || window.innerWidth <= 1020) {
      return;
    }
    const rect = ui.mainLayout.getBoundingClientRect();
    const minEditorWidth = 300;
    const minOutputWidth = 320;
    const splitterWidth = splitter.offsetWidth;
    const maxEditorWidth = rect.width - splitterWidth - minOutputWidth;
    const proposed = event.clientX - rect.left;
    const editorWidth = Math.min(Math.max(proposed, minEditorWidth), maxEditorWidth);
    ui.editorPane.style.flex = `0 0 ${editorWidth}px`;
    ui.editorPane.style.width = `${editorWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    splitter.classList.remove("dragging");
    document.body.style.userSelect = "";
  });
}

function setupEventHandlers() {
  ui.toggleTheme.addEventListener("click", toggleTheme);
  ui.runButton.addEventListener("click", runCode);
  ui.resetProgress.addEventListener("click", openResetModal);
  ui.exportPdf.addEventListener("click", openPdfModal);

  if (ui.runtimeInputSend) {
    ui.runtimeInputSend.addEventListener("click", submitRuntimeInputValue);
  }
  if (ui.runtimeInput) {
    ui.runtimeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitRuntimeInputValue();
      }
    });
  }

  ui.helpBtn.addEventListener("click", openHelp);
  ui.closeHelp.addEventListener("click", closeHelp);
  ui.helpModal.addEventListener("click", (event) => {
    if (event.target === ui.helpModal) {
      closeHelp();
    }
  });
  if (ui.evalModal) {
    if (ui.closeEvalModal) {
      ui.closeEvalModal.addEventListener("click", closeEvaluationModal);
    }
    if (ui.evalModalOk) {
      ui.evalModalOk.addEventListener("click", closeEvaluationModal);
    }
    ui.evalModal.addEventListener("click", (event) => {
      if (event.target === ui.evalModal) {
        closeEvaluationModal();
      }
    });
  }

  if (ui.pdfModal) {
    if (ui.closePdfModal) {
      ui.closePdfModal.addEventListener("click", closePdfModal);
    }
    if (ui.pdfCancel) {
      ui.pdfCancel.addEventListener("click", closePdfModal);
    }
    if (ui.pdfConfirm) {
      ui.pdfConfirm.addEventListener("click", onPdfExportConfirm);
    }
    ui.pdfModal.addEventListener("click", (event) => {
      if (event.target === ui.pdfModal) {
        closePdfModal();
      }
    });
    ui.pdfModal.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onPdfExportConfirm();
      }
    });
  }

  if (ui.resetModal) {
    if (ui.resetCurrent) {
      ui.resetCurrent.addEventListener("click", async () => {
        closeResetModal();
        await resetCurrentExerciseProgress();
      });
    }
    if (ui.resetAll) {
      ui.resetAll.addEventListener("click", async () => {
        closeResetModal();
        await resetAllCourseProgress();
      });
    }
    if (ui.resetCancel) {
      ui.resetCancel.addEventListener("click", closeResetModal);
    }
    ui.resetModal.addEventListener("click", (event) => {
      if (event.target === ui.resetModal) {
        closeResetModal();
      }
    });
  }

  ui.menuTab.addEventListener("click", (event) => {
    event.stopPropagation();
    openMenu();
  });
  ui.closeMenu.addEventListener("click", closeMenu);
  ui.courseMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", (event) => {
    if (!ui.courseMenu.classList.contains("open")) {
      return;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(ui.courseMenu) || path.includes(ui.menuTab)) {
      return;
    }
    if (ui.courseMenu.contains(event.target) || event.target === ui.menuTab) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeHelp();
      closeMenu();
      closeEvaluationModal();
      closePdfModal();
      closeResetModal();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runCode();
    }
  });

  window.addEventListener("blur", () => {
    stopWorkTimer();
    updateMetrics();
  });

  window.addEventListener("focus", () => {
    startWorkTimer();
    updateMetrics();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopWorkTimer();
    } else {
      startWorkTimer();
    }
    updateMetrics();
  });
}

async function bootstrap() {
  cacheUiRefs();
  restoreTheme();
  if (isFileProtocol()) {
    showFileProtocolError();
    return;
  }
  setLoadingStatus("Parnassos wordt voorbereid.", "Thema en basisinterface laden", 8);
  try {
    await loadCatalog();
    restoreSelectionFromStorage();
    initializeMenuAccordionState();
    initializeEditor();
    await activateSelection({
      chapterIdx: state.currentChapterIdx,
      subchapterIdx: state.currentSubchapterIdx,
      exerciseIdx: state.currentExerciseIdx,
    });
    setupSplitter();
    setupEventHandlers();
  } catch (error) {
    const friendly = translateRuntimeError(error && error.message ? error.message : String(error));
    showLoadingError("Parnassos kon niet volledig laden.", friendly);
    showToast("Parnassos kon niet volledig laden.", false);
    throw error;
  }

  try {
    setLoadingStatus("Pythonruntime starten.", "Papyros en input-ondersteuning initialiseren", 78);
    await initializePapyros();
    setLoadingStatus("Klaar.", "Veel succes met Python.", 100);
    hideLoadingOverlay();
  } catch (error) {
    const friendly = translateRuntimeError(error && error.message ? error.message : String(error));
    const rawDetail = formatErrorDetails(error);
    const includeRawDetail = rawDetail && rawDetail !== friendly;
    setRuntimeStatus("Runtime fout", "error");
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("Papyros init error:", error);
    }
    ui.consoleOutput.textContent =
      "Papyros kon niet gestart worden.\n\n" +
      `Foutmelding: ${friendly}` +
      (includeRawDetail ? `\nDetails: ${rawDetail}` : "") +
      "\n\n" +
      "Controleer of je via localhost draait, of input-sw.js in dezelfde map staat, en herlaad daarna hard (Ctrl/Cmd+Shift+R).";
    showLoadingError("Pythonruntime kon niet starten.", friendly);
    showToast("Papyros kon niet starten.", false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});
