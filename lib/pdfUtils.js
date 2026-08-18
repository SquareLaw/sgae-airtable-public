/**
 * pdf-lib's default form field fonts only support the WinAnsi character set.
 * Airtable data can contain emoji (e.g. a "🔴" bullet in a Pricing field) or
 * other characters outside that set, which throws when calling setText().
 * This strips anything pdf-lib's standard fonts can't encode, and normalizes
 * a few common lookalikes (curly quotes, en/em dashes) instead of dropping
 * them.
 */
function sanitizeForPdf(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Normalize common Unicode punctuation to WinAnsi-safe equivalents.
  str = str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...');

  // Strip anything outside the printable Latin-1 / basic Latin range
  // (this removes emoji, box-drawing characters, etc. rather than crashing).
  str = str.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');

  return str.trim();
}

/** Formats a JS Date or an Airtable ISO date string as DD/MM/YYYY. */
function formatDateEU(dateInput) {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Splits a long comma/line-separated string across N fixed-width lines
 * (used for TITULOS / TITULOS 2 / TITULOS 3 / TITULOS 4 on the Mod_401).
 */
function wrapAcrossLines(text, numLines, maxCharsPerLine = 90) {
  const words = sanitizeForPdf(text).split(/\s+/).filter(Boolean);
  const lines = Array(numLines).fill('');
  let lineIdx = 0;
  for (const word of words) {
    if (lineIdx >= numLines) break;
    const candidate = lines[lineIdx] ? `${lines[lineIdx]} ${word}` : word;
    if (candidate.length > maxCharsPerLine && lines[lineIdx]) {
      lineIdx += 1;
      if (lineIdx >= numLines) break;
      lines[lineIdx] = word;
    } else {
      lines[lineIdx] = candidate;
    }
  }
  return lines;
}

/**
 * Parses the "Tracklist" field: one song per line, formatted
 * "Title — Author" (em dash) or "Title - Author".
 * Returns an array of { title, author }.
 */
function parseTracklist(tracklistText) {
  if (!tracklistText) return [];
  return String(tracklistText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+[—–-]\s+/);
      if (parts.length >= 2) {
        return { title: parts[0].trim(), author: parts.slice(1).join(' - ').trim() };
      }
      return { title: line, author: '' };
    });
}

/**
 * Parses the "Pricing" field into ticket tiers. Handles both formats seen
 * in practice, separated by blank lines:
 *   "🔴 - 30 € (Best seats)"                  (label and price on one line)
 *   "Categoría 1" / "25,00 €"                 (label and price on separate blocks)
 * Returns an array of { label, price }.
 */
function parsePricing(pricingText) {
  if (!pricingText) return [];
  const priceRe = /(\d+(?:[.,]\d+)?)\s*€/;
  const blocks = String(pricingText)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const tiers = [];
  let pendingLabel = '';
  for (const block of blocks) {
    const match = block.match(priceRe);
    if (!match) {
      pendingLabel = block; // label-only block, wait for its price
      continue;
    }
    const price = match[1].replace(',', '.');
    const remainder = sanitizeForPdf(block.replace(priceRe, '').replace(/[-–—()]/g, '').trim());
    const label = remainder || pendingLabel;
    tiers.push({ label: sanitizeForPdf(label), price });
    pendingLabel = '';
  }
  return tiers;
}

module.exports = { sanitizeForPdf, formatDateEU, wrapAcrossLines, parseTracklist, parsePricing };
