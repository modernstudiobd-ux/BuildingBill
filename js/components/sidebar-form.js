/* ==========================================================================
   sidebar-form.js — the left-hand "form-col" panels:
   Property & management, Tenant/unit owner, Invoice details, Charges (line
   items live in invoice-renderer.js since they also drive the preview),
   and Payment instructions.
   ========================================================================== */
import { state, val, showToast, senderTypeMeta } from '../state.js';
import { sync, renderLineItems } from '../invoice-renderer.js';

/* ---------- collapsible panels (mobile only) ---------- */
export function togglePanelCollapse(headEl) {
  if (window.innerWidth > 768) return;
  headEl.closest('.panel').classList.toggle('collapsed');
}

/* ---------- sender type (Property & management panel) ---------- */
export function updateSenderTypeLabels() {
  const type = document.getElementById('fSenderType').value;
  const meta = senderTypeMeta[type];
  document.getElementById('fMgmtCompanyLabel').textContent = meta.fieldLabel;
  document.getElementById('fMgmtCompany').placeholder = meta.placeholder;
  sync();
}

/* ---------- payment instructions panel ---------- */
export function renderPaymentFields() {
  const method = document.getElementById('paymentMethod').value;
  const el = document.getElementById('paymentFields');
  let html = '<div class="pay-fields">';
  if (method === 'bank') {
    html += `
      <div class="field-row">
        <div class="field"><label for="payAcctName">Account name</label><input type="text" id="payAcctName" placeholder="e.g. Willow Creek Property Management LLC" oninput="sync()"></div>
        <div class="field"><label for="payAcctNumber">Account number</label><input type="text" class="mono" id="payAcctNumber" placeholder="e.g. 000123456789" oninput="sync()"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="payBankName">Bank name</label><input type="text" id="payBankName" placeholder="e.g. First National Bank" oninput="sync()"></div>
        <div class="field"><label for="payRouting">Routing / SWIFT / IFSC</label><input type="text" class="mono" id="payRouting" placeholder="e.g. ABCDUS33" oninput="sync()"></div>
      </div>`;
  } else if (method === 'wallet') {
    html += `
      <div class="field-row">
        <div class="field"><label for="payProvider">Provider</label><input type="text" id="payProvider" placeholder="e.g. bKash, Venmo, M-Pesa" oninput="sync()"></div>
        <div class="field"><label for="payWalletId">Account / number</label><input type="text" class="mono" id="payWalletId" placeholder="e.g. 01XXXXXXXXX" oninput="sync()"></div>
      </div>
      <div class="field"><label for="payChargePct">Payment charge (%)</label><input type="text" class="mono" id="payChargePct" placeholder="e.g. 2 (optional — leave blank to hide)" oninput="sync()"></div>
      <div class="field">
        <label for="payWalletQRInput">Custom payment QR code (optional)</label>
        <input type="file" accept="image/*" id="payWalletQRInput" onchange="handleWalletQRUpload(event)">
        <div class="field-hint">Upload your own QR image to override the auto-generated one on the invoice.</div>
        <div id="payWalletQRPreviewWrap" style="margin-top:0.5rem;align-items:center;gap:0.5rem;${state.walletQRDataUrl ? 'display:flex;' : 'display:none;'}">
          <img id="payWalletQRPreview" src="${state.walletQRDataUrl || ''}" style="max-height:4rem;border-radius:0.375rem;border:1px solid var(--line);">
          <button type="button" class="new-invoice-btn" onclick="removeWalletQR()">Remove QR</button>
        </div>
      </div>`;
  } else if (method === 'paypal') {
    html += `<div class="field"><label for="payLink">PayPal email or payment link</label><input type="text" id="payLink" placeholder="e.g. pay@propertymanagement.com or https://paypal.me/example" oninput="sync()"></div>
      <div class="field"><label for="payChargePct">Payment charge (%)</label><input type="text" class="mono" id="payChargePct" placeholder="e.g. 3 (optional — leave blank to hide)" oninput="sync()"></div>`;
  } else if (method === 'cash') {
    html += `<div class="field"><label for="payCashNote">Collection instructions</label><textarea id="payCashNote" rows="2" placeholder="e.g. Pay in person at the property management office, Mon–Fri 9am–5pm (optional)" oninput="sync()"></textarea></div>`;
  } else {
    html += `<div class="field"><label for="payOther">Payment details</label><textarea id="payOther" rows="2" placeholder="Describe how the resident should pay" oninput="sync()"></textarea></div>`;
  }
  html += '</div>';
  el.innerHTML = html;
  sync();
}

/* Reused by invoice-renderer.js to build both the preview panel and the message text. */
export function paymentSummary() {
  const method = document.getElementById('paymentMethod').value;
  if (method === 'bank') {
    const name = val('payAcctName'), num = val('payAcctNumber'), bank = val('payBankName'), route = val('payRouting');
    if (!name && !num && !bank) return null;
    return { label: 'Bank transfer', lines: [name && `Account name: ${name}`, num && `Account number: ${num}`, bank && `Bank: ${bank}`, route && `Routing/SWIFT: ${route}`].filter(Boolean) };
  }
  if (method === 'wallet') {
    const provider = val('payProvider'), id = val('payWalletId');
    if (!id) return null; // a provider name alone isn't enough to generate a scannable QR
    return { label: provider || 'Mobile wallet', lines: [`Number: ${id}`] };
  }
  if (method === 'paypal') {
    const link = val('payLink');
    if (!link) return null;
    return { label: 'PayPal', lines: [link] };
  }
  if (method === 'cash') {
    const note = val('payCashNote');
    return { label: 'Cash', lines: note ? [note] : [] };
  }
  const other = val('payOther');
  if (!other) return null;
  return { label: 'Payment details', lines: [other] };
}

/* ---------- wallet QR upload ---------- */
export function handleWalletQRUpload(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.walletQRDataUrl = reader.result;
    updateWalletQRPreview();
    sync();
  };
  reader.readAsDataURL(file);
}
export function removeWalletQR() {
  state.walletQRDataUrl = null;
  updateWalletQRPreview();
  sync();
  showToast('Custom QR removed', 'The invoice will use an auto-generated QR code instead.');
}
export function updateWalletQRPreview() {
  const wrap = document.getElementById('payWalletQRPreviewWrap');
  const img = document.getElementById('payWalletQRPreview');
  if (!wrap || !img) return;
  if (state.walletQRDataUrl) { img.src = state.walletQRDataUrl; wrap.style.display = 'flex'; }
  else { wrap.style.display = 'none'; }
}

/* ---------- invoice detail validation ---------- */
export function validateDates() {
  const issue = document.getElementById('invIssue').value;
  const due = document.getElementById('invDue').value;
  const dueField = document.getElementById('invDue');
  if (issue && due && due < issue) {
    dueField.style.borderColor = 'var(--danger)';
    showToast('Check the due date', 'Due date is earlier than the issue date.');
  } else {
    dueField.style.borderColor = '';
  }
}

/* ---------- "New invoice" reset (button lives in the header, resets the form) ---------- */
export function confirmReset() {
  if (confirm('Start a new invoice? This clears all current fields (your property and logo info are kept).')) {
    state.lineItems = [{ cat: 'Rent', amt: 0 }];
    ['fUnit', 'fResident', 'fResidentEmail', 'fLeaseRef', 'invTitle', 'invNumber', 'invMonth', 'invIssue', 'invDue', 'fNote', 'waNumber'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('invPrevDue').value = 0;
    document.getElementById('invPaid').value = 0;
    document.getElementById('invDiscount').value = 0;
    document.getElementById('invTax').value = 0;
    document.getElementById('invStatus').value = 'draft';
    document.getElementById('fRelation').value = '';
    renderLineItems();
    state.textManuallyEdited = false;
    sync();
    showToast('New invoice ready', 'Previous invoice details were cleared.');
  }
}

/* ---------- wire up listeners that aren't inline onclick/onchange in the HTML ---------- */
export function initSidebarForm() {
  document.getElementById('invIssue').addEventListener('change', validateDates);
  document.getElementById('invDue').addEventListener('change', validateDates);
}

// Expose everything referenced by inline onclick/onchange/oninput attributes in index.html.
window.togglePanelCollapse = togglePanelCollapse;
window.updateSenderTypeLabels = updateSenderTypeLabels;
window.renderPaymentFields = renderPaymentFields;
window.handleWalletQRUpload = handleWalletQRUpload;
window.removeWalletQR = removeWalletQR;
window.confirmReset = confirmReset;
