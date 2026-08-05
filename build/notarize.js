// electron-builder's afterSign hook — only ever invoked for macOS builds, and
// only does anything once real Apple credentials exist. Until then it's a
// harmless no-op so `npm run dist:win` (and any accidental mac build attempt
// on this Windows machine, which can't produce a real mac artifact anyway)
// never fails because of this file.
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      "[notarize] Skipping — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID env vars to notarize a real mac build."
    );
    return;
  }

  // Only required once a mac build is actually being produced (from a Mac).
  const { notarize } = require("@electron/notarize");
  const path = require("node:path");
  const { productName } = context.packager.appInfo;

  await notarize({
    appPath: path.join(appOutDir, `${productName}.app`),
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
};
