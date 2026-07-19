/* ==========================================================================
   pdf-invoice.js — generates a real, selectable-text, print-ready PDF of the
   current invoice using pdf-lib (window.PDFLib, loaded via lib/pdf-lib.min.js)
   and, if available, fontkit (window.fontkit) for embedding a Unicode font so
   currency symbols like ৳ render as real glyphs instead of "Tk"/"Rs" text.

   DATA CONTRACT (kept deliberately narrow and stable): everything this file
   needs comes from `buildInvoiceData()` below, which reads the same `state`
   object and the same field IDs as invoice-renderer.js. If the form is ever
   restyled or reorganized, only buildInvoiceData() should need updating —
   the layout/pagination code below it never touches the DOM directly.

   FAILURE MODE: generateInvoicePDF() is wrapped in a try/catch by its caller
   (downloadPDF() in preview.js). If pdf-lib isn't loaded, a font fails to
   embed, or anything else throws, the caller falls back to the existing
   window.print() "Save as PDF" flow — this file never causes a hard failure
   of the Download PDF button.
   ========================================================================== */
import { state, val, formatDate } from './state.js';
import { computeTotals } from './invoice-renderer.js';
import { paymentSummary } from './components/sidebar-form.js';

/* ---------- page sizes (in PDF points — 72pt = 1in) ---------- */
export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

const PAGE_SIZE_KEY = 'invgen_pagesize';

export function getPageSize() {
  try {
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    if (saved && PAGE_SIZES[saved]) return saved;
  } catch (e) { /* localStorage unavailable — fall through to the locale default */ }
  // No saved preference yet — default by locale (US/Canada get Letter, everyone else A4).
  const locale = (navigator.language || 'en-US').toLowerCase();
  return (locale === 'en-us' || locale === 'en-ca') ? 'letter' : 'a4';
}

export function setPageSize(size) {
  if (!PAGE_SIZES[size]) return;
  try { localStorage.setItem(PAGE_SIZE_KEY, size); } catch (e) {}
}

function initPageSizeSelect() {
  const sel = document.getElementById('pdfPageSize');
  if (sel) sel.value = getPageSize();
}

/* ---------- gather everything the PDF needs from the live form ---------- */
function buildInvoiceData() {
  const t = computeTotals();
  return {
    propertyName: val('fPropertyName') || 'Property / Building Name',
    propertyAddress: val('fPropertyAddress'),
    mgmtCompany: val('fMgmtCompany'), mgmtEmail: val('fMgmtEmail'), mgmtPhone: val('fMgmtPhone'),
    senderType: document.getElementById('fSenderType').value,
    docType: (val('invTitle') || 'Invoice').toUpperCase(),
    invNumber: val('invNumber'),
    status: document.getElementById('invStatus').value,
    resident: val('fResident'), unit: val('fUnit'), relation: document.getElementById('fRelation').value,
    month: val('invMonth') || '—', due: formatDate(val('invDue')) || '—',
    items: state.lineItems.map(i => ({ cat: i.cat || 'Untitled charge', amt: i.amt })),
    totals: t,
    note: val('fNote'),
    pay: paymentSummary(),
    logoDataUrl: state.logoDataUrl,
  };
}

/* ---------- layout constants ---------- */
const MARGIN = 44;
const ROW_H = 20;
const LINE_H = 13;

/* Currency symbols outside the embedded font's coverage fall back to plain text
   so the PDF still generates correctly even without the optional Unicode font. */
const ASCII_FALLBACK = { '৳': 'Tk ', '₹': 'Rs ' };

function money(sym, n, unicodeOK) {
  const num = Math.round((n + Number.EPSILON) * 100) / 100;
  const amount = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usableSym = unicodeOK ? sym : (ASCII_FALLBACK[sym] || sym);
  return usableSym + amount;
}

/* ---------- the PDF-drawing state machine (adds pages as content overflows) ---------- */
function newPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage([ctx.pageW, ctx.pageH]);
  ctx.pageIndex += 1;
  ctx.pages.push(ctx.page);
  ctx.y = ctx.pageH - MARGIN;
  if (ctx.pageIndex > 1) {
    drawContinuationHeader(ctx);
    drawTableHeader(ctx);
  }
}

function ensureSpace(ctx, needed) {
  if (ctx.y - needed < MARGIN + 30 /* room reserved for the page-number footer */) {
    newPage(ctx);
  }
}

function text(ctx, str, x, y, opts = {}) {
  const { font = ctx.font, size = 9.5, color = [0.106, 0.141, 0.188], maxWidth } = opts;
  let s = str == null ? '' : String(str);
  if (maxWidth) {
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxWidth) s = s.slice(0, -1);
    if (s !== String(str)) s = s.slice(0, -1) + '…';
  }
  ctx.page.drawText(s, { x, y, size, font, color: ctx.rgb(color[0], color[1], color[2]) });
  return s;
}

function drawHeader(ctx, data) {
  let y = ctx.y;
  const left = MARGIN;
  text(ctx, data.docType, left, y, { font: ctx.boldFont, size: 20, color: ctx.primaryColor });
  if (data.invNumber) text(ctx, data.invNumber, left, y - 16, { font: ctx.font, size: 10, color: [0.36, 0.42, 0.51] });

  text(ctx, data.propertyName, left, y - 40, { font: ctx.boldFont, size: 12.5 });
  const metaParts = [data.propertyAddress];
  if (data.senderType) metaParts.push(data.mgmtCompany, data.mgmtEmail, data.mgmtPhone);
  const meta = metaParts.filter(Boolean).join('  ·  ');
  if (meta) text(ctx, meta, left, y - 55, { size: 8.5, color: [0.36, 0.42, 0.51], maxWidth: ctx.pageW - MARGIN * 2 });

  // right-aligned billing period / due date block
  const rightX = ctx.pageW - MARGIN;
  const rLabel = (s, yy) => text(ctx, s, rightX - ctx.font.widthOfTextAtSize(s, 8.5), yy, { size: 8.5, color: [0.36, 0.42, 0.51] });
  rLabel('Billing period', y);
  rLabel(data.month, y - 12);
  rLabel('Due date', y - 30);
  rLabel(data.due, y - 42);

  ctx.y = y - 75;
}

function drawContinuationHeader(ctx) {
  text(ctx, `${ctx.data.docType}${ctx.data.invNumber ? ' — ' + ctx.data.invNumber : ''} (continued)`,
    MARGIN, ctx.y, { font: ctx.boldFont, size: 11, color: ctx.primaryColor });
  ctx.y -= 24;
}

function drawParties(ctx, data) {
  if (!data.resident && !data.unit) return;
  let y = ctx.y;
  text(ctx, 'Billed to', MARGIN, y, { font: ctx.boldFont, size: 9 });
  const billLine = [data.resident, data.unit ? `Unit ${data.unit}` : '', data.relation].filter(Boolean).join('  ·  ');
  text(ctx, billLine, MARGIN, y - 13, { size: 9.5 });
  ctx.y = y - 32;
}

function drawTableHeader(ctx) {
  const y = ctx.y;
  const rightX = ctx.pageW - MARGIN;
  text(ctx, 'Description', MARGIN, y, { font: ctx.boldFont, size: 8.5, color: [0.36, 0.42, 0.51] });
  const amtLabel = 'Amount';
  text(ctx, amtLabel, rightX - ctx.font.widthOfTextAtSize(amtLabel, 8.5), y, { font: ctx.boldFont, size: 8.5, color: [0.36, 0.42, 0.51] });
  ctx.page.drawLine({
    start: { x: MARGIN, y: y - 6 }, end: { x: rightX, y: y - 6 },
    thickness: 0.75, color: ctx.rgb(0.85, 0.87, 0.9),
  });
  ctx.y = y - 20;
}

function drawItemRow(ctx, item, sym, unicodeOK) {
  const y = ctx.y;
  const rightX = ctx.pageW - MARGIN;
  text(ctx, item.cat, MARGIN, y, { size: 9.5, maxWidth: ctx.pageW - MARGIN * 2 - 100 });
  const amt = money(sym, item.amt, unicodeOK);
  text(ctx, amt, rightX - ctx.font.widthOfTextAtSize(amt, 9.5), y, { size: 9.5 });
  ctx.y = y - ROW_H;
}

function drawTotals(ctx, t, sym, unicodeOK) {
  const rightX = ctx.pageW - MARGIN;
  const row = (label, value, opts = {}) => {
    ensureSpace(ctx, opts.grand ? 26 : LINE_H + 5);
    const y = ctx.y;
    const size = opts.grand ? 11.5 : 9.5;
    const font = opts.grand ? ctx.boldFont : ctx.font;
    const color = opts.grand ? ctx.primaryColor : [0.106, 0.141, 0.188];
    if (opts.grand) {
      ctx.page.drawLine({ start: { x: rightX - 200, y: y + 12 }, end: { x: rightX, y: y + 12 }, thickness: 1, color: ctx.primaryRGB });
    }
    text(ctx, label, rightX - 200, y, { font, size, color: opts.grand ? [0.106, 0.141, 0.188] : [0.36, 0.42, 0.51] });
    text(ctx, value, rightX - font.widthOfTextAtSize(value, size), y, { font, size, color });
    ctx.y = y - (opts.grand ? 20 : LINE_H + 5);
  };
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 8 }, end: { x: ctx.pageW - MARGIN, y: ctx.y + 8 }, thickness: 0.75, color: ctx.rgb(0.85, 0.87, 0.9) });
  ctx.y -= 10;
  row('Current charges', money(sym, t.subtotal, unicodeOK));
  if (t.discount > 0) row('Discount', '−' + money(sym, t.discount, unicodeOK));
  if (t.tax > 0) row('Tax / VAT', money(sym, t.tax, unicodeOK));
  if (t.prevDue > 0) row('Previous balance', money(sym, t.prevDue, unicodeOK));
  if (t.paymentCharge > 0) row(`Payment charge (${t.chargePct}%)`, money(sym, t.paymentCharge, unicodeOK));
  row('Total due', money(sym, t.total, unicodeOK), { grand: true });
  if (t.paid > 0) {
    row('Amount paid', money(sym, t.paid, unicodeOK));
    row('Balance after payment', money(sym, t.outstanding, unicodeOK));
  }
}

function drawFooter(ctx, data) {
  if (data.note) {
    ensureSpace(ctx, LINE_H * 3);
    ctx.y -= 10;
    const words = data.note.split(/\s+/);
    let line = '';
    const maxW = (ctx.pageW - MARGIN * 2) * 0.6;
    words.forEach((w) => {
      const trial = line ? line + ' ' + w : w;
      if (ctx.font.widthOfTextAtSize(trial, 8.5) > maxW) {
        ensureSpace(ctx, LINE_H);
        text(ctx, line, MARGIN, ctx.y, { size: 8.5, color: [0.36, 0.42, 0.51] });
        ctx.y -= LINE_H;
        line = w;
      } else line = trial;
    });
    if (line) { ensureSpace(ctx, LINE_H); text(ctx, line, MARGIN, ctx.y, { size: 8.5, color: [0.36, 0.42, 0.51] }); ctx.y -= LINE_H; }
  }
  if (data.pay) {
    ensureSpace(ctx, LINE_H * (2 + data.pay.lines.length));
    ctx.y -= 8;
    text(ctx, `Pay via ${data.pay.label}`, MARGIN, ctx.y, { font: ctx.boldFont, size: 8.5 });
    ctx.y -= LINE_H;
    data.pay.lines.forEach((l) => {
      ensureSpace(ctx, LINE_H);
      text(ctx, l, MARGIN, ctx.y, { size: 8.5, color: [0.36, 0.42, 0.51] });
      ctx.y -= LINE_H;
    });
  }
}

function drawPageNumbers(ctx) {
  if (ctx.pages.length < 2) return; // don't clutter a single-page invoice with "Page 1 of 1"
  ctx.pages.forEach((page, i) => {
    const label = `Page ${i + 1} of ${ctx.pages.length}`;
    const w = ctx.font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: ctx.pageW - MARGIN - w, y: MARGIN - 22, size: 8, font: ctx.font,
      color: ctx.rgb(0.58, 0.64, 0.72),
    });
  });
}

/* ---------- optional Unicode font embedding (silently skipped if unavailable) ---------- */
async function embedFonts(ctx) {
  const { StandardFonts } = window.PDFLib;
  try {
    if (!window.fontkit) throw new Error('fontkit not loaded');
    ctx.pdfDoc.registerFontkit(window.fontkit);
    const [regular, bold] = await Promise.all([
      fetch('lib/fonts/NotoSans-Regular.ttf').then((r) => { if (!r.ok) throw new Error('font missing'); return r.arrayBuffer(); }),
      fetch('lib/fonts/NotoSans-Bold.ttf').then((r) => { if (!r.ok) throw new Error('font missing'); return r.arrayBuffer(); }),
    ]);
    ctx.font = await ctx.pdfDoc.embedFont(regular, { subset: true });
    ctx.boldFont = await ctx.pdfDoc.embedFont(bold, { subset: true });
    ctx.unicodeOK = true;
  } catch (e) {
    // No optional font files present (or fontkit missing) — fall back to the
    // built-in Helvetica. Every currency symbol it can't show gets a plain-text
    // substitute (see ASCII_FALLBACK) so the PDF is still fully correct.
    ctx.font = await ctx.pdfDoc.embedFont(StandardFonts.Helvetica);
    ctx.boldFont = await ctx.pdfDoc.embedFont(StandardFonts.HelveticaBold);
    ctx.unicodeOK = false;
  }
}

function currentPrimaryColor() {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  const m = /^#([0-9a-f]{6})$/i.exec(css);
  if (!m) return [0.118, 0.31, 0.639]; // BuildingBill default blue
  const hex = m[1];
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
}

/* ---------- entry point ---------- */
export async function generateInvoicePDF() {
  if (!window.PDFLib) throw new Error('pdf-lib is not loaded (lib/pdf-lib.min.js missing or blocked)');
  const { PDFDocument, rgb } = window.PDFLib;
  const data = buildInvoiceData();
  const sizeKey = getPageSize();
  const [pageW, pageH] = PAGE_SIZES[sizeKey];

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${data.docType} ${data.invNumber || ''}`.trim());
  pdfDoc.setProducer('BuildingBill');

  const primary = currentPrimaryColor();
  const ctx = {
    pdfDoc, rgb, pageW, pageH, data,
    pageIndex: 0, pages: [],
    primaryColor: primary, primaryRGB: rgb(primary[0], primary[1], primary[2]),
  };
  await embedFonts(ctx);

  const sym = document.getElementById('invCurrency').value === 'custom'
    ? (document.getElementById('invCurrencyCustom').value.trim() || '$')
    : document.getElementById('invCurrency').value;

  newPage(ctx);
  drawHeader(ctx, data);
  drawParties(ctx, data);
  drawTableHeader(ctx);
  data.items.forEach((item) => {
    ensureSpace(ctx, ROW_H);
    drawItemRow(ctx, item, sym, ctx.unicodeOK);
  });
  ensureSpace(ctx, 90); // keep the totals block from being orphaned alone at the bottom of a page
  drawTotals(ctx, data.totals, sym, ctx.unicodeOK);
  drawFooter(ctx, data);
  drawPageNumbers(ctx);

  return pdfDoc.save();
}

export function initPdfInvoice() {
  initPageSizeSelect();
}

window.setPageSize = setPageSize;
