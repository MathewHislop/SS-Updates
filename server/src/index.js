import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "./db.js";
import { clientDistDir } from "./paths.js";
import { APP_VERSION } from "./version.js";

import { businessesRouter } from "./routes/businesses.js";
import { customersRouter, customerByIdRouter } from "./routes/customers.js";
import { jobsRouter, jobByIdRouter } from "./routes/jobs.js";
import { profileRouter } from "./routes/profile.js";
import { filesRouter, fileByIdRouter } from "./routes/files.js";
import { interactionLogsRouter, interactionLogByIdRouter } from "./routes/interactionLogs.js";
import { exportRouter } from "./routes/exportData.js";
import { licenseRouter } from "./routes/license.js";
import { updateStatusRouter } from "./routes/updateStatus.js";
import { pricingOverridesRouter, pricingOverrideByIdRouter } from "./routes/pricingOverrides.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/businesses", businessesRouter);
  app.use("/api/businesses/:businessId/customers", customersRouter);
  app.use("/api/customers", customerByIdRouter);
  app.use("/api/customers/:customerId/pricing-overrides", pricingOverridesRouter);
  app.use("/api/pricing-overrides", pricingOverrideByIdRouter);
  app.use("/api/businesses/:businessId/jobs", jobsRouter);
  app.use("/api/jobs", jobByIdRouter);
  app.use("/api/businesses/:businessId/profile", profileRouter);
  app.use("/api/businesses/:businessId/files", filesRouter);
  app.use("/api/files", fileByIdRouter);
  app.use("/api/businesses/:businessId/interaction-logs", interactionLogsRouter);
  app.use("/api/interaction-logs", interactionLogByIdRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/license", licenseRouter);
  app.use("/api/update", updateStatusRouter);

  app.get("/api/version", (req, res) => res.json({ version: APP_VERSION }));
  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // In packaged/preview mode the built client sits in clientDistDir; serve it
  // and the API from one origin so the client's relative fetch('/api/...')
  // calls keep working unchanged. In plain `npm run dev`, this directory
  // doesn't exist yet (Vite's own dev server handles the frontend instead),
  // so this block is simply skipped.
  if (fs.existsSync(path.join(clientDistDir, "index.html"))) {
    app.use(express.static(clientDistDir));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.sendFile(path.join(clientDistDir, "index.html"));
    });
  }

  return app;
}

export function startServer({ port } = {}) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app
      .listen(port ?? process.env.PORT ?? 4000, () => {
        const actualPort = server.address().port;
        console.log(`Site Sparrow API listening on http://localhost:${actualPort}`);
        resolve({ app, server, port: actualPort });
      })
      .on("error", reject);
  });
}

// Auto-start only when this file is run directly (`node src/index.js`, i.e.
// `npm run dev`) — not when Electron's main process imports startServer() itself.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
