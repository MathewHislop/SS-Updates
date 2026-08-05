import { Router } from "express";
import { db, randomUUID } from "../db.js";

export const interactionLogsRouter = Router({ mergeParams: true }); // /api/businesses/:businessId/interaction-logs
export const interactionLogByIdRouter = Router(); // /api/interaction-logs

function rowToLog(l) {
  return { id: l.id, customerId: l.customer_id, date: l.date, type: l.type, subject: l.subject, text: l.text };
}

// POST /api/businesses/:businessId/interaction-logs
// customerId omitted/null => business-profile-level activity entry
// customerId set          => CRM customer-level activity entry
interactionLogsRouter.post("/", (req, res) => {
  const { businessId } = req.params;
  const { id, customerId, date, type, subject, text } = req.body || {};
  if (!type || !["note", "email"].includes(type)) return res.status(400).json({ error: "type must be note or email" });
  if (!date) return res.status(400).json({ error: "date is required" });
  const logId = id || randomUUID();
  db.prepare(
    `INSERT INTO interaction_logs (id, business_id, customer_id, type, subject, text, date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(logId, businessId, customerId || null, type, subject || "", text || "", date);
  const row = db.prepare("SELECT * FROM interaction_logs WHERE id = ?").get(logId);
  res.status(201).json(rowToLog(row));
});

// DELETE /api/interaction-logs/:id
interactionLogByIdRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM interaction_logs WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});
