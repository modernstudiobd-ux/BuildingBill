/* ==========================================================================
   state.js — single source of truth for data shared between components.
   Every component imports what it needs from here instead of using its own
   globals, so there is exactly one copy of the invoice data in memory.
   ========================================================================== */

export const chargeCategories = [
  'Rent','Maintenance Fee','Water Bill','Gas Bill','Electricity Bill','Common Area Electricity',
  'Lift / Elevator Maintenance','Generator / Backup Power','Parking Fee','HOA / Association Dues',
  'Security','Cleaning','Garbage Collection','Gardening / Landscaping','Internet / Common Services',
  'Repair Charges','Special Assessment','Insurance','Security Deposit','Late Fee','Other Charges'
];

export const senderTypeMeta = {
  '': { fieldLabel: 'Company / sender name', placeholder: 'e.g. Company name (optional — Billed by is hidden on the invoice)', roleSuffix: '' },
  management: { fieldLabel: 'Management company', placeholder: 'e.g. Willow Creek Property Management LLC', roleSuffix: '' },
  manager: { fieldLabel: 'Property manager name', placeholder: 'e.g. Alex Rivera, Property Manager', roleSuffix: 'Property Manager' },
  landlord: { fieldLabel: 'Landlord name', placeholder: 'e.g. Sam Whitfield', roleSuffix: 'Landlord' }
};

// Mutable app state. Kept as a single object (not separate `let` exports) so every
// module sees live updates — reassigning a property here is visible everywhere.
export const state = {
  lineItems: [{ cat: 'Rent', amt: 0 }],
  discountMode: 'pct',
  logoDataUrl: null,
  walletQRDataUrl: null,
  textManuallyEdited: false,
  deferredInstallPrompt: null
};

/* ---------- generic DOM / formatting helpers ---------- */
export function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

export function currencySymbol() {
  const sel = document.getElementById('invCurrency').value;
  return sel === 'custom' ? (document.getElementById('invCurrencyCustom').value.trim() || '$') : sel;
}

export function fmt(n) {
  const sym = currencySymbol();
  const num = Math.round((n + Number.EPSILON) * 100) / 100;
  return sym + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;');
}

/* ---------- toast (used by nearly every component) ---------- */
export function showToast(title, msg) {
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><div class="msg"><b>${title}</b><span>${msg}</span></div>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}
window.showToast = showToast;
