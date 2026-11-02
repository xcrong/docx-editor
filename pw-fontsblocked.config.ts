import base from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  ...(base as any),
  use: {
    ...((base as any).use ?? {}),
    launchOptions: {
      args: ['--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1, MAP fonts.gstatic.com 127.0.0.1'],
    },
  },
});
