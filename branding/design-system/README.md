# DeCrown Worker Transportation - Design System

## 🎨 Design System Overview

The DeCrown design system provides a comprehensive set of guidelines, components, and patterns to ensure consistent user experiences across all digital and physical touchpoints.

## 📐 Layout & Grid System

### Grid Structure
- **Desktop**: 12-column grid with 24px gutters
- **Tablet**: 8-column grid with 20px gutters  
- **Mobile**: 4-column grid with 16px gutters
- **Max Width**: 1200px container with auto margins

### Spacing Scale
```
4px   - xs (micro spacing)
8px   - sm (small spacing)
16px  - md (medium spacing - base unit)
24px  - lg (large spacing)
32px  - xl (extra large spacing)
48px  - 2xl (section spacing)
64px  - 3xl (major section spacing)
```

### Breakpoints
- **Mobile**: 320px - 767px
- **Tablet**: 768px - 1023px
- **Desktop**: 1024px - 1439px
- **Large Desktop**: 1440px+

## 🔤 Typography System

### Font Families
- **Primary**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Secondary**: "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif
- **Monospace**: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace

### Type Scale
```css
/* Headings */
--font-size-h1: 2.5rem;    /* 40px */
--font-size-h2: 2rem;      /* 32px */
--font-size-h3: 1.5rem;    /* 24px */
--font-size-h4: 1.25rem;   /* 20px */
--font-size-h5: 1.125rem;  /* 18px */
--font-size-h6: 1rem;      /* 16px */

/* Body Text */
--font-size-lg: 1.125rem;  /* 18px */
--font-size-base: 1rem;    /* 16px */
--font-size-sm: 0.875rem;  /* 14px */
--font-size-xs: 0.75rem;   /* 12px */
```

### Font Weights
- **Light**: 300
- **Regular**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700

### Line Heights
- **Tight**: 1.25 (for headings)
- **Normal**: 1.5 (for body text)
- **Relaxed**: 1.75 (for large text blocks)

## 🎯 Component Library

### Buttons

#### Primary Button
```css
.btn-primary {
  background: var(--color-accent);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #E55A00;
  transform: translateY(-1px);
}
```

#### Secondary Button
```css
.btn-secondary {
  background: transparent;
  color: var(--color-primary);
  padding: 12px 24px;
  border: 2px solid var(--color-primary);
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--color-primary);
  color: white;
}
```

### Form Elements

#### Input Fields
```css
.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #E9ECEF;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(255, 102, 0, 0.1);
}
```

#### Labels
```css
.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--color-text-primary);
}
```

### Cards
```css
.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid #E9ECEF;
  transition: box-shadow 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}
```

## 🎨 Visual Elements

### Shadows
```css
/* Elevation Levels */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.15);
--shadow-xl: 0 8px 32px rgba(0, 0, 0, 0.2);
```

### Border Radius
```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;
```

### Transitions
```css
--transition-fast: 0.15s ease;
--transition-normal: 0.2s ease;
--transition-slow: 0.3s ease;
```

## 📱 Mobile-First Approach

### Responsive Design Principles
1. **Mobile First**: Design for mobile, enhance for larger screens
2. **Touch Targets**: Minimum 44px for interactive elements
3. **Readable Text**: Minimum 16px font size on mobile
4. **Thumb-Friendly**: Place important actions within thumb reach
5. **Performance**: Optimize images and minimize load times

### Mobile Specific Guidelines
- **Navigation**: Use hamburger menu or bottom tab bar
- **Forms**: Stack form fields vertically with adequate spacing
- **Buttons**: Full-width buttons on mobile for easy tapping
- **Content**: Prioritize essential content, hide secondary information
- **Images**: Use responsive images with appropriate aspect ratios

## 🎯 Icon System

### Icon Style
- **Style**: Outline icons with 2px stroke width
- **Size**: 16px, 20px, 24px, 32px standard sizes
- **Grid**: Align to 24px grid system
- **Consistency**: Use same visual weight across all icons

### Common Icons
- **Navigation**: Home, Menu, Back, Close
- **Actions**: Add, Edit, Delete, Save, Share
- **Status**: Success (checkmark), Error (X), Warning (!)
- **Transport**: Car, Bus, Location, Route, Time

## 🌈 Accessibility Standards

### WCAG 2.1 AA Compliance
- **Color Contrast**: Minimum 4.5:1 for normal text, 3:1 for large text
- **Focus Indicators**: Visible focus states for all interactive elements
- **Alt Text**: Descriptive alt text for all images
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Readers**: Semantic HTML and ARIA labels

### Inclusive Design
- **Color Blindness**: Don't rely solely on color to convey information
- **Motor Impairments**: Large touch targets (minimum 44px)
- **Cognitive Load**: Clear, simple language and intuitive navigation
- **Multiple Languages**: Support for RTL languages and text expansion

## 🎨 Animation Guidelines

### Micro-Interactions
- **Hover States**: Subtle color changes and elevation
- **Button Clicks**: Brief scale or color feedback
- **Form Validation**: Smooth error message appearance
- **Loading States**: Skeleton screens or progress indicators

### Page Transitions
- **Duration**: 200-300ms for most transitions
- **Easing**: Use ease-out for entering, ease-in for exiting
- **Purpose**: Provide context and maintain spatial relationships
- **Performance**: Use transform and opacity for smooth animations

## 📊 Data Visualization

### Charts and Graphs
- **Colors**: Use brand colors with sufficient contrast
- **Accessibility**: Include patterns or textures for color-blind users
- **Labels**: Clear, descriptive labels and legends
- **Responsive**: Adapt to different screen sizes

### Status Indicators
- **Success**: Green with checkmark icon
- **Warning**: Yellow with warning icon
- **Error**: Red with error icon
- **Info**: Blue with info icon
- **Neutral**: Gray for inactive states

## 🔧 Implementation Guidelines

### CSS Architecture
```css
/* Use BEM methodology for class naming */
.component {}
.component__element {}
.component--modifier {}

/* Use CSS custom properties for theming */
:root {
  --color-primary: #003366;
  --spacing-md: 16px;
  --radius-md: 8px;
}
```

### Component Structure
```html
<!-- Consistent HTML structure -->
<div class="card">
  <div class="card__header">
    <h3 class="card__title">Title</h3>
  </div>
  <div class="card__content">
    <p class="card__text">Content</p>
  </div>
  <div class="card__actions">
    <button class="btn btn--primary">Action</button>
  </div>
</div>
```

## 📚 Resources

### Design Tools
- **Figma**: Component library and design tokens
- **Sketch**: Alternative design tool with symbols
- **Adobe XD**: Prototyping and design specifications

### Development Tools
- **Storybook**: Component documentation and testing
- **CSS Variables**: For consistent theming
- **Design Tokens**: JSON format for cross-platform consistency

### Documentation
- **Component Guidelines**: Detailed usage instructions
- **Code Examples**: Copy-paste ready implementations
- **Accessibility Checklist**: Ensure compliance standards
- **Brand Guidelines**: Logo, color, and typography rules

---

**Design System Maintenance**: Regular updates ensure the design system evolves with user needs and technology changes while maintaining consistency across all touchpoints.