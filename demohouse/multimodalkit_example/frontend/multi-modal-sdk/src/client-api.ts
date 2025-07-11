import { bridge as appletBridge } from './bridge';
import { eventCenter } from './event-center';
import { bridgeTrace } from './log';
import { FunctionCallMessage } from './message';
import { targets } from './target';
import type { TypeGuard } from './utils';

const trace = (...args: unknown[]) => bridgeTrace('[Client API]', ...args);

/**
 * Unified client API signature
 *
 * The parameter could be omitted only when its type is empty object, the framework will fill in empty object
 * before sending the message to the client when it is omitted.
 */
export type ClientAPI<
  Params extends object,
  Result extends object,
> = object extends Params
  ? (params?: Params) => Promise<Result>
  : (params: Params) => Promise<Result>;

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
 * Assemble and trigger an applet API call
 *
 * @param name Applet API name
 * @param params API call parameters
 * @param options Extra options
 * @returns A promise that resolves to the callback result data when success, or a `APIError` otherwise.
 */
function callAppletAPI<Params extends object, Result extends object>(
  name: string,
  params: Params,
  options?: APIExtraOptions<Params, Result>,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const { resultTypeGuard, transformParams } = options ?? {};
    try {
      trace('call AppletBridge', name, params);
      appletBridge.call(
        new FunctionCallMessage({
          name,
          params: transformParams ? transformParams(params) : params,
          target: targets.clientAPI(),
          callbackId: eventCenter.registerCallback(resolve, reject, {
            typeGuard: resultTypeGuard,
            apiName: name,
          }),
        }),
      );
    } catch (e) {
      trace('call AppletBridge error', e);
      reject(e);
    }
  });
}

/**
 * Helper function to transform underlying handler call into ClientAPI signature
 */
function clientAPIWrapper<Params extends object, Result extends object>(
  handler: (
    name: string,
    params: Params,
    options?: APIExtraOptions<Params, Result>,
  ) => Promise<Result>,
  name: string,
  options?: APIExtraOptions<Params, Result>,
): ClientAPI<Params, Result> {
  return (params?: Params) => handler(name, (params ?? {}) as Params, options);
}

function listenAppletBridgeEvent<Params extends object>(
  name: string,
  handler: (params: Params) => void,
  paramsTypeGuard?: TypeGuard<object, Params>,
) {
  trace('listen AppletBridge event', name);
  return eventCenter.registerEventHandler(name, handler, {
    typeGuard: paramsTypeGuard,
  });
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
export function createAPI<
  Params extends object = object,
  Result extends object = object,
>(
  name: string,
  options?: APIExtraOptions<Params, Result>,
): ClientAPI<Params, Result> {
  return clientAPIWrapper(callAppletAPI, name, options);
}

/**
 * Subscribe Client API event by event name.
 *
 * Pre-defined event APIs using API factories will automatically invoke this.
 *
 * @category Applet
 */
export const subscribeEvent = createAPI<{
  /** Which event to subscribe */
  eventName: string;

  /** Receive event since when */
  timestamp: number;
}>('applet.subscribeEvent');

/**
 * Unsubscribe Client API event by event name.
 *
 * @category Applet
 */
export const unsubscribeEvent = createAPI<{
  /** Which event to unsubscribe */
  eventName: string;
}>('applet.unsubscribeEvent');

/** Unified client event registry signature */
export type ClientEventRegistry<Params extends object = object> = (
  handler: (params: Params) => void,
) => () => void;

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
export function createEvent<Params extends object = object>(
  name: string,
  options?: EventExtraOptions<Params>,
): ClientEventRegistry<Params> {
  const { paramsTypeGuard, isPrivate = false } = options ?? {};
  let eventSubscribed = false;
  return (handler) => {
    if (!isPrivate && !eventSubscribed) {
      subscribeEvent({ eventName: name, timestamp: Date.now() });
      eventSubscribed = true;
    }
    return listenAppletBridgeEvent(name, handler, paramsTypeGuard);
  };
}
