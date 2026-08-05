import { Router } from "express";
import { db, randomUUID } from "../db.js";

export const pricingOverridesRouter = Router({ mergeParams: true }); // /api/customers/:customerId/pricing-overrides
export const pricingOverrideByIdRouter = Router(); // /api/pricing-overrides

function rowToOverride(o) {
  return { id: o.id, customerId: o.customer_id, serviceLabel: o.service_label, price: o.price };
}

// POST /api/customers/:customerId/pricing-overrides  (create or upsert-by-id)
pricingOverridesRouter.post("/", (req, res) => {
  const { customerId } = req.params;
  const { id, serviceLabel, price } = req.body || {};
  if (!serviceLabel || !serviceLabel.trim()) return res.status(400).json({ error: "serviceLabel is required" });
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ error: "price must be a non-negative number" });
  const overrideId = id || randomUUID();
  db.prepare(
    `INSERT INTO customer_pricing_overrides (id, customer_id, service_label, price) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET service_label = excluded.service_label, price = excluded.price`
  ).run(overrideId, customerId, serviceLabel.trim(), priceNum);
  const row = db.prepare("SELECT * FROM customer_pricing_overrides WHERE id = ?").get(overrideId);
  res.status(201).json(rowToOverride(row));
});

// DELETE /api/pricing-overrides/:id
pricingOverrideByIdRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM customer_pricing_overrides WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});
