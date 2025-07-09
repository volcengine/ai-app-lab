import type { TypeGuard } from './utils';
/**
 * Unified client API signature
 *
 * The parameter could be omitted only when its type is empty object, the framework will fill in empty object
 * before sending the message to the client when it is omitted.
 */
export type ClientAPI<Params extends object, Result extends object> = object extends Params ? (params?: Params) => Promise<Result> : (params: Params) => Promise<Result>;
export interface APIExtraOptions<Params extends object, Result extends object> {
    /**
     * An optional type guard to verify the callback result
     */
    resultTypeGuard?: TypeGuard<object, Result>;
    /**
     * Transform params before wrapped into the function call message
     */
    transformParams?: (params: Params) => object;
}
/**
 * Factory function to generate wrapped Applet API function
 *
 * This function should be called mainly by the framework. It is the caller's responsibility to define the type of the
 * input and callback parameters and perform any necessary type check on the result.
 *
 * @param name Applet API name
 * @param options Extra options
 * @returns The generated Applet API caller function
 */
export declare function createAPI<Params extends object = object, Result extends object = object>(name: string, options?: APIExtraOptions<Params, Result>): ClientAPI<Params, Result>;
/**
 * Subscribe Client API event by event name.
 *
 * Pre-defined event APIs using API factories will automatically invoke this.
 *
 * @category Applet
 */
export declare const subscribeEvent: (params: {
    /** Which event to subscribe */
    eventName: string;
    /** Receive event since when */
    timestamp: number;
}) => Promise<object>;
/**
 * Unsubscribe Client API event by event name.
 *
 * @category Applet
 */
export declare const unsubscribeEvent: (params: {
    /** Which event to unsubscribe */
    eventName: string;
}) => Promise<object>;
/** Unified client event registry signature */
export type ClientEventRegistry<Params extends object = object> = (handler: (params: Params) => void) => () => void;
export interface EventExtraOptions<ParamType extends object> {
    /** An optional type guard to verify the event parameter */
    paramsTypeGuard?: TypeGuard<object, ParamType>;
    /**
     * Whether this event is a "private" event.
     *
     * A private event is defined as follows:
     * - The receiver don't need to subscribe this event;
     * - It is only sent to a specified receiver, so others won't receive;
     *
     * For example, lifecycle and floating mask clicked events are defined to be private.
     */
    isPrivate?: boolean;
}
/**
 * Factory function to generate wrapped Applet event registry
 *
 * @param name Event name
 * @param options Extra options
 * @returns The generated event register function
 */
export declare function createEvent<Params extends object = object>(name: string, options?: EventExtraOptions<Params>): ClientEventRegistry<Params>;
