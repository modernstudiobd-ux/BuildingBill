/* ==========================================================================
   mobile-tabs.js — the "Form / Preview" pill switcher shown only on phones
   (.mobile-view-tabs in the header area). Desktop and tablet show both
   columns side by side and never touch this.
   ========================================================================== */
import { closeMobileMenu } from './header.js';

export function switchMobileView(name) {
  document.body.classList.toggle('mobile-tab-form', name === 'form');
  document.body.classList.toggle('mobile-tab-preview', name === 'preview');
  document.getElementById('mvTabForm').classList.toggle('active', name === 'form');
  document.getElementById('mvTabPreview').classList.toggle('active', name === 'preview');
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

window.switchMobileView = switchMobileView;
