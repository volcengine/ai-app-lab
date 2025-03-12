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
    
  }
});
