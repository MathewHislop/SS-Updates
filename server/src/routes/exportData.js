import { Router } from "express";
import { db } from "../db.js";

export const exportRouter = Router();

// GET /api/export — full snapshot across all businesses, shaped like the original
// prototype's in-memory state, so the client can reuse the same Excel-export logic.
exportRouter.get("/", (req, res) => {
  const businesses = db.prepare("SELECT * FROM businesses ORDER BY sort_order ASC").all();

  const customers = {};
  const jobs = {};
  const businessProfiles = {};
  const interactionLogs = {};

  for (const biz of businesses) {
    const overridesByCustomer = {};
    db.prepare(
      "SELECT * FROM customer_pricing_overrides WHERE customer_id IN (SELECT id FROM customers WHERE business_id = ?)"
    )
      .all(biz.id)
      .forEach((o) => {
        (overridesByCustomer[o.customer_id] ||= []).push({ serviceLabel: o.service_label, price: o.price });
      });

    customers[biz.id] = db
      .prepare("SELECT * FROM customers WHERE business_id = ? ORDER BY created_at ASC")
      .all(biz.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        pricingNote: c.pricing_note,
        pricingOverrides: overridesByCustomer[c.id] || [],
      }));

    jobs[biz.id] = db
      .prepare("SELECT * FROM jobs WHERE business_id = ? ORDER BY date ASC, start_time ASC")
      .all(biz.id)
      .map((j) => ({
        id: j.id,
        customerId: j.customer_id,
        date: j.date,
        startTime: j.start_time,
        durationMinutes: j.duration_minutes,
        service: j.service,
        notes: j.notes,
      }));

    const profileRow = db.prepare("SELECT * FROM business_profiles WHERE business_id = ?").get(biz.id);
    const files = db
      .prepare("SELECT * FROM business_profile_files WHERE business_id = ?")
      .all(biz.id)
      .map((f) => ({ id: f.id, name: f.filename, size: f.size, type: f.mime_type, uploadedAt: f.uploaded_at }));

    businessProfiles[biz.id] = profileRow
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
        }
      : { address: "", contactName: "", contactPhone: "", contactEmail: "", industry: "", googleProfileUrl: "", websiteUrl: "", notes: "", fileRefs: [] };

    interactionLogs[biz.id] = db
      .prepare("SELECT * FROM interaction_logs WHERE business_id = ? AND customer_id IS NOT NULL")
      .all(biz.id)
      .map((l) => ({ id: l.id, customerId: l.customer_id, date: l.date, type: l.type, subject: l.subject, text: l.text }));
  }

  res.json({
    businesses: businesses.map((b) => ({ id: b.id, name: b.name, color: b.color })),
    customers,
    jobs,
    businessProfiles,
    interactionLogs,
  });
});
