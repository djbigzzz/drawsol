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
        bg: "#080B12",
        surface: "#111827",
        elevated: "#1A2133",
        hover: "#212A40",
        primary: "#7C3AED",
        "primary-light": "#8B5CF6",
        gold: "#F5B731",
        "gold-bright": "#FBBF24",
        success: "#10B981",
        "sol-green": "#14F195",
        hot: "#EC4899",
        text: "#F1F5F9",
        secondary: "#94A3B8",
        tertiary: "#64748B",
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
