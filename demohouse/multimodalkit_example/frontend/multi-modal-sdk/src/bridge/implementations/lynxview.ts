import { MultiModalSDKBridgeError } from '../../error';
import { bridgeTrace } from '../../log';
import { EventMessage, type Message, parseMessage } from '../../message';
import { BRIDGE_READY_EVENT_NAME } from '../constants';
import { Bridge } from '../interface';

declare global {
  // biome-ignore lint/suspicious/noExplicitAny: complex lynx API
  const lynx: any;
  const __LEPUS__: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: complex lynx API
  const NativeModules: any;
}

export const LYNXVIEW_BRIDGE_TRACE_TAG = '[LynxView]';
const trace = (...args: unknown[]) =>
  bridgeTrace(LYNXVIEW_BRIDGE_TRACE_TAG, ...args);

export class LynxBridgeImpl extends Bridge {
  private handshake = false;
  private available = true;
  private receiver?: (message: Message) => void;

  init() {
    if (lynx.__isSSRInternalUsage) return;
    try {
      if (!__LEPUS__) {
        lynx
          .getJSModule('GlobalEventEmitter')
          .addListener('__APPLET_BRIDGE__', (message: unknown) => {
            trace('receive from client', message);
            this.receiver?.(parseMessage(message));
          });
      }
    } catch (e) {
      console.error('Applet bridge initialization failed');
      trace(e);
      this.available = false;
    }
  }

  notifyReady(): void {
    if (this.handshake || lynx.__isSSRInternalUsage) return;
    // Send handshake message
    NativeModules.AppletBridgeModule.postMessage(
      new EventMessage({ name: BRIDGE_READY_EVENT_NAME }).toPlainObject(),
    );
    this.handshake = true;
  }

  call(message: Message) {
    // should not throw error in Lynx rocket env.
    if (lynx.__isSSRInternalUsage) return;
    trace('call to client', message);
    if (!this.available) throw new MultiModalSDKBridgeError();
    NativeModules.AppletBridgeModule.postMessage(message.toPlainObject());
  }

  listen(handler: (message: Message) => void): void {
    this.receiver = handler;
  }
}

export const bridge: Bridge = /*#__PURE__*/ new LynxBridgeImpl();
