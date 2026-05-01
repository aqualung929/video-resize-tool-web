// sw.js
// This service worker injects Cross-Origin-Opener-Policy and
// Cross-Origin-Embedder-Policy headers on all responses.
// These headers are required for SharedArrayBuffer, which FFmpeg.wasm needs.
// GitHub Pages does not support custom server headers, so the SW is the workaround.
