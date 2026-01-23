"use strict";

// vim: foldmethod=marker

// Slide control script taken from ChatGPT and slightly adapted
// -----------------------------------------------------------------------------

/* global namespace (don't clobber if already present) */
var HtmlSlides = (typeof HtmlSlides !== "undefined") ? HtmlSlides : {};
HtmlSlides.Control = HtmlSlides.Control || {};

// ============================ Utilities ============================= {{{1

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

  // Get an array of colums of the `table`, where columns are arrays of cells
  // visually starting in that column.
  function bucketCellsByStartColumn(table) {
    const rows = Array.from(table.querySelectorAll("tr"))

    // cols[c] = array of cells whose visual start column is c
    const cols = [];
    // For each column: rows remaining occupied by a rowspan from above
    const downSpan = [];

    const bumpPastRowspans = (col) => {
      while ((downSpan[col] ?? 0) > 0) col += 1;
      return col;
    }

    for (const tr of rows) {
      let col = bumpPastRowspans(0);

      const cells = Array.from(tr.children).filter((n) =>
        n instanceof HTMLElement && (n.tagName === "TD" || n.tagName === "TH"));

      for (const cell of cells) {
        col = bumpPastRowspans(col);

        const startCol = col;
        const colspan = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
        const rowspan = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);

        (cols[startCol] ??= []).push(cell);

        if (rowspan > 1) {
          for (let c = startCol; c < startCol + colspan; c += 1) {
            downSpan[c] = Math.max(downSpan[c] ?? 0, rowspan - 1);
          }
        }

        col = startCol + colspan;
      }

      for (let c = 0; c < downSpan.length; c += 1) {
        if ((downSpan[c] ?? 0) > 0) downSpan[c] -= 1;
      }
    }

    // Fill missing columns with empty arrays
    for (let c = 0; c < cols.length; c += 1) {
      cols[c] ??= [];
    }

    return cols;
  }

  return { mod, isEditableTarget, bucketCellsByStartColumn };
})();

// ====================== Anchor & Slide indexing ===================== {{{1

HtmlSlides.Control.Anchors = HtmlSlides.Control.Anchors || (function(Util) {
  const config = {
    slideSelector: "div.slide",
    sectionClass: "section",
    titleClass: "title",
    idPrefix: "",     // if you prefer "slide-" set to "slide-"
  };

  let slides = [];
  let sections = [];  // indices (1-based) of section-start slides

  function ensureAnchors() {
    slides = Array.from(document.querySelectorAll(config.slideSelector));
    sections = [];

    slides.forEach((slide, i) => {
      const n = i + 1;
      const id = config.idPrefix + String(n);

      // If parent is an <a>, put id on parent; else put id on the slide.
      const p = slide.parentElement;
      if (p && p.tagName && p.tagName.toUpperCase() === "A") {
        p.id = p.id || id;
        // mirror the 'section' marker for convenience
        if (slide.classList.contains(config.sectionClass)) {
          p.classList.add(config.sectionClass);
        }
      } else {
        if (!slide.id) slide.id = id;
        // (No need to wrap: any element with id can be a target)
      }

      if (slide.classList.contains(config.sectionClass)) {
        sections.push(n);
      }
    });
  }

  function getCount() { return slides.length; }
  function getSections() { return sections.slice(); }

  function getCurrentIndex() {
    const h = (window.location.hash || "").replace("#", "");
    const i = parseInt(h, 10);
    return (!Number.isNaN(i) && i >= 1 && i <= slides.length) ? i : 1;
  }

  function goTo(n) {
    // centralize navigation (history-friendly)
    window.location.hash = "#" + String(n);
  }

  function goToOffset(offset) {
    const m = getCount();
    if (!m) return;
    const cur = getCurrentIndex();
    const next = Util.mod(cur - 1 + offset, m) + 1;
    goTo(next);
  }

  function goToSectionOffset(offset) {
    if (!sections.length) return;
    const cur = getCurrentIndex();
    // index of first section strictly greater than current
    const pos = sections.findIndex(i => i > cur);
    const j = Util.mod(Math.max(pos, 0) - 1, sections.length);
    const same = (sections[j] === cur);
    const jNext = Util.mod(j + (same || offset > 0 ? 0 : 1) + offset,
                        sections.length);
    goTo(sections[jNext]);
  }

  function getSlides() { return slides; }
  function getSections() { return sections; }

  function getCurrentSlide() { return slides[getCurrentIndex() - 1]; }
  // could also do a getCurrentSection() …

  return {
    ensureAnchors,
    getCount,
    getSections,
    getCurrentIndex,
    goTo,
    goToOffset,
    goToSectionOffset,
    getSlides,
    getSections,
    getCurrentSlide,
    config
  };
})(HtmlSlides.Control.Util);

// ======================== Incremental reveal ======================== {{{1

HtmlSlides.Control.IncrementalReveal = HtmlSlides.Control.IncrementalReveal ||
    (function(Util, Anchors) {
  const config = {
    classNameUnrevealed: "unrevealed", // internal class for hidden elements
    classNameIncrement: "increment", // explicit incr. reveal elements
    classNameNoIncrement: "no-increment", // exclude element from incr. reveal
    classNameNoReveal: "no-reveal", // disable incr. reveal on the slide
    classNameRevealFirst: "reveal-first", // reveal the slide's first element
    classNameRevealColwise: "reveal-colwise", // reveal table column-wise
    classNameIncrementHeaders: "increment-headers", // don't merge table headers
  };

  function injectStylesOnce() {
    if (document.getElementById("incrementalRevealStyles")) return;
    const style = document.createElement("style");
    style.id = "incrementalRevealStyles";
    style.textContent =
      // `.${config.classNameUnrevealed} { visibility: hidden; }`;
      `.${config.classNameUnrevealed} { opacity: 10%; }`;
    document.head.appendChild(style);
  }

  function getChildIncrements(node, list) {
    // Can't put a class on a `Node.TEXT_NODE`, so iterate over elements only.
    for (let child = node.firstElementChild;
        child;
        child = child.nextElementSibling) {
      if (child.classList.contains(config.classNameNoIncrement)) continue;
      if (child.tagName === "DIV" || child.tagName === "A") {
        getChildIncrements(child, list);
      } else if (child.tagName === "P") {
        list.push([child]);
      } else if (child.tagName === "IMG") {
        list.push([child]);
      } else if (child.tagName === "UL" || child.tagName === "OL") {
        getChildIncrements(child, list);
      } else if (child.tagName === "LI") {
        const subs = child.querySelectorAll(":scope > ul, :scope > ol");
        if (subs.length === 0) list.push([child]);
        else for (const sub in subs) getChildIncrements(sub, list);
      } else if (child.tagName === "TABLE") {
        let ess;
        if (child.classList.contains(config.classNameRevealColwise)) {
          ess = Util.bucketCellsByStartColumn(child);
        } else {
          ess = getChildIncrements(child, []);
        }

        if (child.classList.contains(config.classNameIncrementHeaders)) {
          for (const es of ess) list.push(es);
        } else {
          // Merge header-only rows/cols with the first "payload" row/col
          let headerOnlySoFar = true;
          const esHead = [];
          const essTail = [];
          for (const es of ess) {
            if (headerOnlySoFar) for (const e of es) esHead.push(e);
            else essTail.push(es);
            const headerOnly = es.every(e => e.tagName === "TH");
            headerOnlySoFar &&= headerOnly;
          }

          if (esHead.length !== 0) list.push(esHead);
          for (const es of essTail) list.push(es);
        }
      } else if (child.tagName === "THEAD" || child.tagName === "TBODY") {
        getChildIncrements(child, list);
      } else if (child.tagName === "TR") {
        const cells = child.querySelectorAll(":scope > th, :scope > td");
        list.push(Array.from(cells));
      }
    }

    if (list.length <= 1) return [];

    return list;
  }

  function getIncrements(slide) {
    if (slide.classList.contains(config.classNameNoReveal)) return [];

    // If the slide is in to-do mode
    if (slide.querySelectorAll(".todo").length > 0) return [];

    const explicitIncrementElements =
      slide.querySelectorAll(`.${config.classNameIncrement}`);
    if (explicitIncrementElements.length > 0) {
      return Array.from(explicitIncrementElements, e => [e]);
    }

    return getChildIncrements(slide, []);
  }

  function resetSlideRevelation(slide, reveal) {
    const increments = getIncrements(slide);
    if (reveal) {
      for (const es of increments) {
        for (const e of es) {
          e.classList.remove(config.classNameUnrevealed);
        }
      }
    } else {
      const revealFirst = slide.classList.contains(config.classNameRevealFirst);
      let isFirst = revealFirst;
      for (const es of increments) {
        if (isFirst) {
          for (const e of es) {
            e.classList.remove(config.classNameUnrevealed);
          }
          isFirst = false;
        } else {
          for (const e of es) {
            e.classList.add(config.classNameUnrevealed);
          }
        }
      }
    }
  }

  function resetRevelation(reveal) {
    for (const slide of Anchors.getSlides()) {
      resetSlideRevelation(slide, reveal);
    }
  }

  function incrementSlideRevelation(slide, prev) {
    const increments = getIncrements(slide);

    let i = 0;
    for (const es of increments) {
      if (es.length !== 0) {
        const e = es[0];
        if (e.classList.contains(config.classNameUnrevealed)) break;
      }
      i += 1;
    }

    if (prev) i -= 1;

    if (i >= 0 && i < increments.length) {
      for (const e of increments[i]) {
        if (prev) e.classList.add(config.classNameUnrevealed);
        else e.classList.remove(config.classNameUnrevealed);
      }
    }
  }

  function incrementCurrentSlideRevelation(prev) {
    const slide = Anchors.getCurrentSlide();
    return incrementSlideRevelation(slide, prev);
  }

  function init() {
    injectStylesOnce();
  }

  return {
    resetRevelation,
    incrementCurrentSlideRevelation,
    init,
    config
  };
})(HtmlSlides.Control.Util, HtmlSlides.Control.Anchors);

// =========================== Key Controls =========================== {{{1

HtmlSlides.Control.Keys = HtmlSlides.Control.Keys ||
    (function(Util, Anchors, IncrementalReveal) {
  const config = {
    // main slide nav
    prevSlideKeys: ["ArrowLeft", "k"],
    nextSlideKeys: ["ArrowRight", "j"],

    // section jumps
    prevSectionKeys: ["i"],
    nextSectionKeys: ["o"],

    // piecewise revelation
    prevIncrementKeys: ["h"],
    nextIncrementKeys: ["l"],

    // revelation reset
    resetRevealKeys: ["r"],
    resetUnrevealKeys: ["R"],

    // jump to begin or end
    topSlideKeys: ["g"],
    bottomSlideKeys: ["G"],
  };

  let installed = false;
  let hideTimer = null;

  function onKeyDown(e) {
    if (Util.isEditableTarget(e)) return;
    // If Navigator overlay is open, don't handle base keys here
    if (HtmlSlides.Control.Navigator &&
        HtmlSlides.Control.Navigator.isOpen &&
        HtmlSlides.Control.Navigator.isOpen()) {
      return;
    }

    const k = e.key;
    let handled = true;

    if (config.prevSlideKeys.includes(k)) {
      Anchors.goToOffset(-1);
    } else if (config.nextSlideKeys.includes(k)) {
      Anchors.goToOffset(1);
    } else if (config.prevSectionKeys.includes(k)) {
      Anchors.goToSectionOffset(-1);
    } else if (config.nextSectionKeys.includes(k)) {
      Anchors.goToSectionOffset(1);
    } else if (config.topSlideKeys.includes(k)) {
      Anchors.goTo(1);
    } else if (config.bottomSlideKeys.includes(k)) {
      Anchors.goTo(Anchors.getCount());
    } else if (config.prevIncrementKeys.includes(k)) {
      IncrementalReveal.incrementCurrentSlideRevelation(true);
    } else if (config.nextIncrementKeys.includes(k)) {
      IncrementalReveal.incrementCurrentSlideRevelation(false);
    } else if (config.resetRevealKeys.includes(k)) {
      IncrementalReveal.resetRevelation(true);
    } else if (config.resetUnrevealKeys.includes(k)) {
      IncrementalReveal.resetRevelation(false);
    } else {
      handled = false;
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

  return { init, config };
})(HtmlSlides.Control.Util, HtmlSlides.Control.Anchors,
    HtmlSlides.Control.IncrementalReveal);

// ============================ Navigator ============================= {{{1

HtmlSlides.Control.Navigator = HtmlSlides.Control.Navigator ||
    (function(Util, Anchors) {
  const config = {
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
    const h = slide.querySelector(config.headingSelector);
    if (h) {
      const tag = (h.tagName || "").toLowerCase(); // h1,h2,h3
      const lvl = tag === "h1" ? 1 : (tag === "h2" ? 2 : 3);
      const txt = (h.textContent || "").trim() || config.noTitleText;
      return { title: txt, level: lvl };
    }
    // fallback to classes if no heading
    if (slide.classList.contains("title"))
      return { title: config.noTitleText, level: 1 };
    if (slide.classList.contains("section"))
      return { title: config.noTitleText, level: 2 };
    return { title: config.noTitleText, level: 3 };
  }

  function populateList() {
    listEl.innerHTML = "";
    const slides = Array.from(document.querySelectorAll(config.slideSelector));

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
        Anchors.goTo(n); // use the centralized navigation
      });

      listEl.appendChild(item);
    });

    const cur = Anchors.getCurrentIndex() || 1;
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

    const cur = Anchors.getCurrentIndex() || 1;
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
    const next = Util.mod(selectedIdx + d, vis.length);
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
        Anchors.goTo(n);
      }
    } else if (k === "Escape") {
      e.preventDefault(); e.stopPropagation();
      closeOverlay();
    }
  }

  function onGlobalKey(e) {
    if (Util.isEditableTarget(e)) return;
    if (e.key === config.openKey) {
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

  return { init, isOpen, config };
})(HtmlSlides.Control.Util, HtmlSlides.Control.Anchors);

// ============================ Bootstrap ============================= {{{1

(function bootstrap() {
  function start() {
    HtmlSlides.Control.Anchors.ensureAnchors();
    HtmlSlides.Control.IncrementalReveal.init();
    HtmlSlides.Control.Keys.init();
    HtmlSlides.Control.Navigator.init();
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

