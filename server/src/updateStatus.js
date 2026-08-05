// Shared in-memory bridge between Electron's main process (which owns
// electron-updater and actually knows about update availability) and the
// Express routes below (which the renderer polls over plain HTTP, same as
// everything else in this app). Both sides run in the same Node process —
// main.js imports this module directly — so no IPC/preload bridge is needed.

let state = {
  updateAvailable: false,
  updateDownloaded: false,
  version: null,
  error: null,
};

let installHandler = null;

export function getUpdateStatus() {
  return state;
}

export function setUpdateStatus(patch) {
  state = { ...state, ...patch };
}

// Called once by electron/main.js with the real quitAndInstall() trigger.
export function registerInstallHandler(fn) {
  installHandler = fn;
}

export function triggerInstall() {
  if (installHandler) installHandler();
}
