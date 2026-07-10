import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e3ecff",
          500: "#3457d5",
          600: "#2a46b0",
          700: "#22398c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
