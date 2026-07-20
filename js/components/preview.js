/* ==========================================================================
   preview.js — the right-hand "preview-col": the Invoice preview / Message
   text tabs, and every send/export action (Print, Download PDF, Email,
   WhatsApp, Share, Copy, Download .txt).
   ========================================================================== */
import { state, val, showToast } from '../state.js';
import { saveToHistory } from './history-modal.js';
import { closeMobileMenu } from './header.js';
import { generateInvoicePDF } from '../pdf-invoice.js';

/* ---------- tabs ---------- */
export function switchTab(name) {
  document.getElementById('tabPaper').classList.toggle('active', name === 'paper');
  document.getElementById('tabText').classList.toggle('active', name === 'text');
  document.getElementById('pane-paper').classList.toggle('active', name === 'paper');
  document.getElementById('pane-text').classList.toggle('active', name === 'text');
}

/* ---------- message text actions ---------- */
export function copyText() {
  const ta = document.getElementById('msgText');
  ta.select();
  navigator.clipboard.writeText(ta.value).then(() => {
    showToast('Copied to clipboard', 'Paste it into any messaging app or email.');
  }).catch(() => {
    document.execCommand('copy');
    showToast('Copied to clipboard', 'Paste it into any messaging app or email.');
  });
}

// Guards against a double-invocation opening two windows (e.g. a fast double-tap on mobile).
let waSending = false;
export function sendWhatsApp() {
  if (waSending) return;
  waSending = true;
  setTimeout(() => { waSending = false; }, 1200);

  const rawText = document.getElementById('msgText').value;
  if (!rawText.trim()) {
    showToast('Nothing to send', 'The message text is empty — add some details first.');
    return;
  }
  
  const text = encodeURIComponent(rawText);
  const numberInput = document.getElementById('waNumber').value;
  const number = numberInput.replace(/[^\d]/g, '');
  
  if (numberInput.trim() && !number) {
    showToast('Check the phone number', 'Enter digits only, with country code, no + or spaces.');
    return;
  }

  // Using api.whatsapp.com provides absolute routing stability across PWA standalones and webviews
  let whatsappUrl = `https://api.whatsapp.com/send?text=${text}`;
  if (number) {
    whatsappUrl += `&phone=${number}`;
  }

  // Force isolated tab generation across all form factors. This cleanly hands off 
  // execution to the native WhatsApp client wrapper without triggering a PWA window layout crash.
  // NOTE: window.open's 'noopener'/'noreferrer' features make it always return null
  // (even when the popup succeeds), so opener isolation is done manually below instead —
  // that keeps the true return value intact for accurate popup-blocked detection.
  const win = window.open(whatsappUrl, '_blank');
  if (win) {
    win.opener = null;
  } else {
    // Ultimate fallback context switch if popups are strictly blocked by native security policies
    window.location.href = whatsappUrl;
  }

  showToast('Opening WhatsApp', number ? `Sending to +${number}` : 'Choose a contact to send to.');
}

export function sendEmail() {
  const invNo = val('invNumber') || 'Invoice';
  const resident = val('fResident');
  const subject = encodeURIComponent(`Invoice ${invNo}` + (resident ? ` for ${resident}` : ''));
  const body = encodeURIComponent(document.getElementById('msgText').value);
  const to = val('fResidentEmail');
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  showToast('Opening your email app', 'Review and send the drafted invoice email.');
}

export function shareText() {
  const text = document.getElementById('msgText').value;
  const invNo = val('invNumber') || 'Invoice';
  if (navigator.share) {
    navigator.share({ title: 'Invoice ' + invNo, text: text }).catch(() => {});
  } else {
    copyText();
    showToast('Share not available', "Copied instead — your browser doesn't support the native share sheet.");
  }
}

export function downloadTXT() {
  const blob = new Blob([document.getElementById('msgText').value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (val('invNumber') || 'invoice') + '.txt';
  a.click();
  showToast('Downloaded', a.download + ' saved.');
}

/* ---------- print ---------- */
// Printing now goes straight through window.print(). Which content shows is decided
// entirely by the @media print rules in styles.css (they force the invoice preview
// visible regardless of which tab/mobile view is on screen) — so there is no DOM to
// mutate here, no .printing class to add/remove, and nothing to revert afterwards.
// The only real risk left is Chrome grabbing the page before a web font or an <img>
// (logo/QR) has actually finished loading, so that's the only thing we wait for.
function waitForPreviewAssets() {
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  const container = document.getElementById('pane-paper');
  const imgs = container ? Array.from(container.querySelectorAll('img')).filter((img) => img.src) : [];
  const imagesReady = imgs.length
    ? Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; })))))
    : Promise.resolve();
  // A stuck/broken image or a font that never resolves shouldn't be able to hang the
  // Print button forever — cap the wait, print with whatever's ready by then.
  const timeout = new Promise((res) => setTimeout(res, 1200));
  return Promise.race([Promise.all([fontsReady, imagesReady]), timeout]);
}

export async function printInvoice() {
  await waitForPreviewAssets();
  window.print();
}

/* ---------- download as PDF (unchanged — still the real pdf-lib file generator) ---------- */
export async function downloadPDF() {
  closeMobileMenu();
  saveToHistory();
  try {
    const pdfBytes = await generateInvoicePDF();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (val('invNumber') || 'invoice') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('PDF downloaded', a.download + ' saved — text stays selectable and it\u2019s ready to print.');
  } catch (e) {
    console.error('PDF generation failed:', e);
    showToast('Could not generate the PDF', 'Something went wrong — see the browser console for details, or try again.');
  }
}

/* ---------- wire up listeners that aren't inline onclick/onchange in the HTML ---------- */
export function initPreview() {
  document.getElementById('msgText').addEventListener('input', () => { state.textManuallyEdited = true; });
}

// Expose everything referenced by inline onclick attributes in index.html.
window.switchTab = switchTab;
window.copyText = copyText;
window.sendWhatsApp = sendWhatsApp;
window.sendEmail = sendEmail;
window.shareText = shareText;
window.downloadTXT = downloadTXT;
window.printInvoice = printInvoice;
window.downloadPDF = downloadPDF;
