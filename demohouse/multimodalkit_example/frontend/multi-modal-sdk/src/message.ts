import {
  assertRawCallResult,
  type CallResult,
  parseCallResultOrInvalid,
  type RawCallResult,
} from './call-result';
import { bridgeTrace } from './log';
import { isTargetEntity, type TargetEntity } from './target';
import {
  assertNumberProperty,
  assertObjectProperty,
  assertStringProperty,
} from './utils';

const trace = (...args: unknown[]) => bridgeTrace('[Message]', ...args);

export type JSBCallMessage = {
  type: MessageType.CALL;
  name: string;
  params: object;
  callbackId: number;
  target: TargetEntity;
};

export type JSBEventMessage = {
  type: MessageType.EVENT;
  name: string;
  params: object;
  timestamp: number;
};
export type JSBCallBackMessage = {
  type: MessageType.CALLBACK;
  params: object;
  callbackId: number;
};

/**
 * Message type definition
 */
export enum MessageType {
  /**
   * - Front-end -> Client: Function call
   * - Client -> Front-end: Function forwarding or client initiated function call (e.g. Execute Local Plugin)
   */
  CALL = 'call',

  /**
   * - Front-end -> Client: Target front-end's function execution completion, return callback
   * - Client -> Front-end: Return target front-end's execution result to the source front-end
   */
  CALLBACK = 'callback',

  /**
   * - Front-end -> Client: Send event
   * - Client -> Front-end: Broadcast/forward event
   */
  EVENT = 'event',
}

/**
 * Unified Message structure
 *
 * Different type of messages have different data structure. See {@link FunctionCallMessage}, {@link CallbackMessage}
 * and {@link EventMessage}
 */
export interface Message {
  accept: <ReturnType>(visitor: MessageVisitor<ReturnType>) => ReturnType;

  toPlainObject: () => object;
}

/**
 * Visitor pattern implementation for Message
 */
export interface MessageVisitor<ReturnType> {
  functionCall: (message: FunctionCallMessage) => ReturnType;
  callback: (message: CallbackMessage) => ReturnType;
  event: (message: EventMessage) => ReturnType;
}

/**
 * Message structure for function call
 */
export class FunctionCallMessage implements Message {
  name: string;
  params: object;
  callbackId: number;
  target: TargetEntity;

  constructor(options: {
    name: string;
    params?: object;
    callbackId: number;
    target: TargetEntity;
  }) {
    this.name = options.name;
    this.params = options.params ?? {};
    this.callbackId = options.callbackId;
    this.target = options.target;
  }

  accept<ReturnType>(visitor: MessageVisitor<ReturnType>): ReturnType {
    return visitor.functionCall(this);
  }

  toPlainObject(): JSBCallMessage {
    return {
      type: MessageType.CALL,
      name: this.name,
      params: this.params,
      callbackId: this.callbackId,
      target: this.target,
    };
  }
}

/**
 * Message structure for callback
 */
export class CallbackMessage implements Message {
  params: RawCallResult;
  callbackId: number;

  constructor(options: { params: RawCallResult; callbackId: number }) {
    this.params = options.params;
    this.callbackId = options.callbackId;
  }

  get parsedParams(): CallResult {
    return parseCallResultOrInvalid(this.params);
  }

  static fromCallMessage(message: FunctionCallMessage, result: CallResult) {
    return new CallbackMessage({
      params: result.toRaw(),
      callbackId: message.callbackId,
    });
  }

  accept<ReturnType>(visitor: MessageVisitor<ReturnType>): ReturnType {
    return visitor.callback(this);
  }

  toPlainObject(): JSBCallBackMessage {
    return {
      type: MessageType.CALLBACK,
      params: this.params,
      callbackId: this.callbackId,
    };
  }
}

/**
 * Message structure for event
 */
export class EventMessage implements Message {
  static _nextTraceId = 0;

  name: string;
  params: object;
  timestamp: number;
  callbackId: number;

  constructor(options: {
    name: string;
    params?: object;
    timestamp?: number;
    callbackId?: number;
  }) {
    const {
      name,
      params = {},
      timestamp = Date.now(),
      callbackId = EventMessage._nextTraceId++,
    } = options;
    this.name = name;
    this.params = params;
    this.timestamp = timestamp;
    this.callbackId = callbackId;
  }

  accept<ReturnType>(visitor: MessageVisitor<ReturnType>): ReturnType {
    return visitor.event(this);
  }

  toPlainObject(): JSBEventMessage {
    return {
      type: MessageType.EVENT,
      name: this.name,
      params: this.params,
      timestamp: this.timestamp,
    };
  }
}

function parseFunctionCallMessage(input: object): FunctionCallMessage {
  assertStringProperty(input, 'name');
  assertNumberProperty(input, 'callbackId');
  assertObjectProperty(input, 'target', {
    typeGuard: isTargetEntity,
    expectedType: 'TargetEntity',
  });
  assertObjectProperty(input, 'params', { optional: true });
  return new FunctionCallMessage(input);
}

function parseCallbackMessage(input: object): CallbackMessage {
  assertObjectProperty(input, 'params');
  assertRawCallResult(input.params);
  assertNumberProperty(input, 'callbackId');
  return new CallbackMessage({
    params: input.params,
    callbackId: input.callbackId,
  });
}

function parseEventMessage(input: object): EventMessage {
  assertStringProperty(input, 'name');
  assertObjectProperty(input, 'params', { optional: true });
  assertNumberProperty(input, 'timestamp');
  return new EventMessage(input);
}

/**
 * Try to parse the given input value into Message structure
 *
 * @param input The input object to parse to Message structure
 * @returns The parsed Message implementation when succeeded.
 * @throws When parse failed, throws {@link TypeError}.
 */
export function parseMessage(input: unknown): Message {
  if (typeof input !== 'object' || input === null)
    throw new TypeError('expect Message to be an object');
  assertStringProperty(input, 'type');
  switch (input.type) {
    case MessageType.CALL:
      trace('parse as function call');
      return parseFunctionCallMessage(input);
    case MessageType.CALLBACK:
      trace('parse as callback');
      return parseCallbackMessage(input);
    case MessageType.EVENT:
      trace('parse as event');
      return parseEventMessage(input);
    default:
      throw new TypeError(`unrecognized message type ${input.type}`);
  }
}

export type MessageCallback = (message: Message) => void;
