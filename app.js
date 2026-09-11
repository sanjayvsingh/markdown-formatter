(function () {
  "use strict";

  // Force rel="noopener noreferrer" on any link that carries target, so pasted
  // raw HTML with target="_blank" can't use window.opener for reverse tabnabbing.
  DOMPurify.addHook("afterSanitizeAttributes", function (node) {
    if (node.tagName === "A" && node.hasAttribute("target")) {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  var FONT_GROUPS = {
    serif: ["Georgia", "Cambria", "Palatino Linotype", "Book Antiqua", "Times New Roman", "Garamond"],
    sans: ["Arial", "Helvetica", "Segoe UI", "Calibri", "Verdana", "Tahoma", "Trebuchet MS"],
    mono: ["Consolas", "Menlo", "Monaco", "Courier New", "Lucida Console", "Cascadia Code"]
  };

  var DEFAULTS = {
    headingFont: "Georgia", headingSize: 28,
    bodyFont: "Arial", bodySize: 16,
    monoFont: "Consolas", monoSize: 14,
    headingFg: "#111111", headingFgAuto: true,
    headingBg: "#ffffff", headingBgAuto: true,
    bodyFg: "#111111", bodyFgAuto: true,
    bodyBg: "#ffffff", bodyBgAuto: true,
    monoFg: "#111111", monoFgAuto: true,
    monoBg: "#f5f5f5", monoBgAuto: true
  };
  var COLOR_FIELDS = ["headingFg", "headingBg", "bodyFg", "bodyBg", "monoFg", "monoBg"];

  var STORAGE_KEY = "mdformatter.settings.v1";

  function populateSelect(sel, includeMono) {
    function addGroup(label, list) {
      var og = document.createElement("optgroup");
      og.label = label;
      list.forEach(function (f) {
        var opt = document.createElement("option");
        opt.value = f; opt.textContent = f;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    }
    addGroup("Serif", FONT_GROUPS.serif);
    addGroup("Sans-serif", FONT_GROUPS.sans);
    addGroup("Monospace", FONT_GROUPS.mono);
    var custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Custom…";
    sel.appendChild(custom);
  }

  populateSelect(document.getElementById("headingFont"));
  populateSelect(document.getElementById("bodyFont"));
  populateSelect(document.getElementById("monoFont"));

  var els = {
    headingFont: document.getElementById("headingFont"),
    headingFontCustom: document.getElementById("headingFontCustom"),
    headingSize: document.getElementById("headingSize"),
    bodyFont: document.getElementById("bodyFont"),
    bodyFontCustom: document.getElementById("bodyFontCustom"),
    bodySize: document.getElementById("bodySize"),
    monoFont: document.getElementById("monoFont"),
    monoFontCustom: document.getElementById("monoFontCustom"),
    monoSize: document.getElementById("monoSize"),
    mdInput: document.getElementById("mdInput"),
    preview: document.getElementById("preview"),
    copyStatus: document.getElementById("copyStatus")
  };

  COLOR_FIELDS.forEach(function (name) {
    els[name] = document.getElementById(name);
    els[name + "Auto"] = document.getElementById(name + "Auto");
  });

  function loadSettings() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) {}
    return Object.assign({}, DEFAULTS, saved);
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function knownFont(list, val) {
    return list.indexOf(val) !== -1;
  }

  function applySettingsToControls(s) {
    var all = FONT_GROUPS.serif.concat(FONT_GROUPS.sans, FONT_GROUPS.mono);

    function setFontControl(selectEl, customEl, val) {
      if (knownFont(all, val)) {
        selectEl.value = val;
        customEl.style.display = "none";
      } else {
        selectEl.value = "__custom__";
        customEl.style.display = "inline-block";
        customEl.value = val;
      }
    }
    setFontControl(els.headingFont, els.headingFontCustom, s.headingFont);
    setFontControl(els.bodyFont, els.bodyFontCustom, s.bodyFont);
    setFontControl(els.monoFont, els.monoFontCustom, s.monoFont);
    els.headingSize.value = s.headingSize;
    els.bodySize.value = s.bodySize;
    els.monoSize.value = s.monoSize;

    COLOR_FIELDS.forEach(function (name) {
      els[name].value = s[name];
      els[name + "Auto"].checked = !!s[name + "Auto"];
      els[name].disabled = !!s[name + "Auto"];
    });
  }

  function currentFontValue(selectEl, customEl) {
    if (selectEl.value === "__custom__") return customEl.value.trim() || DEFAULTS.bodyFont;
    return selectEl.value;
  }

  function readSettingsFromControls() {
    var s = {
      headingFont: currentFontValue(els.headingFont, els.headingFontCustom),
      headingSize: parseInt(els.headingSize.value, 10) || DEFAULTS.headingSize,
      bodyFont: currentFontValue(els.bodyFont, els.bodyFontCustom),
      bodySize: parseInt(els.bodySize.value, 10) || DEFAULTS.bodySize,
      monoFont: currentFontValue(els.monoFont, els.monoFontCustom),
      monoSize: parseInt(els.monoSize.value, 10) || DEFAULTS.monoSize
    };
    COLOR_FIELDS.forEach(function (name) {
      s[name] = els[name].value;
      s[name + "Auto"] = els[name + "Auto"].checked;
    });
    return s;
  }

  function applySettingsToPreview(s) {
    var root = document.documentElement.style;
    root.setProperty("--heading-font", quoteFont(s.headingFont));
    root.setProperty("--heading-size", s.headingSize + "px");
    root.setProperty("--body-font", quoteFont(s.bodyFont));
    root.setProperty("--body-size", s.bodySize + "px");
    root.setProperty("--mono-font", quoteFont(s.monoFont));
    root.setProperty("--mono-size", s.monoSize + "px");

    function setColorVar(cssVar, autoFlag, value) {
      if (autoFlag) root.removeProperty(cssVar);
      else root.setProperty(cssVar, value);
    }
    setColorVar("--heading-fg", s.headingFgAuto, s.headingFg);
    setColorVar("--heading-bg", s.headingBgAuto, s.headingBg);
    setColorVar("--body-fg", s.bodyFgAuto, s.bodyFg);
    setColorVar("--body-bg", s.bodyBgAuto, s.bodyBg);
    setColorVar("--mono-fg", s.monoFgAuto, s.monoFg);
    setColorVar("--mono-bg", s.monoBgAuto, s.monoBg);
  }

  function quoteFont(name) {
    return /\s/.test(name) ? '"' + name + '"' : name;
  }

  var currentSettings = loadSettings();
  applySettingsToControls(currentSettings);
  applySettingsToPreview(currentSettings);

  function onControlsChanged() {
    currentSettings = readSettingsFromControls();
    applySettingsToPreview(currentSettings);
    saveSettings(currentSettings);
  }

  [els.headingFont, els.headingFontCustom, els.headingSize,
   els.bodyFont, els.bodyFontCustom, els.bodySize,
   els.monoFont, els.monoFontCustom, els.monoSize].forEach(function (el) {
    el.addEventListener("input", onControlsChanged);
    el.addEventListener("change", function () {
      var pairs = [[els.headingFont, els.headingFontCustom],
                   [els.bodyFont, els.bodyFontCustom],
                   [els.monoFont, els.monoFontCustom]];
      pairs.forEach(function (p) {
        p[1].style.display = (p[0].value === "__custom__") ? "inline-block" : "none";
      });
      onControlsChanged();
    });
  });

  COLOR_FIELDS.forEach(function (name) {
    var colorEl = els[name], autoEl = els[name + "Auto"];
    colorEl.addEventListener("input", function () {
      autoEl.checked = false;
      colorEl.disabled = false;
      onControlsChanged();
    });
    autoEl.addEventListener("change", function () {
      colorEl.disabled = autoEl.checked;
      onControlsChanged();
    });
  });

  document.getElementById("btnReset").addEventListener("click", function () {
    currentSettings = Object.assign({}, DEFAULTS);
    applySettingsToControls(currentSettings);
    applySettingsToPreview(currentSettings);
    saveSettings(currentSettings);
  });

  // ---- Settings modal ----
  var settingsModal = document.getElementById("settingsModal");
  function openSettings() { settingsModal.classList.add("open"); }
  function closeSettings() { settingsModal.classList.remove("open"); }
  document.getElementById("btnSettings").addEventListener("click", openSettings);
  document.getElementById("btnCloseSettings").addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", function (e) {
    if (e.target === settingsModal) closeSettings();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && settingsModal.classList.contains("open")) closeSettings();
  });

  // Declared here (ahead of renderNow) so renderNow can check whether the
  // fullscreen preview is visible before paying to update its DOM too.
  var fullscreenModal = document.getElementById("fullscreenModal");

  // ---- Resizable columns ----
  var leftPane = document.getElementById("leftPane");
  var resizer = document.getElementById("paneResizer");
  var mainEl = document.querySelector("main");

  function applySplit(percent) {
    leftPane.style.flex = "0 0 " + percent + "%";
  }

  var dragging = false, startX = 0, startWidth = 0, containerWidth = 0;
  resizer.addEventListener("pointerdown", function (e) {
    dragging = true;
    resizer.classList.add("dragging");
    resizer.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startWidth = leftPane.getBoundingClientRect().width;
    // Measured once per drag rather than per pointermove — mainEl's width doesn't
    // change while dragging, so re-measuring on every move just forces layout for nothing.
    containerWidth = mainEl.getBoundingClientRect().width - resizer.getBoundingClientRect().width;
  });
  resizer.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var newWidth = startWidth + (e.clientX - startX);
    var minPx = containerWidth * 0.2;
    var maxPx = containerWidth * 0.8;
    newWidth = Math.max(minPx, Math.min(maxPx, newWidth));
    applySplit((newWidth / containerWidth) * 100);
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
  }
  resizer.addEventListener("pointerup", endDrag);
  resizer.addEventListener("pointercancel", endDrag);

  // ---- Markdown rendering ----
  marked.setOptions({ gfm: true, breaks: false });

  var renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, 120);
  }
  var previewFullscreen = document.getElementById("previewFullscreen");
  var INPUT_KEY = "mdformatter.input.v1";
  function renderNow() {
    var clean;
    try {
      var raw = marked.parse(els.mdInput.value || "");
      clean = DOMPurify.sanitize(raw, {
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["style", "iframe", "object", "embed"]
      });
    } catch (e) {
      // Malformed/pathological input shouldn't leave the preview stuck on
      // stale content with no indication anything went wrong.
      clean = "<p><em>Could not render this Markdown.</em></p>";
    }
    els.preview.innerHTML = clean;
    // Skip touching the fullscreen copy's DOM while it's hidden — it's re-synced
    // in openFullscreen() instead, so this cost is only ever paid when it's visible.
    if (fullscreenModal.classList.contains("open")) previewFullscreen.innerHTML = clean;
    try { localStorage.setItem(INPUT_KEY, els.mdInput.value); } catch (e) {}
  }
  els.mdInput.addEventListener("input", scheduleRender);

  var savedInput = "";
  try { savedInput = localStorage.getItem(INPUT_KEY) || ""; } catch (e) {}
  els.mdInput.value = savedInput;
  renderNow();

  // ---- Drag & drop a .md file onto the input pane ----
  var MD_EXTENSIONS = /\.(md|markdown|mdown|mkd|mkdn|mdtext|txt|text)$/i;
  var MAX_DROP_BYTES = 5 * 1024 * 1024;
  var dropZone = document.getElementById("leftPane");
  var dragDepth = 0;

  // Only files should trigger the drop UI; dragging a text selection inside the
  // textarea must keep its native move/copy behaviour.
  function hasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    return Array.prototype.indexOf.call(types, "Files") !== -1;
  }

  function setDragState(on) {
    dropZone.classList.toggle("drag-over", on);
  }

  dropZone.addEventListener("dragenter", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    setDragState(true);
  });
  dropZone.addEventListener("dragover", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  dropZone.addEventListener("dragleave", function (e) {
    if (!hasFiles(e)) return;
    // dragleave also fires when crossing between child elements, so only clear
    // the highlight once every matching dragenter has been balanced out.
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragState(false);
  });
  dropZone.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    setDragState(false);

    var files = e.dataTransfer.files;
    if (!files || !files.length) return;
    var file = files[0];

    if (!MD_EXTENSIONS.test(file.name) && file.type.indexOf("text/") !== 0) {
      flashStatus("Not a Markdown file", true);
      return;
    }
    if (file.size > MAX_DROP_BYTES) {
      flashStatus("File too large (max 5 MB)", true);
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      els.mdInput.value = reader.result;
      renderNow();
      flashStatus("Loaded " + file.name + " ✓");
    };
    reader.onerror = function () { flashStatus("Could not read file", true); };
    reader.readAsText(file);
  });

  // Without this, dropping a file anywhere outside the drop zone makes the
  // browser navigate away from the app and lose the current input.
  window.addEventListener("dragover", function (e) {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("drop", function (e) {
    if (hasFiles(e)) e.preventDefault();
  });

  // ---- Build a standalone, inline-styled HTML document from current preview ----
  function buildStandaloneHtml() {
    var clone = els.preview.cloneNode(true);

    function applyInline(el) {
      var tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) {
        var level = parseInt(tag.substring(1), 10);
        var ratios = [1, 1, .83, .70, .60, .53, .48];
        el.style.fontFamily = currentSettings.headingFont;
        el.style.fontSize = Math.round(currentSettings.headingSize * ratios[level]) + "px";
        el.style.fontWeight = "700";
        el.style.lineHeight = "1.25";
        el.style.margin = "1.2em 0 .5em";
        if (!currentSettings.headingFgAuto) el.style.color = currentSettings.headingFg;
        if (!currentSettings.headingBgAuto) el.style.backgroundColor = currentSettings.headingBg;
      } else if (tag === "CODE" || tag === "PRE") {
        el.style.fontFamily = currentSettings.monoFont;
        el.style.fontSize = currentSettings.monoSize + "px";
        el.style.border = "1px solid #d0d0d0";
        if (!currentSettings.monoFgAuto) el.style.color = currentSettings.monoFg;
        if (!currentSettings.monoBgAuto) el.style.backgroundColor = currentSettings.monoBg;
        if (tag === "CODE" && el.parentElement && el.parentElement.tagName !== "PRE") {
          el.style.padding = "0.15em 0.35em";
          el.style.borderRadius = "3px";
        }
        if (tag === "PRE") {
          el.style.padding = "12px 14px";
          el.style.borderRadius = "6px";
          el.style.overflowX = "auto";
        }
      } else {
        el.style.fontFamily = currentSettings.bodyFont;
        el.style.fontSize = currentSettings.bodySize + "px";
        if (!currentSettings.bodyFgAuto) el.style.color = currentSettings.bodyFg;
        if (!currentSettings.bodyBgAuto) el.style.backgroundColor = currentSettings.bodyBg;
      }
      Array.prototype.forEach.call(el.children, applyInline);
    }
    Array.prototype.forEach.call(clone.children, applyInline);

    clone.style.fontFamily = currentSettings.bodyFont;
    clone.style.fontSize = currentSettings.bodySize + "px";
    clone.style.lineHeight = "1.55";
    if (!currentSettings.bodyFgAuto) clone.style.color = currentSettings.bodyFg;
    if (!currentSettings.bodyBgAuto) clone.style.backgroundColor = currentSettings.bodyBg;
    clone.style.maxWidth = "720px";

    var titleEl = els.preview.querySelector("h1");
    var title = titleEl ? titleEl.textContent.trim() : "Document";

    return {
      title: title,
      bodyHtml: clone.outerHTML,
      fullHtml:
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>" +
        escapeHtml(title) + "</title></head><body>" + clone.outerHTML + "</body></html>"
    };
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function flashStatus(msg, isError) {
    els.copyStatus.textContent = msg;
    els.copyStatus.classList.toggle("error", !!isError);
    setTimeout(function () {
      els.copyStatus.textContent = "";
      els.copyStatus.classList.remove("error");
    }, 2200);
  }

  document.getElementById("btnCopyRich").addEventListener("click", function () {
    var built = buildStandaloneHtml();
    var plain = els.preview.textContent;
    try {
      var item = new ClipboardItem({
        "text/html": new Blob([built.bodyHtml], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      });
      navigator.clipboard.write([item]).then(function () {
        flashStatus("Copied rich text ✓");
      }, function () {
        fallbackCopyRich(built.bodyHtml);
      });
    } catch (e) {
      fallbackCopyRich(built.bodyHtml);
    }
  });

  function fallbackCopyRich(html) {
    var container = document.createElement("div");
    container.contentEditable = true;
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.innerHTML = html;
    document.body.appendChild(container);
    var range = document.createRange();
    range.selectNodeContents(container);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      document.execCommand("copy");
      flashStatus("Copied rich text ✓");
    } catch (e) {
      flashStatus("Copy failed");
    }
    sel.removeAllRanges();
    document.body.removeChild(container);
  }

  document.getElementById("btnCopySource").addEventListener("click", function () {
    var built = buildStandaloneHtml();
    navigator.clipboard.writeText(built.fullHtml).then(function () {
      flashStatus("Copied HTML source ✓");
    }, function () {
      flashStatus("Copy failed");
    });
  });

  function openFullscreen() {
    previewFullscreen.innerHTML = els.preview.innerHTML;
    fullscreenModal.classList.add("open");
  }
  function closeFullscreen() { fullscreenModal.classList.remove("open"); }
  document.getElementById("btnFullscreen").addEventListener("click", openFullscreen);
  document.getElementById("btnCloseFullscreen").addEventListener("click", closeFullscreen);
  fullscreenModal.addEventListener("click", function (e) {
    if (e.target === fullscreenModal) closeFullscreen();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && fullscreenModal.classList.contains("open")) closeFullscreen();
  });

  document.getElementById("btnDownload").addEventListener("click", function () {
    var built = buildStandaloneHtml();
    var safeName = (built.title || "document").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "document";
    var blob = new Blob([built.fullHtml], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = safeName + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

})();
