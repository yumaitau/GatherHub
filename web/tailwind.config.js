/** @type {import('tailwindcss').Config} */
// GatherHub design tokens. See ../DESIGN.md for the system spec.
// Colours resolve to `oklch(var(--token) / <alpha-value>)` so alpha utilities
// (bg-primary/20, ring-ring/50) keep working under OKLCH.
const tone = (cssVar) => `oklch(var(${cssVar}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // GatherHub semantic palette (canonical names)
        paper: tone("--paper"),
        surface: {
          DEFAULT: tone("--surface"),
          sunk: tone("--surface-sunk"),
          raised: tone("--surface-raised"),
        },
        ink: {
          DEFAULT: tone("--ink"),
          strong: tone("--ink-strong"),
          soft: tone("--ink-soft"),
          quiet: tone("--ink-quiet"),
        },
        hairline: tone("--border-hairline"),
        "border-strong": tone("--border-strong"),

        // shadcn semantic aliases (existing components keep working)
        background: tone("--paper"),
        foreground: tone("--ink"),
        border: tone("--border-default"),
        input: tone("--border-hairline"),
        ring: tone("--accent-base"),

        primary: {
          DEFAULT: tone("--accent-base"),
          foreground: tone("--accent-ink"),
          hover: tone("--accent-hover"),
          active: tone("--accent-active"),
          wash: tone("--accent-wash"),
        },
        secondary: {
          DEFAULT: tone("--surface-sunk"),
          foreground: tone("--ink"),
        },
        muted: {
          DEFAULT: tone("--surface-sunk"),
          foreground: tone("--ink-quiet"),
        },
        accent: {
          // shadcn convention: "accent" = hover/active tint, not the brand
          // accent. Brand accent lives under `primary`.
          DEFAULT: tone("--surface-sunk"),
          foreground: tone("--ink"),
        },
        popover: {
          DEFAULT: tone("--surface-raised"),
          foreground: tone("--ink"),
        },
        card: {
          DEFAULT: tone("--surface"),
          foreground: tone("--ink"),
        },
        destructive: {
          DEFAULT: tone("--danger"),
          foreground: tone("--accent-ink"),
        },

        // Status palette (semantic; pairs with -wash for chip backgrounds)
        success: {
          DEFAULT: tone("--success"),
          wash: tone("--success-wash"),
        },
        warning: {
          DEFAULT: tone("--warning"),
          wash: tone("--warning-wash"),
        },
        danger: {
          DEFAULT: tone("--danger"),
          wash: tone("--danger-wash"),
        },
        info: {
          DEFAULT: tone("--info"),
          wash: tone("--info-wash"),
        },
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
      },
      fontFamily: {
        sans: [
          "InterVariable",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono Variable",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Tight 1.18 scale, fixed rem. Product register is not fluid.
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
        caption: ["0.75rem", { lineHeight: "1.125rem" }],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        title: ["1.0625rem", { lineHeight: "1.5rem" }],
        headline: ["1.375rem", { lineHeight: "1.75rem" }],
        display: ["1.75rem", { lineHeight: "2.125rem" }],
      },
      fontWeight: {
        regular: "400",
        medium: "500",
        semi: "550",
        strong: "600",
      },
      spacing: {
        4.5: "1.125rem",
        13: "3.25rem",
        15: "3.75rem",
        17: "4.25rem",
        18: "4.5rem",
        sidebar: "240px",
        "sidebar-collapsed": "56px",
      },
      maxWidth: {
        prose: "70ch",
      },
      transitionTimingFunction: {
        out: "var(--ease)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
      boxShadow: {
        popover: "var(--shadow-popover)",
        dialog: "var(--shadow-dialog)",
        focus: "var(--shadow-focus)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "overlay-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 180ms var(--ease)",
        "accordion-up": "accordion-up 180ms var(--ease)",
        "fade-in": "fade-in 120ms var(--ease)",
        "fade-out": "fade-out 120ms var(--ease)",
        "overlay-in": "overlay-in 180ms var(--ease)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
