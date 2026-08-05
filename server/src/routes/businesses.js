import { Router } from "express";
import { db, TAB_COLORS, randomUUID } from "../db.js";
import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "../uploads.js";

export const businessesRouter = Router();

function rowToBusiness(row) {
  return { id: row.id, name: row.name, color: row.color };
}

businessesRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM businesses ORDER BY sort_order ASC").all();
  res.json(rows.map(rowToBusiness));
});

businessesRouter.post("/", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS n FROM businesses").get().n;
  const id = randomUUID();
  const name = (req.body?.name || `Business ${count + 1}`).trim() || `Business ${count + 1}`;
  const color = TAB_COLORS[count % TAB_COLORS.length];
  db.prepare("INSERT INTO businesses (id, name, color, sort_order) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    color,
    count
  );
  db.prepare("INSERT INTO business_profiles (business_id) VALUES (?)").run(id);
  res.status(201).json({ id, name, color });
});

businessesRouter.patch("/:id", (req, res) => {
  const { name } = req.body || {};
  const trimmed = (name || "").trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });
  const result = db.prepare("UPDATE businesses SET name = ? WHERE id = ?").run(trimmed, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.params.id);
  res.json(rowToBusiness(row));
});

businessesRouter.delete("/:id", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM businesses").get().n;
  if (total <= 1) return res.status(400).json({ error: "cannot delete the only business" });

  const files = db
    .prepare("SELECT stored_path FROM business_profile_files WHERE business_id = ?")
    .all(req.params.id);

  const result = db.prepare("DELETE FROM businesses WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });

  for (const f of files) {
    fs.rm(path.join(uploadsDir, f.stored_path), { force: true }, () => {});
  }
  res.status(204).end();
});

// Everything needed to render one business's tab in a single round trip.
businessesRouter.get("/:id/bundle", (req, res) => {
  const businessId = req.params.id;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
  if (!business) return res.status(404).json({ error: "not found" });

  const overridesByCustomer = {};
  db.prepare(
    "SELECT * FROM customer_pricing_overrides WHERE customer_id IN (SELECT id FROM customers WHERE business_id = ?)"
  )
    .all(businessId)
    .forEach((o) => {
      (overridesByCustomer[o.customer_id] ||= []).push({ id: o.id, serviceLabel: o.service_label, price: o.price });
    });

  const customers = db
    .prepare("SELECT * FROM customers WHERE business_id = ? ORDER BY created_at ASC")
    .all(businessId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      pricingNote: c.pricing_note,
      pricingOverrides: overridesByCustomer[c.id] || [],
    }));

  const jobs = db
    .prepare("SELECT * FROM jobs WHERE business_id = ? ORDER BY date ASC, start_time ASC")
    .all(businessId)
    .map((j) => ({
      id: j.id,
      customerId: j.customer_id,
      date: j.date,
      startTime: j.start_time,
      durationMinutes: j.duration_minutes,
      service: j.service,
      notes: j.notes,
    }));

  const profileRow = db.prepare("SELECT * FROM business_profiles WHERE business_id = ?").get(businessId);
  const files = db
    .prepare("SELECT * FROM business_profile_files WHERE business_id = ? ORDER BY uploaded_at ASC")
    .all(businessId)
    .map((f) => ({
      id: f.id,
      name: f.filename,
      size: f.size,
      type: f.mime_type,
      uploadedAt: f.uploaded_at,
    }));

  const businessActivity = db
    .prepare(
      "SELECT * FROM interaction_logs WHERE business_id = ? AND customer_id IS NULL ORDER BY date ASC"
    )
    .all(businessId)
    .map(rowToLog);

  const interactionLogs = db
    .prepare(
      "SELECT * FROM interaction_logs WHERE business_id = ? AND customer_id IS NOT NULL ORDER BY date ASC"
    )
    .all(businessId)
    .map(rowToLog);

  res.json({
    business: rowToBusiness(business),
    customers,
    jobs,
    profile: profileRow
      ? {
          address: profileRow.address,
          contactName: profileRow.contact_name,
          contactPhone: profileRow.contact_phone,
          contactEmail: profileRow.contact_email,
          industry: profileRow.industry,
          googleProfileUrl: profileRow.google_profile_url,
          websiteUrl: profileRow.website_url,
          notes: profileRow.notes,
          fileRefs: files,
          activityLog: businessActivity,
        }
      : null,
    interactionLogs,
  });
});

function rowToLog(l) {
  return { id: l.id, customerId: l.customer_id, date: l.date, type: l.type, subject: l.subject, text: l.text };
}
