/* ==========================================================================
   app.js — the only script tag index.html loads directly. Pulls in every
   component (each one attaches its own functions to `window` so the existing
   onclick="..." attributes in the HTML keep working unchanged), then runs
   the original startup sequence: render the charges table and payment
   fields, restore any autosaved draft, sync the preview, and register the
   service worker for offline support + installability.
   ========================================================================== */
import './state.js';
import { renderLineItems } from './invoice-renderer.js';
import { initSidebarForm, renderPaymentFields } from './components/sidebar-form.js';
import { loadDraft } from './components/history-modal.js';
import { initHeader } from './components/header.js';
import './components/mobile-tabs.js';
import './components/bottom-action-bar.js';
import { initPreview } from './components/preview.js';
import { sync } from './invoice-renderer.js';

initHeader();
initSidebarForm();
initPreview();

/* ---------- startup sequence (unchanged from the original single-file version) ---------- */
renderLineItems();
renderPaymentFields();
loadDraft();
sync();

/* ---------- service worker registration + install prompt plumbing ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
      
      // Forces the browser to check GitHub for a newer version of sw.js
      reg.update().catch(() => {});
      
      // When a new version (like invoicer-v9) is detected downloading in the background:
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // Once downloaded, tell the new service worker to take over instantly
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage('skipWaiting');
          }
        });
      });
    }).catch(() => { /* offline support unavailable — app still works online */ });

    // The instant the new service worker takes control, reload the page ONCE 
    // to seamlessly display the new code/features to the user.
    let reloadedOnce = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    });
  });
}
