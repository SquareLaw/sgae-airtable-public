const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { sanitizeForPdf } = require('./pdfUtils');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'Hoja_Variedades_blank.pdf');
const MAX_SONG_ROWS = 55;

// Fixed declarant details for this demo — see fillMod401.js for the matching
// organizer block. Swap these for your own in production.
const DECLARANT = {
  'Nombre del declarante': 'Demo Organizer S.L.',
  'Dirección': 'Calle Ejemplo 1',
  CP: '28001',
  Población_2: 'Madrid',
  Provincia_2: 'Madrid',
  'Correo electrónico': 'demo@example.com',
  'Teléfono': '600000000',
};

function setTextSafe(form, fieldName, value) {
  try {
    form.getTextField(fieldName).setText(sanitizeForPdf(value));
  } catch (err) {
    console.warn(`HojaVariedades: could not set field "${fieldName}": ${err.message}`);
  }
}

/**
 * @param {object} event - shape produced by lib/poll.js recordToEvent()
 * @returns {Promise<Buffer>} filled PDF bytes
 */
async function fillHojaVariedades(event) {
  const bytes = fs.readFileSync(TEMPLATE_PATH);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();

  setTextSafe(form, 'título del espectáculoconcierto o Gira', event.programTitle);
  setTextSafe(form, 'Intérprete', event.performers);
  setTextSafe(form, 'Local', event.venueName);
  setTextSafe(form, 'Domicilio', event.venueAddress);
  setTextSafe(form, 'Población', event.venueCity);
  setTextSafe(form, 'Provincia', event.venueCity);
  setTextSafe(form, 'desde fecha', event.date);
  setTextSafe(form, 'hasta fecha', event.date);

  for (const [field, value] of Object.entries(DECLARANT)) {
    setTextSafe(form, field, value);
  }

  // Per-song rows: "{n} 1" = title, "A"/"A_{n}" = author,
  // "I"/"I_{n}" = interpreter (only if different from header Intérprete),
  // "{n}" = times performed.
  const songs = event.tracklist.slice(0, MAX_SONG_ROWS);
  songs.forEach((song, idx) => {
    const n = idx + 1;
    setTextSafe(form, `${n} 1`, song.title);
    const authorField = n === 1 ? 'A' : `A_${n}`;
    setTextSafe(form, authorField, song.author);
    setTextSafe(form, `${n}`, '1'); // veces interpretado
  });

  return Buffer.from(await doc.save());
}

module.exports = { fillHojaVariedades };
