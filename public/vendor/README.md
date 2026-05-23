# Vendored Browser Libraries

## tokenizer.js

Bundled from `js-tiktoken@1.0.21` using only the `cl100k_base` rank data.

The app loads this file directly in the browser, so token counting works offline
without calling an API or requiring SillyTavern to be running.

`js-tiktoken` is MIT licensed.

## markdown.js

Bundled from `marked@12.0.2`.

The fullscreen editor uses this file to render local Markdown previews offline.

`marked` is MIT licensed.
