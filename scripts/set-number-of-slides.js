"use strict";

var HtmlSlides = HtmlSlides || {};

HtmlSlides.numberOfSlides = {};

HtmlSlides.numberOfSlides.get = function() {
  return document.querySelectorAll('div.slide').length;
}

HtmlSlides.numberOfSlides.addAsStyleVar = function(n) {
  const css = "body { --n-slides: \"" + n + "\"; } ";
  const style = document.createElement("style");
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

HtmlSlides.numberOfSlides.setup = function() {
  document.addEventListener("DOMContentLoaded", function() {
    const n = HtmlSlides.numberOfSlides.get();
    HtmlSlides.numberOfSlides.addAsStyleVar(n);
  })
}

HtmlSlides.numberOfSlides.setup();

