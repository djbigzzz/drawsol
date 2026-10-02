/**
 * Webpack loader for the generated IDL (src/idl/drawsol.json, never edited by hand): drops every `docs`
 * field at build time, so the program's developer comments don't ship in the browser bundle. Anchor's
 * Program never reads `docs`; names, types, discriminators and errors are untouched.
 */
module.exports = function stripIdlDocs(source) {
  const strip = (v) =>
    Array.isArray(v)
      ? v.map(strip)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "docs").map(([k, x]) => [k, strip(x)]))
        : v;
  return JSON.stringify(strip(JSON.parse(source)));
};
