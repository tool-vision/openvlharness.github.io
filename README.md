# openvlharness.github.io

Project page for **OpenVLHarness: Real-World Visual Agentic Tool-Use with Multimodal Memory**.

Plain static site (no build step): `index.html`, `static/css/style.css`, `static/js/{data,main}.js`, images in `static/images/`.

```bash
python3 -m http.server 8765   # then open http://localhost:8765
```

## Placeholders to fill in
Search `index.html` for `TODO(`:
- `TODO(authors)`: author list and affiliations (also update the BibTeX `author` field)
- `TODO(links)`: Paper / arXiv / Code button URLs (remove `data-placeholder` and the `soon` span once linked)
- `TODO(video)`: replace the placeholder block with a `<video>` or YouTube `<iframe>`
- `TODO(playground)`: placeholder UI only
- `TODO(bibtex)`: final citation entry

All chart numbers live in `static/js/data.js` (transcribed from Tables 1, 2, 6, 8, 12, 20 of the paper).
After editing CSS/JS, bump the `?v=` query in `index.html` so browsers pick up the change.
