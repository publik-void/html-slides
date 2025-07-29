# As of writing this, Firefox does not support the `@property` at-rule, which
# is why I would need to either use JavaScript or to create multiple CSS files
# manually with hard-coded sizes and a lot of code duplication. So let's
# generate those with this script instead.

import textwrap
import os
import fractions
import math

def slide_size_and_padding(
    slide_class, slide_height_full, aspect,
    padding_left, padding_right, padding_bottom, padding_top):
  slide_class_selector = "" if slide_class is None else f".{slide_class}"
  slide_width = (f"calc({slide_height_full} * {aspect} - "
    f"{padding_left} - {padding_right})")
  slide_height = (f"calc({slide_height_full} "
    f"- {padding_bottom} - {padding_top})")
  return textwrap.dedent(f"""\
    div.slide{slide_class_selector} {{
      width: {slide_width};
      height: {slide_height};

      padding-left:   {  padding_left};
      padding-right:  { padding_right};
      padding-bottom: {padding_bottom};
      padding-top:    {   padding_top};
    }}
    """)

def sizing_stylesheet(
    mode = "fixed",
    width = 1280,
    height = 960,
    fontsize_factor = .025,
    default_width = 1280,
    slide_classes = {
      None: {
        "padding_left"    : "3.75em",
        "padding_right"   : "3.75em",
        "padding_bottom"  : "3.75em",
        "padding_top"     : "5.75em"},
      "headless": {
        "padding_left"    : "3.75em",
        "padding_right"   : "3.75em",
        "padding_bottom"  : "3.75em",
        "padding_top"     : "3.75em"},
      "title": {
        "padding_left"    : "1.75em",
        "padding_right"   : "1.75em",
        "padding_bottom"  : "1.75em",
        "padding_top"     : "1.75em"},
      "image-fill": {
        "padding_left"    : "0.0em",
        "padding_right"   : "0.0em",
        "padding_bottom"  : "0.0em",
        "padding_top"     : "0.0em"}}):

  if mode != "fixed":
    width, height = fractions.Fraction(width, height).as_integer_ratio()
  aspect = f"{width} / {height}"

  file_name = f"{mode}-{width}x{height}.css"

  if mode == "fixed":
    page_width = width
    page_height = height
    slide_height_full = f"{height}px"
    margin_bottom = f"max(calc(100vh - {slide_height_full}), 0px)"
  elif mode == "fit-height":
    page_width = default_width
    page_height = page_width / width * height
    slide_height_full = "100vh"
    margin_bottom = f"0px"
  else:
    raise ValueError(f"Unrecognized mode \"{mode}\".")

  file_content = textwrap.dedent(f"""\
    @page {{
      size: {page_width}px {page_height}px;
      margin: 0px;
      padding: 0px;
    }}

    body {{
      font-size: calc({slide_height_full} * {fontsize_factor});
    }}

    div.slide {{
      position: relative;

      margin-left: auto;
      margin-right: auto;
      margin-bottom: {margin_bottom};
      margin-top: 0px;
    }}
    """)

  for slide_class, paddings in slide_classes.items():
    file_content += "\n" + slide_size_and_padding(slide_class,
      slide_height_full, aspect, **paddings)

  return file_name, file_content

for mode, width, height in (
    ("fit-height",   16,   9),
    ("fit-height",   16,  10),
    ("fit-height",    4,   3),
    (     "fixed", 1280, 720),
    (     "fixed", 1280, 800),
    (     "fixed", 1280, 960)):
  file_name, file_content = sizing_stylesheet(mode, width, height)
  file_path = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), file_name)
  with open(file_path, "w") as f:
    f.write(file_content)

