# Third-party notices

Every library the extension uses ships inside the package. Nothing is fetched from a CDN and
run: the one thing that does come over the network at run time is the OCR language model,
which is data the recognizer reads, and it is listed at the bottom with the rest.

This file exists so that the large minified files in the package can be identified rather
than guessed at. The biggest of them, `src/lib/tesseract-core.wasm.js`, is 4.6 MB and is
mostly one base64 string — that is an Emscripten `SINGLE_FILE` build, which is how a
WebAssembly binary is carried inside a `.js` file, and it is the published build of a public
package, not code written to be unreadable.

The `sha256` of each file is given so anyone can check it against the published package
rather than take this file's word for it.

## Bundled at build time

These are imported as modules; the bundler emits them into `assets/` with the rest of the
application code.

| Library | Version | Licence | Source in this repository | sha256 |
|:---|:---|:---|:---|:---|
| [tesseract.js](https://github.com/naptha/tesseract.js) | 5.0.5 | Apache-2.0 | `src/lib/tesseract.min.js` | `c46216a3d1a41a945834c4c901c41fc241434e6e1d2429601acd6ac8a53bd93f` |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 | `src/lib/jsQR.js` | `7989567794db4d9ecea21aac1feb9da2f4f5176a43bf1159ab81605190365041` |
| [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) | 1.x (UMD build; the file carries no version string) | MIT | `src/lib/qr-code-styling.js` | `761aa6e4c90f316d5ca6748be2d4c24efc454e69161929cf0d2b0d3c58f3866a` |
| [marked](https://github.com/markedjs/marked) | 15.0.12 | MIT | `src/lib/marked.js` | `6f5c3edbb710c13b414ac3ce980100bc1715a437291e82f83dc628620e8ba24f` |
| [marked](https://github.com/markedjs/marked) | 18.0.5 | MIT | npm dependency | — |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.8 | MPL-2.0 OR Apache-2.0 | npm dependency | — |
| [Svelte](https://github.com/sveltejs/svelte) | 5.x runtime | MIT | npm dependency | — |

`src/lib/chart.local.js` is not third-party. It is this project's own charting code, written
to the shape of the Chart.js API so the dashboards could drop the dependency.

## Copied into the package verbatim

The OCR engine loads these two **by URL** rather than by import, so they have to exist at
that exact path inside the package. They are handed to `Tesseract.createWorker` as
`workerPath` and `corePath`. Left unset, the library's own defaults point at jsDelivr, and an
extension that fetches its WebAssembly core over the network is running remotely hosted code —
which is why these are set, and why these two files are here.

| Library | Version | Licence | Path in the package | sha256 |
|:---|:---|:---|:---|:---|
| [tesseract.js](https://github.com/naptha/tesseract.js) worker | 5.0.5, **one line patched** — see below | Apache-2.0 | `src/lib/worker.min.js` | `191928775b9db091a097e1086644a7ad675701dabe7fdc4114e07e0b23998b5e` |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | the 5.x core that tesseract.js 5.0.5 loads; the file carries no version string of its own | Apache-2.0 | `src/lib/tesseract-core.wasm.js` | `c5d306536d8bcb19c5846a762525afe209021147fa4e93d18fa55f63f19c70af` |

### The one patch, and why

`src/lib/worker.min.js` is the published build with a single line changed, stated here rather
than left to be found by whoever next refreshes the file from npm.

Webpack's `globalThis` polyfill ends in a fallback that builds a function out of a string.
That branch is unreachable in any browser that runs Manifest V3 — the enclosing expression
returns `globalThis` before reaching it — but a string-to-function construct anywhere in a
package is what the Chrome Web Store's remote-code rule is about, and what a static scan
flags. It now reads `return this || globalThis;`.

Behaviour is unchanged. On a hypothetical engine with no `globalThis`, the bare reference
throws a `ReferenceError` that the surrounding `try` already catches, and the `typeof window`
fallback below it still runs.

Because of that line, the `sha256` above does not match the file as published on npm. The
unpatched file hashes to
`06eb0a87ade7fe1652fc4d890041abbf2b8deb7bf1674722dac5a34409c0bad9`, and the patch is a
one-line diff against it. A header comment at the top of the file says the same thing, so it
is visible to somebody reading the file rather than only to somebody reading this one.

## The one thing fetched at run time

Reading text out of a screenshot needs a trained language model, one file per language. The
extension asks for Spanish and English, so the first OCR run fetches `spa.traineddata.gz` and
`eng.traineddata.gz` from `cdn.jsdelivr.net` and the browser caches them; later runs fetch
nothing.

It is data the recognizer reads, not code it runs — the engine that reads it, the WebAssembly
core above, ships inside the package. Nothing about the user, the page or the image is sent
with the request: it asks for a file by name.
