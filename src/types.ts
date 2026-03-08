export interface HealthReporterOptions {
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

export type HealthEventType = "js_error" | "crash" | "custom" | "app_launch";

export interface HealthEvent {
  type: HealthEventType;
  name?: string;
  message?: string;
  count: number;
  flagStates?: Record<string, unknown>;
}

export interface HealthMetricsPayload {
  projectSlug: string;
  updateUuid: string | null;
  deviceId: string;
  channel: string;
  platform: string;
  runtimeVersion: string;
  events: HealthEvent[];
}
