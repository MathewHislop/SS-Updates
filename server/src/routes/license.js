import { Router } from "express";
import { getAccessStatus, activateLicense, deactivateLicense, completeOnboarding } from "../license.js";

export const licenseRouter = Router();

licenseRouter.get("/status", async (req, res) => {
  const status = await getAccessStatus();
  res.json(status);
});

licenseRouter.post("/revalidate", async (req, res) => {
  const status = await getAccessStatus({ forceRevalidate: true });
  res.json(status);
});

licenseRouter.post("/activate", async (req, res) => {
  const { licenseKey } = req.body || {};
  const result = await activateLicense(licenseKey);
  if (!result.ok) return res.status(400).json(result);
  const status = await getAccessStatus();
  res.json({ ok: true, status });
});

licenseRouter.post("/deactivate", async (req, res) => {
  const status = await deactivateLicense();
  res.json(status);
});

licenseRouter.post("/complete-onboarding", (req, res) => {
  completeOnboarding();
  res.status(204).end();
});
