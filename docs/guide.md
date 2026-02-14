# How to Use Tufte Editor

## The Interface

{newthought:The editor is a split-pane layout.} The left pane is where you write in Markdown, and the right pane shows a live preview styled with Tufte CSS. Use the **Edit**, **Split**, and **Preview** buttons in the top bar to switch between views. Drag the divider to resize the panes.

## Documents

The sidebar on the left lists all your documents. Click **+ New** to create a new document, or click any document to switch to it. Click the title at the top to rename a document. Documents are saved automatically as you type.

## Writing

You can use standard Markdown: **bold**, *italic*, `inline code`, [links](url), headings with `#`, lists with `-` or `1.`, blockquotes with `>`, code blocks with triple backticks, and horizontal rules with `---`.

## Tufte Tokens

Beyond standard Markdown, this editor supports five tokens from Tufte's typographic style. You can type them manually or use the toolbar buttons.

### Sidenotes

Add numbered notes in the margin with `{sn:Your note text}`. Place them inline right after the word they annotate.{sn:Like this sidenote right here.}

### Margin Notes

Add unnumbered margin notes with `{mn:Your note text}`.{mn:Margin notes work just like sidenotes but without a number.} Use these for supplementary remarks that don't need a reference number.

### New Thoughts

Mark the start of a new train of thought with `{newthought:Opening words}`. {newthought:This renders} the opening words in small caps.

### Epigraphs

Write a blockquote with an attribution line starting with `--` or `—`:

> It is not enough to do your best; you must know what to do, and then do your best.
> — W. Edwards Deming

## Images

### From a URL

Use the syntax `![caption][width%](url)`:

- `![My photo][50](https://example.com/photo.jpg)` — 50% width
- `![Wide shot][100](url){fullwidth}` — full-width figure
- `![Detail][100](url){margin}` — margin figure

The `[width%]` bracket is optional; omit it for default sizing.

### Uploaded Images

Click the **Images** button in the toolbar to manage uploaded images. You can upload new images and delete existing ones from the modal.

Once uploaded, reference an image by its filename: `![caption][50](photo.jpg)`. As you type `@` in the editor, autocomplete will suggest uploaded image filenames alongside citation keys.

## Citations

### Loading a Bibliography

Click the **Bib** button in the toolbar to open the bibliography modal. Paste BibTeX entries or load a `.bib` file, then click **Apply**.

### Citing References

Once loaded, cite a reference inline with `@citekey` — for example, `@tufte2001`. Autocomplete will suggest matching keys as you type after `@`.

To cite a URL directly, use `@url[https://example.com]`. A references section is generated automatically at the bottom of the document.

Toggle between **[1]** numbered and **APA** citation styles using the toggle in the top bar.

## Keyboard Shortcuts

- **Ctrl/Cmd + B** — Bold
- **Ctrl/Cmd + I** — Italic
- **Ctrl/Cmd + Z** — Undo
- **Ctrl/Cmd + Shift + Z** — Redo
- **Ctrl/Cmd + S** — Force save
- **Tab** — Insert two spaces

## Exporting

Click **Export** in the top bar for three options:

- **Download HTML** — A standalone `.html` file with Tufte CSS, ready to open in any browser or host anywhere. Uploaded images are inlined automatically.
- **Print / PDF** — Opens the browser print dialog. Use "Save as PDF" for a PDF export.
- **Copy Markdown** — Copies the raw Markdown source to your clipboard.
