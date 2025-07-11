import { bridgeTrace } from './log';
import {
  assertNumberProperty,
  assertObjectProperty,
  assertStringProperty,
  type TypeGuard,
} from './utils';

const trace = (...params: unknown[]) => bridgeTrace('[Call Result]', ...params);

/**
 * Result code for callbacks
 */
export enum ResultCode {
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
  SETTING_DISABLE = -6,
}

/**
 * Commonly used pre-defined error messages
 */
export enum ErrorMessages {
  /** Function call failed because the desired function not found */
  UNREGISTERED = 'Function not found',

  /** Function call failed because the input parameters don't meet the requirement */
  INVALID_PARAMS = 'Invalid params',

  /** Function call failed because the result can't be recognized */
  INVALID_RESULT = 'Invalid result',
}

export interface RawCallResult {
  code: number;
  msg?: string;
  data?: object;
}

/**
 * Abstract class for all call results, usually passed through `params` in callback messages.
 */
export abstract class CallResult<
  DataType extends object = object,
  ErrorType extends object = object,
> {
  abstract accept<ReturnType>(
    visitor: CallResultVisitor<DataType, ErrorType, ReturnType>,
  ): ReturnType;
  abstract toRaw(): RawCallResult;
}

/**
 * Visitor pattern implementation for CallResult
 */
export interface CallResultVisitor<
  DataType extends object,
  ErrorType extends object,
  ReturnType,
> {
  success: (result: SuccessCallResult<DataType>) => ReturnType;
  failed: (result: FailedCallResult<ErrorType>) => ReturnType;
  internalError: (result: InternalErrorCallResult) => ReturnType;
}

export class SuccessCallResult<DataType extends object> extends CallResult<
  DataType,
  never
> {
  data: DataType;

  constructor(data: DataType) {
    super();
    this.data = data;
  }

  /** Call succeeded with data */
  static withData<DataType extends object>(data: DataType) {
    return new SuccessCallResult(data);
  }

  accept<ReturnType>(
    visitor: CallResultVisitor<DataType, never, ReturnType>,
  ): ReturnType {
    return visitor.success(this);
  }

  toRaw(): RawCallResult {
    return {
      code: ResultCode.SUCCESS,
      data: this.data,
    };
  }
}

export class FailedCallResult<ErrorType extends object> extends CallResult<
  never,
  ErrorType
> {
  msg: string;
  data?: ErrorType;

  constructor(msg: string, data?: ErrorType) {
    super();
    this.msg = msg;
    this.data = data;
  }

  /** Call failed with unknown reason */
  static withReason(reason: string) {
    return new FailedCallResult<never>(reason);
  }

  static withReasonAndData<NewErrorType extends object>(
    reason: string,
    data: NewErrorType,
  ) {
    return new FailedCallResult(reason, data);
  }

  accept<ReturnType>(
    visitor: CallResultVisitor<never, ErrorType, ReturnType>,
  ): ReturnType {
    return visitor.failed(this);
  }

  toRaw(): RawCallResult {
    return {
      code: ResultCode.FAILED,
      msg: this.msg,
      data: this.data,
    };
  }
}

export class InternalErrorCallResult extends CallResult<never, never> {
  code: number;
  msg: string;

  constructor(code: number, msg: string) {
    super();
    this.code = code;
    this.msg = msg;
  }

  /** Input params object doesn't meet the requirement */
  static invalidParams() {
    return new InternalErrorCallResult(
      ResultCode.INVALID_PARAMS,
      ErrorMessages.INVALID_PARAMS,
    );
  }

  /** The required function not found */
  static unregistered() {
    return new InternalErrorCallResult(
      ResultCode.UNREGISTERED,
      ErrorMessages.UNREGISTERED,
    );
  }

  /** The result from target entity doesn't meet the requirement */
  static invalidResult() {
    return new InternalErrorCallResult(
      ResultCode.INVALID_RESULT,
      ErrorMessages.INVALID_RESULT,
    );
  }

  /** The function call is not permitted in the current runtime */
  static runtimeForbidden(msg: string) {
    return new InternalErrorCallResult(ResultCode.UNREGISTERED, msg);
  }

  accept<ReturnType>(
    visitor: CallResultVisitor<never, never, ReturnType>,
  ): ReturnType {
    return visitor.internalError(this);
  }

  toRaw(): RawCallResult {
    return {
      code: this.code,
      msg: this.msg,
    };
  }
}

export function assertRawCallResult(
  input: object,
): asserts input is RawCallResult {
  assertNumberProperty(input, 'code');
  assertStringProperty(input, 'msg', { optional: true });
  assertObjectProperty(input, 'data', { optional: true });
}

/**
 * Try to parse the RawCallResult object into CallResult structure
 *
 * @param input The object to parse to CallResult structure
 * @returns The parsed CallResult implementation when parsing succeeded.
 * @throws When parse failed, throws {@link TypeError}.
 */
export function parseCallResult(input: RawCallResult): CallResult {
  if (input.code === ResultCode.SUCCESS) {
    if (input.data === undefined) throw new TypeError('undefined "data"');
    trace('parsed "success"', input.data);
    return SuccessCallResult.withData(input.data);
  }
  if (input.code === ResultCode.FAILED) {
    const { msg, data } = input;
    if (msg === undefined) throw new TypeError('undefined "msg"');
    trace('parsed "failed"', msg, data);
    if (data === undefined) return FailedCallResult.withReason(msg);
    return FailedCallResult.withReasonAndData(msg, data);
  }
  if (input.msg === undefined) throw new TypeError('undefined "msg"');
  trace('parsed "internal error"', input.msg);
  return new InternalErrorCallResult(input.code, input.msg);
}

/**
 * Try to parse the input object into CallResult structure, when error occurs, return an InvalidResult instead of
 * throwing an error
 *
 * @param input The object to parse to CallResult structure
 * @returns The parsed CallResult implementation when parsing succeeded, or InvalidResult CallResult if error occurs.
 */
export function parseCallResultOrInvalid(input: RawCallResult): CallResult {
  try {
    return parseCallResult(input);
  } catch (_) {
    return InternalErrorCallResult.invalidResult();
  }
}

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
export function transformDataType<
  OldDataType extends object,
  NewDataType extends OldDataType,
  OldErrorType extends object,
  NewErrorType extends OldErrorType,
>(
  dataTypeGuard?: TypeGuard<OldDataType, NewDataType>,
  errorTypeGuard?: TypeGuard<OldErrorType, NewErrorType>,
): CallResultVisitor<
  OldDataType,
  OldErrorType,
  CallResult<NewDataType, NewErrorType>
> {
  return {
    success: (result) =>
      dataTypeGuard?.(result.data) === false
        ? InternalErrorCallResult.invalidResult()
        : (result as SuccessCallResult<NewDataType>),
    failed: (result) =>
      result.data && errorTypeGuard?.(result.data) === false
        ? InternalErrorCallResult.invalidResult()
        : (result as FailedCallResult<NewErrorType>),
    internalError: (result) => result,
  };
}
