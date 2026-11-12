// Lets Playwright Practice Lab (the page that embeds the shop in an iframe) observe this
// window: dialogs, console messages, fetch requests and popups. Does nothing when the
// shop is opened on its own.
(function () {
  try {
    var lab = window.top !== window && window.top.__playwrightLab;
    if (lab) lab.instrument(window);
  } catch (e) {
    /* standalone or cross-origin: ignore */
  }
})();
