// Empty browser stub for the optional "canvas" package required lazily by
// pdfjs-dist's Node rendering path, which text extraction never executes.
// Aliased in next.config.ts so client bundles never include native code.
module.exports = {};
