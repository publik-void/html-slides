var HtmlSlides = HtmlSlides || {};

HtmlSlides.control = {}

// A true mod function.
// Works for integer inputs and y > 0. Probably improvable.
HtmlSlides.control.mod = function(x, y) {
  if (x >= 0) {
    return x % y;
  } else {
    let a = y + x % y;
    if (a == y) {
      return 0;
    } else {
      return a;
    }
  }
}

HtmlSlides.control.scrollAnchors = function(offset) {
  let anchors = document.anchors;
  const n = anchors.length;

  if (n > 0) {
    const loc = window.location.href.replace(/#.*/,"");
    const anchorName = window.location.hash.replace(/#/,"");
    let nextAnchorName;

    if (anchorName) {
      for (let i = 0; i < n; i++) {
        if (anchors[i].name == anchorName) {
          nextAnchorName = anchors[HtmlSlides.control.mod(i + offset, n)].name;
          break;
        }
      }
    }

    if (!nextAnchorName) {
      nextAnchorName = anchors[Math.min(1, n - 1)].name;
    }

    window.location.href = loc + "#" + nextAnchorName;
  }
}

HtmlSlides.control.setup = function() {
  document.addEventListener("keydown", function (e) {
    const keyCode = e.keyCode;
    let offset = 0;
    if (keyCode == 37) { // left
      offset = -1;
    }
    else if (keyCode == 39) { // right
      offset = 1;
    }

    if (offset != 0) {
      HtmlSlides.control.scrollAnchors(offset);
      setTimeout(function () {
        document.body.classList.add("hide-cursor");
      }, 250);
    }
  });

  document.addEventListener("mousemove", function (e) {
    document.body.classList.remove("hide-cursor");
  });

  // document.body.addEventListener("keydown", function (e) {
  //   const keyCode = e.keyCode;
  //   if (keyCode == 13) { // enter
  //     console.log(`width: ${window.innerWidth}, height: ${window.innerHeight}`);
  //   }
  // });
}

HtmlSlides.control.setup()

