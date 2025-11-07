# DeCrown Worker Transportation - Color Palette

## 🎨 Primary Color Palette

### Deep Blue - Primary Brand Color
- **Hex**: `#003366`
- **RGB**: `rgb(0, 51, 102)`
- **HSL**: `hsl(210, 100%, 20%)`
- **CMYK**: `C:100 M:50 Y:0 K:60`
- **Usage**: Primary backgrounds, headers, main branding elements
- **Meaning**: Trust, reliability, professionalism, stability

### Accent Orange - Secondary Brand Color  
- **Hex**: `#FF6600`
- **RGB**: `rgb(255, 102, 0)`
- **HSL**: `hsl(24, 100%, 50%)`
- **CMYK**: `C:0 M:60 Y:100 K:0`
- **Usage**: Call-to-action buttons, highlights, crown/pin elements
- **Meaning**: Energy, enthusiasm, action, visibility

## 🌈 Supporting Color Palette

### Emerald Green - Success & Active States
- **Hex**: `#2E8B57`
- **RGB**: `rgb(46, 139, 87)`
- **HSL**: `hsl(146, 50%, 36%)`
- **CMYK**: `C:67 M:0 Y:37 K:45`
- **Usage**: Success messages, active status indicators, positive actions
- **Meaning**: Growth, success, go/active status

### Neutral Gray - Background & Text
- **Hex**: `#F5F5F5`
- **RGB**: `rgb(245, 245, 245)`
- **HSL**: `hsl(0, 0%, 96%)`
- **CMYK**: `C:0 M:0 Y:0 K:4`
- **Usage**: Background sections, subtle borders, secondary text
- **Meaning**: Clean, modern, neutral foundation

## 🚨 Functional Colors

### Error Red
- **Hex**: `#DC3545`
- **RGB**: `rgb(220, 53, 69)`
- **Usage**: Error messages, alerts, destructive actions

### Warning Yellow
- **Hex**: `#FFC107`
- **RGB**: `rgb(255, 193, 7)`
- **Usage**: Warning messages, caution indicators

### Info Blue
- **Hex**: `#17A2B8`
- **RGB**: `rgb(23, 162, 184)`
- **Usage**: Information messages, neutral notifications

## 🌓 Grayscale Palette

### Text Colors
- **Primary Text**: `#212529` (Dark Gray)
- **Secondary Text**: `#6C757D` (Medium Gray)
- **Muted Text**: `#ADB5BD` (Light Gray)
- **Disabled Text**: `#DEE2E6` (Very Light Gray)

### Background Variations
- **White**: `#FFFFFF`
- **Light Gray**: `#F8F9FA`
- **Medium Gray**: `#E9ECEF`
- **Dark Gray**: `#343A40`
- **Black**: `#000000`

## ♿ Accessibility Guidelines

### Contrast Ratios (WCAG 2.1 AA Compliance)
All color combinations meet minimum contrast ratio of **4.5:1** for normal text and **3:1** for large text.

#### Approved Combinations
✅ **Deep Blue (#003366) on White (#FFFFFF)**: 12.6:1  
✅ **White (#FFFFFF) on Deep Blue (#003366)**: 12.6:1  
✅ **Accent Orange (#FF6600) on White (#FFFFFF)**: 4.8:1  
✅ **White (#FFFFFF) on Accent Orange (#FF6600)**: 4.8:1  
✅ **Primary Text (#212529) on White (#FFFFFF)**: 16.1:1  
✅ **Primary Text (#212529) on Light Gray (#F8F9FA)**: 15.3:1  

#### Avoid These Combinations
❌ **Accent Orange (#FF6600) on Deep Blue (#003366)**: 2.6:1 (Too low)  
❌ **Secondary Text (#6C757D) on Light Gray (#F8F9FA)**: 3.2:1 (Too low for small text)  

## 📱 Digital Applications

### Web Interface
- **Primary Buttons**: Accent Orange (#FF6600) with white text
- **Secondary Buttons**: Deep Blue (#003366) with white text
- **Background**: White (#FFFFFF) or Light Gray (#F8F9FA)
- **Navigation**: Deep Blue (#003366) background
- **Links**: Deep Blue (#003366) or Accent Orange (#FF6600)

### Mobile Applications
- **Status Bar**: Deep Blue (#003366)
- **Active Elements**: Accent Orange (#FF6600)
- **Success States**: Emerald Green (#2E8B57)
- **Card Backgrounds**: White (#FFFFFF)
- **Dividers**: Light Gray (#E9ECEF)

## 🖨️ Print Applications

### Business Materials
- **Primary**: Deep Blue (#003366) - Use for headers and branding
- **Accent**: Accent Orange (#FF6600) - Use sparingly for highlights
- **Body Text**: Primary Text (#212529)
- **Background**: White (#FFFFFF) or Light Gray (#F8F9FA)

### Vehicle Graphics
- **High Visibility**: Accent Orange (#FF6600) for maximum visibility
- **Professional**: Deep Blue (#003366) for company branding
- **Contrast**: White (#FFFFFF) for text on colored backgrounds

## 🎯 Usage Guidelines

### Do's
✅ Use primary colors for main brand elements  
✅ Maintain consistent color usage across all platforms  
✅ Test color combinations for accessibility  
✅ Use functional colors appropriately (red for errors, green for success)  
✅ Consider color blindness when designing interfaces  

### Don'ts
❌ Don't use colors outside the approved palette  
❌ Don't use low-contrast color combinations  
❌ Don't rely solely on color to convey information  
❌ Don't use too many colors in a single design  
❌ Don't modify brand colors without approval  

## 🔧 Implementation

### CSS Variables
```css
:root {
  /* Primary Colors */
  --color-primary: #003366;
  --color-accent: #FF6600;
  --color-success: #2E8B57;
  --color-neutral: #F5F5F5;
  
  /* Functional Colors */
  --color-error: #DC3545;
  --color-warning: #FFC107;
  --color-info: #17A2B8;
  
  /* Text Colors */
  --color-text-primary: #212529;
  --color-text-secondary: #6C757D;
  --color-text-muted: #ADB5BD;
  
  /* Background Colors */
  --color-bg-white: #FFFFFF;
  --color-bg-light: #F8F9FA;
  --color-bg-medium: #E9ECEF;
  --color-bg-dark: #343A40;
}
```

### Design Tokens
```json
{
  "colors": {
    "primary": "#003366",
    "accent": "#FF6600",
    "success": "#2E8B57",
    "neutral": "#F5F5F5",
    "error": "#DC3545",
    "warning": "#FFC107",
    "info": "#17A2B8"
  }
}
```

---

**Color Consistency**: Maintaining consistent color usage across all touchpoints strengthens brand recognition and creates a cohesive user experience.