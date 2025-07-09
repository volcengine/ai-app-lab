import { type TypeGuard } from './utils';
/**
 * Result code for callbacks
 */
export declare enum ResultCode {
    /** Function call succeeded */
    SUCCESS = 1,
    /**
     * Function call failed without specified reason
     *
     * This is a general purpose error status code
     */
    FAILED = 0,
    /** Function call failed because of unauthorized operation */
    UNAUTHORIZED = -1,
    /** Function call failed because the desired function not found */
    UNREGISTERED = -2,
    /** Function call failed because the input parameters don't meet the requirement */
    INVALID_PARAMS = -3,
    /** Function call failed because the result can't be recognized */
    INVALID_RESULT = -4,
    /** Function call failed because the client prohibited */
    SETTING_DISABLE = -6
}
/**
 * Commonly used pre-defined error messages
 */
export declare enum ErrorMessages {
    /** Function call failed because the desired function not found */
    UNREGISTERED = "Function not found",
    /** Function call failed because the input parameters don't meet the requirement */
    INVALID_PARAMS = "Invalid params",
    /** Function call failed because the result can't be recognized */
    INVALID_RESULT = "Invalid result"
}
export interface RawCallResult {
    code: number;
    msg?: string;
    data?: object;
}
/**
 * Abstract class for all call results, usually passed through `params` in callback messages.
 */
export declare abstract class CallResult<DataType extends object = object, ErrorType extends object = object> {
    abstract accept<ReturnType>(visitor: CallResultVisitor<DataType, ErrorType, ReturnType>): ReturnType;
    abstract toRaw(): RawCallResult;
}
/**
 * Visitor pattern implementation for CallResult
 */
export interface CallResultVisitor<DataType extends object, ErrorType extends object, ReturnType> {
    success: (result: SuccessCallResult<DataType>) => ReturnType;
    failed: (result: FailedCallResult<ErrorType>) => ReturnType;
    internalError: (result: InternalErrorCallResult) => ReturnType;
}
export declare class SuccessCallResult<DataType extends object> extends CallResult<DataType, never> {
    data: DataType;
    constructor(data: DataType);
    /** Call succeeded with data */
    static withData<DataType extends object>(data: DataType): SuccessCallResult<DataType>;
    accept<ReturnType>(visitor: CallResultVisitor<DataType, never, ReturnType>): ReturnType;
    toRaw(): RawCallResult;
}
export declare class FailedCallResult<ErrorType extends object> extends CallResult<never, ErrorType> {
    msg: string;
    data?: ErrorType;
    constructor(msg: string, data?: ErrorType);
    /** Call failed with unknown reason */
    static withReason(reason: string): FailedCallResult<never>;
    static withReasonAndData<NewErrorType extends object>(reason: string, data: NewErrorType): FailedCallResult<NewErrorType>;
    accept<ReturnType>(visitor: CallResultVisitor<never, ErrorType, ReturnType>): ReturnType;
    toRaw(): RawCallResult;
}
export declare class InternalErrorCallResult extends CallResult<never, never> {
    code: number;
    msg: string;
    constructor(code: number, msg: string);
    /** Input params object doesn't meet the requirement */
    static invalidParams(): InternalErrorCallResult;
    /** The required function not found */
    static unregistered(): InternalErrorCallResult;
    /** The result from target entity doesn't meet the requirement */
    static invalidResult(): InternalErrorCallResult;
    /** The function call is not permitted in the current runtime */
    static runtimeForbidden(msg: string): InternalErrorCallResult;
    accept<ReturnType>(visitor: CallResultVisitor<never, never, ReturnType>): ReturnType;
    toRaw(): RawCallResult;
}
export declare function assertRawCallResult(input: object): asserts input is RawCallResult;
/**
 * Try to parse the RawCallResult object into CallResult structure
 *
 * @param input The object to parse to CallResult structure
 * @returns The parsed CallResult implementation when parsing succeeded.
 * @throws When parse failed, throws {@link TypeError}.
 */
export declare function parseCallResult(input: RawCallResult): CallResult;
/**
 * Try to parse the input object into CallResult structure, when error occurs, return an InvalidResult instead of
 * throwing an error
 *
 * @param input The object to parse to CallResult structure
 * @returns The parsed CallResult implementation when parsing succeeded, or InvalidResult CallResult if error occurs.
 */
export declare function parseCallResultOrInvalid(input: RawCallResult): CallResult;
/**
 * A utility CallResult visitor used to transform the containing data type into another.
 *
 * @param dataTypeGuard An optional guard function to check whether the data meets the requirements of the target type
 * @param errorTypeGuard An optional guard function to check whether the error data meets the requirements of the target
 *                       error data type
 * @returns A visitor object with the following behavior:
 *          - returns the object unchanged for `InternalErrorCallResult`.
 *          - returns the object unchanged when check passed for `SuccessCallResult` or `FailedCallResult`;
 *          - returns a new `InternalErrorCallResult` when check failed;
 */
export declare function transformDataType<OldDataType extends object, NewDataType extends OldDataType, OldErrorType extends object, NewErrorType extends OldErrorType>(dataTypeGuard?: TypeGuard<OldDataType, NewDataType>, errorTypeGuard?: TypeGuard<OldErrorType, NewErrorType>): CallResultVisitor<OldDataType, OldErrorType, CallResult<NewDataType, NewErrorType>>;
