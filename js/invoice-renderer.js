/* ==========================================================================
   invoice-renderer.js — the single place that turns form data into what the
   user sees: the invoice preview paper, the totals summary, the message
   text, the QR code, and the charge-line-items table (used by both the
   editable form and the printable preview).
   ========================================================================== */
import { state, val, fmt, escapeHtml, escapeAttr, formatDate, chargeCategories } from './state.js';
import { paymentSummary } from './components/sidebar-form.js';
import { saveDraft } from './components/history-modal.js';

/* ---------- charge line items (Charges panel) ---------- */
export function categoryOptions(selected) {
  const isCustom = !chargeCategories.includes(selected);
  return chargeCategories.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('') +
    `<option value="__custom__" ${isCustom ? 'selected' : ''}>Custom category…</option>`;
}

export function renderLineItems() {
  const body = document.getElementById('lineItemBody');
  body.innerHTML = state.lineItems.map((item, idx) => {
    const isCustom = !chargeCategories.includes(item.cat);
    return `
    <tr>
      <td>
        <select onchange="updateItem(${idx}, 'cat', this.value)">${categoryOptions(item.cat)}</select>
        ${isCustom ? `<input type="text" class="custom-cat" value="${escapeAttr(item.cat)}" placeholder="e.g. Balcony Repair" oninput="updateItem(${idx}, 'cat', this.value)">` : ''}
      </td>
      <td><input type="text" class="mono amount-input" value="${item.amt}" oninput="updateItem(${idx}, 'amt', this.value)"></td>
      <td class="li-remove" onclick="removeLineItem(${idx})" role="button" aria-label="Remove charge line" tabindex="0">✕</td>
    </tr>`;
  }).join('');
}

export function addLineItem() { state.lineItems.push({ cat: 'Other Charges', amt: 0 }); renderLineItems(); sync(); }
export function removeLineItem(idx) {
  if (state.lineItems.length === 1) { state.lineItems[idx] = { cat: 'Rent', amt: 0 }; }
  else { state.lineItems.splice(idx, 1); }
  renderLineItems(); sync();
}
export function updateItem(idx, field, value) {
  if (field === 'amt') { state.lineItems[idx].amt = parseFloat(value.replace(/[^\d.-]/g, '')) || 0; sync(); return; }
  const wasCustom = !chargeCategories.includes(state.lineItems[idx].cat);
  if (value === '__custom__') {
    state.lineItems[idx].cat = '';
    renderLineItems();
    sync();
    return;
  }
  state.lineItems[idx].cat = value;
  // Switching from a custom category back to a preset one via the dropdown —
  // re-render so the now-stale custom text box is removed instead of lingering on screen.
  if (wasCustom && chargeCategories.includes(value)) renderLineItems();
  sync();
}

export function setDiscountMode(mode) {
  state.discountMode = mode;
  document.querySelectorAll('#discountToggle span').forEach(s => s.classList.toggle('active', s.dataset.mode === mode));
  sync();
}

/* ---------- totals ---------- */
export function computeTotals() {
  const subtotal = state.lineItems.reduce((s, i) => s + i.amt, 0);
  const discountRaw = parseFloat(document.getElementById('invDiscount').value.replace(/[^\d.-]/g, '')) || 0;
  const discount = state.discountMode === 'pct' ? subtotal * (discountRaw / 100) : discountRaw;
  const taxPct = parseFloat(document.getElementById('invTax').value.replace(/[^\d.-]/g, '')) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * (taxPct / 100);
  const prevDue = parseFloat(document.getElementById('invPrevDue').value.replace(/[^\d.-]/g, '')) || 0;
  const preChargeTotal = taxable + tax + prevDue;
  const method = document.getElementById('paymentMethod').value;
  let chargePct = 0;
  if (method === 'wallet' || method === 'paypal') {
    const el = document.getElementById('payChargePct');
    chargePct = el ? (parseFloat(el.value.replace(/[^\d.-]/g, '')) || 0) : 0;
  }
  const paymentCharge = chargePct > 0 ? preChargeTotal * (chargePct / 100) : 0;
  const total = preChargeTotal + paymentCharge;
  const paid = parseFloat(document.getElementById('invPaid').value.replace(/[^\d.-]/g, '')) || 0;
  const outstanding = total - paid;
  return { subtotal, discount, tax, prevDue, chargePct, paymentCharge, total, paid, outstanding };
}

/* ---------- QR code (generated entirely in-browser) ---------- */
let qrLibWarned = false;
export function generateQRDataURL(text, targetSizePx) {
  if (typeof qrcode !== 'function') {
    if (!qrLibWarned) {
      qrLibWarned = true;
      console.error('QR code library not loaded: lib/qrcode.min.js is missing or failed to load. Download it from https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.0.3/qrcode.min.js and place it in the "lib" folder next to this HTML file.');
      window.showToast('QR code unavailable', 'lib/qrcode.min.js is missing — see console for the download link.');
    }
    return null;
  }
  let qr = null;
  for (let type = 1; type <= 40 && !qr; type++) {
    try {
      const attempt = qrcode(type, 'M');
      attempt.addData(text);
      attempt.make();
      qr = attempt;
    } catch (e) { /* data doesn't fit at this type — try the next size up */ }
  }
  if (!qr) return null;
  try {
    const count = qr.getModuleCount();
    const cell = Math.max(1, Math.floor(targetSizePx / count));
    const size = cell * count;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
    return canvas.toDataURL('image/png');
  } catch (e) { return null; }
}
export function updateQR(pay, show, total) {
  const qrImg = document.getElementById('paperQR');
  const qrFallback = document.getElementById('paperQRFallback');
  const method = document.getElementById('paymentMethod').value;
  if (!show) { qrImg.style.display = 'none'; qrFallback.style.display = 'none'; return; }
  if (method === 'wallet' && state.walletQRDataUrl) {
    qrImg.src = state.walletQRDataUrl;
    qrImg.style.display = 'block';
    qrFallback.style.display = 'none';
    return;
  }
  if (!pay) { qrImg.style.display = 'none'; qrFallback.style.display = 'none'; return; }
  const invNo = val('invNumber') || 'invoice';
  const data = `Payment for ${invNo}\n${pay.label}\n${pay.lines.join('\n')}\nAmount: ${fmt(total)}`;
  const dataUrl = generateQRDataURL(data, 140);
  if (dataUrl) {
    qrImg.src = dataUrl;
    qrImg.style.display = 'block';
    qrFallback.style.display = 'none';
  } else {
    qrImg.style.display = 'none';
    qrFallback.style.display = 'block';
  }
}

/* ---------- SYNC (form -> preview) ---------- */
export function sync() {
  document.getElementById('customCurrencyField').style.display = document.getElementById('invCurrency').value === 'custom' ? 'block' : 'none';

  const t = computeTotals();
  document.getElementById('sumSubtotal').textContent = fmt(t.subtotal);
  document.getElementById('sumDiscountRow').style.display = t.discount > 0 ? 'flex' : 'none';
  document.getElementById('sumDiscount').textContent = '−' + fmt(t.discount);
  document.getElementById('sumTax').textContent = fmt(t.tax);
  document.getElementById('sumPrevDue').textContent = fmt(t.prevDue);
  document.getElementById('sumPayChargeRow').style.display = t.paymentCharge > 0 ? 'flex' : 'none';
  document.getElementById('sumPayChargeLabel').textContent = `Payment charge (${t.chargePct}%)`;
  document.getElementById('sumPayCharge').textContent = fmt(t.paymentCharge);
  document.getElementById('sumTotal').textContent = fmt(t.total);
  document.getElementById('sumOutstanding').textContent = fmt(t.outstanding);

  document.getElementById('pPropertyName').textContent = val('fPropertyName') || 'Property / Building Name';
  const senderType = document.getElementById('fSenderType').value;
  const propMetaParts = [val('fPropertyAddress')];
  if (senderType) { propMetaParts.push(val('fMgmtCompany'), val('fMgmtEmail'), val('fMgmtPhone')); }
  document.getElementById('pPropertyMeta').textContent = propMetaParts.filter(Boolean).join(' · ') || 'Property address · management contact';
  const invNumVal = val('invNumber');
  const pInvNumberEl = document.getElementById('pInvNumber');
  pInvNumberEl.textContent = invNumVal;
  pInvNumberEl.style.display = invNumVal ? 'block' : 'none';
  document.getElementById('pDocType').textContent = (val('invTitle') || 'Invoice').toUpperCase();

  const status = document.getElementById('invStatus').value;
  const statusLabels = { draft: 'Draft', sent: 'Sent', due: 'Due', paid: 'Paid', overdue: 'Overdue' };
  const pStatus = document.getElementById('pStatus');
  pStatus.textContent = statusLabels[status];
  pStatus.className = 'status-pill ' + status;

  const residentVal = val('fResident');
  const unitVal = val('fUnit');
  document.getElementById('pResident').textContent = residentVal || '—';
  document.getElementById('pUnit').textContent = unitVal || '—';
  const relationVal = document.getElementById('fRelation').value;
  document.getElementById('pRelation').textContent = relationVal;
  document.getElementById('pRelationWrap').style.display = relationVal ? 'inline' : 'none';
  const showBillTo = !!(residentVal || unitVal);
  document.getElementById('pBillToGrp').style.display = showBillTo ? 'block' : 'none';
  document.getElementById('pPartiesRow').classList.toggle('single-item', !showBillTo);

  document.getElementById('pMonth').textContent = val('invMonth') || '—';
  document.getElementById('pDue').textContent = formatDate(val('invDue')) || '—';

  document.getElementById('pLineItems').innerHTML = state.lineItems.map(i =>
    `<tr><td>${escapeHtml(i.cat) || '<span style="color:#B7BFCC">Untitled charge</span>'}</td><td class="r">${fmt(i.amt)}</td></tr>`
  ).join('');

  document.getElementById('pSubtotal').textContent = fmt(t.subtotal);
  document.getElementById('pDiscountRow').style.display = t.discount > 0 ? 'flex' : 'none';
  document.getElementById('pDiscount').textContent = '−' + fmt(t.discount);
  document.getElementById('pTaxRow').style.display = t.tax > 0 ? 'flex' : 'none';
  document.getElementById('pTax').textContent = fmt(t.tax);
  document.getElementById('pPrevDueRow').style.display = t.prevDue > 0 ? 'flex' : 'none';
  document.getElementById('pPrevDue').textContent = fmt(t.prevDue);
  document.getElementById('pPayChargeRow').style.display = t.paymentCharge > 0 ? 'flex' : 'none';
  document.getElementById('pPayChargeLabel').textContent = `Payment charge (${t.chargePct}%)`;
  document.getElementById('pPayCharge').textContent = fmt(t.paymentCharge);
  document.getElementById('pTotal').textContent = fmt(t.total);

  document.getElementById('pNoteText').textContent = val('fNote');

  const pay = paymentSummary();
  const showQR = document.getElementById('showQR').checked;
  const payBox = document.getElementById('pPaymentBox');
  if (pay) {
    payBox.innerHTML = `<b>Pay via ${escapeHtml(pay.label)}</b><br>` + pay.lines.map(escapeHtml).join('<br>');
  } else {
    payBox.innerHTML = '';
  }

  if (state.logoDataUrl) {
    document.getElementById('paperLogo').src = state.logoDataUrl;
    document.getElementById('paperLogo').style.display = 'block';
    document.getElementById('paperLogoFallback').style.display = 'none';
  } else {
    document.getElementById('paperLogo').style.display = 'none';
    document.getElementById('paperLogoFallback').style.display = 'none';
  }

  updateQR(pay, showQR, t.total);
  if (!state.textManuallyEdited) buildMessageText();
  saveDraft();
}

/* ---------- message text (Message text preview pane) ---------- */
export function buildMessageText() {
  const t = computeTotals();
  const month = val('invMonth') || '—';
  const due = formatDate(val('invDue')) || '—';

  let lines = '';
  const greeting = val('msgGreeting');
  if (greeting) lines += `${greeting}\n\n`;
  lines += `Billing Period: ${month}\n`;
  lines += `Due Date: *${due}*\n\n`;
  lines += `*Charges:*\n`;
  state.lineItems.forEach(i => {
    const label = i.cat || 'Charge';
    lines += `• ${label} ${'.'.repeat(Math.max(2, 28 - label.length))} ${fmt(i.amt)}\n`;
  });
  lines += `\nCurrent Charges: ${fmt(t.subtotal)}\n`;
  if (t.discount > 0) lines += `Discount: −${fmt(t.discount)}\n`;
  if (t.tax > 0) lines += `Tax / VAT: ${fmt(t.tax)}\n`;
  if (t.prevDue > 0) lines += `Previous Due: ${fmt(t.prevDue)}\n`;
  if (t.paymentCharge > 0) lines += `Payment Charge (${t.chargePct}%): ${fmt(t.paymentCharge)}\n`;
  lines += `*Total Due: ${fmt(t.total)}*\n`;
  if (t.paid > 0) {
    lines += `Amount Paid: ${fmt(t.paid)}\n`;
    lines += `*Outstanding: ${fmt(t.outstanding)}*\n`;
  }
  const pay = paymentSummary();
  if (pay) {
    lines += `\n💳 *Pay via ${pay.label}*\n${pay.lines.join('\n')}\n`;
  }

  document.getElementById('msgText').value = lines;
}
export function regenerateText() {
  state.textManuallyEdited = false;
  buildMessageText();
  window.showToast('Text regenerated', 'Pulled fresh numbers from the form.');
}

// Expose everything referenced by inline onclick/onchange/oninput attributes in index.html
// (including markup generated dynamically by renderLineItems above).
window.addLineItem = addLineItem;
window.removeLineItem = removeLineItem;
window.updateItem = updateItem;
window.setDiscountMode = setDiscountMode;
window.sync = sync;
window.regenerateText = regenerateText;
