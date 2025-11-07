# DeCrown Worker Transportation - Typography Guide

## 🔤 Typography System

### Font Stack Hierarchy

#### Primary Font Family
**Inter** - Modern, highly legible sans-serif font optimized for user interfaces
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
```

**Usage**: Body text, UI elements, forms, navigation
**Characteristics**: Excellent readability, wide language support, optimized for screens

#### Display Font Family  
**SF Pro Display** - Apple's system font for headings and large text
```css
font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Usage**: Headings, hero text, marketing materials
**Characteristics**: Strong visual hierarchy, excellent at large sizes

#### Monospace Font Family
**SF Mono** - For code, data, and technical content
```css
font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Courier New', monospace;
```

**Usage**: Code snippets, data tables, technical specifications
**Characteristics**: Fixed-width characters, high legibility for code

## 📏 Type Scale & Hierarchy

### Heading Styles

#### H1 - Page Titles
```css
.heading-1 {
  font-family: var(--font-display);
  font-size: 2.5rem;        /* 40px */
  font-weight: 700;         /* Bold */
  line-height: 1.2;         /* 48px */
  letter-spacing: -0.02em;  /* Tight */
  color: var(--color-primary);
}
```
**Usage**: Main page titles, hero headings
**Example**: "Worker Transportation Dashboard"

#### H2 - Section Headings
```css
.heading-2 {
  font-family: var(--font-display);
  font-size: 2rem;          /* 32px */
  font-weight: 600;         /* Semibold */
  line-height: 1.25;        /* 40px */
  letter-spacing: -0.01em;
  color: var(--color-primary);
}
```
**Usage**: Major section headings, card titles
**Example**: "Active Transportation Routes"

#### H3 - Subsection Headings
```css
.heading-3 {
  font-family: var(--font-display);
  font-size: 1.5rem;        /* 24px */
  font-weight: 600;         /* Semibold */
  line-height: 1.33;        /* 32px */
  color: var(--color-text-primary);
}
```
**Usage**: Subsection headings, modal titles
**Example**: "Worker Details"

#### H4 - Component Headings
```css
.heading-4 {
  font-family: var(--font-primary);
  font-size: 1.25rem;       /* 20px */
  font-weight: 600;         /* Semibold */
  line-height: 1.4;         /* 28px */
  color: var(--color-text-primary);
}
```
**Usage**: Component headings, form section titles
**Example**: "Personal Information"

#### H5 - Small Headings
```css
.heading-5 {
  font-family: var(--font-primary);
  font-size: 1.125rem;      /* 18px */
  font-weight: 600;         /* Semibold */
  line-height: 1.44;        /* 26px */
  color: var(--color-text-primary);
}
```
**Usage**: Small section headings, list headers
**Example**: "Recent Activity"

#### H6 - Micro Headings
```css
.heading-6 {
  font-family: var(--font-primary);
  font-size: 1rem;          /* 16px */
  font-weight: 600;         /* Semibold */
  line-height: 1.5;         /* 24px */
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
}
```
**Usage**: Form labels, table headers, overlines
**Example**: "WORKER STATUS"

### Body Text Styles

#### Large Body Text
```css
.text-large {
  font-family: var(--font-primary);
  font-size: 1.125rem;      /* 18px */
  font-weight: 400;         /* Regular */
  line-height: 1.67;        /* 30px */
  color: var(--color-text-primary);
}
```
**Usage**: Lead paragraphs, important descriptions
**Example**: Introduction text, feature descriptions

#### Regular Body Text
```css
.text-body {
  font-family: var(--font-primary);
  font-size: 1rem;          /* 16px */
  font-weight: 400;         /* Regular */
  line-height: 1.5;         /* 24px */
  color: var(--color-text-primary);
}
```
**Usage**: Standard body text, descriptions, content
**Example**: Form help text, card descriptions

#### Small Body Text
```css
.text-small {
  font-family: var(--font-primary);
  font-size: 0.875rem;      /* 14px */
  font-weight: 400;         /* Regular */
  line-height: 1.43;        /* 20px */
  color: var(--color-text-secondary);
}
```
**Usage**: Secondary information, metadata, captions
**Example**: "Last updated 2 hours ago"

#### Extra Small Text
```css
.text-xs {
  font-family: var(--font-primary);
  font-size: 0.75rem;       /* 12px */
  font-weight: 400;         /* Regular */
  line-height: 1.33;        /* 16px */
  color: var(--color-text-muted);
}
```
**Usage**: Fine print, legal text, micro-copy
**Example**: Copyright notices, terms links

### Specialized Text Styles

#### Button Text
```css
.text-button {
  font-family: var(--font-primary);
  font-size: 1rem;          /* 16px */
  font-weight: 600;         /* Semibold */
  line-height: 1;           /* 16px */
  letter-spacing: 0.01em;
}
```

#### Link Text
```css
.text-link {
  font-family: var(--font-primary);
  color: var(--color-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}

.text-link:hover {
  color: var(--color-primary);
  text-decoration-thickness: 2px;
}
```

#### Code Text
```css
.text-code {
  font-family: var(--font-mono);
  font-size: 0.875rem;      /* 14px */
  font-weight: 400;         /* Regular */
  background: var(--color-bg-medium);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--color-text-primary);
}
```

## 📱 Responsive Typography

### Mobile Adjustments (320px - 767px)
```css
@media (max-width: 767px) {
  .heading-1 { font-size: 2rem; }      /* 32px */
  .heading-2 { font-size: 1.75rem; }   /* 28px */
  .heading-3 { font-size: 1.25rem; }   /* 20px */
  .text-large { font-size: 1rem; }     /* 16px */
}
```

### Tablet Adjustments (768px - 1023px)
```css
@media (min-width: 768px) and (max-width: 1023px) {
  .heading-1 { font-size: 2.25rem; }   /* 36px */
  .heading-2 { font-size: 1.875rem; }  /* 30px */
}
```

## 🎯 Typography Usage Guidelines

### Hierarchy Best Practices

#### Do's ✅
- Use only one H1 per page for the main title
- Follow logical heading order (H1 → H2 → H3)
- Maintain consistent spacing between headings and content
- Use appropriate font weights for visual hierarchy
- Ensure sufficient color contrast for accessibility

#### Don'ts ❌
- Don't skip heading levels (H1 → H3)
- Don't use headings for styling purposes only
- Don't use all caps for long text passages
- Don't use too many different font sizes on one page
- Don't sacrifice readability for visual appeal

### Content-Specific Guidelines

#### Forms
- **Labels**: Use heading-6 style with uppercase
- **Input Text**: Use text-body style
- **Help Text**: Use text-small style
- **Error Messages**: Use text-small with error color

#### Tables
- **Headers**: Use heading-6 style
- **Cell Content**: Use text-body style
- **Metadata**: Use text-small style

#### Cards
- **Card Titles**: Use heading-3 or heading-4
- **Card Content**: Use text-body style
- **Card Metadata**: Use text-small style

#### Navigation
- **Main Nav**: Use text-body with medium weight
- **Breadcrumbs**: Use text-small style
- **Menu Items**: Use text-body style

## ♿ Accessibility Considerations

### WCAG 2.1 AA Compliance

#### Font Size Requirements
- **Minimum**: 16px for body text (meets AA standard)
- **Large Text**: 18px+ or 14px+ bold (meets AAA standard)
- **Touch Targets**: Minimum 44px for interactive text elements

#### Color Contrast
- **Normal Text**: 4.5:1 contrast ratio minimum
- **Large Text**: 3:1 contrast ratio minimum
- **UI Components**: 3:1 contrast ratio for focus indicators

#### Readability Guidelines
- **Line Length**: 45-75 characters per line for optimal reading
- **Line Height**: 1.5x font size minimum for body text
- **Paragraph Spacing**: 1.5x line height between paragraphs

### Screen Reader Considerations
- Use semantic HTML headings (h1, h2, h3, etc.)
- Provide descriptive link text
- Use proper markup for lists and tables
- Include alt text for decorative typography images

## 🔧 Implementation

### CSS Custom Properties
```css
:root {
  /* Font Families */
  --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'SF Mono', 'Monaco', 'Roboto Mono', monospace;
  
  /* Font Sizes */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 2rem;
  --font-size-4xl: 2.5rem;
  
  /* Font Weights */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* Line Heights */
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
}
```

### Utility Classes
```css
/* Font Weight Utilities */
.font-normal { font-weight: var(--font-weight-normal); }
.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }
.font-bold { font-weight: var(--font-weight-bold); }

/* Text Color Utilities */
.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-muted { color: var(--color-text-muted); }
.text-accent { color: var(--color-accent); }

/* Text Alignment Utilities */
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

/* Text Transform Utilities */
.uppercase { text-transform: uppercase; }
.lowercase { text-transform: lowercase; }
.capitalize { text-transform: capitalize; }
```

---

**Typography Consistency**: Consistent typography creates a cohesive brand experience and improves readability across all digital touchpoints.