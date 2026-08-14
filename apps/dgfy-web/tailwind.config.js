/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,jsx,ts,tsx}",
    "./Pages/**/*.{js,jsx}",
    // Shared trunk extracted to packages/web-core (issue #322); its src/ and Components/
    // carry the bulk of the class names previously scanned from this app's own src/ and
    // Components/. See docs/architecture/frontend-split-sync.md.
    "../../packages/web-core/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/web-core/Components/**/*.{js,jsx}",
    "../../packages/web-core/Pages/**/*.{js,jsx}",
    // The store app's DGFY auth/business pages are ports of Pages/DgfyAuthPage.jsx,
    // Pages/DgfyResetPasswordPage.jsx and Pages/RegisterCompany.jsx, so they need the
    // same utilities generated. Deliberately scoped to those two directories rather
    // than all of ./apps/**: other app files (Components/store/InfoGrid.jsx,
    // MenuSection.jsx, the mode hero components, discoveryResultsRenderer.jsx) carry
    // Tailwind class names that have never been generated, and widening the glob
    // would restyle those live surfaces as a side effect.
    "./apps/store/src/auth/**/*.{js,jsx}",
    "./apps/store/src/business/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pos-slide-in": {
          "0%": { transform: "translateX(16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pos-slide-in": "pos-slide-in 10ms ease-out",
      },
    },
  },
  plugins: [],
}
