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
- `TODO(playground)`: placeholder UI only
- `TODO(bibtex)`: final citation entry

Examples gallery: `static/js/examples.js` + `static/examples/` are generated from the `paper_examples` bundles in mini-vlm-toolkit (branch `bryan/sandbox`). Unzip the bundles into one folder and run `python scripts/build_examples.py <folder>` to regenerate.

All chart numbers live in `static/js/data.js` (transcribed from Tables 1, 2, 6, 8, 12, 20 of the paper).
After editing CSS/JS, bump the `?v=` query in `index.html` so browsers pick up the change.

Live demo: `static/js/demo.js` is the client; its backend lives in [`demo_server/`](demo_server/README.md) (Gradio app on the released `openvlharness` package, GPU tool budget, launch scripts). Append `?demo_server=<url>` to the page URL to test against another backend.

Hugging Face Space: `python scripts/build_space.py <tunnel-url> <out-dir>` builds the Space page from this page's demo section (same markup, `demo.js`, styles and samples) and records the demo server URL that both pages read; upload `<out-dir>` to the Space after each tunnel restart.
