# Tufte Markdown Editor

## Getting Started

{newthought:Welcome to the Tufte Markdown Editor.} This split-pane editor lets you write in an extended Markdown syntax and see a live preview styled with Edward Tufte's elegant CSS.

All five custom tokens are demonstrated below, along with standard Markdown formatting.

## Sidenotes and Margin Notes

Sidenotes are like footnotes, but better — they appear in the margin right next to the relevant text.{sn:This is a sidenote. It appears in the margin and is numbered automatically.} They keep the reader's eye on the page instead of forcing them to jump to the bottom.

Margin notes are similar but unnumbered.{mn:This is a margin note. It uses the ⊕ symbol as a toggle on mobile devices.} Use them for supplementary commentary that doesn't need a numbered reference.

## New Thoughts

{newthought:A new thought} marks the beginning of a new section within a larger discussion. It renders the opening words in small caps, a classic Tufte convention.

## Epigraphs

> The purpose of computing is insight, not numbers.
> — Richard Hamming

Epigraphs set the tone for a section with a quotation and attribution.

## Full-width Figures

Standard images are set within the article width. Use `![caption][size](url)` where size is a percentage:

![A standard figure caption][60](https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/300px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg)

Full-width images stretch across the entire page:

![A full-width figure caption][100](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camille_Pissarro_-_Boulevard_Montmartre_-_Eremitage.jpg/1280px-Camille_Pissarro_-_Boulevard_Montmartre_-_Eremitage.jpg){fullwidth}

## Standard Markdown

You can use all the usual formatting: **bold text**, *italic text*, `inline code`, and [hyperlinks](https://edwardtufte.github.io/tufte-css/).

### Code Blocks

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

### Lists

- First item
- Second item with **bold**
- Third item

1. Ordered first
2. Ordered second
3. Ordered third

---

## Citations

Load a BibTeX file using the **Bib** button in the toolbar, then cite references inline with `@key` syntax. For example, @tufte2001 produces a numbered citation linked to the references section.

You can also cite URLs directly: @url[https://edwardtufte.github.io/tufte-css/] will create a reference entry for that URL.

Unknown keys like @nonexistent will show an error indicator. Toggle between numbered [1] and APA (Author, Year) styles using the toggle in the top bar.

---

{newthought:That covers the basics.} Try editing the text on the left and watch the preview update in real time. Use the toolbar buttons to insert any of the custom tokens.
