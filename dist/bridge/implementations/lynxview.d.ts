import { type Message } from '../../message';
import { Bridge } from '../interface';
declare global {
    const lynx: any;
    const __LEPUS__: boolean;
    const NativeModules: any;
}
export declare const LYNXVIEW_BRIDGE_TRACE_TAG = "[LynxView]";
export declare class LynxBridgeImpl extends Bridge {
    private handshake;
    private available;
    private receiver?;
    init(): void;
    notifyReady(): void;
    call(message: Message): void;
    listen(handler: (message: Message) => void): void;
}
export declare const bridge: Bridge;
