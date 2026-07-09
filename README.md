# Image URL Generator for Render

This is a complete ready-to-upload GitHub project.

It lets you upload an image and get a public URL like:

```txt
https://your-service-name.onrender.com/image/1
```

The image file is stored inside PostgreSQL as `BYTEA`, and the public URL is served from the Express app.

## Features

- Upload image from browser
- Password-protected upload
- Public image URL generation
- Recent image gallery
- Copy URL button
- Copy HTML `<img>` button
- Delete image button
- Download App / Add to Home Screen PWA button
- App manifest, mobile icons, and service worker
- PostgreSQL database storage
- Ready for Render Web Service

## Project structure

```txt
.
├── public
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── icons
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── render.yaml
└── README.md
```

## Local testing

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and add your PostgreSQL URL and upload key:

```env
DATABASE_URL=your_postgres_connection_url
UPLOAD_KEY=your_upload_password
NODE_ENV=development
PUBLIC_URL=http://localhost:3000
MAX_FILE_SIZE_MB=5
```

Run:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Deploy on Render manually

### 1. Upload this project to GitHub

```bash
git init
git add .
git commit -m "image url generator"
```

Create a new GitHub repository, then push the files.

### 2. Create PostgreSQL on Render

In Render dashboard:

```txt
New → Postgres
```

Create the database and copy its connection string.

### 3. Create Web Service on Render

In Render dashboard:

```txt
New → Web Service
```

Connect your GitHub repository.

Use:

```txt
Build Command: npm install
Start Command: npm start
```

### 4. Add Environment Variables

Add these in Render web service Environment Variables:

```env
DATABASE_URL=your_render_postgres_connection_string
UPLOAD_KEY=your_private_upload_password
NODE_ENV=production
PUBLIC_URL=https://your-service-name.onrender.com
MAX_FILE_SIZE_MB=5
```

Then deploy.

## Important notes

- Keep `UPLOAD_KEY` secret.
- Do not commit `.env` to GitHub.
- PostgreSQL storage is fine for small personal use.
- For many large images, use object storage such as Render Disk, Supabase Storage, S3, or Cloudinary.
- Render services may sleep or restart depending on your plan.

## API

### Upload image

```http
POST /api/upload
Header: x-upload-key: your_password
Body: multipart/form-data with field name image
```

### Get public image

```http
GET /image/:id
```

### List images

```http
GET /api/images
Header: x-upload-key: your_password
```

### Delete image

```http
DELETE /api/images/:id
Header: x-upload-key: your_password
```

## Add to Home Screen / Download App

This project includes PWA files:

```txt
public/manifest.webmanifest
public/service-worker.js
public/icons/icon-192.png
public/icons/icon-512.png
```

After deploying on Render, open your Render website on mobile. Tap **Download App**.

- Android Chrome/Edge: the browser can show an install prompt.
- iPhone/iPad Safari: tap Share, then **Add to Home Screen**.

PWA install works best on HTTPS. Render public URLs use HTTPS automatically.
