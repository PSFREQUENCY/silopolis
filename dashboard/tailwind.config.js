/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "'Courier New'", "monospace"],
      },
      colors: {
        vault: {
          bg:     "#050402",
          card:   "#080604",
          border: "#2A1E0A",
          gold:   "#DAA520",
          ancient:"#B8860B",
          dim:    "#4A3A22",
        },
      },
      animation: {
        "ping-slow": "ping 3s cubic-bezier(0,0,0.2,1) infinite",
        "marquee":   "marquee 28s linear infinite",
      },
      keyframes: {
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};
