// Set by the Electron main process (from app.getVersion(), which electron-builder
// stamps from the root package.json). Falls back to a clearly-dev value for the
// plain `npm run dev` workflow, where there's no packaged app version to report.
export const APP_VERSION = process.env.SCHEDULER_APP_VERSION || "0.0.0-dev";
