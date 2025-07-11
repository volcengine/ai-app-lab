let bridgeTraceEnabled = false;
let traceLogger: (...args: unknown[]) => void = console.debug;

/**
 * The trace tag that will be inserted in front of the other arguments automatically
 */
export const APPLET_BRIDGE_TRACE_TAG = '[Applet Bridge]';

/**
 * Print trace logs for Applet bridge if enabled
 *
 * @param args Log arguments
 * @internal Only used by the bridge framework, do not re-export.
 */
export function bridgeTrace(...args: unknown[]) {
  if (bridgeTraceEnabled) traceLogger(APPLET_BRIDGE_TRACE_TAG, ...args);
}

/**
 * Switch on/off the bridge trace logger
 *
 * @param enabled whether the bridge trace logs should be printed.
 */
export function setBridgeTraceEnabled(enabled: boolean) {
  bridgeTraceEnabled = enabled;
}

/**
 * Set the custom bridge trace logger
 *
 * This is mainly used by the unit tests, but can also be used elsewhere.
 *
 * @param logger The actual logger
 */
export function setBridgeTraceLogger(logger: (...args: unknown[]) => void) {
  traceLogger = logger;
}
