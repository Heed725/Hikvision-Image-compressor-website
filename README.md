# Hikvision Photo Prep

A responsive, browser-only face photo cropper and JPEG compressor. Hosted on [GitHub Pages](https://Heed725.github.io/Hikvision-Image-compressor-website/).

## Use

1. Add JPG, PNG or WebP photos, or try the built-in sample.
2. Select a photo. Drag it to position the face, adjust zoom and brightness, and choose the required output dimensions. The guide is only an aid; it is not a face detector.
3. Download one JPEG or download the entire batch as a ZIP. Extract ZIP files before uploading individual pictures.

Default output is 640 × 800. JPEGs are strictly below 195,000 bytes, leaving room below a 200 KB limit. Images below 60 KB are flagged because some models impose a minimum. Larger output presets may help. Original-proportions mode preserves the full composition and limits the longest side to 1,600 pixels. No AI enhancement or facial recognition is performed; enlarging a small photo does not add real detail.

Each photo retains its own crop, size and brightness. Up to 100 files can be added, with a 20 MB / 50 megapixel limit per photo. Photos stay in browser memory and disappear on reload. Nothing is uploaded or saved to a server; there are no analytics, accounts or external runtime dependencies. The repository contains no user photos.

## Device compatibility

Photo requirements differ by model and upload method. File size alone does not guarantee successful enrolment. Use a well-lit, straight-on image with one visible face, and consult your model’s manual for dimensions, clothing, eyewear, naming and import rules. The site cannot connect to or verify recognition on a terminal.

Official references: [photo upload](https://enpinfo.hikvision.com/unzip/20201102205526_84041_doc/GUID-80ABCE8D-68A1-4E6A-8547-32364ABFD437.html), [terminal import requirements](https://enpinfo.hikvision.com/hkwsen/unzip/20231116152157_30379_doc/GUID-1C74D204-C508-44DA-B19A-411FF9D7C050.html).

## Development and publishing

Buildless HTML, CSS and JavaScript modules. Serve the repository root using any static HTTP server. Run `node --test tests/core.test.mjs` for ZIP integrity, crop bounds and compression-limit checks.

GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`. The `.nojekyll` file allows the static files to be served directly. Later commits to `main` publish automatically.

Built by [Heed725](https://github.com/Heed725). Independent project; not affiliated with Hikvision.
