import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { db, randomUUID } from "../db.js";
import { uploadsDir } from "../uploads.js";

export const filesRouter = Router({ mergeParams: true }); // mounted at /api/businesses/:businessId/files
export const fileByIdRouter = Router(); // mounted at /api/files

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB, matches the prototype's client-side limit

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const id = randomUUID();
    req._uploadIds = req._uploadIds || [];
    req._uploadIds.push(id);
    // Stored filename is just the id — the original name is preserved separately in the DB
    // and reapplied on download, so no parsing/collision issues with names or hyphens.
    cb(null, id);
  },
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

function rowToFile(f) {
  return { id: f.id, name: f.filename, size: f.size, type: f.mime_type, uploadedAt: f.uploaded_at };
}

// POST /api/businesses/:businessId/files  (multipart/form-data, field name "files", multiple allowed)
filesRouter.post("/", (req, res) => {
  upload.array("files")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "One or more files exceed the 4MB limit." });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    const { businessId } = req.params;
    const files = req.files || [];
    const ids = req._uploadIds || [];
    const saved = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = ids[i] || file.filename;
      db.prepare(
        `INSERT INTO business_profile_files (id, business_id, filename, stored_path, size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, businessId, file.originalname, file.filename, file.size, file.mimetype || "");
      saved.push(
        rowToFile({
          id,
          filename: file.originalname,
          size: file.size,
          mime_type: file.mimetype || "",
          uploaded_at: new Date().toISOString(),
        })
      );
    }
    res.status(201).json(saved);
  });
});

// GET /api/files/:id/download
fileByIdRouter.get("/:id/download", (req, res) => {
  const row = db.prepare("SELECT * FROM business_profile_files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const fullPath = path.join(uploadsDir, row.stored_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "file missing on disk" });
  res.download(fullPath, row.filename);
});

// DELETE /api/files/:id
fileByIdRouter.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM business_profile_files WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("DELETE FROM business_profile_files WHERE id = ?").run(req.params.id);
  fs.rm(path.join(uploadsDir, row.stored_path), { force: true }, () => {});
  res.status(204).end();
});
