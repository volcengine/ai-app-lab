import { defineConfig } from '@ai-app/kit';

export default defineConfig({
  agent: {
    mode: 'localAgent'
  },
  app: {
    entry:
      { type: 'FullPage', id: 'recognition' }
  },
  deploy: {
    gecko: {
      env: 'prod',
      deployAccessKey: '902679bb2254666f3e4642f82008a743',
      deploymentId: 25828116277250,
      channel: 'com_volcengine_snap_solver',
      channelId: '26322102019842',
      prefix: 'gecko/applet/volcengine',
      leafId: '26322102018306',
      // env: 'test',
      // deployAccessKey: '3d40cd5a01416112cebfd266e9acbb94',
      // deploymentId: 25828116277506,
      // channel: 'com_volcengine_snap_solver',
      // channelId: '26047372999426',
      // prefix: 'gecko/applet/volcengine',
      // leafId: '26047372997890',
    }
  }
});
