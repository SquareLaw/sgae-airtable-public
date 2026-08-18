const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { sanitizeForPdf, wrapAcrossLines, parsePricing } = require('./pdfUtils');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'Mod_401_blank.pdf');

// Fixed organizer/declarant details for this demo. In the real production
// service these come from references/organizer.md — swap in your own here.
const ORGANIZER = {
  ORGANIZADOR: 'Demo Organizer S.L.',
  DOMICILIO: 'Calle Ejemplo 1, 28001 Madrid',
  'CP OK': '28001',
  DNI: 'X0000000X',
  TEL: '600000000',
  PERSONA: 'Demo Contact',
  EMAIL: 'demo@example.com',
};

function setTextSafe(form, fieldName, value) {
  try {
    form.getTextField(fieldName).setText(sanitizeForPdf(value));
  } catch (err) {
    // Field doesn't exist on this template revision — skip rather than crash.
    console.warn(`Mod401: could not set field "${fieldName}": ${err.message}`);
  }
}

/**
 * @param {object} event - shape produced by lib/poll.js recordToEvent()
 * @returns {Promise<Buffer>} filled PDF bytes
 */
async function fillMod401(event) {
  const bytes = fs.readFileSync(TEMPLATE_PATH);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();

  // Organizer/declarant (constant for this demo)
  for (const [field, value] of Object.entries(ORGANIZER)) {
    setTextSafe(form, field, value);
  }

  // Event details
  setTextSafe(form, 'NOMBRE DEL CONCIERTO', event.programTitle);
  setTextSafe(form, 'ACTUANTES', event.performers);
  setTextSafe(form, 'LUGAR CELEBRACION', event.venueName);
  setTextSafe(form, 'FECHA', event.date);
  setTextSafe(form, 'HORA', event.hour ? `${event.hour} h` : '');
  setTextSafe(form, 'DOMICILIO LOCAL', event.venueAddress);
  setTextSafe(form, 'AFORO TOTAL', event.aforo);
  setTextSafe(form, 'TITULAR LOCAL', event.venueName);

  // Song titles, wrapped across the 4 TITULOS lines
  const titleList = event.tracklist.map((s) => s.author ? `${s.title} (${s.author})` : s.title).join(', ');
  const [t1, t2, t3, t4] = wrapAcrossLines(titleList, 4);
  setTextSafe(form, 'TITULOS', t1);
  setTextSafe(form, 'TITULOS 2', t2);
  setTextSafe(form, 'TITULOS 3', t3);
  setTextSafe(form, 'TITULOS 4', t4);

  // Ticket tiers (up to 6 rows on this template)
  const tiers = parsePricing(event.pricing).slice(0, 6);
  const suffixes = ['', '2', '3', '4', '5', '6'];
  tiers.forEach((tier, i) => {
    const suf = suffixes[i];
    setTextSafe(form, `CLASE${suf}`, tier.label);
    setTextSafe(form, `PRECIO${suf}`, tier.price);
  });
  setTextSafe(form, 'TOTAL LOCALIDADES', event.aforo);

  // Tariff type: this template only exposes ONE fillable checkbox, bound to
  // the "Tarifa tanto alzado" box — there is no separate fillable box for
  // "Tarifa porcentual (8,5%)". So: checked = tanto alzado; when the event
  // wants the 8.5% option, we leave this unchecked and it must be marked
  // by hand (flagged in the poll results / README).
  try {
    const tarifaBox = form.getCheckBox('TIPO_TARIFA');
    if (event.tarifa85) tarifaBox.uncheck();
    else tarifaBox.check();
  } catch (err) {
    console.warn(`Mod401: could not set TIPO_TARIFA: ${err.message}`);
  }

  return Buffer.from(await doc.save());
}

module.exports = { fillMod401 };
