import { Router } from "express";
import { getUpdateStatus, triggerInstall } from "../updateStatus.js";

export const updateStatusRouter = Router();

updateStatusRouter.get("/", (req, res) => {
  res.json(getUpdateStatus());
});

updateStatusRouter.post("/install", (req, res) => {
  triggerInstall();
  res.status(204).end();
});
