import type { Config } from "tailwindcss";

/**
 * "Clean commercial", navy and blue — docs/DESIGN.md §2. Closed palette: nothing outside this list.
 * Tailwind supplies the preflight reset and layout utilities only; component styling lives in globals.css.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",
      navy: "#0B1B3F",
      "navy-2": "#3B4A66",
      "navy-3": "#5B6884",
      deep: "#0B1B3F",
      "deep-2": "#102A5C",
      surface: "#F4F7FB",
      "surface-2": "#E8EDF5",
      line: "#E2E8F0",
      "line-2": "#CBD5E1",
      blue: "#1D4ED8",
      "blue-2": "#2563EB",
      "blue-3": "#1E40AF",
      "blue-tint": "#EFF6FF",
      "blue-line": "#BFDBFE",
      sky: "#93C5FD",
      "on-dark-2": "#C9D4EA",
      "on-dark-3": "#9DB0D3",
      "violet-on-dark": "#C4B5FD",
      accent: "#7C3AED",
      "accent-2": "#6D28D9",
      "accent-tint": "#F5F3FF",
      "accent-line": "#DDD6FE",
      highlight: "#9945FF",
      warn: "#B45309",
      "warn-tint": "#FFFBEB",
      danger: "#B91C1C",
      "danger-tint": "#FEF2F2",
    },
    fontFamily: {
      sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
    },
    screens: { md: "761px", lg: "1024px", xl: "1280px" },
    extend: { maxWidth: { page: "1200px" } },
  },
  plugins: [],
};

export default config;
