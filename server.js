require('dotenv').config();
const express = require('express');
const { pollAndGenerate } = require('./lib/poll');

const app = express();
const PORT = process.env.PORT || 3000;
const TABLE_ID = process.env.AIRTABLE_TABLE_ID;

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'sgae-document-demo',
    note: 'Public demo — fills SGAE forms from the connected Airtable base. See README for setup.',
  });
});

// Polling endpoint — hit this on a schedule (e.g. via cron-job.org every few
// minutes). Checks the connected Airtable base for any record with
// Status = "Create document", generates both PDFs, uploads them back as
// attachments, and advances Status to "Document created".
// Secret is passed as a query param since free external schedulers often
// can't set custom headers.
app.get('/poll', async (req, res) => {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  try {
    const results = await pollAndGenerate(TABLE_ID);
    res.json({ checked: true, processed: results.length, results });
  } catch (err) {
    console.error('Poll failed:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SGAE document demo service listening on port ${PORT}`);
});
