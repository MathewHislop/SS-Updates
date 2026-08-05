import { Router } from "express";
import { db, randomUUID } from "../db.js";

export const jobsRouter = Router({ mergeParams: true });
export const jobByIdRouter = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function rowToJob(j) {
  return {
    id: j.id,
    customerId: j.customer_id,
    date: j.date,
    startTime: j.start_time,
    durationMinutes: j.duration_minutes,
    service: j.service,
    notes: j.notes,
  };
}

function validateJobBody(body) {
  const { customerId, date, startTime, durationMinutes } = body;
  if (!customerId) return "customerId is required";
  if (!date) return "date is required";
  if (startTime !== undefined && !TIME_RE.test(startTime)) return "startTime must be HH:MM (24hr)";
  if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
    return "durationMinutes must be a positive integer";
  }
  return null;
}

// POST /api/businesses/:businessId/jobs  (create or upsert-by-id, matching addOrUpdateJob)
jobsRouter.post("/", (req, res) => {
  const { businessId } = req.params;
  const body = req.body || {};
  const error = validateJobBody(body);
  if (error) return res.status(400).json({ error });
  const { id, customerId, date, startTime, durationMinutes, service, notes } = body;
  const jobId = id || randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, business_id, customer_id, date, start_time, duration_minutes, service, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET customer_id = excluded.customer_id, date = excluded.date,
       start_time = excluded.start_time, duration_minutes = excluded.duration_minutes,
       service = excluded.service, notes = excluded.notes`
  ).run(
    jobId,
    businessId,
    customerId,
    date,
    startTime || "09:00",
    durationMinutes || 60,
    service || "",
    notes || ""
  );
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
  res.status(201).json(rowToJob(row));
});

// DELETE /api/jobs/:id
jobByIdRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM jobs WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});
