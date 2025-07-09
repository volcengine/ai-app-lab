import { Bridge, type GlobalBridgeReceiver } from '../interface';
export declare const WEBVIEW_BRIDGE_TRACE_TAG = "[WebView]";
interface WebViewGlobalBridgeReceiver extends GlobalBridgeReceiver<string> {
    port?: MessagePort;
}
declare global {
    /**
     * Receive message from client in WebView.
     *
     * For historical reason, the input must be in JSON format
     */
    var onWebViewMessage: WebViewGlobalBridgeReceiver;
}
export declare const bridge: Bridge;
export {};
