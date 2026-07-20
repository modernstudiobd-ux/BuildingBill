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

/* ---------- print / PDF ---------- */
// Chrome has a well-known bug where calling window.print() in the very same tick as a
// DOM/class change can print a blank page — it hasn't finished repainting the new print
// layout yet. Waiting one real paint cycle (two nested requestAnimationFrame calls) before
// printing fixes that, and still fires close enough to the original tap/click for mobile
// Safari/Chrome to treat it as part of the same user action (so the print dialog still opens
// there too).
function waitForPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
async function preparePrintLayout() {
  // Self-heal: if a previous print attempt left the page stuck in "printing" mode (this can
  // happen with virtual PDF printers like Microsoft Print to PDF, which don't always fire the
  // browser's 'afterprint' event reliably), clear it before starting a new attempt instead of
  // stacking on top of broken state.
  document.body.classList.remove('printing');
  switchTab('paper');
  // Safety net: if the user is still on the mobile "Form" tab when Print/Download
  // is triggered, force the Preview tab so the invoice column is guaranteed to be
  // in the DOM and visible — the print stylesheet only hides the form column, it
  // doesn't show the preview column if mobile CSS has hidden it.
  if (window.innerWidth <= 768 && typeof window.switchMobileView === 'function') window.switchMobileView('preview');
  closeMobileMenu();
  document.body.classList.add('printing');
  saveToHistory();
  await waitForPaint();
}

function endPrintingState() {
  document.body.classList.remove('printing');
}

function canPrint() {
  // A handful of in-app webviews (e.g. opening the site from inside the
  // Facebook/Instagram/WhatsApp/TikTok app, or some older embedded browsers)
  // strip window.print entirely — there is no print/PDF UI to fall back to in
  // those cases, since it's a native browser feature, not something a website
  // can build itself. Detect that and tell the person to switch browsers
  // instead of silently doing nothing.
  if (typeof window.print !== 'function') {
    showToast('Printing not available here', 'Open this page in Chrome, Safari, Firefox or Edge (not an in-app browser) to print or save as PDF.');
    return false;
  }
  return true;
}

export async function printInvoice() {
  if (!canPrint()) return;
  await preparePrintLayout();
  window.print();
  showToast('Opening print dialog', 'Select your printer and print the invoice.');
  setTimeout(endPrintingState, 3000); // safety net in case 'afterprint' doesn't fire
}

export async function downloadPDF() {
  closeMobileMenu();
  saveToHistory();
  try {
    const pdfBytes = await generateInvoicePDF();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (val('invNumber') || 'invoice') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('PDF downloaded', a.download + ' saved — text stays selectable and it\u2019s ready to print.');
  } catch (e) {
    console.error('PDF generation failed, falling back to Print > Save as PDF:', e);
    if (!canPrint()) return;
    await preparePrintLayout();
    window.print();
    showToast('Opening print dialog instead', 'Choose "Save as PDF" as the destination. (The one-tap PDF download hit a snag — see console for details.)');
    setTimeout(endPrintingState, 3000);
  }
}

/* ---------- wire up listeners that aren't inline onclick/onchange in the HTML ---------- */
export function initPreview() {
  window.addEventListener('afterprint', endPrintingState);
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
