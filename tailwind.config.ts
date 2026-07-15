import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Arial is the body face; it's a system font so nothing is downloaded.
        sans: ["Arial", "Helvetica", "sans-serif"],
        display: ['"Domaine Display"', "Georgia", '"Times New Roman"', "serif"],
        mono: ['"Atlas Typewriter"', "ui-monospace", "Menlo", "monospace"],
      },
      colors: {
        // Warm paper-toned neutrals, replacing Tailwind's cool slate.
        canvas: "#f2f0eb", // page background
        paper: "#ffffff", // cards / header
        ink: {
          DEFAULT: "#1a1a1a", // headings, KPI values
          muted: "#6b6862", // body copy
          faint: "#9c9890", // captions, source lines
        },
        rule: "#e5e2db", // hairline borders
        accent: {
          DEFAULT: "#d9503f", // coral -- section labels, active states
          soft: "#f7ede9",
        },
        positive: "#2f7a55",
        negative: "#c0442f",
      },
    },
  },
  plugins: [],
};

export default config;
