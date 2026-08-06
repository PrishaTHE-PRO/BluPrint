// Side-effect CSS imports have no type, and Vite doesn't ship one unless
// `vite/client` is referenced. Declaring it here keeps `tsc --noEmit` clean
// without pulling in the full Vite ambient types.
declare module '*.css';

// roughjs ships no types for its bundled ESM entry point.
declare module 'roughjs/bundled/rough.esm.js';
