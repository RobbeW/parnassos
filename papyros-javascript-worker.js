import * as Comlink from "https://esm.sh/comlink@4.4.2/es2022/comlink.bundle.mjs";

function ensureWorkerCompatGlobals() {
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

ensureWorkerCompatGlobals();

let implPromise = null;

function getImpl() {
  if (!implPromise) {
    implPromise = import(
      "https://cdn.jsdelivr.net/npm/@dodona/papyros@4.0.7/dist/backend/workers/javascript/JavaScriptWorker.js/+esm"
    ).then(({ JavaScriptWorker }) => new JavaScriptWorker());
  }
  return implPromise;
}

const api = {
  launch: async (...args) => (await getImpl()).launch(...args),
  runCode: async (...args) => (await getImpl()).runCode(...args),
  runModes: async (...args) => (await getImpl()).runModes(...args),
  provideFiles: async (...args) => (await getImpl()).provideFiles(...args),
  lintCode: async (...args) => (await getImpl()).lintCode(...args),
};

Comlink.expose(api);
