const { fillMod401 } = require('./fillMod401');
const { fillHojaVariedades } = require('./fillHojaVariedades');
const { listPendingRecords, uploadAttachment, updateRecordFields, getRecord } = require('./airtable');
const { formatDateEU, parseTracklist } = require('./pdfUtils');

// The "Program Title" field on Events links to this table, which holds the
// actual program name + song/author tracklist.
const TRACKLIST_TABLE_ID = process.env.AIRTABLE_TRACKLIST_TABLE_ID || 'tblwfPzZlyG4BPmwL';

/** Best-effort city extraction from a free-text venue address (last comma segment). */
function parseCityFromAddress(address) {
  if (!address) return '';
  const parts = String(address).split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  // Last segment is often "28001 Madrid" — strip a leading postal code if present.
  const last = parts[parts.length - 1];
  return last.replace(/^\d{4,5}\s*/, '').trim();
}

/**
 * Maps a raw Airtable "Events" record into the flat shape the PDF fillers
 * expect. "Program Title" is a link — pass in the already-resolved
 * program record's fields as `programFields` (or {} if none linked).
 */
function recordToEvent(record, programFields = {}) {
  const f = record.fields;
  return {
    recordId: record.id,
    date: formatDateEU(f['Date']),
    hour: f['Hour'] || '',
    programTitle: programFields['Program title'] || '',
    performers: f['Performers'] || '',
    venueName: f['Venue Name'] || '',
    venueAddress: f['Venue Address'] || '',
    venueCity: parseCityFromAddress(f['Venue Address']),
    aforo: f['Aforo'] || '',
    pricing: f['Pricing'] || '',
    tracklist: parseTracklist(programFields['Tracklist']),
    tarifa85: !!f['Tarifa 8,5%'],
  };
}

/**
 * Finds every record with Status = "Create document", fills both PDFs,
 * uploads them back as attachments, and advances Status to "Document created".
 * Returns a per-record result summary.
 */
async function pollAndGenerate(tableId) {
  const records = await listPendingRecords(tableId);
  const results = [];

  for (const record of records) {
    try {
      // Resolve the linked "Program Title" record, if any, for the program
      // name and song tracklist.
      const linkedIds = record.fields['Program Title'] || [];
      let programFields = {};
      if (linkedIds.length > 0) {
        const programRecord = await getRecord(TRACKLIST_TABLE_ID, linkedIds[0]);
        programFields = programRecord.fields;
      }

      const event = recordToEvent(record, programFields);
      console.log(`Processing record ${event.recordId} (${event.programTitle || 'untitled'})`);

      const [mod401Buffer, hojaBuffer] = await Promise.all([
        fillMod401(event),
        fillHojaVariedades(event),
      ]);

      const dateSlug = (event.date || '').replace(/\//g, '-');
      const programSlug = (event.programTitle || 'evento').replace(/[^a-zA-Z0-9]+/g, '_');

      await Promise.all([
        uploadAttachment(
          event.recordId,
          'Mod401 PDF',
          mod401Buffer,
          `Mod401_${dateSlug}_${programSlug}.pdf`
        ),
        uploadAttachment(
          event.recordId,
          'Hoja de Variedades',
          hojaBuffer,
          `HojaVariedades_${dateSlug}_${programSlug}.pdf`
        ),
      ]);

      await updateRecordFields(tableId, event.recordId, { Status: 'Document created' });

      results.push({ recordId: event.recordId, success: true });
    } catch (err) {
      console.error(`Failed processing record ${record.id}:`, err.response?.data || err.message);
      results.push({ recordId: record.id, success: false, error: err.message });
    }
  }

  return results;
}

module.exports = { pollAndGenerate, recordToEvent };
