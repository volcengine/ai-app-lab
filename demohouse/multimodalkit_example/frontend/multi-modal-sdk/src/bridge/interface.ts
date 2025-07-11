import type { Message, MessageCallback } from '../message';

/**
 * Abstract bridge interface for front-end
 *
 * This class acts as the abstract bridge layer and thus should be as generic as possible and defines the basic data
 * transfer methods.
 */
export abstract class Bridge {
  /**
   * Prepare global interfaces if needed
   */
  abstract init(): void;

  /**
   * Register message handler for incoming messages
   */
  abstract listen(handler: (message: Message) => void): void;

  /**
   * Send message to client
   *
   * Messages sent through this interface including function call, callback, event broadcasting, etc.
   */
  abstract call(message: Message): void;

  /**
   * Indicate that the framework is ready to receive messages from the client and send handshake message.
   */
  abstract notifyReady(): void;
}

export interface GlobalBridgeReceiver<ReceiveType = unknown> {
  (message: ReceiveType): void;
  on: (listener: MessageCallback) => void;
  off: (listener: MessageCallback) => void;
  isAvailable: () => boolean;
  notifyReady: () => void;
}
