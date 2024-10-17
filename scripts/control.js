var HtmlSlides = HtmlSlides || {};

HtmlSlides.control = {};

// A true mod function.
// Works for integer inputs and y > 0. Probably improvable.
HtmlSlides.control.mod = function(x, y) {
  if (x >= 0) {
    return x % y;
  } else {
    const a = y + x % y;
    if (a == y) {
      return 0;
    } else {
      return a;
    }
  }
}

HtmlSlides.control.createSlideAnchors = function() {
  const divs = document.querySelectorAll('div.slide');

  const anchors = [];

  divs.forEach((div, i) => {
    const anchor = document.createElement('a');

    div.parentNode.insertBefore(anchor, div);
    anchor.appendChild(div);

    anchor.id = (i + 1).toString();

    anchors.push(anchor);
  });

  // console.log(anchors);
  return anchors;
}

HtmlSlides.control.scrollAnchors = function(n_slides, offset) {
  if (n_slides > 0) {
    fragment = window.location.hash;
    let i = 1;
    if (fragment.startsWith("#")) {
      i = parseInt(fragment.substring(1));
      if (isNaN(i)) {
        i = 1;
      }
    }

    i_next = (HtmlSlides.control.mod(i - 1 + offset, n_slides) + 1);

    window.location.hash = "#" + i_next;
  }
}

HtmlSlides.control.setup = function() {
  document.addEventListener("DOMContentLoaded", function() {
    const anchors = HtmlSlides.control.createSlideAnchors();
    HtmlSlides.control.n_slides = anchors.length;

    document.addEventListener("keydown", function(e) {
      let offset = 0;
      if (e.key == "ArrowLeft") {
        offset = -1;
      }
      else if (e.key == "ArrowRight") {
        offset = 1;
      }

      if (offset != 0) {
        HtmlSlides.control.scrollAnchors(HtmlSlides.control.n_slides, offset);
        setTimeout(function () {
          document.body.classList.add("hide-cursor");
        }, 250);
      }
    });

    document.addEventListener("mousemove", function() {
      document.body.classList.remove("hide-cursor");
    });
  });
}

HtmlSlides.control.setup();

