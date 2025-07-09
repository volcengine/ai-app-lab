import type { Bridge } from './bridge/interface';
import { type RawCallResult } from './call-result';
import { APICallError } from './error';
import type { TypeGuard } from './utils';
export declare const EVENT_CENTER_TRACE_TAG = "[EventCenter]";
declare global {
    var globalEventIDGenerator: {
        next: () => number;
        reset: () => void;
    };
}
export declare class EventCenter {
    private _functionCallHandlers;
    private _callbackHandlers;
    private _rawCallbackHandlers;
    private _eventHandlers;
    private _clientBridge;
    constructor(clientBridge: Bridge);
    private get nextCallbackId();
    /**
     * Register a handler for any function call with the given name
     *
     * @param name Function name. May be prefixed with a namespace to disambiguate with others
     * @param handler Function call handler. The return value will be sent back to the caller
     * @param options Additional options
     * @returns The unregister function
     */
    registerFunctionCallHandler<ParamsType extends object, ReturnType extends object>(name: string, handler: (params: ParamsType) => Promise<ReturnType>, options?: {
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
    }): () => void;
    /**
     * Register a handler for any event with the given name.
     *
     * @param name Event name. May be prefixed with a namespace to disambiguate with others.
     * @param handler Event handler
     * @param options Additional options
     * @returns The unregister function
     */
    registerEventHandler<ParamsType extends object>(name: string, handler: (params: ParamsType) => void, options?: {
        /**
         * Guard function for input parameters.
         */
        typeGuard?: TypeGuard<object, ParamsType>;
    }): () => void;
    /**
     * Store the given callback and returns a newly generated id.
     *
     * @param handler The callback function
     * @param options additional options
     * @returns The generated id
     */
    registerCallback<ParamsType extends object>(onSuccess: (data: ParamsType) => void, onFailed: (error: APICallError<object>) => void, options?: {
        /**
         * Type guard to make sure the callback result is of acceptable type.
         */
        typeGuard?: TypeGuard<object, ParamsType>;
        /**
         * Extra name for error message
         */
        apiName?: string;
    }): number;
    registerRawCallback(onResult: (result: RawCallResult) => void): number;
    private dispatchCallMessage;
    private dispatchCallbackMessage;
    private dispatchEventMessage;
}
/**
 * Global event center singleton.
 */
export declare const eventCenter: EventCenter;
