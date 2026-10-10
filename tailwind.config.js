/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        paddock: {
          bg: "#0b0b0d",
          surface: "#17171a",
          border: "#2a2a2f",
          text: "#f2f0ee",
          muted: "#9a928d",
          orange: "#e8582f",
          peach: "#ffb4a0",
          cyan: "#5cc8ff",
        },
      },
    },
  },
  plugins: [],
}
