import { type CallResult, type RawCallResult } from './call-result';
import { type TargetEntity } from './target';
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
export declare enum MessageType {
    /**
     * - Front-end -> Client: Function call
     * - Client -> Front-end: Function forwarding or client initiated function call (e.g. Execute Local Plugin)
     */
    CALL = "call",
    /**
     * - Front-end -> Client: Target front-end's function execution completion, return callback
     * - Client -> Front-end: Return target front-end's execution result to the source front-end
     */
    CALLBACK = "callback",
    /**
     * - Front-end -> Client: Send event
     * - Client -> Front-end: Broadcast/forward event
     */
    EVENT = "event"
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
export declare class FunctionCallMessage implements Message {
    name: string;
    params: object;
    callbackId: number;
    target: TargetEntity;
    constructor(options: {
        name: string;
        params?: object;
        callbackId: number;
        target: TargetEntity;
    });
    accept<ReturnType>(visitor: MessageVisitor<ReturnType>): ReturnType;
    toPlainObject(): JSBCallMessage;
}
/**
 * Message structure for callback
 */
export declare class CallbackMessage implements Message {
    params: RawCallResult;
    callbackId: number;
    constructor(options: {
        params: RawCallResult;
        callbackId: number;
    });
    get parsedParams(): CallResult;
    static fromCallMessage(message: FunctionCallMessage, result: CallResult): CallbackMessage;
    accept<ReturnType>(visitor: MessageVisitor<ReturnType>): ReturnType;
    toPlainObject(): JSBCallBackMessage;
}
/**
 * Message structure for event
 */
export declare class EventMessage implements Message {
    static _nextTraceId: number;
    name: string;
    params: object;
    timestamp: number;
    callbackId: number;
    constructor(options: {
        name: string;
        params?: object;
        timestamp?: number;
        callbackId?: number;
    });
    accept<ReturnType>(visitor: MessageVisitor<ReturnType>): ReturnType;
    toPlainObject(): JSBEventMessage;
}
/**
 * Try to parse the given input value into Message structure
 *
 * @param input The input object to parse to Message structure
 * @returns The parsed Message implementation when succeeded.
 * @throws When parse failed, throws {@link TypeError}.
 */
export declare function parseMessage(input: unknown): Message;
export type MessageCallback = (message: Message) => void;
