require("dotenv").config();

const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const path = require("path");
const { Pool } = require("pg");

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const UPLOAD_KEY = process.env.UPLOAD_KEY;
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 5);
const PUBLIC_URL = process.env.PUBLIC_URL || "";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

if (!UPLOAD_KEY) {
  console.error("Missing UPLOAD_KEY environment variable.");
  console.error("Create one in Render Environment Variables, for example: UPLOAD_KEY = yourStrongPassword");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP, GIF, and SVG images are allowed."));
    }

    cb(null, true);
  }
});

function requireUploadKey(req, res, next) {
  const key = req.headers["x-upload-key"];

  if (!key || key !== UPLOAD_KEY) {
    return res.status(401).json({
      success: false,
      message: "Wrong upload password."
    });
  }

  next();
}

function getBaseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id BIGSERIAL PRIMARY KEY,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS images_created_at_idx
    ON images (created_at DESC);
  `);
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ success: false, status: "database_error" });
  }
});

app.post("/api/upload", requireUploadKey, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded."
      });
    }

    const result = await pool.query(
      `
      INSERT INTO images (original_name, mime_type, size_bytes, data)
      VALUES ($1, $2, $3, $4)
      RETURNING id, original_name, mime_type, size_bytes, created_at
      `,
      [req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
    );

    const image = result.rows[0];
    const url = `${getBaseUrl(req)}/image/${image.id}`;

    res.status(201).json({
      success: true,
      image: {
        id: image.id,
        name: image.original_name,
        type: image.mime_type,
        size: image.size_bytes,
        createdAt: image.created_at,
        url
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Upload failed. Check Render logs."
    });
  }
});

app.get("/api/images", requireUploadKey, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);

    const result = await pool.query(
      `
      SELECT id, original_name, mime_type, size_bytes, created_at
      FROM images
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    const baseUrl = getBaseUrl(req);

    res.json({
      success: true,
      images: result.rows.map((image) => ({
        id: image.id,
        name: image.original_name,
        type: image.mime_type,
        size: image.size_bytes,
        createdAt: image.created_at,
        url: `${baseUrl}/image/${image.id}`
      }))
    });
  } catch (error) {
    console.error("List images error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load images."
    });
  }
});

app.get("/image/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT original_name, mime_type, size_bytes, data FROM images WHERE id = $1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Image not found");
    }

    const image = result.rows[0];

    res.setHeader("Content-Type", image.mime_type);
    res.setHeader("Content-Length", image.size_bytes);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(image.original_name)}"`
    );

    res.send(image.data);
  } catch (error) {
    console.error("Fetch image error:", error);
    res.status(500).send("Failed to load image");
  }
});

app.delete("/api/images/:id", requireUploadKey, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM images WHERE id = $1 RETURNING id", [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Image not found." });
    }

    res.json({ success: true, message: "Image deleted." });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ success: false, message: "Delete failed." });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: `Image is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`
      });
    }
  }

  if (error.message && error.message.includes("Only")) {
    return res.status(400).json({ success: false, message: error.message });
  }

  console.error("Unhandled error:", error);
  res.status(500).json({ success: false, message: "Something went wrong." });
});

setupDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Image URL app running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database setup failed:", error);
    process.exit(1);
  });
