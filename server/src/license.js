import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { dataDir } from "./paths.js";

const STATE_PATH = path.join(dataDir, "license-state.json");
const LS_BASE = "https://api.lemonsqueezy.com/v1/licenses";

const TRIAL_DAYS = 14;
// How often we bother re-checking an already-active license against Lemon Squeezy.
const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function defaultState() {
  return {
    trialStartedAt: new Date().toISOString(),
    onboardingCompleted: false,
    licenseKey: null,
    instanceId: null,
    instanceName: null,
    cachedStatus: null, // last status Lemon Squeezy reported: active | inactive | expired | disabled
    lastValidatedAt: null,
    lastCheckError: null,
  };
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    const fresh = defaultState();
    writeState(fresh);
    return fresh;
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function trialInfo(state) {
  const startedAt = new Date(state.trialStartedAt).getTime();
  const daysElapsed = Math.floor((Date.now() - startedAt) / (24 * 60 * 60 * 1000));
  const daysLeft = Math.max(0, TRIAL_DAYS - daysElapsed);
  return { startedAt: state.trialStartedAt, daysElapsed, daysLeft, active: daysElapsed < TRIAL_DAYS };
}

// Calls Lemon Squeezy's License API. These endpoints (activate/validate/deactivate)
// take only the customer's license key — no store API key or store ID needed, by
// design, since they're meant to be called straight from an untrusted desktop app.
async function callLemonSqueezy(endpoint, params) {
  const res = await fetch(`${LS_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  return { httpStatus: res.status, body };
}

export async function activateLicense(licenseKey) {
  const key = (licenseKey || "").trim();
  if (!key) return { ok: false, error: "Enter a license key." };

  const instanceName = os.hostname() || "this-computer";
  let result;
  try {
    result = await callLemonSqueezy("activate", { license_key: key, instance_name: instanceName });
  } catch (e) {
    return { ok: false, error: "Couldn't reach Lemon Squeezy. Check your internet connection and try again." };
  }

  const { body } = result;
  if (!body.activated) {
    return { ok: false, error: body.error || "That license key couldn't be activated." };
  }

  const state = readState();
  state.licenseKey = key;
  state.instanceId = body.instance?.id || null;
  state.instanceName = instanceName;
  state.cachedStatus = body.license_key?.status || "active";
  state.lastValidatedAt = new Date().toISOString();
  state.lastCheckError = null;
  writeState(state);

  return { ok: true, status: state.cachedStatus };
}

// Re-checks the CURRENT status of the stored license against Lemon Squeezy —
// this is deliberately "is this license active right now", not "was it ever
// activated". If Lemon Squeezy later reports expired/disabled/cancelled (e.g.
// a subscription lapses), access is revoked on the next successful check.
// Network failures don't revoke access — they just leave the last-known status
// in place, per the handoff's "app still works if offline" requirement.
async function revalidateLicense(state) {
  if (!state.licenseKey) return state;
  try {
    const { body } = await callLemonSqueezy("validate", {
      license_key: state.licenseKey,
      instance_id: state.instanceId || undefined,
    });
    if (body.error && !body.license_key) {
      // e.g. license_key not found / instance mismatch — reflect it, but don't
      // silently wipe the local record; deactivating is an explicit user action.
      state.lastCheckError = body.error;
      state.lastValidatedAt = new Date().toISOString();
      state.cachedStatus = "inactive";
    } else {
      state.cachedStatus = body.license_key?.status || (body.valid ? "active" : "inactive");
      state.lastValidatedAt = new Date().toISOString();
      state.lastCheckError = null;
    }
  } catch (e) {
    state.lastCheckError = "offline";
  }
  writeState(state);
  return state;
}

export async function getAccessStatus({ forceRevalidate = false } = {}) {
  let state = readState();

  if (state.licenseKey) {
    const staleMs = state.lastValidatedAt ? Date.now() - new Date(state.lastValidatedAt).getTime() : Infinity;
    if (forceRevalidate || staleMs > REVALIDATE_INTERVAL_MS) {
      state = await revalidateLicense(state);
    }
    const licensed = state.cachedStatus === "active";
    return {
      mode: licensed ? "licensed" : "license_inactive",
      licenseStatus: state.cachedStatus,
      lastValidatedAt: state.lastValidatedAt,
      lastCheckError: state.lastCheckError,
      onboardingCompleted: state.onboardingCompleted,
      trial: trialInfo(state),
    };
  }

  const trial = trialInfo(state);
  return {
    mode: trial.active ? "trial" : "trial_expired",
    licenseStatus: null,
    lastValidatedAt: null,
    lastCheckError: null,
    onboardingCompleted: state.onboardingCompleted,
    trial,
  };
}

export async function deactivateLicense() {
  const state = readState();
  if (state.licenseKey) {
    try {
      await callLemonSqueezy("deactivate", { license_key: state.licenseKey, instance_id: state.instanceId || "" });
    } catch {
      // best-effort — still clear the local record so this machine can be re-licensed
    }
  }
  state.licenseKey = null;
  state.instanceId = null;
  state.instanceName = null;
  state.cachedStatus = null;
  state.lastValidatedAt = null;
  state.lastCheckError = null;
  writeState(state);
  return getAccessStatus();
}

export function completeOnboarding() {
  const state = readState();
  state.onboardingCompleted = true;
  writeState(state);
}
