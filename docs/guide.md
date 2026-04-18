# Tufte Editor Guide

{newthought:Welcome to the Tufte Markdown Editor.} A split-pane editor for writing in extended Markdown with a live preview styled after Edward Tufte's typographic principles. The left pane is your editor, the right is the preview. Use the **Edit**, **Split**, and **Preview** buttons to switch views, or drag the divider to resize. Double-click anything in the preview to jump to that spot in the source.

## Documents and Folders

Documents are saved automatically as `.md` files on disk. The sidebar lists them all — click **+ New** to create one, click the title bar to rename, or click the **x** to delete. A live word count is shown in the top bar.

Create folders with the **+ Folder** button in the sidebar header. Drag and drop documents onto a folder to move them. Right-click a document to move it between folders via the context menu. Click a folder to expand or collapse it. The sidebar itself can be toggled open and closed with the sidebar button.

## Sidenotes and Margin Notes

Sidenotes appear in the margin, numbered automatically.{sn:This is a sidenote. Write them with \`{sn:your text}\` right after the word they annotate.} They keep the reader's eye on the page instead of jumping to the bottom.

Margin notes are similar but unnumbered.{mn:This is a margin note. Write them with \`{mn:your text}\`. You can also use math here $\frac{1}{2}$. Use these for supplementary remarks.} Good for commentary that doesn't need a reference number. They are highlighted in the editor as you add them.

## New Thoughts

{newthought:Mark the start of a new idea} with `{newthought:Opening words}`. The opening words render in small caps — a classic Tufte convention for signaling a shift in topic.

## Epigraphs

Write a blockquote with an attribution line starting with `--` or `—`:

> The purpose of computing is insight, not numbers.
> — Richard Hamming

## Figures

Figures are auto-numbered. Write `![caption](url)` and the preview shows **Figure 1: caption**, **Figure 2: caption**, and so on. Margin figures (`{margin}`) are excluded from numbering. Images without captions are not numbered.

![Mona Lisa, Leonardo da Vinci][50](Mona Lisa by Leonardo da Vinci.webp){margin}

Add a size bracket `[width%]` after the caption to control width — for example, `![caption][75](url)` renders at 75% width. A tooltip appears in the editor when your cursor is inside the size bracket.

### Figure modifiers

Append a modifier in braces after the URL:

- `{fullwidth}` — stretches the figure across the full page width
- `{margin}` — places the figure in the margin as a small side image
- `{label:name}` — gives the figure a label for cross-referencing

Modifiers can be combined: `![caption](url){fullwidth,label:myplot}`.

### Figure references

Label a figure and then reference it anywhere in the text with `{fig:label}`. The reference renders as a clickable link showing the resolved figure number. Forward references work — you can reference a figure before it appears.

For example, writing `{fig:mona}` with a figure labeled `{label:mona}` produces a link reading "Figure 1" that scrolls to the figure when clicked. Unknown labels show "Figure ??".

### Image management

![An example figure][100](cviz.png){label:label}

Click the **Images** button in the toolbar to upload images from your computer. Once uploaded, reference them by filename. Autocomplete suggests filenames as you type after `@`. Click any image in the preview to open a lightbox with zoom and pan.

## Tables

Insert a table with the **Table** button — a grid picker lets you choose the size. Tables use standard pipe syntax:

| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |
| d | e | f |

Right-click a table in the editor to add or remove rows and columns via the context menu. Alignment is set with colons in the separator row: `:---` left, `:---:` center, `---:` right. Inline formatting like **bold**, *italic*, `code`, and [links](https://example.com) works inside cells.

### Table captions and references

Add a caption line starting with `|:` immediately before the header row:

|: Experimental results {label:results}
| Method | Accuracy |
| --- | ---: |
| Baseline | 72% |
| Ours | 89% |

Tables with captions are auto-numbered independently of figures. Add `{label:name}` in the caption to make the table referenceable. Use `{tbl:name}` anywhere in the text to create a clickable link — for example, {tbl:results} links to the table above. Forward references work the same as with figures.

## Math

Inline math uses single dollar signs: `$E = mc^2$` renders as $E = mc^2$. Display math uses double dollar signs on their own lines:

$$
\alpha + \beta = \gamma
$$

LaTeX autocomplete is available inside math contexts — type `\` and a dropdown will suggest Greek letters, operators, and symbols. Math also works inside figure captions.

## Citations

Click **Bib** in the toolbar to load BibTeX entries (paste text or upload a `.bib` file), then cite inline with `@citekey` — for example, `@tufte2001`. Autocomplete suggests matching keys as you type.

Cite URLs directly with `@url[https://example.com]`, or give them a name: `@url[Example][https://example.com]`. A references section is generated automatically at the bottom of the document. Toggle between **[1]** numbered and **APA** styles in the top bar.

## Standard Markdown

All the usual formatting works: **bold**, *italic*, `inline code`, [hyperlinks](https://edwardtufte.github.io/tufte-css/), headings with `#`, lists with `-` or `1.`, blockquotes with `>`, and horizontal rules with `---`.

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

Fenced code blocks support syntax highlighting for JavaScript, Python, TypeScript, Bash, JSON, and SQL.

- First item
- Second item with **bold**
- Third item

1. Ordered lists
2. Work the same way

## Keyboard Shortcuts

- **Ctrl/Cmd + B** — Bold
- **Ctrl/Cmd + I** — Italic
- **Ctrl/Cmd + Z** — Undo
- **Ctrl/Cmd + Shift + Z** — Redo
- **Ctrl/Cmd + S** — Force save
- **Tab** — Insert two spaces
- **Escape** — Close autocomplete or context menu

## Exporting

Click **Export** in the top bar:

- **Download HTML** — Standalone `.html` with Tufte CSS. Uploaded images are inlined automatically. Math and code are pre-rendered so no external scripts are needed.
- **Print / PDF** — Opens the browser print dialog.
- **Copy Markdown** — Copies raw source to clipboard.

---

{newthought:That covers everything.} Delete this document and start writing, or edit it to experiment with the syntax.
