import * as Comlink from "https://esm.sh/comlink@4.4.2/es2022/comlink.bundle.mjs";
import { syncExpose } from "https://esm.sh/comsync@0.0.9/es2022/comsync.bundle.mjs";
import { loadPyodide } from "https://cdn.jsdelivr.net/npm/pyodide@0.29.0/+esm";

const PYTHON_PACKAGE_URL =
  "https://cdn.jsdelivr.net/npm/@dodona/papyros@4.0.7/dist/backend/workers/python/python_package.tar.gz.load_by_url";
const PYODIDE_VERSION = "0.29.0";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_WORKER_RUNNER_PY = `
import importlib

try:
    from pyodide.code import find_imports  # noqa
except ImportError:
    from pyodide import find_imports  # noqa

import pyodide_js  # noqa


def _import_to_package_mapping():
    try:
        return pyodide_js._module._import_name_to_package_name.to_py()
    except Exception:
        pass
    try:
        return pyodide_js._api._import_name_to_package_name.to_py()
    except Exception:
        pass
    return {}


def _normalize_imports(source_code_or_imports):
    if isinstance(source_code_or_imports, str):
        try:
            return find_imports(source_code_or_imports)
        except SyntaxError:
            return []
    return list(source_code_or_imports or [])


async def install_imports(
    source_code_or_imports,
    message_callback=lambda event_type, data: None,
):
    imports = _normalize_imports(source_code_or_imports)
    if not imports:
        return

    to_package_name = _import_to_package_mapping()
    to_install = []

    for module in imports:
        try:
            importlib.import_module(module)
        except ModuleNotFoundError:
            to_install.append(
                {
                    "module": module,
                    "package": to_package_name.get(module, module),
                }
            )

    if not to_install:
        return

    message_callback("loading_all", to_install)

    try:
        import micropip  # noqa
    except ModuleNotFoundError:
        micropip_entry = {"module": "micropip", "package": "micropip"}
        message_callback("loading_micropip", micropip_entry)
        await pyodide_js.loadPackage("micropip")
        import micropip  # noqa
        message_callback("loaded_micropip", micropip_entry)

    for entry in to_install:
        message_callback("loading_one", entry)
        await micropip.install(entry["package"])
        message_callback("loaded_one", entry)

    message_callback("loaded_all", to_install)
`;

function pyodideExposeCompat(fn) {
  return syncExpose((channel, interruptBuffer, ...args) =>
    fn({ ...channel, interruptBuffer }, ...args)
  );
}

const BackendEventType = {
  Start: "start",
  End: "end",
  Input: "input",
  Output: "output",
  Sleep: "sleep",
  Error: "error",
  Interrupt: "interrupt",
  Loading: "loading",
  Frame: "frame",
  FrameChange: "frame-change",
  Stop: "stop",
};

const RunMode = {
  Run: "run",
  Debug: "debug",
  Doctest: "doctest",
};

class BackendEventQueue {
  constructor(callback, flushTime = 100) {
    this.callback = callback;
    this.flushTime = flushTime;
    this.queue = [];
    this.lastFlushTime = Date.now();
    this.decoder = new TextDecoder();
  }

  put(type, data, contentType = "text/plain", extra = {}) {
    let normalized = "";
    if (typeof data === "number") {
      normalized = String(data);
    } else if (typeof data === "string") {
      normalized = data;
    } else {
      normalized = this.decoder.decode(data);
    }

    const evt = {
      type,
      data: normalized,
      contentType,
      ...extra,
    };

    const last = this.queue[this.queue.length - 1];
    if (
      last &&
      last.type === type &&
      last.contentType === contentType &&
      String(contentType || "").startsWith("text")
    ) {
      last.data += normalized;
    } else {
      this.queue.push(evt);
    }

    if (this.shouldFlush()) {
      this.flush();
    }
  }

  shouldFlush() {
    return this.queue.length > 1 || Date.now() - this.lastFlushTime > this.flushTime;
  }

  reset() {
    this.queue = [];
    this.lastFlushTime = Date.now();
  }

  flush() {
    this.queue.forEach((evt) => this.callback(evt));
    this.queue = [];
    this.lastFlushTime = Date.now();
  }

  setCallback(callback) {
    this.callback = callback;
  }
}

class Backend {
  constructor() {
    this.extras = {};
    this.onEvent = () => {};
    this.queue = null;
    this.runCode = this.syncExpose()(this.runCode.bind(this));
  }

  syncExpose() {
    return (fn) => fn;
  }

  async launch(onEvent) {
    this.onEvent = (event) => {
      onEvent(event);

      if (event.type === BackendEventType.Sleep) {
        return this.extras.syncSleep(event.data);
      }
      if (event.type === BackendEventType.Input) {
        return this.extras.readMessage();
      }
      return undefined;
    };

    this.queue = new BackendEventQueue(this.onEvent.bind(this));
    return Promise.resolve();
  }

  runModes() {
    return [];
  }

  // eslint-disable-next-line class-methods-use-this
  runCode() {
    throw new Error("runCode() must be implemented by subclass");
  }

  provideFiles() {
    return Promise.resolve();
  }
}

class PythonWorker extends Backend {
  constructor() {
    super();
    this.pyodide = null;
    this.papyros = null;
    this.installPromise = null;
  }

  static convert(data) {
    return data && typeof data.toJs === "function"
      ? data.toJs({ dict_converter: Object.fromEntries })
      : data;
  }

  syncExpose() {
    return pyodideExposeCompat;
  }

  static async getPyodide() {
    const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    if (!pyodide || typeof pyodide.unpackArchive !== "function") {
      throw new Error("Pyodide kon niet correct initialiseren.");
    }

    const response = await fetch(PYTHON_PACKAGE_URL);
    if (!response.ok) {
      throw new Error(`Python package kon niet geladen worden (${response.status}).`);
    }
    const archive = await response.arrayBuffer();

    pyodide.unpackArchive(archive, ".tgz", { extractDir: "/tmp/" });
    pyodide.pyimport("sys").path.append("/tmp/");
    pyodide.FS.writeFile("/tmp/pyodide_worker_runner.py", PYODIDE_WORKER_RUNNER_PY);

    if (typeof pyodide.registerComlink === "function") {
      pyodide.registerComlink(Comlink);
    }

    return pyodide;
  }

  async launch(onEvent) {
    await super.launch(onEvent);

    this.pyodide = await PythonWorker.getPyodide();
    this.papyros = this.pyodide.pyimport("papyros").Papyros.callKwargs({
      callback: (event) => this.onEvent(PythonWorker.convert(event)),
      buffer_constructor: (cb) => {
        this.queue.setCallback(cb);
        return this.queue;
      },
    });

    await this.pyodide.loadPackage("micropip");
  }

  async installImports(code) {
    if (this.installPromise == null) {
      this.installPromise = this.papyros?.install_imports.callKwargs({
        source_code: code,
        ignore_missing: true,
      });
    }

    await this.installPromise;
    this.installPromise = null;
  }

  runModes(code) {
    let modes = super.runModes(code);
    if (this.papyros?.has_doctests(code)) {
      modes = [RunMode.Doctest, ...modes];
    }
    return [RunMode.Debug, ...modes];
  }

  async runCode(extras, code, mode = "exec") {
    this.extras = extras;

    if (extras.interruptBuffer && this.pyodide?.setInterruptBuffer) {
      this.pyodide.setInterruptBuffer(extras.interruptBuffer);
    }

    await this.installImports(code);
    return this.papyros?.run_async.callKwargs({
      source_code: code,
      mode,
    });
  }

  async lintCode(code) {
    await this.installImports(code);
    return PythonWorker.convert(this.papyros?.lint(code) || []);
  }

  async provideFiles(inlineFiles, hrefFiles) {
    await this.papyros?.provide_files.callKwargs({
      inline_files: JSON.stringify(inlineFiles),
      href_files: JSON.stringify(hrefFiles),
    });
  }
}

let impl = null;
function getImpl() {
  if (!impl) {
    impl = new PythonWorker();
  }
  return impl;
}

const api = {
  launch: async (...args) => getImpl().launch(...args),
  runCode: async (...args) => getImpl().runCode(...args),
  runModes: async (...args) => getImpl().runModes(...args),
  provideFiles: async (...args) => getImpl().provideFiles(...args),
  lintCode: async (...args) => getImpl().lintCode(...args),
};

Comlink.expose(api);
