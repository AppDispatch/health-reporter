var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/buffer.ts
var EventBuffer = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
  }
  makeKey(type, name, message) {
    return `${type}::${name ?? ""}::${message ?? ""}`;
  }
  add(type, name, message, count = 1, flagStates) {
    const key = this.makeKey(type, name, message);
    const existing = this.entries.get(key);
    if (existing) {
      existing.count += count;
      if (flagStates) existing.flagStates = flagStates;
    } else {
      this.entries.set(key, { type, name, message, count, flagStates });
    }
  }
  /** Drain all buffered events and reset. */
  drain() {
    const events = [];
    for (const entry of this.entries.values()) {
      const event = {
        type: entry.type,
        count: entry.count
      };
      if (entry.name) event.name = entry.name;
      if (entry.message) event.message = entry.message;
      if (entry.flagStates) event.flagStates = entry.flagStates;
      events.push(event);
    }
    this.entries.clear();
    return events;
  }
  get size() {
    return this.entries.size;
  }
};

// src/correlation.ts
function snapshotFlagStates(provider) {
  if (!provider) return void 0;
  try {
    const states = provider();
    if (states && Object.keys(states).length > 0) return states;
  } catch {
  }
  return void 0;
}

// src/auto-capture.ts
function installErrorHandler(onError) {
  if (typeof ErrorUtils === "undefined") return null;
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    try {
      const message = error?.message || error?.toString() || "Unknown error";
      onError(message, isFatal ?? false);
    } catch {
    }
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
  return () => {
    ErrorUtils.setGlobalHandler(originalHandler);
  };
}
function installAppLaunchTracker(onLaunch) {
  try {
    const RN = __require("react-native");
    const AppState = RN?.AppState;
    if (!AppState?.addEventListener) return null;
    let lastState = AppState.currentState ?? "unknown";
    if (lastState === "active") {
      onLaunch();
    }
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if ((lastState === "background" || lastState === "inactive") && nextState === "active") {
          onLaunch();
        }
        lastState = nextState;
      }
    );
    return () => {
      subscription?.remove?.();
    };
  } catch {
    return null;
  }
}

// src/reporter.ts
function getExpoUpdatesInfo() {
  try {
    const Updates = __require("expo-updates");
    return {
      updateUuid: Updates?.updateId ?? null,
      runtimeVersion: Updates?.runtimeVersion ?? "unknown"
    };
  } catch {
    return { updateUuid: null, runtimeVersion: "unknown" };
  }
}
function detectPlatform() {
  try {
    const RN = __require("react-native");
    return RN?.Platform?.OS ?? "unknown";
  } catch {
    return "unknown";
  }
}
var HealthReporter = class {
  constructor(options) {
    this.buffer = new EventBuffer();
    this.flushTimer = null;
    this.teardownError = null;
    this.teardownLaunch = null;
    this.flagStateProvider = null;
    this.started = false;
    this.options = options;
  }
  /**
   * Start auto-capture hooks and flush timer.
   * Call once at app startup, after expo-updates has loaded.
   */
  start() {
    if (this.started) return;
    this.started = true;
    if (this.options.autoCaptureErrors !== false) {
      this.teardownError = installErrorHandler((message, isFatal) => {
        const type = isFatal ? "crash" : "js_error";
        const flagStates = snapshotFlagStates(this.flagStateProvider);
        this.buffer.add(type, void 0, message, 1, flagStates);
        this.checkBufferSize();
      });
    }
    if (this.options.trackAppLaunches !== false) {
      this.teardownLaunch = installAppLaunchTracker(() => {
        this.buffer.add("app_launch", void 0, void 0);
      });
    }
    const interval = this.options.flushIntervalMs ?? 3e4;
    if (interval > 0) {
      this.flushTimer = setInterval(() => this.flush(), interval);
    }
  }
  /**
   * Stop all hooks and timers, flush remaining events.
   */
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.teardownError) {
      this.teardownError();
      this.teardownError = null;
    }
    if (this.teardownLaunch) {
      this.teardownLaunch();
      this.teardownLaunch = null;
    }
    this.started = false;
    await this.flush();
  }
  /** Record a custom event (e.g. "checkout_success"). */
  recordEvent(name, count = 1) {
    this.buffer.add("custom", name, void 0, count);
    this.checkBufferSize();
  }
  /** Record an error manually (goes into js_error bucket). */
  recordError(message, count = 1) {
    const flagStates = snapshotFlagStates(this.flagStateProvider);
    this.buffer.add("js_error", void 0, message, count, flagStates);
    this.checkBufferSize();
  }
  /**
   * Register a flag state provider for correlation.
   * The callback is invoked at error time to snapshot active flags.
   * Designed for openfeature-provider integration without a hard dep.
   */
  setFlagStateProvider(provider) {
    this.flagStateProvider = provider;
  }
  /** Force flush buffered events to the server. */
  async flush() {
    const events = this.buffer.drain();
    if (events.length === 0) return;
    const { updateUuid, runtimeVersion } = getExpoUpdatesInfo();
    const platform = this.options.platform ?? detectPlatform();
    const payload = {
      projectSlug: this.options.projectSlug,
      updateUuid,
      deviceId: this.options.deviceId,
      channel: this.options.channel ?? "default",
      platform,
      runtimeVersion,
      events
    };
    try {
      const url = new URL("/v1/ota/health-metrics", this.options.baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.warn(
          `[AppDispatch] Failed to report health metrics: ${res.status}`
        );
      }
    } catch (err) {
      console.warn("[AppDispatch] Failed to report health metrics:", err);
    }
  }
  checkBufferSize() {
    const max = this.options.maxBufferSize ?? 100;
    if (this.buffer.size >= max) {
      this.flush();
    }
  }
};
export {
  HealthReporter
};
//# sourceMappingURL=index.mjs.map