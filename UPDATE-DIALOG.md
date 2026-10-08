# Update information dialog and restored forest theme

The latest operational HUD redesign (7d3106a) was reverted independently; the earlier forest/lime palette and exact-row Push, Setup/Config exclusivity, and direct ComfyUI media contracts remain intact.

Configuration uses associated labels, responsive aligned fields, and restrained rounded forest borders. The update information panel is a nonmodal `role="dialog"`: it does not change body overflow, position, page layout, scroll position, or the application's shared editor-modal state. The transparent outer layer passes pointer/wheel input through; the panel alone receives input and scrolls its own content. Close, Escape, and outside click dismiss it and restore the opener's focus without scrolling. Repeated opens reset callbacks, not page state.

**Check for updates remains informational.** It does not fetch GitHub, install a release, or load new application assets. Its **Refresh table data** button reloads the current table/templates only. Reload the browser document after a separately authorized deployment to pick up HTML/script changes. Operator-managed `/version` metadata may not identify the served file; verify the served HTML hash instead.

Verification: `npm test` includes updater scroll-style/focus/repeated-open regression tests and all existing functional contracts. `npm run build` compiles the full inline browser script. Real desktop (1280x800) and mobile (390x844) browser verification checks background wheel scrolling while open, independent dialog scrolling, Escape/focus restoration, five open/close cycles, outside-click dismissal, post-close scrolling, and configuration width/labels. No production generation or approval is required.
