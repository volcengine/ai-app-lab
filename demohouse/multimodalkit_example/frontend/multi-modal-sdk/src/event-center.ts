import { bridge } from './bridge';
import type { Bridge } from './bridge/interface';
import {
  type CallResult,
  FailedCallResult,
  InternalErrorCallResult,
  type RawCallResult,
  SuccessCallResult,
  transformDataType,
} from './call-result';
import {
  APICallError,
  APICallFailedError,
  APICallInternalError,
} from './error';
import { bridgeTrace } from './log';
import {
  CallbackMessage,
  type EventMessage,
  type FunctionCallMessage,
} from './message';
import type { TypeGuard } from './utils';

export const EVENT_CENTER_TRACE_TAG = '[EventCenter]';

const trace = (...args: unknown[]) =>
  bridgeTrace(EVENT_CENTER_TRACE_TAG, ...args);

type Handler<Input extends object, Output> = (input: Input) => Output;

declare global {
  // eslint-disable-next-line no-var
  var globalEventIDGenerator: {
    next: () => number;
    reset: () => void;
  };
}

export class EventCenter {
  private _functionCallHandlers: Record<
    string,
    Handler<object, Promise<object>>
  > = {};
  private _callbackHandlers: Record<number, Handler<CallResult, void>> = {};
  private _rawCallbackHandlers: Record<number, Handler<RawCallResult, void>> =
    {};
  private _eventHandlers: Record<string, Set<Handler<object, void>>> = {};
  private _clientBridge: Bridge;

  constructor(clientBridge: Bridge) {
    this._clientBridge = clientBridge;
    this._clientBridge.listen((message) => {
      message.accept({
        functionCall: (callMessage) =>
          void this.dispatchCallMessage(callMessage),
        callback: (callbackMessage) =>
          this.dispatchCallbackMessage(callbackMessage),
        event: (eventMessage) => this.dispatchEventMessage(eventMessage),
      });
    });
    globalThis.globalEventIDGenerator ??= (() => {
      let nextID = 1;
      return {
        next: () => nextID++,
        reset: () => {
          nextID = 1;
        },
      };
    })();
  }

  private get nextCallbackId() {
    return globalThis.globalEventIDGenerator.next();
  }

  /**
   * Register a handler for any function call with the given name
   *
   * @param name Function name. May be prefixed with a namespace to disambiguate with others
   * @param handler Function call handler. The return value will be sent back to the caller
   * @param options Additional options
   * @returns The unregister function
   */
  registerFunctionCallHandler<
    ParamsType extends object,
    ReturnType extends object,
  >(
    name: string,
    handler: (params: ParamsType) => Promise<ReturnType>,
    options?: {
      /**
       * Guard function for input parameters.
       */
      typeGuard?: TypeGuard<object, ParamsType>;

      /**
       * There must be at most one handler for a given function name. By default an error will be thrown if a second
       * handler is about to set. Setting this to true to disable this error and replace the function call handler with
       * the new one. Note that in this situation the former unregister function will no longer available **only when
       * the two handlers are different**.
       */
      allowOverwrite?: boolean;
    },
  ): () => void {
    trace('register function call handler', name);
    const { typeGuard, allowOverwrite = false } = options ?? {};

    // Check handler collision
    if (!allowOverwrite && this._functionCallHandlers[name]) {
      throw new Error(
        `Function call handler already exists for function name ${name}`,
      );
    }

    const wrappedHandler = (input: object) => {
      if (typeGuard?.(input) === false)
        throw APICallInternalError.fromCallResult(
          InternalErrorCallResult.invalidParams(),
        );
      return handler(input);
    };
    this._functionCallHandlers[name] = wrappedHandler;

    const unregister = () => {
      if (this._functionCallHandlers[name] === wrappedHandler) {
        delete this._functionCallHandlers[name];
      }
    };
    return unregister;
  }

  /**
   * Register a handler for any event with the given name.
   *
   * @param name Event name. May be prefixed with a namespace to disambiguate with others.
   * @param handler Event handler
   * @param options Additional options
   * @returns The unregister function
   */
  registerEventHandler<ParamsType extends object>(
    name: string,
    handler: (params: ParamsType) => void,
    options?: {
      /**
       * Guard function for input parameters.
       */
      typeGuard?: TypeGuard<object, ParamsType>;
    },
  ): () => void {
    trace('register event handler', name);
    const { typeGuard } = options ?? {};

    const wrappedHandler = (input: object) => {
      if (typeGuard?.(input) !== false) handler(input);
    };

    this._eventHandlers[name] ??= new Set();
    this._eventHandlers[name].add(wrappedHandler);

    const unregister = () => {
      this._eventHandlers[name].delete(wrappedHandler);
    };
    return unregister;
  }

  /**
   * Store the given callback and returns a newly generated id.
   *
   * @param handler The callback function
   * @param options additional options
   * @returns The generated id
   */
  registerCallback<ParamsType extends object>(
    onSuccess: (data: ParamsType) => void,
    onFailed: (error: APICallError<object>) => void,
    options?: {
      /**
       * Type guard to make sure the callback result is of acceptable type.
       */
      typeGuard?: TypeGuard<object, ParamsType>;
      /**
       * Extra name for error message
       */
      apiName?: string;
    },
  ): number {
    const { typeGuard, apiName } = options ?? {};
    const callbackId = this.nextCallbackId;
    trace(`register callback handler for id: ${callbackId}`);

    const wrappedHandler = (result: CallResult) =>
      result.accept(transformDataType(typeGuard)).accept({
        success: (res) => onSuccess(res.data),
        failed: (res) =>
          onFailed(new APICallFailedError(res.msg, res.data, apiName)),
        internalError: (res) =>
          onFailed(APICallInternalError.fromCallResult(res, apiName)),
      });
    this._callbackHandlers[callbackId] = wrappedHandler;

    return callbackId;
  }

  registerRawCallback(onResult: (result: RawCallResult) => void): number {
    const callbackId = this.nextCallbackId;
    trace(`register raw callback handler for id: ${callbackId}`);
    this._rawCallbackHandlers[callbackId] = onResult;
    return callbackId;
  }

  private async dispatchCallMessage(message: FunctionCallMessage) {
    trace(`dispatch call message. name = ${message.name},`, message.params);
    const sendCallback = (res: CallResult) => {
      trace('send callback', res);
      this._clientBridge.call(CallbackMessage.fromCallMessage(message, res));
    };
    // It is true that `message.name` is non-null when type check is passed in bridge, but it is still possible to be
    // empty, which is also invalid.
    if (!message.name) {
      return sendCallback(InternalErrorCallResult.invalidParams());
    }
    const handler = this._functionCallHandlers[message.name];
    if (!handler) {
      return sendCallback(InternalErrorCallResult.unregistered());
    }
    const { params } = message;
    // Make sure `sendCallback` is called on either path.
    try {
      trace('invoke function call handler');
      const result = await handler(params);
      sendCallback(SuccessCallResult.withData(result));
    } catch (e) {
      const resultFromError = (() => {
        if (e instanceof APICallError) return e.toCallResult();
        if (e instanceof Error) return FailedCallResult.withReason(e.message);
        if (e) return FailedCallResult.withReason(e.toString());
        return FailedCallResult.withReason(
          'Function invocation failed: unknown error',
        );
      })();
      sendCallback(resultFromError);
    }
  }

  private dispatchCallbackMessage(message: CallbackMessage) {
    trace(`dispatch callback message. id = ${message.callbackId}`);
    const { callbackId } = message;
    const handler = this._callbackHandlers[callbackId] as
      | Handler<CallResult, void>
      | undefined;
    const rawHandler = this._rawCallbackHandlers[callbackId] as
      | Handler<RawCallResult, void>
      | undefined;
    try {
      trace('invoke callback handler');
      if (handler) {
        delete this._callbackHandlers[callbackId];
        handler(message.parsedParams);
      }
      if (rawHandler) {
        delete this._rawCallbackHandlers[callbackId];
        rawHandler(message.params);
      }
    } catch (e) {
      console.error(e);
    }
  }

  private dispatchEventMessage(message: EventMessage) {
    trace(`dispatch event message. name = ${message.name},`, message.params);
    // Same as function call, if `message.name` is empty, just return silently.
    if (!message.name) return;
    const { params } = message;
    const handlers = this._eventHandlers[message.name];
    trace(`handlers to invoke: ${handlers?.size ?? 0}`);
    if (!handlers || handlers.size === 0) return; // No handlers registered
    for (const handler of handlers) {
      try {
        handler(params);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

/**
 * Global event center singleton.
 */
export const eventCenter = new EventCenter(bridge);
