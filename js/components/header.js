/* ==========================================================================
   header.js — the sticky top bar: logo upload, theme + accent-color toggles,
   the mobile hamburger drawer, undo/redo, and the Save / Duplicate /
   History / Install app / New invoice buttons.
   ========================================================================== */
import { state, showToast } from '../state.js';
import { sync } from '../invoice-renderer.js';
import { buildSnapshot, applySnapshot, saveToHistory, saveDraft } from './history-modal.js';

/* ---------- theme ---------- */
export function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  document.getElementById('themeDark').classList.toggle('active', mode === 'dark');
  document.getElementById('themeLight').classList.toggle('active', mode === 'light');
  localStorage.setItem('invgen_theme', mode);
}
function initTheme() {
  const saved = localStorage.getItem('invgen_theme');
  if (saved) setTheme(saved);
}

/* ---------- invoice color accent ---------- */
export function setAccent(name) {
  document.documentElement.setAttribute('data-accent', name);
  document.querySelectorAll('.accent-dot').forEach(d => d.classList.toggle('active', d.dataset.accent === name));
  try { localStorage.setItem('invgen_accent', name); } catch (e) {}
}
function initAccent() {
  const saved = localStorage.getItem('invgen_accent');
  if (saved) setAccent(saved);
}

/* ---------- logo upload (re-encoded to PNG via canvas for consistent print/cross-browser rendering) ---------- */
const logoPlaceholderHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><input type="file" accept="image/*" id="logoInput" onchange="handleLogoUpload(event)" aria-label="Upload logo">`;
export function handleLogoUpload(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 400;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      state.logoDataUrl = canvas.toDataURL('image/png');
      document.getElementById('logoUpload').innerHTML = `<img src="${state.logoDataUrl}" alt="Uploaded logo"><input type="file" accept="image/*" id="logoInput" onchange="handleLogoUpload(event)" aria-label="Upload logo">`;
      document.getElementById('logoRemoveBtn').classList.add('show');
      sync();
    };
    img.onerror = () => {
      showToast('Logo could not be read', 'Try a different image file (PNG or JPG works best).');
    };
    img.src = reader.result;
  };
  reader.onerror = () => showToast('Logo could not be read', 'Try a different image file.');
  reader.readAsDataURL(file);
}
export function removeLogo(evt) {
  if (evt) evt.stopPropagation();
  state.logoDataUrl = null;
  document.getElementById('logoUpload').innerHTML = logoPlaceholderHTML;
  document.getElementById('logoRemoveBtn').classList.remove('show');
  sync();
  showToast('Logo removed', 'The invoice will show your property name only.');
}

/* ---------- manual save / duplicate (Save + Duplicate buttons) ---------- */
export function manualSave() {
  saveToHistory();
  saveDraft();
  showToast('Invoice saved', 'Added to your invoice history.');
}

/* ---------- undo / redo ---------- */
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 50;
let undoTimer = null;
let isRestoringSnapshot = false;
let lastSnapshotJSON = null;

function updateUndoRedoButtons() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}
function pushUndoSnapshot() {
  if (isRestoringSnapshot) return;
  const snap = JSON.stringify(buildSnapshot());
  if (snap === lastSnapshotJSON) return;
  if (lastSnapshotJSON !== null) {
    undoStack.push(lastSnapshotJSON);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
  lastSnapshotJSON = snap;
  updateUndoRedoButtons();
}
function scheduleUndoSnapshot() {
  if (isRestoringSnapshot) return;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(pushUndoSnapshot, 500);
}
export function undoAction() {
  if (!undoStack.length) return;
  const current = lastSnapshotJSON || JSON.stringify(buildSnapshot());
  redoStack.push(current);
  const prev = undoStack.pop();
  isRestoringSnapshot = true;
  applySnapshot(JSON.parse(prev), { silent: true });
  lastSnapshotJSON = prev;
  isRestoringSnapshot = false;
  updateUndoRedoButtons();
  showToast('Undo', 'Reverted the last change.');
}
export function redoAction() {
  if (!redoStack.length) return;
  const current = lastSnapshotJSON || JSON.stringify(buildSnapshot());
  undoStack.push(current);
  const next = redoStack.pop();
  isRestoringSnapshot = true;
  applySnapshot(JSON.parse(next), { silent: true });
  lastSnapshotJSON = next;
  isRestoringSnapshot = false;
  updateUndoRedoButtons();
  showToast('Redo', 'Restored the change.');
}

/* ---------- hamburger drawer (mobile) ---------- */
export function toggleMobileMenu() {
  const panel = document.getElementById('topbarActions');
  const open = !panel.classList.contains('menu-open');
  if (open) openMobileMenu(); else closeMobileMenu();
}
export function openMobileMenu() {
  const panel = document.getElementById('topbarActions');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  const btn = document.getElementById('hamburgerBtn');
  panel.classList.add('menu-open');
  backdrop.classList.add('show');
  btn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('mobile-menu-open');
}
export function closeMobileMenu() {
  const panel = document.getElementById('topbarActions');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  const btn = document.getElementById('hamburgerBtn');
  panel.classList.remove('menu-open');
  backdrop.classList.remove('show');
  btn.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-menu-open');
}

/* ---------- install app (PWA install prompt) ---------- */
export function installApp() {
  const btn = document.getElementById('installAppBtn');
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  state.deferredInstallPrompt.userChoice.finally(() => {
    state.deferredInstallPrompt = null;
    if (btn) btn.style.display = 'none';
  });
}

/* ---------- wire up listeners that aren't inline onclick/onchange in the HTML ---------- */
export function initHeader() {
  initTheme();
  initAccent();

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redoAction(); }
  });
  // Capture snapshots on any form input/change, debounced so typing doesn't flood the stack.
  document.addEventListener('input', scheduleUndoSnapshot, true);
  document.addEventListener('change', scheduleUndoSnapshot, true);
  window.addEventListener('load', () => {
    setTimeout(() => {
      lastSnapshotJSON = JSON.stringify(buildSnapshot());
      updateUndoRedoButtons();
    }, 300);
  });

  // Auto-close the drawer after any action inside it is used, without touching those buttons' own onclick handlers.
  document.getElementById('topbarActions').addEventListener('click', function (e) {
    if (e.target.closest('button, .accent-dot, .theme-opt')) setTimeout(closeMobileMenu, 150);
  });
  document.getElementById('mobileMenuBackdrop').addEventListener('click', closeMobileMenu);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMobileMenu(); });
  window.addEventListener('resize', function () { if (window.innerWidth > 768) closeMobileMenu(); });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'flex';
  });
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'none';
    showToast('App installed', 'BuildingBill was added to your device.');
  });
}

// Expose everything referenced by inline onclick attributes in index.html.
window.setTheme = setTheme;
window.setAccent = setAccent;
window.handleLogoUpload = handleLogoUpload;
window.removeLogo = removeLogo;
window.manualSave = manualSave;
window.undoAction = undoAction;
window.redoAction = redoAction;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.installApp = installApp;
