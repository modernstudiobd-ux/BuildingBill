/* ==========================================================================
   history-modal.js — turning the whole form into a plain-object "snapshot",
   restoring a snapshot back into the form, autosaving a draft to
   localStorage, and the saved-invoice History modal (list/load/duplicate/delete).
   ========================================================================== */
import { state, val, escapeHtml, showToast } from '../state.js';
import { renderLineItems, sync } from '../invoice-renderer.js';
import { updateSenderTypeLabels, renderPaymentFields, updateWalletQRPreview } from './sidebar-form.js';

/* ---------- snapshot (shared by autosave draft + invoice history) ---------- */
export function buildSnapshot() {
  return {
    fPropertyName: val('fPropertyName'), fPropertyAddress: val('fPropertyAddress'), fMgmtCompany: val('fMgmtCompany'), fMgmtEmail: val('fMgmtEmail'), fMgmtPhone: val('fMgmtPhone'),
    fUnit: val('fUnit'), fResident: val('fResident'), fRelation: document.getElementById('fRelation').value, fResidentEmail: val('fResidentEmail'), fLeaseRef: val('fLeaseRef'),
    fSenderType: document.getElementById('fSenderType').value,
    invTitle: val('invTitle'), invNumber: val('invNumber'), invMonth: val('invMonth'), invIssue: val('invIssue'), invDue: val('invDue'), invCurrency: document.getElementById('invCurrency').value,
    invCurrencyCustom: val('invCurrencyCustom'), invStatus: document.getElementById('invStatus').value,
    invDiscount: val('invDiscount'), discountMode: state.discountMode, invTax: val('invTax'), invPrevDue: val('invPrevDue'), invPaid: val('invPaid'),
    fNote: val('fNote'), paymentMethod: document.getElementById('paymentMethod').value, showQR: document.getElementById('showQR').checked,
    payFields: (() => { const o = {}; document.querySelectorAll('#paymentFields input:not([type="file"]), #paymentFields textarea').forEach(el => { if (el.id) o[el.id] = el.value; }); return o; })(),
    lineItems: JSON.parse(JSON.stringify(state.lineItems)), logoDataUrl: state.logoDataUrl, walletQRDataUrl: state.walletQRDataUrl
  };
}

export function applySnapshot(d, opts) {
  opts = opts || {};
  Object.keys(d).forEach(k => {
    if (['lineItems', 'discountMode', 'logoDataUrl', 'walletQRDataUrl', 'fSenderType', 'payFields'].includes(k)) return;
    const el = document.getElementById(k);
    if (el && el.type !== 'checkbox') el.value = d[k] || '';
  });
  if (typeof d.showQR === 'boolean') document.getElementById('showQR').checked = d.showQR;
  if (typeof d.fSenderType === 'string') { document.getElementById('fSenderType').value = d.fSenderType; }
  updateSenderTypeLabels();
  state.lineItems = (d.lineItems && d.lineItems.length) ? JSON.parse(JSON.stringify(d.lineItems)) : [{ cat: 'Rent', amt: 0 }];
  if (d.discountMode) { state.discountMode = d.discountMode; document.querySelectorAll('#discountToggle span').forEach(s => s.classList.toggle('active', s.dataset.mode === d.discountMode)); }
  if (d.logoDataUrl) {
    state.logoDataUrl = d.logoDataUrl;
    document.getElementById('logoUpload').innerHTML = `<img src="${state.logoDataUrl}" alt="Uploaded logo"><input type="file" accept="image/*" id="logoInput" onchange="handleLogoUpload(event)" aria-label="Upload logo">`;
    document.getElementById('logoRemoveBtn').classList.add('show');
  } else {
    state.logoDataUrl = null;
    document.getElementById('logoUpload').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><input type="file" accept="image/*" id="logoInput" onchange="handleLogoUpload(event)" aria-label="Upload logo">`;
    document.getElementById('logoRemoveBtn').classList.remove('show');
  }
  state.walletQRDataUrl = d.walletQRDataUrl || null;
  if (d.paymentMethod) {
    document.getElementById('paymentMethod').value = d.paymentMethod;
    renderPaymentFields();
    if (d.payFields) {
      Object.keys(d.payFields).forEach(k => { const el = document.getElementById(k); if (el) el.value = d.payFields[k]; });
    }
    updateWalletQRPreview();
  } else {
    renderPaymentFields();
  }
  renderLineItems();
  state.textManuallyEdited = false;
  sync();
  if (!opts.silent) showToast(opts.toastTitle || 'Loaded', opts.toastMsg || '');
}

/* ---------- draft autosave (localStorage) ---------- */
let saveTimer = null;
export function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem('invgen_draft', JSON.stringify(buildSnapshot())); }
    catch (e) { /* storage unavailable — skip autosave silently */ }
  }, 400);
}
export function loadDraft() {
  let raw;
  try { raw = localStorage.getItem('invgen_draft'); } catch (e) { return; }
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    applySnapshot(d, { toastTitle: 'Draft restored', toastMsg: 'Picked up where you left off.' });
  } catch (e) { /* ignore corrupt draft */ }
}

/* ---------- invoice history (localStorage) ---------- */
const HISTORY_KEY = 'invgen_history';
const HISTORY_LIMIT = 200;
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}
function setHistoryList(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }
  catch (e) { /* storage full or unavailable — history won't persist this entry */ }
}
export function saveToHistory() {
  const snap = buildSnapshot();
  const list = getHistory();
  const invNum = (snap.invNumber || '').trim();
  const existingIdx = invNum ? list.findIndex(h => (h.snapshot.invNumber || '').trim() === invNum) : -1;
  if (existingIdx >= 0) list.splice(existingIdx, 1);
  list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), savedAt: Date.now(), snapshot: snap });
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
  setHistoryList(list);
}
function computeSnapshotTotal(s) {
  const subtotal = (s.lineItems || []).reduce((sum, i) => sum + (parseFloat(i.amt) || 0), 0);
  const discountRaw = parseFloat(String(s.invDiscount || '').replace(/[^\d.-]/g, '')) || 0;
  const discount = s.discountMode === 'pct' ? subtotal * (discountRaw / 100) : discountRaw;
  const taxPct = parseFloat(String(s.invTax || '').replace(/[^\d.-]/g, '')) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * (taxPct / 100);
  const prevDue = parseFloat(String(s.invPrevDue || '').replace(/[^\d.-]/g, '')) || 0;
  const preChargeTotal = taxable + tax + prevDue;
  let chargePct = 0;
  if ((s.paymentMethod === 'wallet' || s.paymentMethod === 'paypal') && s.payFields) {
    chargePct = parseFloat(String(s.payFields.payChargePct || '').replace(/[^\d.-]/g, '')) || 0;
  }
  const paymentCharge = chargePct > 0 ? preChargeTotal * (chargePct / 100) : 0;
  return preChargeTotal + paymentCharge;
}
function renderHistoryList() {
  const list = getHistory();
  const wrap = document.getElementById('historyList');
  if (!list.length) {
    wrap.innerHTML = '<div class="history-empty">No saved invoices yet. An invoice is saved here automatically each time you print or download it.</div>';
    return;
  }
  const statusLabels = { draft: 'Draft', sent: 'Sent', due: 'Due', paid: 'Paid', overdue: 'Overdue' };
  wrap.innerHTML = list.map(item => {
    const s = item.snapshot;
    const sym = s.invCurrency === 'custom' ? (s.invCurrencyCustom || '$') : (s.invCurrency || '$');
    const total = computeSnapshotTotal(s);
    const status = s.invStatus || 'draft';
    const savedDate = new Date(item.savedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    return `
      <div class="history-row">
        <div class="history-main">
          <div class="history-title">${escapeHtml(s.invNumber || 'Untitled invoice')} <span class="status-pill ${status}">${statusLabels[status]}</span></div>
          <div class="history-sub">${escapeHtml(s.fResident || 'No resident')}${s.fUnit ? ' · Unit ' + escapeHtml(s.fUnit) : ''}${s.invMonth ? ' · ' + escapeHtml(s.invMonth) : ''}</div>
          <div class="history-sub">Saved ${savedDate}</div>
        </div>
        <div class="history-amount mono">${escapeHtml(sym)}${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="history-actions">
          <button class="new-invoice-btn" onclick="loadFromHistory('${item.id}')">Load</button>
          <button class="new-invoice-btn" onclick="duplicateFromHistory('${item.id}')">Duplicate</button>
          <button class="new-invoice-btn danger" onclick="deleteFromHistory('${item.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}
export function openHistoryModal() { renderHistoryList(); document.getElementById('historyModal').classList.add('show'); }
export function closeHistoryModal() { document.getElementById('historyModal').classList.remove('show'); }
export function loadFromHistory(id) {
  const item = getHistory().find(h => h.id === id);
  if (!item) return;
  applySnapshot(item.snapshot, { toastTitle: 'Invoice loaded', toastMsg: 'Loaded from history.' });
  closeHistoryModal();
}
export function duplicateFromHistory(id) {
  const item = getHistory().find(h => h.id === id);
  if (!item) return;
  const snap = JSON.parse(JSON.stringify(item.snapshot));
  snap.invNumber = ''; snap.invStatus = 'draft'; snap.invIssue = ''; snap.invDue = ''; snap.invPaid = 0;
  applySnapshot(snap, { toastTitle: 'Invoice duplicated', toastMsg: 'Set a new invoice number and dates before sending.' });
  closeHistoryModal();
}
export function deleteFromHistory(id) {
  if (!confirm('Delete this invoice from history? This cannot be undone.')) return;
  setHistoryList(getHistory().filter(h => h.id !== id));
  renderHistoryList();
}
/* "Duplicate" button in the header — duplicates the invoice currently on screen (not a saved one). */
export function duplicateCurrentInvoice() {
  const snap = buildSnapshot();
  snap.invNumber = ''; snap.invStatus = 'draft'; snap.invIssue = ''; snap.invDue = ''; snap.invPaid = 0;
  applySnapshot(snap, { toastTitle: 'Invoice duplicated', toastMsg: 'Set a new invoice number and dates before sending.' });
}

// Expose everything referenced by inline onclick attributes in index.html
// (including markup generated dynamically by renderHistoryList above).
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.loadFromHistory = loadFromHistory;
window.duplicateFromHistory = duplicateFromHistory;
window.deleteFromHistory = deleteFromHistory;
window.duplicateCurrentInvoice = duplicateCurrentInvoice;
