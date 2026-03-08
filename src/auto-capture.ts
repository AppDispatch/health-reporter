/**
 * React Native error auto-capture via ErrorUtils.
 * Chains onto the existing global handler (does not replace it).
 * No-ops silently in environments where ErrorUtils is unavailable.
 */

// React Native global — not typed in standard TS libs
declare const ErrorUtils: {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
} | undefined;

/**
 * Install a global JS error handler that chains with the existing one.
 * Returns a teardown function that restores the original handler.
 */
export function installErrorHandler(
  onError: (message: string, isFatal: boolean) => void,
): (() => void) | null {
  if (typeof ErrorUtils === "undefined") return null;

  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    try {
      const message = error?.message || error?.toString() || "Unknown error";
      onError(message, isFatal ?? false);
    } catch {
      // Never let our handler break the app
    }

    // Always call through to the original handler
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });

  return () => {
    ErrorUtils.setGlobalHandler(originalHandler);
  };
}

// React Native AppState — declared loosely to avoid requiring RN types
declare const require: (module: string) => unknown;

/**
 * Track app launches via AppState transitions.
 * Detects background/inactive → active as a launch event.
 * Returns a teardown function.
 */
export function installAppLaunchTracker(
  onLaunch: () => void,
): (() => void) | null {
  try {
    // Dynamic require to avoid hard dependency on react-native
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RN = require("react-native") as any;
    const AppState = RN?.AppState;
    if (!AppState?.addEventListener) return null;

    let lastState: string = AppState.currentState ?? "unknown";

    // Record initial launch
    if (lastState === "active") {
      onLaunch();
    }

    const subscription = AppState.addEventListener(
      "change",
      (nextState: string) => {
        if (
          (lastState === "background" || lastState === "inactive") &&
          nextState === "active"
        ) {
          onLaunch();
        }
        lastState = nextState;
      },
    );

    return () => {
      subscription?.remove?.();
    };
  } catch {
    return null;
  }
}
