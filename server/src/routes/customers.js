import { Router } from "express";
import { db, randomUUID } from "../db.js";

export const customersRouter = Router({ mergeParams: true });
export const customerByIdRouter = Router();

function rowToCustomer(c) {
  return { id: c.id, name: c.name, phone: c.phone, email: c.email, pricingNote: c.pricing_note };
}

// POST /api/businesses/:businessId/customers  (create or upsert-by-id)
customersRouter.post("/", (req, res) => {
  const { businessId } = req.params;
  const { id, name, phone, email, pricingNote } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  const customerId = id || randomUUID();
  db.prepare(
    `INSERT INTO customers (id, business_id, name, phone, email, pricing_note) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone, email = excluded.email,
       pricing_note = excluded.pricing_note`
  ).run(customerId, businessId, name.trim(), phone || "", email || "", pricingNote || "");
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
  res.status(201).json(rowToCustomer(row));
});

// DELETE /api/customers/:id
customerByIdRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM customers WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});
