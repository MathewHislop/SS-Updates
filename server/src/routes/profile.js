import { Router } from "express";
import { db } from "../db.js";

export const profileRouter = Router({ mergeParams: true });

const FIELD_MAP = {
  address: "address",
  contactName: "contact_name",
  contactPhone: "contact_phone",
  contactEmail: "contact_email",
  industry: "industry",
  googleProfileUrl: "google_profile_url",
  websiteUrl: "website_url",
  notes: "notes",
};

function rowToProfile(row) {
  return {
    address: row.address,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    industry: row.industry,
    googleProfileUrl: row.google_profile_url,
    websiteUrl: row.website_url,
    notes: row.notes,
  };
}

// GET /api/businesses/:businessId/profile
profileRouter.get("/", (req, res) => {
  const row = db.prepare("SELECT * FROM business_profiles WHERE business_id = ?").get(req.params.businessId);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(rowToProfile(row));
});

// PATCH /api/businesses/:businessId/profile — accepts a partial patch of camelCase fields
profileRouter.patch("/", (req, res) => {
  const { businessId } = req.params;
  const patch = req.body || {};
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = FIELD_MAP[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    values.push(value ?? "");
  }
  if (sets.length === 0) return res.status(400).json({ error: "no valid fields in patch" });
  values.push(businessId);
  const result = db.prepare(`UPDATE business_profiles SET ${sets.join(", ")} WHERE business_id = ?`).run(...values);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  const row = db.prepare("SELECT * FROM business_profiles WHERE business_id = ?").get(businessId);
  res.json(rowToProfile(row));
});
