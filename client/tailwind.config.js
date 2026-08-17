/** @type {import('tailwindcss').Config} */

// Brand colours are defined once, as RGB channel triplets, in src/index.css.
// This file only maps them onto Tailwind utility names — to change a brand
// colour, edit src/index.css, not this file.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const ramp = (prefix) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      token(`${prefix}-${step}`),
    ])
  );

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Site Sparrow orange — brand identity + interactive accent.
        sparrow: ramp("sparrow"),
        // Warm near-black neutral ramp — text, chrome, surfaces.
        ink: ramp("ink"),
      },
    },
  },
  plugins: [],
};
