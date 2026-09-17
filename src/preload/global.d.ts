// Makes `window.allbee` typed in the renderer. Which of the three it is depends on the
// window; check `allbee.role` to narrow it.
import type { AudioApi, CompanionApi, MainApi } from '@shared/constants/ipc';

declare global {
  interface Window {
    allbee: MainApi | CompanionApi | AudioApi;
  }
}

export {};
