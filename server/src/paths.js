import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SCHEDULER_DATA_DIR is set by the Electron main process to the OS's per-user
// app-data folder (e.g. %APPDATA%\simple-scheduler — derived from package.json's
// "name", unaffected by the Site Sparrow display-name rebrand). When unset — the plain
// `npm run dev` local-prototype workflow — everything stays exactly where it
// already was, next to the source, so nothing changes for that flow.
const root = process.env.SCHEDULER_DATA_DIR
  ? process.env.SCHEDULER_DATA_DIR
  : path.join(__dirname, "..");

export const dataDir = path.join(root, "data");
export const uploadsDir = path.join(root, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

// Where the built client (client/dist) lives, so the packaged app can serve
// the frontend and API from a single origin. Electron sets this explicitly;
// falls back to the source-tree location for `npm run electron:preview`.
export const clientDistDir = process.env.SCHEDULER_CLIENT_DIST
  ? process.env.SCHEDULER_CLIENT_DIST
  : path.join(__dirname, "..", "..", "client", "dist");
