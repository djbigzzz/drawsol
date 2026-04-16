import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0B0A08",
        surface: "#15140F",
        elevated: "#1E1C16",
        primary: "#D4691F",
        gold: "#E2A336",
        success: "#2FB88A",
        text: "#E8E6E1",
        secondary: "#918E86",
        tertiary: "#5C5A54",
      },
      fontFamily: {
        display: ["Clash Display", "system-ui", "sans-serif"],
        sans: ["Satoshi", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
