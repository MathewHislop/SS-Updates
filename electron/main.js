const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Only one copy of the app should ever hold the SQLite database open at a time.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  let mainWindow = null;

  async function createWindow() {
    // Where this user's real data lives — per-OS conventions (e.g. on Windows,
    // %APPDATA%\Simple Scheduler). This is what makes the packaged app's data
    // survive updates/reinstalls and live in the "right" place, unlike the
    // dev workflow which keeps everything next to the source for easy inspection.
    process.env.SCHEDULER_DATA_DIR = app.getPath("userData");
    process.env.SCHEDULER_APP_VERSION = app.getVersion();
    process.env.SCHEDULER_CLIENT_DIST = app.isPackaged
      ? path.join(process.resourcesPath, "client-dist")
      : path.join(__dirname, "..", "client", "dist");

    // The server is plain ESM; dynamic import() works from this CJS main process
    // regardless of the root package's module type. On Windows, import() needs a
    // real file:// URL — a bare "C:\..." path throws ERR_UNSUPPORTED_ESM_URL_SCHEME.
    const serverDir = app.isPackaged
      ? path.join(process.resourcesPath, "server", "src")
      : path.join(__dirname, "..", "server", "src");
    const { startServer } = await import(pathToFileURL(path.join(serverDir, "index.js")).href);
    const { setUpdateStatus, registerInstallHandler } = await import(
      pathToFileURL(path.join(serverDir, "updateStatus.js")).href
    );

    const { port } = await startServer({ port: 0 });

    setupAutoUpdate({ setUpdateStatus, registerInstallHandler });

    mainWindow = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 960,
      minHeight: 640,
      title: "Simple Scheduler",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    mainWindow.setMenuBarVisibility(false);
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }

  // Checks GitHub Releases for a newer published version, downloads it
  // silently in the background, and leaves it queued to install — the
  // renderer polls /api/update/status and shows a "restart to update" prompt
  // rather than us forcing an interruption. No-ops entirely outside a real
  // packaged install, since there's nothing meaningful to update against.
  function setupAutoUpdate({ setUpdateStatus, registerInstallHandler }) {
    if (!app.isPackaged) return;

    const { autoUpdater } = require("electron-updater");

    // TODO: remove once builds are code-signed. Unsigned installers have no
    // publisher certificate for electron-updater to verify the download
    // against, so this check would otherwise just fail every update.
    autoUpdater.verifyUpdateCodeSignature = false;

    registerInstallHandler(() => autoUpdater.quitAndInstall());

    autoUpdater.on("update-available", (info) => {
      setUpdateStatus({ updateAvailable: true, version: info.version, error: null });
    });
    autoUpdater.on("update-downloaded", (info) => {
      setUpdateStatus({ updateDownloaded: true, version: info.version, error: null });
    });
    autoUpdater.on("error", (err) => {
      setUpdateStatus({ error: err?.message || String(err) });
    });

    autoUpdater.checkForUpdates().catch((err) => {
      setUpdateStatus({ error: err?.message || String(err) });
    });
  }

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
