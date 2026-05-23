const path = require("path")

module.exports = {
  darkMode: "class",
  presets: [require("@medusajs/ui-preset")],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/modules/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@medusajs/ui/dist/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        rexton: ["var(--font-rexton)"],
        "maison-neue": ["var(--font-maison-neue)"],
        "maison-neue-mono": ["var(--font-maison-neue-mono)"],
      },
      spacing: {
        4.5: "18px",
      },
      transitionProperty: {
        width: "width margin",
        height: "height",
        bg: "background-color",
        display: "display opacity",
        visibility: "visibility",
        padding: "padding-top padding-right padding-bottom padding-left",
      },
      colors: {
        grey: {
          0: "#FFFFFF",
          5: "#F9FAFB",
          10: "#F3F4F6",
          20: "#E5E7EB",
          30: "#D1D5DB",
          40: "#9CA3AF",
          50: "#6B7280",
          60: "#4B5563",
          70: "#374151",
          80: "#1F2937",
          90: "#111827",
        },
        Black: "#001B23",
        Charcoal: "#001B23",
        Smoke: "#686674",
        Pewter: "#B1A6A2",
        SilverPlate: "#D3D5D3",
        Scroll: "#F0F0ED",
        IsraelBlue: "#2D479D",
        RichGold: "#6F4F24",
        Gold: "#E5B565",
        CopperBrown: "#735048",
        Teal: "#83C2C7",
        Crimson: "#951D20",
        VibrantRed: "#9E2A1D",
        White: "#fff",
      },
      borderRadius: {
        none: "0px",
        soft: "2px",
        base: "4px",
        rounded: "8px",
        large: "16px",
        circle: "9999px",
      },
      maxWidth: {
        "7xl": "1340px",
        "8xl": "100rem",
      },
      screens: {
        "2xsmall": "320px",
        xsmall: "512px",
        small: "1024px",
        medium: "1280px",
        large: "1440px",
        xlarge: "1680px",
        "2xlarge": "1920px",
      },
      fontSize: {
        "3xl": "2rem",
        h1: ["80px", { lineHeight: "110%" }],
        "h1-mobile": ["36px", { lineHeight: "110%" }],
        h2: ["60px", { lineHeight: "110%" }],
        "h2-mobile": ["30px", { lineHeight: "110%" }],
        h3: ["42px", { lineHeight: "115%" }],
        h4: ["22px", { lineHeight: "125%" }],
        h5: ["14px", { lineHeight: "130%" }],
        h6: ["11px", { lineHeight: "150%" }],
        "p-sm": ["14px", { lineHeight: "140%" }],
        "p-sm-bold": ["15px", { lineHeight: "140%" }],
        "p-md": ["16px", { lineHeight: "140%" }],
        "p-md-bold": ["16px", { lineHeight: "140%" }],
        "p-lg": ["19px", { lineHeight: "140%" }],
        "p-lg-bold": ["19px", { lineHeight: "140%" }],
        a: ["16px", { lineHeight: "140%" }],
        "p-ex-sm-mono": ["12px", { lineHeight: "18px" }],
        "p-ex-sm-mono-bold": ["12px", { lineHeight: "18px" }],
        "p-sm-mono": ["14px", { lineHeight: "140%" }],
        "p-md-mono": ["16px", { lineHeight: "140%" }],
        "header-lg": ["150px", { lineHeight: "110%" }],
        quote: ["72px", { lineHeight: "115%" }],
        "quote-mobile": ["36px", { lineHeight: "115%" }],
      },
      keyframes: {
        ring: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "fade-in-right": {
          "0%": {
            opacity: "0",
            transform: "translateX(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "fade-in-top": {
          "0%": {
            opacity: "0",
            transform: "translateY(-10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-out-top": {
          "0%": {
            height: "100%",
          },
          "99%": {
            height: "0",
          },
          "100%": {
            visibility: "hidden",
          },
        },
        "accordion-slide-up": {
          "0%": {
            height: "var(--radix-accordion-content-height)",
            opacity: "1",
          },
          "100%": {
            height: "0",
            opacity: "0",
          },
        },
        "accordion-slide-down": {
          "0%": {
            "min-height": "0",
            "max-height": "0",
            opacity: "0",
          },
          "100%": {
            "min-height": "var(--radix-accordion-content-height)",
            "max-height": "none",
            opacity: "1",
          },
        },
        enter: {
          "0%": { transform: "scale(0.9)", opacity: 0 },
          "100%": { transform: "scale(1)", opacity: 1 },
        },
        leave: {
          "0%": { transform: "scale(1)", opacity: 1 },
          "100%": { transform: "scale(0.9)", opacity: 0 },
        },
        "slide-in": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        ring: "ring 2.2s cubic-bezier(0.5, 0, 0.5, 1) infinite",
        "fade-in-right":
          "fade-in-right 0.3s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "fade-in-top": "fade-in-top 0.2s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "fade-out-top":
          "fade-out-top 0.2s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "accordion-open":
          "accordion-slide-down 300ms cubic-bezier(0.87, 0, 0.13, 1) forwards",
        "accordion-close":
          "accordion-slide-up 300ms cubic-bezier(0.87, 0, 0.13, 1) forwards",
        enter: "enter 200ms ease-out",
        "slide-in": "slide-in 1.2s cubic-bezier(.41,.73,.51,1.02)",
        leave: "leave 150ms ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-radix")()],
}
