import { Capacitor, registerPlugin } from '@capacitor/core';
const plugin = registerPlugin('DarkFotoSessionExport');
export const hasSessionFolderExport = () => Capacitor.getPlatform() === 'android';
export const androidSessionDestination = {
  begin: (options) => plugin.begin(options),
  stage: (options) => plugin.stage(options),
  commit: (options) => plugin.commit(options),
  abort: (options) => plugin.abort(options),
};
