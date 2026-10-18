// Light/dark theme, chosen under Settings → Theme. "System" follows the OS
// (handled in styles.css); Light or Dark is saved and set as data-theme.
// Loaded in <head> so a saved choice applies before first paint instead of
// flashing the other theme.
(function () {
  "use strict";

  var THEME_KEY = "mdformatter.theme.v1";
  var root = document.documentElement;

  function savedTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    return t === "dark" || t === "light" ? t : null;
  }

  function applyTheme(theme) {
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }

  applyTheme(savedTheme());

  function initControls() {
    var current = savedTheme() || "system";
    Array.prototype.forEach.call(document.querySelectorAll('input[name="theme"]'), function (radio) {
      radio.checked = radio.value === current;
      radio.addEventListener("change", function () {
        if (!radio.checked) return;
        var theme = radio.value === "system" ? null : radio.value;
        applyTheme(theme);
        try {
          if (theme) localStorage.setItem(THEME_KEY, theme);
          else localStorage.removeItem(THEME_KEY);
        } catch (e) {}
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initControls);
  else initControls();
})();
