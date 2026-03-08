declare const require: (module: string) => unknown;

import type { HealthReporterOptions, HealthMetricsPayload } from "./types";
import { EventBuffer } from "./buffer";
import { snapshotFlagStates } from "./correlation";
import { installErrorHandler, installAppLaunchTracker } from "./auto-capture";

/**
 * Resolve expo-updates constants lazily at flush time.
 * Returns updateUuid and runtimeVersion if expo-updates is available.
 */
function getExpoUpdatesInfo(): {
  updateUuid: string | null;
  runtimeVersion: string;
} {
  try {
    // Dynamic require to avoid hard dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Updates = require("expo-updates") as any;
    return {
      updateUuid: Updates?.updateId ?? null,
      runtimeVersion: Updates?.runtimeVersion ?? "unknown",
    };
  } catch {
    return { updateUuid: null, runtimeVersion: "unknown" };
  }
}

/**
 * Detect platform from React Native if not provided.
 */
function detectPlatform(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RN = require("react-native") as any;
    return RN?.Platform?.OS ?? "unknown";
  } catch {
    return "unknown";
  }
}

export class HealthReporter {
  private readonly options: HealthReporterOptions;
  private readonly buffer: EventBuffer = new EventBuffer();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private teardownError: (() => void) | null = null;
  private teardownLaunch: (() => void) | null = null;
  private flagStateProvider: (() => Record<string, unknown>) | null = null;
  private started = false;

  constructor(options: HealthReporterOptions) {
    this.options = options;
  }

  /**
   * Start auto-capture hooks and flush timer.
   * Call once at app startup, after expo-updates has loaded.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Auto-capture JS errors
    if (this.options.autoCaptureErrors !== false) {
      this.teardownError = installErrorHandler((message, isFatal) => {
        const type = isFatal ? "crash" : "js_error";
        const flagStates = snapshotFlagStates(this.flagStateProvider);
        this.buffer.add(type, undefined, message, 1, flagStates);
        this.checkBufferSize();
      });
    }

    // Track app launches
    if (this.options.trackAppLaunches !== false) {
      this.teardownLaunch = installAppLaunchTracker(() => {
        this.buffer.add("app_launch", undefined, undefined);
      });
    }

    // Start flush timer
    const interval = this.options.flushIntervalMs ?? 30_000;
    if (interval > 0) {
      this.flushTimer = setInterval(() => this.flush(), interval);
    }
  }

  /**
   * Stop all hooks and timers, flush remaining events.
   */
  async stop(): Promise<void> {
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
  recordEvent(name: string, count: number = 1): void {
    this.buffer.add("custom", name, undefined, count);
    this.checkBufferSize();
  }

  /** Record an error manually (goes into js_error bucket). */
  recordError(message: string, count: number = 1): void {
    const flagStates = snapshotFlagStates(this.flagStateProvider);
    this.buffer.add("js_error", undefined, message, count, flagStates);
    this.checkBufferSize();
  }

  /**
   * Register a flag state provider for correlation.
   * The callback is invoked at error time to snapshot active flags.
   * Designed for openfeature-provider integration without a hard dep.
   */
  setFlagStateProvider(
    provider: () => Record<string, unknown>,
  ): void {
    this.flagStateProvider = provider;
  }

  /** Force flush buffered events to the server. */
  async flush(): Promise<void> {
    const events = this.buffer.drain();
    if (events.length === 0) return;

    const { updateUuid, runtimeVersion } = getExpoUpdatesInfo();
    const platform =
      this.options.platform ?? detectPlatform();

    const payload: HealthMetricsPayload = {
      projectSlug: this.options.projectSlug,
      updateUuid,
      deviceId: this.options.deviceId,
      channel: this.options.channel ?? "default",
      platform,
      runtimeVersion,
      events,
    };

    try {
      const url = new URL("/v1/ota/health-metrics", this.options.baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(
          `[AppDispatch] Failed to report health metrics: ${res.status}`,
        );
      }
    } catch (err) {
      console.warn("[AppDispatch] Failed to report health metrics:", err);
    }
  }

  private checkBufferSize(): void {
    const max = this.options.maxBufferSize ?? 100;
    if (this.buffer.size >= max) {
      this.flush();
    }
  }
}
