"use strict";

// Slide control script taken from ChatGPT and slightly adapted
// -----------------------------------------------------------------------------

/* global namespace (don't clobber if already present) */
var HtmlSlides = (typeof HtmlSlides !== "undefined") ? HtmlSlides : {};
HtmlSlides.Control = HtmlSlides.Control || {};

/* ============================ Utilities ============================= */

HtmlSlides.Control.Util = HtmlSlides.Control.Util || (function() {
  function mod(x, y) {
    // true mathematical modulo for y > 0
    return ((x % y) + y) % y;
  }
  function isEditableTarget(e) {
    const t = e.target;
    if (!t) return false;
    const tag = (t.tagName || "").toUpperCase();
    return t.isContentEditable ||
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
  return { mod, isEditableTarget };
})();

/* ====================== Anchor & Slide indexing ===================== */

HtmlSlides.Control.Anchors = HtmlSlides.Control.Anchors || (function(U) {
  const cfg = {
    slideSelector: "div.slide",
    sectionClass: "section",
    titleClass: "title",
    idPrefix: "",     // if you prefer "slide-" set to "slide-"
  };

  let slides = [];
  let sections = [];  // indices (1-based) of section-start slides

  function ensureAnchors() {
    slides = Array.from(document.querySelectorAll(cfg.slideSelector));
    sections = [];

    slides.forEach((slide, i) => {
      const n = i + 1;
      const id = cfg.idPrefix + String(n);

      // If parent is an <a>, put id on parent; else put id on the slide.
      const p = slide.parentElement;
      if (p && p.tagName && p.tagName.toUpperCase() === "A") {
        p.id = p.id || id;
        // mirror the 'section' marker for convenience
        if (slide.classList.contains(cfg.sectionClass)) {
          p.classList.add(cfg.sectionClass);
        }
      } else {
        if (!slide.id) slide.id = id;
        // (No need to wrap: any element with id can be a target)
      }

      if (slide.classList.contains(cfg.sectionClass)) {
        sections.push(n);
      }
    });
  }

  function getCount() { return slides.length; }
  function getSections() { return sections.slice(); }

  function getCurrentIndex() {
    const h = (window.location.hash || "").replace("#", "");
    const n = parseInt(h, 10);
    return (!Number.isNaN(n) && n >= 1 && n <= slides.length) ? n : 1;
  }

  function goTo(n) {
    // centralize navigation (history-friendly)
    window.location.hash = "#" + String(n);
  }

  function goToOffset(offset) {
    const m = getCount();
    if (!m) return;
    const cur = getCurrentIndex();
    const next = U.mod(cur - 1 + offset, m) + 1;
    goTo(next);
  }

  function goToSectionOffset(offset) {
    if (!sections.length) return;
    const cur = getCurrentIndex();
    // index of first section strictly greater than current
    const pos = sections.findIndex(i => i > cur);
    const j = U.mod(Math.max(pos, 0) - 1, sections.length);
    const same = (sections[j] === cur);
    const jNext = U.mod(j + (same || offset > 0 ? 0 : 1) + offset,
                        sections.length);
    goTo(sections[jNext]);
  }

  return {
    ensureAnchors,
    getCount,
    getSections,
    getCurrentIndex,
    goTo,
    goToOffset,
    goToSectionOffset,
    _config: cfg
  };
})(HtmlSlides.Control.Util);

/* =========================== Key Controls =========================== */

HtmlSlides.Control.Keys = HtmlSlides.Control.Keys || (function(U, A) {
  const cfg = {
    // main slide nav
    prevSlideKeys: ["ArrowLeft", "k"],
    nextSlideKeys: ["ArrowRight", "j"],
    // section jumps
    prevSectionKeys: ["h"],
    nextSectionKeys: ["l"],
    // jump to begin or end
    topSlideKeys: ["g"],
    bottomSlideKeys: ["G"]
  };

  let installed = false;
  let hideTimer = null;

  function onKeyDown(e) {
    if (U.isEditableTarget(e)) return;
    // If Navigator overlay is open, don't handle base keys here
    if (HtmlSlides.Control.Navigator &&
        HtmlSlides.Control.Navigator.isOpen &&
        HtmlSlides.Control.Navigator.isOpen()) {
      return;
    }

    const k = e.key;
    let handled = false;

    if (cfg.prevSlideKeys.includes(k)) {
      A.goToOffset(-1);
      handled = true;
    } else if (cfg.nextSlideKeys.includes(k)) {
      A.goToOffset(1);
      handled = true;
    } else if (cfg.prevSectionKeys.includes(k)) {
      A.goToSectionOffset(-1);
      handled = true;
    } else if (cfg.nextSectionKeys.includes(k)) {
      A.goToSectionOffset(1);
      handled = true;
    } else if (cfg.topSlideKeys.includes(k)) {
      A.goTo(1);
      handled = true;
    } else if (cfg.bottomSlideKeys.includes(k)) {
      A.goTo(A.getCount());
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      // hide cursor shortly after navigation
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        document.body.classList.add("hide-cursor");
      }, 250);
    }
  }

  function onMouseMove() {
    document.body.classList.remove("hide-cursor");
  }

  function init() {
    if (installed) return;
    installed = true;
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousemove", onMouseMove);
  }

  return { init, _config: cfg };
})(HtmlSlides.Control.Util, HtmlSlides.Control.Anchors);

/* ============================ Navigator ============================= */

HtmlSlides.Control.Navigator = HtmlSlides.Control.Navigator || (function(A, U) {
  const cfg = {
    openKey: "/",                 // toggle
    slideSelector: "div.slide",
    headingSelector: "h1,h2,h3",
    noTitleText: "(no title)"
  };

  let overlayRoot = null;
  let searchInput = null;
  let listEl = null;
  let open = false;
  let selectedIdx = -1;

  function injectStylesOnce() {
    if (document.getElementById("slideNavStyles")) return;
    const style = document.createElement("style");
    style.id = "slideNavStyles";
    style.textContent =
`#slideNavOverlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99999;
display:none;align-items:center;justify-content:center;font-family:system-ui,
-apple-system,Segoe UI,Roboto,sans-serif}
#slideNavPanel{width:min(900px,92vw);max-height:80vh;background:#fff;border-radius:8px;
box-shadow:0 10px 30px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}
#slideNavHeader{padding:10px 12px;border-bottom:1px solid #eee;display:flex;gap:8px;
align-items:center}
#slideNavHeader .slideNavPrompt{font-size:14px;color:#666}
#slideNavHeader input{flex:1;font-size:16px;padding:8px 10px;border:1px solid #ddd;
border-radius:6px;outline:none}
#slideNavHeader input:focus{border-color:#888}
#slideNavList{overflow:auto;padding:6px 0}
.slideNavItem{display:grid;grid-template-columns:4.5ch 1fr;gap:8px;align-items:baseline;
padding:8px 12px;cursor:pointer;user-select:none}
.slideNavItem:hover{background:#f6f7f9}
.slideNavItem[aria-selected="true"]{background:#e8f0fe}
.slideNavNum{color:#666;text-align:right}
.slideNavTitle{color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.level-1{font-weight:700;background:#fafafa;border-top:1px solid #f0f0f0;
border-bottom:1px solid #f0f0f0}
.level-2{padding-left:16px}
.level-3{padding-left:32px;position:relative}
.level-3::before{content:"";position:absolute;left:24px;top:0;bottom:0;width:3px;
background:#e0e0e0;border-radius:2px}
#slideNavFooter{padding:8px 12px;border-top:1px solid #eee;color:#666;font-size:12px}
@media (prefers-color-scheme: dark){
#slideNavPanel{background:#1e1f22}
#slideNavHeader{border-bottom-color:#2a2c31}
#slideNavHeader .slideNavPrompt{color:#aaa}
#slideNavHeader input{background:#151619;color:#ddd;border-color:#333}
#slideNavHeader input:focus{border-color:#666}
#slideNavList{color:#e8e8e8}
.slideNavItem:hover{background:#2a2c31}
.slideNavItem[aria-selected="true"]{background:#23314a}
.slideNavTitle{color:#e8e8e8}
.slideNavNum{color:#aaa}
.level-1{background:#22252b;border-color:#2a2c31}
.level-3::before{background:#3a3d44}
#slideNavFooter{border-top-color:#2a2c31;color:#aaa}}`;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (overlayRoot) return;

    injectStylesOnce();

    overlayRoot = document.createElement("div");
    overlayRoot.id = "slideNavOverlay";
    overlayRoot.setAttribute("role", "dialog");
    overlayRoot.setAttribute("aria-modal", "true");
    overlayRoot.style.display = "none";

    const panel = document.createElement("div");
    panel.id = "slideNavPanel";
    panel.addEventListener("click", (e) => e.stopPropagation());

    const header = document.createElement("div");
    header.id = "slideNavHeader";

    const prompt = document.createElement("div");
    prompt.textContent = "Search slides";
    prompt.className = "slideNavPrompt";

    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Type to filter…";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;

    header.appendChild(prompt);
    header.appendChild(searchInput);

    listEl = document.createElement("div");
    listEl.id = "slideNavList";
    listEl.setAttribute("role", "listbox");

    const footer = document.createElement("div");
    footer.id = "slideNavFooter";
    footer.textContent =
      "↑/↓ select • Enter jump • Esc close • Click item to jump";

    panel.appendChild(header);
    panel.appendChild(listEl);
    panel.appendChild(footer);

    overlayRoot.appendChild(panel);
    overlayRoot.addEventListener("click", closeOverlay);

    document.body.appendChild(overlayRoot);

    overlayRoot.addEventListener("keydown", onOverlayKeys);
    searchInput.addEventListener("input", onFilter);

    populateList();
  }

  function headingInfo(slide) {
    const h = slide.querySelector(cfg.headingSelector);
    if (h) {
      const tag = (h.tagName || "").toLowerCase(); // h1,h2,h3
      const lvl = tag === "h1" ? 1 : (tag === "h2" ? 2 : 3);
      const txt = (h.textContent || "").trim() || cfg.noTitleText;
      return { title: txt, level: lvl };
    }
    // fallback to classes if no heading
    if (slide.classList.contains("title")) return { title: cfg.noTitleText, level: 1 };
    if (slide.classList.contains("section")) return { title: cfg.noTitleText, level: 2 };
    return { title: cfg.noTitleText, level: 3 };
  }

  function populateList() {
    listEl.innerHTML = "";
    const slides = Array.from(document.querySelectorAll(cfg.slideSelector));

    slides.forEach((slide, i) => {
      const n = i + 1;
      const info = headingInfo(slide);

      const item = document.createElement("div");
      item.className = "slideNavItem";
      item.classList.add(`level-${info.level}`);
      if (info.level <= 2) item.classList.add("sectionHead");

      item.setAttribute("role", "option");
      item.dataset.index = String(n);
      item.dataset.title = info.title.toLowerCase();

      const num = document.createElement("div");
      num.className = "slideNavNum";
      num.textContent = String(n);

      const title = document.createElement("div");
      title.className = "slideNavTitle";
      title.textContent = info.title;

      item.appendChild(num);
      item.appendChild(title);
      item.addEventListener("click", () => {
        closeOverlay();
        A.goTo(n); // use the centralized navigation
      });

      listEl.appendChild(item);
    });

    const cur = A.getCurrentIndex() || 1;
    selectVisibleIndex(findVisibleIndexForNumber(cur));
  }

  function openOverlay() {
    ensureOverlay();
    open = true;
    overlayRoot.style.display = "flex";
    selectedIdx = -1;
    searchInput.value = "";
    onFilter();
    setTimeout(() => searchInput.focus(), 0);
  }

  function closeOverlay() {
    if (!open) return;
    open = false;
    overlayRoot.style.display = "none";
  }

  function onFilter() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const items = Array.from(listEl.children);
    items.forEach((el) => {
      const hay = el.dataset.title || "";
      el.style.display = (q === "" || hay.includes(q)) ? "" : "none";
    });

    const cur = A.getCurrentIndex() || 1;
    const tgt = findVisibleIndexForNumber(cur);
    if (tgt !== -1) selectVisibleIndex(tgt);
    else selectVisibleIndex(0);
  }

  function visibleItems() {
    return Array.from(listEl.children).filter(el => el.style.display !== "none");
  }

  function clearSelection() {
    Array.from(listEl.querySelectorAll('[aria-selected="true"]'))
      .forEach(el => el.setAttribute("aria-selected", "false"));
  }

  function selectVisibleIndex(idx) {
    const vis = visibleItems();
    if (!vis.length) { selectedIdx = -1; return; }
    const bounded = Math.max(0, Math.min(idx, vis.length - 1));
    clearSelection();
    vis[bounded].setAttribute("aria-selected", "true");
    vis[bounded].scrollIntoView({ block: "nearest" });
    selectedIdx = bounded;
  }

  function moveSelection(d) {
    const vis = visibleItems();
    if (!vis.length) return;
    if (selectedIdx < 0) selectedIdx = 0;
    const next = U.mod(selectedIdx + d, vis.length);
    selectVisibleIndex(next);
  }

  function findVisibleIndexForNumber(n) {
    const vis = visibleItems();
    for (let i = 0; i < vis.length; i++) {
      if (parseInt(vis[i].dataset.index, 10) === n) return i;
    }
    return -1;
  }

  function onOverlayKeys(e) {
    const k = e.key;
    if (k === "ArrowDown") {
      e.preventDefault(); e.stopPropagation();
      moveSelection(1);
    } else if (k === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      moveSelection(-1);
    } else if (k === "Enter") {
      e.preventDefault(); e.stopPropagation();
      const vis = visibleItems();
      if (selectedIdx >= 0 && vis[selectedIdx]) {
        const n = parseInt(vis[selectedIdx].dataset.index, 10);
        closeOverlay();
        A.goTo(n);
      }
    } else if (k === "Escape") {
      e.preventDefault(); e.stopPropagation();
      closeOverlay();
    }
  }

  function onGlobalKey(e) {
    if (U.isEditableTarget(e)) return;
    if (e.key === cfg.openKey) {
      e.preventDefault();
      if (open) closeOverlay();
      else openOverlay();
    }
  }

  function isOpen() { return open; }

  function init() {
    ensureOverlay();
    // Global toggle listener
    document.addEventListener("keydown", onGlobalKey);
  }

  return { init, isOpen, _config: cfg };
})(HtmlSlides.Control.Anchors, HtmlSlides.Control.Util);

/* ============================ Bootstrap ============================= */

(function bootstrap() {
  function start() {
    HtmlSlides.Control.Anchors.ensureAnchors();
    HtmlSlides.Control.Keys.init();
    HtmlSlides.Control.Navigator.init();
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

