/* ==========================================================================
   bottom-action-bar.js — the fixed bar pinned to the bottom of the screen on
   phones (safe-area aware). There are two of them, and neither needs its own
   JS: they're existing buttons that CSS repositions to the bottom on small
   screens, so all the click handlers already live elsewhere.

   1. Form view -> "Preview invoice" CTA (.mobile-form-bar in index.html)
      Calls switchMobileView('preview'), defined in mobile-tabs.js.

   2. Preview view -> the existing .action-row buttons (Print / Download PDF /
      Send email, or WhatsApp / Share / Copy / Download / Regenerate)
      Defined in preview.js. On phones, `.preview-pane.active .action-row` in
      css/styles.css switches them from an inline row to a fixed bottom bar.

   This file exists so the six requested components each have a clear,
   findable home — even where "the component" is really a CSS rule rather
   than new behavior.
   ========================================================================== */
