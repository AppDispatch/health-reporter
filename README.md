# @appdispatch/health-reporter

SDK for reporting app health metrics (JS errors, crashes, app launches, custom events) to your AppDispatch server. Designed for React Native apps using Expo.

## Install

```bash
npm install @appdispatch/health-reporter
```

## Quick Start

```typescript
import { HealthReporter } from "@appdispatch/health-reporter";

const reporter = new HealthReporter({
  baseUrl: "https://ota.example.com",
  projectSlug: "my-app",
  deviceId: "device-xyz", // stable device ID (e.g. expo-device or async-storage UUID)
  channel: "production",
});

reporter.start();
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | AppDispatch server URL |
| `projectSlug` | `string` | required | Project slug for routing metrics |
| `deviceId` | `string` | required | Stable device identifier |
| `channel` | `string` | `"default"` | Channel name (e.g. "production", "staging") |
| `platform` | `"ios" \| "android"` | auto-detected | Platform override |
| `flushIntervalMs` | `number` | `30000` | Flush interval in ms. `0` disables auto-flush. |
| `autoCaptureErrors` | `boolean` | `true` | Auto-capture JS errors via ErrorUtils |
| `trackAppLaunches` | `boolean` | `true` | Track app launches via AppState |
| `maxBufferSize` | `number` | `100` | Force flush when buffer reaches this size |

## Manual Event Recording

```typescript
// Record a custom success metric
reporter.recordEvent("checkout_success");

// Record a manual error
reporter.recordError("Payment failed: timeout");

// Force flush
await reporter.flush();

// Cleanup on unmount
await reporter.stop();
```

## OpenFeature Integration

Connect with `@appdispatch/openfeature-provider` for flag-error correlation. When an error occurs, the health reporter snapshots active flag states so you can see which flags were enabled when errors happened.

```typescript
import { HealthReporter } from "@appdispatch/health-reporter";
import { DispatchProvider } from "@appdispatch/openfeature-provider";

const reporter = new HealthReporter({
  baseUrl: "https://ota.example.com",
  projectSlug: "my-app",
  deviceId: "device-xyz",
  channel: "production",
});

const provider = new DispatchProvider({
  baseUrl: "https://ota.example.com",
  projectSlug: "my-app",
  channel: "production",
});

// Connect them — duck-typed, no hard dependency
provider.attachHealthReporter(reporter);

// Start after connecting
reporter.start();
```

This enables:
- Flag health badges on the flag list
- Per-variation health in the flag detail panel
- Flag impact analysis on the Telemetry page
- Per-flag health monitoring during rollout executions
