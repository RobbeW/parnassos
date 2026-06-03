const browserProcess = {
  browser: true,
  env: {},
  argv: [],
  version: "",
  versions: {},
  platform: "browser",
  cwd: () => "/",
  nextTick: (callback, ...args) => Promise.resolve().then(() => callback(...args)),
};

if (typeof globalThis.process === "undefined") {
  globalThis.process = browserProcess;
}

export default browserProcess;
export const browser = browserProcess.browser;
export const env = browserProcess.env;
export const argv = browserProcess.argv;
export const version = browserProcess.version;
export const versions = browserProcess.versions;
export const platform = browserProcess.platform;
export const cwd = browserProcess.cwd;
export const nextTick = browserProcess.nextTick;
