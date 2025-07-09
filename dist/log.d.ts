/**
 * The trace tag that will be inserted in front of the other arguments automatically
 */
export declare const APPLET_BRIDGE_TRACE_TAG = "[Applet Bridge]";
/**
 * Print trace logs for Applet bridge if enabled
 *
 * @param args Log arguments
 * @internal Only used by the bridge framework, do not re-export.
 */
export declare function bridgeTrace(...args: unknown[]): void;
/**
 * Switch on/off the bridge trace logger
 *
 * @param enabled whether the bridge trace logs should be printed.
 */
export declare function setBridgeTraceEnabled(enabled: boolean): void;
/**
 * Set the custom bridge trace logger
 *
 * This is mainly used by the unit tests, but can also be used elsewhere.
 *
 * @param logger The actual logger
 */
export declare function setBridgeTraceLogger(logger: (...args: unknown[]) => void): void;
