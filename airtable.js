const axios = require('axios');

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const API_KEY = process.env.AIRTABLE_API_KEY;

const api = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE_ID}`,
  headers: { Authorization: `Bearer ${API_KEY}` },
});

// Attachment uploads use a separate content API host.
const uploadApi = axios.create({
  baseURL: `https://content.airtable.com/v0/${BASE_ID}`,
  headers: { Authorization: `Bearer ${API_KEY}` },
});

/**
 * Lists all records in a table whose Status field equals "Create document".
 */
async function listPendingRecords(tableId) {
  const records = [];
  let offset;
  do {
    const response = await api.get(`/${tableId}`, {
      params: {
        filterByFormula: `{Status} = "Create document"`,
        offset,
      },
    });
    records.push(...response.data.records);
    offset = response.data.offset;
  } while (offset);
  return records;
}

/**
 * Uploads a generated PDF straight to an attachment field on a record.
 * @param {string} recordId
 * @param {string} attachmentFieldIdOrName - e.g. "Mod401 PDF"
 * @param {Buffer} fileBuffer
 * @param {string} filename
 */
async function uploadAttachment(recordId, attachmentFieldIdOrName, fileBuffer, filename) {
  const response = await uploadApi.post(
    `/${recordId}/${encodeURIComponent(attachmentFieldIdOrName)}/uploadAttachment`,
    {
      contentType: 'application/pdf',
      filename,
      file: fileBuffer.toString('base64'),
    }
  );
  return response.data;
}

/**
 * Fetches a single record by ID (used to resolve the "Program Title" link
 * from Events into the actual program/tracklist record).
 */
async function getRecord(tableId, recordId) {
  const response = await api.get(`/${tableId}/${recordId}`);
  return response.data;
}

/**
 * Updates non-attachment fields on a record (e.g. advancing Status from
 * "Create document" to "Send document" once generation succeeds).
 */
async function updateRecordFields(tableId, recordId, fields) {
  const response = await api.patch(`/${tableId}/${recordId}`, { fields });
  return response.data;
}

module.exports = { listPendingRecords, uploadAttachment, updateRecordFields, getRecord };
