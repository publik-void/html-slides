# As of writing this, Firefox does not support the `@property` at-rule, which
# is why I would need to either use JavaScript or to create multiple CSS files
# manually with hard-coded sizes and a lot of code duplication. So let's
# generate those with this script instead.

import textwrap
import os
import fractions

def sizing_stylesheet(
    mode = "fixed",
    width = 1280,
    height = 960,
    fontsize_factor = .025,
    padding_left    = "3.75em",
    padding_right   = "3.75em",
    padding_bottom  = "3.75em",
    padding_top     = "3.75em"):
  if mode != "fixed":
    width, height = fractions.Fraction(width, height).as_integer_ratio()

  file_name = f"{mode}-{width}x{height}.css"

  if mode == "fixed":
    file_content = textwrap.dedent(f"""\
      @page {{
        size: {width}px {height}px;
        margin: 0px;
        padding: 0px;
      }}

      body {{
        font-size: calc({height}px * {fontsize_factor});
      }}

      a.slide {{
        position: relative;

        width:  calc({ width}px - {  padding_left} - {padding_right});
        height: calc({height}px - {padding_bottom} - {  padding_top});

        padding-left:   {  padding_left};
        padding-right:  { padding_right};
        padding-bottom: {padding_bottom};
        padding-top:    {   padding_top};

        margin-left: auto;
        margin-right: auto;
        margin-bottom: max(calc(100vh - {height}px), 0px);
        margin-top: 0px;
      }}
      """)
  elif mode == "fit-height":
    printing_width = 1280
    file_content = textwrap.dedent(f"""\
      @page {{
        size: {printing_width}px {printing_width / width * height}px;
        margin: 0px;
        padding: 0px;
      }}

      body {{
        font-size: calc(100vh * {fontsize_factor});
      }}

      a.slide {{
        position: relative;

        width:  calc(100vh * {width} / {height} -
          {  padding_left} - {padding_right});
        height: calc(100vh - {padding_bottom} - {  padding_top});

        padding-left:   {  padding_left};
        padding-right:  { padding_right};
        padding-bottom: {padding_bottom};
        padding-top:    {   padding_top};

        margin-left: auto;
        margin-right: auto;
        margin-bottom: 0px;
        margin-top: 0px;
      }}
      """)
  else:
    raise ValueError(f"Unrecognized mode \"{mode}\".")

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

