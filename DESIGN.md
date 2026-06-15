---
name: Vizyon Design System
description: A minimalist, clean, light-mode design system with soft editorial typography.
colors:
  primary: "#10b981"
  neutral-bg: "#fcfbfa"
  neutral-surface: "#f4f3ef"
  ink: "#1a1e1b"
  ink-muted: "#6b726c"
  border: "#e5e7eb"
  success: "#10b981"
  warning: "#d97706"
  danger: "#dc2626"
typography:
  display:
    fontFamily: "Outfit, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Outfit, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Outfit, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#059669"
---

# Design System: Vizyon

## 1. Overview

**Creative North Star: "The Editorial Sanctuary"**

Vizyon is built around a clean, structured interface inspired by physical editorial spreads. It rejects dark, low-contrast terminal styles in favor of a soft, warm off-white linen background paired with sharp charcoal typography. High-contrast indicators clearly display user progress without distracting clutter.

The layout utilizes ample negative space, balanced text blocks, and structured lists rather than heavily nested dashboard card frameworks. Every element is designed to prioritize information clarity and ease of daily habit tracking.

**Key Characteristics:**
- **Soft Warmth:** Off-white linen and warm gray base tones replace cold pure-whites and flat grays.
- **Typographic Authority:** Heavy sans-serif display headers paired with balanced, readable body line lengths.
- **Functional Contrast:** Color is used strictly for state indicators (Completed, In Progress, Failed) and focal actions.

## 2. Colors

The color palette is built on high-contrast warm neutrals with distinct status accents.

### Primary
- **Emerald Green** (#10b981): Used for main actions, primary button backgrounds, and indicating completed states.

### Neutral
- **Linen Background** (#fcfbfa): The default application background color, providing a soft warm backdrop.
- **Oatmeal Surface** (#f4f3ef): Used for cards, sidebar lists, and input backgrounds to distinguish them from the main backdrop.
- **Charcoal Ink** (#1a1e1b): The main body text color, ensuring high legibility and contrast.
- **Sage Muted Ink** (#6b726c): Used for secondary labels, hints, and placeholder text.
- **Soft Border** (#e5e7eb): Used for thin grid lines, list dividers, and structural borders.

### Named Rules
**The 10% Accent Rule.** Colored accents (emerald, amber, crimson) must be reserved for state representation and critical buttons. Decorative color splashes are prohibited.

## 3. Typography

**Display Font:** Outfit (with fallback -apple-system, sans-serif)
**Body Font:** Outfit (with fallback -apple-system, sans-serif)
**Label/Mono Font:** Outfit (with fallback monospace)

The typographic system relies on Outfit's variable weights to create visual hierarchy through size and weight rather than decorative dividers.

### Hierarchy
- **Display** (Bold (700), clamp(2rem, 5vw, 3rem), 1.2): Used for page-level headers and screen branding.
- **Headline** (Semi-Bold (600), 1.5rem, 1.3): Used for section titles and card headers.
- **Title** (Medium (500), 1.1rem, 1.4): Used for task names and subheaders.
- **Body** (Regular (400), 1rem, 1.5): Used for descriptions, notes, and general text. Max line length: 70ch.
- **Label** (Semi-Bold (600), 0.8rem, 0.05em letter-spacing): Used for status badges, table headers, and inputs.

### Named Rules
**The Pretty Wrap Rule.** All headings must use `text-wrap: balance` and body copy must use `text-wrap: pretty` to ensure optical alignment and eliminate typographic orphans.

## 4. Elevation

Vizyon uses flat-by-default surfaces. Depth is established through subtle border definitions and warm neutral layering rather than heavy ambient drop shadows.

### Named Rules
**The Flat-By-Default Rule.** Cards, inputs, and sidebars remain flat against their background. Light ambient shadows appear only on interactive hover states or elevated toast notifications.

## 5. Components

### Buttons
- **Shape:** Softly curved corners (6px radius).
- **Primary:** Emerald background with Charcoal/White text and explicit 0.6rem 1.2rem padding.
- **Hover / Focus:** Slight scaling and brightness adjustments on hover. Outlined focus rings in emerald.

### Cards / Containers
- **Corner Style:** Medium curves (10px radius).
- **Background:** Oatmeal surface (#f4f3ef).
- **Shadow Strategy:** Flat by default, subtle shadow on interactive elements only.
- **Border:** Thin soft border (#e5e7eb).

### Inputs / Fields
- **Style:** Flat Oatmeal background with a thin soft border.
- **Focus:** Border shifts to primary emerald with a subtle inner glow.

### Navigation
- **Style:** Navigation buttons utilize soft backgrounds and change text weight/color for active states. Active navigation shows an emerald undertone.

## 6. Do's and Don'ts

### Do:
- **Do** maintain contrast ratios of at least 4.5:1 for body copy against linen and oatmeal backgrounds.
- **Do** keep cards and calendar cells flat at rest.
- **Do** use numerical rankings (`1.`, `2.`, `3.`) in lists rather than gamified medal/cup graphics.

### Don't:
- **Don't** use medal, trophy, or cup symbols anywhere on the dashboard or leaderboard.
- **Don't** use side-stripe borders (colored borders thicker than 1px on one side only) on cards or tasks.
- **Don't** use gradient text overlay layouts.
- **Don't** use low-contrast gray placeholder text that fails contrast accessibility.
