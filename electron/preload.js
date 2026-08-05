// Intentionally minimal: the renderer talks to the embedded server over plain
// HTTP (fetch to the same origin, same as the plain web/dev build), so there's
// no need to bridge any Node/Electron APIs into the page. Kept as a real file
// (rather than omitted) so contextIsolation + a preload script stay wired in
// from day one if a real need for one shows up later.
