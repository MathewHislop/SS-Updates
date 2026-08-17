import { useState } from "react";

// Site Sparrow brand mark.
//
// The artwork is NOT inlined here — it's loaded from client/public/brand/ so the
// designer can drop in the final files without anyone editing React:
//
//   /brand/site-sparrow-logo.svg  full lockup (bird + wordmark)  — variant="lockup"
//   /brand/site-sparrow-mark.svg  bird only, square              — variant="mark"
//
// Until those files land, this renders a quiet neutral placeholder rather than a
// stand-in drawing. A wrong bird is worse than no bird.
//
// Props:
//   variant   "lockup" (default) | "mark"
//   size      rendered HEIGHT in px. Lockup keeps its natural aspect ratio;
//             mark is square.
//   className passed through to the root element.
//   alt       override the accessible name; pass "" for decorative use next to
//             a visible "Site Sparrow" text label, to avoid double-announcing.

const SOURCES = {
  lockup: "/brand/site-sparrow-logo.svg",
  mark: "/brand/site-sparrow-mark.svg",
};

export default function Logo({
  variant = "lockup",
  size = 24,
  className = "",
  alt,
}) {
  const [failed, setFailed] = useState(false);
  const src = SOURCES[variant] || SOURCES.lockup;
  const label = alt === undefined ? "Site Sparrow" : alt;

  if (failed) {
    // Placeholder: brand-orange rounded square at the mark's footprint. Holds
    // layout so nothing jumps when the real art arrives.
    return (
      <div
        className={`bg-sparrow-500 rounded-[22%] shrink-0 ${className}`}
        style={{ width: size, height: size }}
        role={label ? "img" : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : true}
      />
    );
  }

  return (
    <img
      src={src}
      alt={label}
      onError={() => setFailed(true)}
      className={`shrink-0 ${className}`}
      style={{
        height: size,
        width: variant === "mark" ? size : "auto",
      }}
      draggable={false}
    />
  );
}
