# Tufte Editor Guide

{newthought:Welcome to the Tufte Markdown Editor.} A split-pane editor for writing in extended Markdown with a live preview styled after Edward Tufte's typographic principles. The left pane is your editor, the right is the preview. Use the **Edit**, **Split**, and **Preview** buttons to switch views, or drag the divider to resize. Double-click anything in the preview to jump to that spot in the source.

Documents are saved automatically as `.md` files on disk. The sidebar lists them all — click **+ New** to create one, click the title bar to rename, or click the **×** to delete.

## Sidenotes and Margin Notes

Sidenotes appear in the margin, numbered automatically.{sn:This is a sidenote. Write them with \`{sn:your text}\` right after the word they annotate.} They keep the reader's eye on the page instead of jumping to the bottom.

Margin notes are similar but unnumbered.{mn:This is a margin note. Write them with \`{mn:your text}\`. Use these for supplementary remarks.} Good for commentary that doesn't need a reference number.

## New Thoughts

{newthought:Mark the start of a new idea} with `{newthought:Opening words}`. The opening words render in small caps — a classic Tufte convention for signaling a shift in topic.

## Epigraphs

Write a blockquote with an attribution line starting with `—` or `--`:

> The purpose of computing is insight, not numbers.
> — Richard Hamming

## Images

![Mona Lisa, Leonardo da Vinci][40](https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/300px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg)

Add `{fullwidth}` after the URL for a full-width figure, or `{margin}` for a margin figure.

![Mona Lisa, Leonardo da Vinci][100](https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/300px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg){fullwidth}

Click the **Images** button in the toolbar to upload images from your computer. Once uploaded, reference them by filename. Autocomplete will suggest filenames as you type after `@`.

## Citations

Click **Bib** in the toolbar to load BibTeX entries, then cite inline with `@citekey` — for example, `@tufte2001`. Autocomplete suggests matching keys as you type.

Cite URLs directly with `@url[https://example.com]`. A references section is generated automatically at the bottom of the document. Toggle between **[1]** numbered and **APA** styles in the top bar.

## Standard Markdown

All the usual formatting works: **bold**, *italic*, `inline code`, [hyperlinks](https://edwardtufte.github.io/tufte-css/), headings with `#`, lists with `-` or `1.`, blockquotes with `>`, and horizontal rules with `---`.

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

- First item
- Second item with **bold**
- Third item

## Keyboard Shortcuts

- **Ctrl/Cmd + B** — Bold
- **Ctrl/Cmd + I** — Italic
- **Ctrl/Cmd + Z** — Undo
- **Ctrl/Cmd + Shift + Z** — Redo
- **Ctrl/Cmd + S** — Force save
- **Tab** — Insert two spaces

## Exporting

Click **Export** in the top bar:

- **Download HTML** — Standalone `.html` with Tufte CSS. Uploaded images are inlined automatically.
- **Print / PDF** — Opens the browser print dialog.
- **Copy Markdown** — Copies raw source to clipboard.

---

{newthought:That covers everything.} Delete this document and start writing, or edit it to experiment with the syntax.
