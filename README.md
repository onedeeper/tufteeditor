# Tufte Editor

A distraction-free Markdown editor with live preview, styled with [Edward Tufte's CSS](https://edwardtufte.github.io/tufte-css/). Get to writing fast, with simple, clean typography.

Documents are plain `.md` files on disk. Images are regular files. No build step, no dependencies, no accounts — just `node server.js` and write.

## Quick start

```
git clone <repo-url> && cd tufte
node server.js
```

Open [http://localhost:3000](http://localhost:3000). Two starter documents are included to get you oriented.

## Features

**Writing**
- Split-pane editor with live Tufte-styled preview
- Sidenotes, margin notes, epigraphs, and new-thought markers
- Image uploads with drag-and-drop management
- BibTeX citations with autocomplete and numbered/APA styles
- Keyboard shortcuts for bold, italic, undo/redo, and save

**Documents**
- Multi-document sidebar with create, rename, and delete
- Auto-save as you type — every document is a `.md` file in `docs/`
- Uploaded images stored as files in `uploads/`

**Export**
- Standalone HTML with Tufte CSS and inlined images
- Print / PDF via browser dialog
- Copy raw Markdown to clipboard

## Project structure

```
tufte/
  server.js       Zero-dependency Node.js server
  index.html      Single-page app shell
  editor.js       App logic, toolbar, sidebar, modals
  parser.js       Markdown-to-HTML with Tufte extensions
  documents.js    Document CRUD (talks to server API)
  images.js       Image store (talks to server API)
  citations.js    BibTeX parsing and citation rendering
  style.css       Editor UI styles
  docs/           Your documents (Markdown files)
  uploads/        Your uploaded images
  test.js         Integration tests
```

## Tufte Markdown syntax

Standard Markdown plus:

| Syntax | Renders as |
|--------|------------|
| `{sn:text}` | Numbered sidenote in the margin |
| `{mn:text}` | Unnumbered margin note |
| `{newthought:words}` | Opening words in small caps |
| `> quote` / `> — Author` | Epigraph with attribution |
| `![caption][50](url)` | Image at 50% width |
| `![caption][100](url){fullwidth}` | Full-width figure |
| `![caption][100](url){margin}` | Margin figure |
| `@citekey` | Inline citation |
| `@url[https://...]` | URL citation |

## Tests

```
node test.js
```

## Requirements

Node.js 18 or later. No `npm install` needed.
