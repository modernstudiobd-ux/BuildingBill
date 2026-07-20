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
// Printing the live app page directly (window.print()) turned out to be fundamentally
// unreliable: Chrome and Firefox each apply their print pipeline to a dynamic single-page
// app differently, virtual printers like Microsoft Print to PDF interact with it
// differently again, and no combination of timing/CSS fixes made it consistent across all
// three at once. So Print and Download PDF now both go through the same PDF file
// generator. A finished PDF has no live layout to mistime and no page state that can get
// stuck between attempts — it's just a document, which every browser prints the same way.
function canPrint() {
  // A handful of in-app webviews (e.g. opening the site from inside the
  // Facebook/Instagram/WhatsApp/TikTok app, or some older embedded browsers)
  // block pop-ups/new tabs entirely. Detect that and tell the person to switch
  // browsers instead of silently doing nothing.
  if (typeof window.open !== 'function') {
    showToast('Printing not available here', 'Open this page in Chrome, Safari, Firefox or Edge (not an in-app browser) to print or save as PDF.');
    return false;
  }
  return true;
}

async function openInvoicePDF() {
  const pdfBytes = await generateInvoicePDF();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export async function printInvoice() {
  if (!canPrint()) return;
  // Open the tab synchronously, in the same tick as the tap/click, so mobile
  // browsers don't treat it as an unrequested pop-up. It's filled in below once
  // the PDF is ready (that part has to be async).
  const printWin = window.open('', '_blank');
  closeMobileMenu();
  saveToHistory();
  try {
    const url = await openInvoicePDF();
    if (printWin) {
      printWin.location.href = url;
      showToast('Invoice opened in a new tab', 'Use the Print icon in the PDF viewer that just opened. You can print it as many times as you like — it\u2019s a finished file, not a live page, so it can\u2019t get stuck or come out blank.');
    } else {
      // Pop-up blocked — fall back to a normal download so the person still gets the file.
      const a = document.createElement('a');
      a.href = url; a.download = (val('invNumber') || 'invoice') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      showToast('Pop-up blocked — downloaded instead', 'Open the PDF, then use its own Print button.');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error('PDF generation failed:', e);
    if (printWin) printWin.close();
    showToast('Could not open the invoice', 'Something went wrong generating the PDF — see the browser console for details, or try Download PDF instead.');
  }
}

export async function downloadPDF() {
  closeMobileMenu();
  saveToHistory();
  try {
    const url = await openInvoicePDF();
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
