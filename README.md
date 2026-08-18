# SGAE Document Demo Service

Fills the **Mod_401 (Solicitud de Autorización)** and **Hoja de Variedades**
PDFs from Airtable event data, and writes the finished PDFs straight back to
the record as attachments — a public/demo deployment, separate from any
production instance, with its own repo, its own Render service, and its own
Airtable base.

This is the same design as the production SGAE automation, pointed at the
demo base:
**https://airtable.com/app2pECkoEFxrpQCc/shrVxuL5rITMm7s2S**

## How it works

Since Airtable's free plan doesn't include the automation actions needed to
call an external server (Send webhook / Run a script are paid-plan
features), this service uses **polling** instead of a push-based webhook:

```
Scheduled ping (e.g. cron-job.org, every few minutes)
   → GET /poll?secret=...  (this service)
      → checks the "Events" table for any record with Status = "Create document"
      → resolves the linked "Program Title" record for program name + tracklist
      → fills both PDFs with pdf-lib
      → uploads both back to Airtable as attachments
      → advances Status to "Document created"
```

No external file storage (S3, Cloudinary, etc.) is used — PDFs are generated
in memory and uploaded directly to Airtable via its base64 attachment-upload
endpoint.

## Base schema this expects

**Events** (`tblh5cIMuXdgagvzF`)
| Field | Type |
|---|---|
| Date | date |
| Hour | text |
| Program Title | link → tracklist table |
| Performers | text |
| Venue Name | text |
| Venue Address | text |
| Aforo | text |
| Pricing | multiline text (see formats below) |
| Tarifa 8,5% | checkbox |
| Status | single select: "Create document" / "Document created" |
| Mod401 PDF | attachment |
| Hoja de Variedades | attachment |

**tracklist** (`tblwfPzZlyG4BPmwL`)
| Field | Type |
|---|---|
| Program title | text |
| Tracklist | multiline text, one song per line: `Title — Author` |
| Dates- | link back to Events |

`Pricing` accepts either format, one tier per blank-line-separated block:
```
🔴 - 30 € (Best seats)

🟢 - 20 €
```
or
```
Categoría 1

25,00 €

Categoría 2

18,00 €
```

## 1. Push this project to GitHub

Create a **new, separate** repository (e.g. `sgae-document-demo`) and push
everything in this folder except `node_modules/` (already excluded via
`.gitignore`).

```bash
git init
git add .
git commit -m "Initial SGAE demo service"
git remote add origin <your new repo URL>
git push -u origin main
```

## 2. Deploy a new Render Web Service

1. [render.com](https://render.com) → **New** → **Web Service**
2. Connect the new GitHub repo (not your production one)
3. Settings:
   - **Runtime**: Node
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free is fine to start
4. Environment variables (see `.env.example`):
   - `AIRTABLE_API_KEY` — a personal access token ([airtable.com/create/tokens](https://airtable.com/create/tokens)) scoped to **this demo base** with read/write on data + attachments
   - `AIRTABLE_BASE_ID` = `app2pECkoEFxrpQCc`
   - `AIRTABLE_TABLE_ID` = `tblh5cIMuXdgagvzF`
   - `AIRTABLE_TRACKLIST_TABLE_ID` = `tblwfPzZlyG4BPmwL`
   - `WEBHOOK_SECRET` = any random string you make up
5. Click **Create Web Service**. Render builds and gives you a URL like
   `https://sgae-document-demo.onrender.com`

## 3. Verify it's live

Visit `https://<your-service>.onrender.com/` — you should see:
```json
{"status":"ok","service":"sgae-document-demo", ...}
```

## 4. Add a scheduled poll (cron-job.org)

1. [cron-job.org](https://cron-job.org) → create a free account → new cron job
2. URL: `https://<your-service>.onrender.com/poll?secret=<your WEBHOOK_SECRET>`
3. Interval: every 5–15 minutes is plenty

## 5. Test it

In Airtable, set an Event record's **Status** to `Create document`, then
either wait for the next scheduled ping or hit the poll URL manually in a
browser. Refresh the record — both PDFs should appear as attachments and
Status should flip to `Document created`.

## Known manual-completion items

- **Signature** — always manual, on both forms.
- **"Tarifa porcentual (8,5%)" checkbox** — the Mod_401 template only exposes
  one fillable tariff checkbox, bound to "Tarifa tanto alzado". When
  `Tarifa 8,5%` is checked in Airtable, that box is deliberately left
  unchecked by this service and the **porcentual** box needs to be marked by
  hand before submitting.
- **`PRECIO MEDIO` / `IMPORTE`** (tanto alzado fields) — not collected in
  this table; fill in by hand if using that tariff.
- **Solicitud N°**, **Titular local**'s real legal holder (defaults to venue
  name), and any venue-specific fields not in the base — check before
  submitting.

## Files

- `server.js` — Express app: health check + `/poll` route
- `lib/fillMod401.js` / `lib/fillHojaVariedades.js` — the two PDF fillers
- `lib/airtable.js` — Airtable REST client (list, get, upload, update)
- `lib/poll.js` — orchestrates polling → resolving the linked program → filling → uploading → status update
- `lib/pdfUtils.js` — text sanitizing, date formatting, tracklist/pricing parsing
- `templates/` — the two blank PDF templates
- `mod401_fields_reference.json` / `hoja_fields_reference.json` — field-ID references for the templates
