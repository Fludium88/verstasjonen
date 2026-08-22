import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        met: {
          dark: "#0b1329",
          card: "#111c3a",
          cardHover: "#16244a",
          border: "#1e2f5d",
          muted: "#8899b7",
          cyan: "#38bdf8",
          blue: "#2563eb",
          amber: "#f59e0b",
          green: "#10b981",
          red: "#ef4444",
          purple: "#8b5cf6"
        }
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "monospace"],
        sans: ["var(--font-geist-sans)", "sans-serif"],
      }
    },
  },
  plugins: [],
};
export default config;
