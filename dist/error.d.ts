import { type CallResult, InternalErrorCallResult } from './call-result';
/**
 * Base error type for Bridge API
 */
export declare abstract class APICallError<ErrorType extends object> extends Error {
    protected readonly code: number;
    protected readonly apiName?: string | undefined;
    readonly name: string;
    constructor(code: number, msg: string, apiName?: string | undefined);
    /** @ignore */
    abstract toCallResult(): CallResult<ErrorType>;
}
/**
 * An error that indicates the function call was successfully returned, but the result is in failed state.
 */
export declare class APICallFailedError<ErrorType extends object> extends APICallError<ErrorType> {
    readonly name: string;
    readonly data?: ErrorType;
    constructor(msg: string, data?: ErrorType, apiName?: string);
    /** @ignore */
    toCallResult(): CallResult<object, ErrorType>;
}
/**
 * An error that indicates the bridge call itself was failed
 */
export declare class APICallInternalError extends APICallError<never> {
    readonly name: string;
    protected constructor(code: number, msg: string, apiName?: string);
    /** @ignore */
    static fromCallResult(result: InternalErrorCallResult, apiName?: string): APICallInternalError;
    /** @ignore */
    toCallResult(): CallResult<never, object>;
}
/** Function call failed because of unauthorized operation */
export declare class APIUnauthorizedError extends APICallInternalError {
    readonly name: string;
}
/** Function call failed because the desired function not found */
export declare class APIUnregisteredError extends APICallInternalError {
    readonly name: string;
}
/** Function call failed because the input parameters don't meet the requirement */
export declare class APIInvalidParamsError extends APICallInternalError {
    readonly name: string;
}
/** Function call failed because the result can't be recognized */
export declare class APIInvalidResultError extends APICallInternalError {
    readonly name: string;
}
/**
 * An error that indicates the Bridge is broken.
 */
export declare class MultiModalSDKBridgeError extends APICallError<never> {
    readonly name: string;
    constructor();
    /** @ignore */
    toCallResult(): CallResult<never, object>;
}
