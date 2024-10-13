/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        pulseBorder: {
          "0%, 100%": { borderColor: "transparent" }, // Invisible at start/end
          "50%": { borderColor: "#fff" }, // Visible at middle
        },
      },
      animation: {
        pulseBorder: "pulseBorder 1.5s infinite", // Apply the custom animation
      },

      fontFamily: {
        fira: ['"Fira Sans Condensed"', "sans-serif", "Inconsolata"], // Custom font configuration
      },
    },
  },
  plugins: [],
};
