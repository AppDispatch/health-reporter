interface HealthReporterOptions {
    /** Base URL of Dispatch server (e.g. "https://ota.example.com") */
    baseUrl: string;
    /** Project slug for routing metrics */
    projectSlug: string;
    /** Stable device identifier (caller must provide, e.g. expo-device or async-storage UUID) */
    deviceId: string;
    /** Channel name (e.g. "production", "staging") */
    channel?: string;
    /** Platform ("ios" | "android") — auto-detected from React Native if omitted */
    platform?: "ios" | "android";
    /** Flush interval in ms (default: 30000). Set to 0 to disable auto-flush. */
    flushIntervalMs?: number;
    /** Whether to auto-capture JS errors via ErrorUtils (default: true) */
    autoCaptureErrors?: boolean;
    /** Whether to track app launches automatically (default: true) */
    trackAppLaunches?: boolean;
    /** Max events to buffer before forcing a flush (default: 100) */
    maxBufferSize?: number;
}
type HealthEventType = "js_error" | "crash" | "custom" | "app_launch";
interface HealthEvent {
    type: HealthEventType;
    name?: string;
    message?: string;
    count: number;
    flagStates?: Record<string, unknown>;
}
interface HealthMetricsPayload {
    projectSlug: string;
    updateUuid: string | null;
    deviceId: string;
    channel: string;
    platform: string;
    runtimeVersion: string;
    events: HealthEvent[];
}

declare class HealthReporter {
    private readonly options;
    private readonly buffer;
    private flushTimer;
    private teardownError;
    private teardownLaunch;
    private flagStateProvider;
    private started;
    constructor(options: HealthReporterOptions);
    /**
     * Start auto-capture hooks and flush timer.
     * Call once at app startup, after expo-updates has loaded.
     */
    start(): void;
    /**
     * Stop all hooks and timers, flush remaining events.
     */
    stop(): Promise<void>;
    /** Record a custom event (e.g. "checkout_success"). */
    recordEvent(name: string, count?: number): void;
    /** Record an error manually (goes into js_error bucket). */
    recordError(message: string, count?: number): void;
    /**
     * Register a flag state provider for correlation.
     * The callback is invoked at error time to snapshot active flags.
     * Designed for openfeature-provider integration without a hard dep.
     */
    setFlagStateProvider(provider: () => Record<string, unknown>): void;
    /** Force flush buffered events to the server. */
    flush(): Promise<void>;
    private checkBufferSize;
}

export { type HealthEvent, type HealthEventType, type HealthMetricsPayload, HealthReporter, type HealthReporterOptions };
