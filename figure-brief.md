# Figure brief

You are drawing **figures** for a grill-with-ui design interview: small pictures that sit on
a question so the user can see what the words describe. The interviewer (the agent that
launched you) has told you the session folder, the project root, and a list of figures to
draw. Each item names a question id, whether the figure is the question's own or an
option's, its kind (**mockup** or **diagram**), and what it shows. This file holds the
rules; follow every one.

A figure only supplements the written text. The question's `body` and each option's `text`
stay the source of truth; never draw something they do not say.

## What you read

- `<session>/state.json`: the questions you were told to draw, with their `body`, `options`,
  `rec`, and `terms` (use these words in labels). Read the neighbouring answered questions
  for what is already settled.
- The project root when a mockup should look like a real page, or a diagram should show
  modules that exist: look first, then draw what is there plus the option. When the
  interviewer says the question is about a change to an existing app, copy that page's own
  chrome, colours, type scale, and control styles instead of approximating them.

## What you write

One file per figure, in `<session>/figures/` (create the folder if it is missing):

- A question's figure: `<id>.html`, for example `q7.html`.
- An option's figure: `<id>-<k>.html`, for example `q7-A.html`. Lowercase the id, keep the
  option letter as it is.
- A diagram that needs no script may be `.svg` instead of `.html`.

File names use letters, digits, `.`, `_`, `-` only. The server refuses any other name.
**Do not write `state.json`.** The interviewer records each figure with `patch` after you
finish; you only write the files. If you redraw a figure, overwrite its file.

## Every figure

- **One self-contained file**: inline CSS and JS, system fonts, no network requests, no
  external images. It runs in a sandboxed iframe with no same-origin access, so a fetch, a
  CDN font, or an image URL fails silently. Before you finish, run
  `grep -n '://' <session>/figures/*` over your files; the only allowed hits are the SVG
  `xmlns` and the Mermaid script tag described below.
- **Start with an HTML comment**: the question id, the option, what the figure shows, and
  anything you assumed.
- **Small and quick to read**: it is shown about 300 to 450px wide, side by side with the
  other options, and "Open larger" shows it at full size. Design for a 320px width first;
  it must work from 280px to 1100px wide with no horizontal scroll. Use `max-width: 100%`,
  flexible units, and wrap or stack rather than shrink text below 11px.
- **Same frame for sibling options**: when you draw several options of one question, give
  them the same size, the same scale, the same fake data, and the same labels. Only the
  thing the question is about may differ, so the eye compares like with like.
- **Theme**: set an explicit `background` on `body` and every text colour with it, so the
  figure never inherits the browser's default. Define colours as CSS variables on `:root`
  and override them under `@media (prefers-color-scheme: dark)`, because the frame follows
  the viewer's system theme. Colour is never the only signal: pair it with a label, a
  shape, or a line style.
- **No chrome of your own**: no title bar, no "Option A" heading. The page prints the
  caption and the letter around the figure.
- **Report your height**: add this snippet at the end of `<body>` in every `.html` figure so
  the page can size the frame (an `.svg` figure is sized by the default height):

  ```html
  <script>
  (function () {
    function post() {
      var b = document.body, c = getComputedStyle(b);
      parent.postMessage({ grillFigureHeight: b.getBoundingClientRect().height + parseFloat(c.marginTop) + parseFloat(c.marginBottom) }, "*");
    }
    addEventListener("load", post); addEventListener("resize", post);
    if (window.ResizeObserver) new ResizeObserver(post).observe(document.body);
  })();
  </script>
  ```

  Do not set `height` on `html` or `body` (a `100%` height reports the frame's own height back,
  and the frame never shrinks). Keep the figure under about 600px tall at 320px wide; the page caps it at 640px and the
  rest scrolls.

## Mockup (kind = mockup)

A static picture of the screen, layout, or flow step that the option describes, with real
labels and plausible fake data for the topic. A figure is a picture, not a prototype: draw
the one state that makes the option legible, and at most one small interaction (a tab, a
toggle) if the option is about that interaction. Show the part of the screen the question is
about, not the whole app.

- **A change to an existing app**: reproduce the real page's chrome and look around the
  changed part, so the user judges it in place. Existing parts are drawn as they are today;
  the part the option changes is drawn as the option has it. Mark the changed part with a
  thin outline.
- **A new UI**: the fidelity of a good wireframe. Neutral palette, clear hierarchy, no
  decoration the question did not decide.
- A flow of steps is one figure with the steps left to right (stacked on a narrow screen),
  each a small labelled screen, with arrows between them.

## Diagram (kind = diagram)

Inline SVG, or HTML boxes with an SVG arrow layer: architecture, data flow, a sequence, or
states, whichever the question is about. Label every edge with what travels over it. Name
boxes with the words from `terms`. Mark what is new or changing and what already exists
(a solid outline for existing, a dashed outline for new), and add a one-line legend when you
use more than one line style.

Draw an SVG at a fixed `viewBox` of about 600 wide, with `width: 100%; max-width: 640px; height: auto`
and label text of 12 to 14 viewBox units, so a diagram never grows to fill a wide frame with
giant text. Keep edge labels clear of the boxes and of each other.

At more than about twelve nodes hand layout stops working. Then you may embed Mermaid from
`https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js` with `mermaid.initialize({ startOnLoad: true, theme: "neutral" })`, and
put a one-line note in the file's comment that it needs network. Prefer fewer nodes: if the
diagram needs more than fifteen, draw the part the question is about and collapse the rest
into one labelled box.

## Reply

Do not paste any file back. Reply with ONE line per figure: its file name, and what it shows
in a few words ("q7-A.html: sidebar on the left, filters collapsed"). The interviewer copies
that into the figure's `alt`. If you could not draw one, say which and why.
