import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors for Property 10
        'p10-dark': '#0a1132',
        'p10-blue': '#1a2942',
        'p10-blue-dark': '#0d1a2d',
        'p10-blue-light': '#2d5a7b',
        'p10-border': '#3a4a6a',
        'p10-text-muted': '#8b9dc3',
        'p10-accent': '#4a9eff',
        'p10-cyan': '#00d4ff',
        'p10-cyan-dark': '#00879f',
      },
      fontFamily: {
        poppins: ['var(--font-poppins)', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
};

export default config;
