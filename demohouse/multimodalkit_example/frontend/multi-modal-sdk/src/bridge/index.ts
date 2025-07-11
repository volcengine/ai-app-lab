import { bridge as lynxViewBridge } from './implementations/lynxview';
import { bridge as webViewBridge } from './implementations/webview';

export type { Bridge } from './interface';

const isLynxView =
  typeof lynx === 'object' && typeof NativeModules === 'object';

export const bridge = isLynxView ? lynxViewBridge : webViewBridge;
bridge.init();
bridge.notifyReady();
