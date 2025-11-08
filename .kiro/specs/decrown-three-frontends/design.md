# Design Document - DeCrown Three Frontend Applications

## Overview

This design document outlines the architecture and implementation for three web applications inspired by the Maxim ride-hailing app UI/UX:

1. **Public Marketing Website** (www.gowithdecrown.com)
2. **Admin Dashboard** (app.gowithdecrown.com)  
3. **Mobile Web Apps** (driver/worker.gowithdecrown.com)

## Architecture

### Technology Stack
- **Framework**: React 18+ with Vite
- **Styling**: Tailwind CSS + Shadcn/ui
- **Icons**: Lucide React
- **Routing**: React Router 6+
- **State**: React Context API
- **Build**: Docker containers
- **Deploy**: Render.com

### Project Structure
```
decrown-frontends/
├── public-website/          # Marketing site
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── assets/
│   ├── Dockerfile
│   └── package.json
├── admin-dashboard/         # Admin interface
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── data/
│   ├── Dockerfile
│   └── package.json
└── mobile-apps/            # Driver & Worker apps
    ├── src/
    │   ├── driver/
    │   ├── worker/
    │   └── shared/
    ├── Dockerfile
    └── package.json
```

## Application 1: Public Marketing Website

### Design System
- **Colors**: Deep Blue (#003366), Orange (#FF6600)
- **Theme**: Light, professional
- **Layout**: Traditional marketing site

### Key Pages
1. Homepage with hero section
2. Services overview
3. Pricing page
4. Contact form
5. About us

### Components
- Header with navigation
- Hero section with CTA buttons
- Feature cards grid
- Contact form
- Footer with links

## Application 2: Admin Dashboard

### Design System (Maxim-inspired)
- **Colors**: Black (#000000), Gold (#E3BB56), Dark Gray (#1F2937)
- **Theme**: Dark mode
- **Layout**: Sidebar + main content

### Key Screens
1. **Country Selector** - Initial screen with language selection
2. **Booking Screen** - Map + booking panel
3. **Active Ride** - Real-time tracking
4. **History** - Past transports
5. **Fleet Management** - Vehicle/driver management
6. **Analytics** - Reports and metrics
7. **Profile** - User settings

### Core Components

**Sidebar Navigation:**
```javascript
- Logo (top)
- Menu items with icons
- Active state highlighting
- Logout button (bottom)
```

**Booking Interface:**
```javascript
- Map view (left side)
- Booking panel (right side, 480px)
- Location inputs with icons
- Saved places
- Vehicle selection cards
- Book button
```

**Active Ride Tracking:**
```javascript
- Full-screen map
- Driver info card
- Vehicle details
- ETA and distance
- Action buttons (call, cancel, share)
```

## Application 3: Mobile Web Apps

### Driver App
- **Theme**: Dark with gold accents
- **Layout**: Mobile-first, bottom navigation
- **Key Features**:
  - Request cards (slide-up)
  - Accept/decline buttons
  - Navigation integration
  - Earnings tracker

### Worker App
- **Theme**: Light with orange accents
- **Layout**: Card-based interface
- **Key Features**:
  - Upcoming rides
  - Driver tracking
  - Check-in functionality
  - Ride history

## Data Models

### Mock Data Structure
```javascript
// Countries
countries = [{ id, name, code }]

// Languages  
languages = [{ id, name, code }]

// Vehicle Types
vehicleTypes = [{
  id, name, icon, price, eta, 
  capacity, description
}]

// Transport Request
transportRequest = {
  id, status, worker, driver, vehicle,
  pickup, destination, price, distance, eta
}
```

## Component Library

### Shared Components
1. **Button** - Primary, secondary, ghost variants
2. **Input** - With icon support
3. **Card** - Container component
4. **Select** - Dropdown selector
5. **Badge** - Status indicators
6. **Modal** - Overlay dialogs

### Custom Components
1. **Logo** - Crown + pin branding
2. **MapView** - Map integration
3. **LocationInput** - Address autocomplete
4. **VehicleCard** - Selectable vehicle option
5. **DriverCard** - Driver information display
6. **RideCard** - Transport summary

## Styling Guidelines

### Tailwind Configuration
```javascript
theme: {
  colors: {
    'deep-blue': '#003366',
    'orange': '#FF6600',
    'gold': '#E3BB56',
    'dark-gray': '#1F2937'
  }
}
```

### Animation Classes
- `animate-slide-up` - Bottom sheet animation
- `animate-fade-in` - Fade in effect
- `hover:shadow-lg` - Elevation on hover
- `transition-all duration-200` - Smooth transitions

## Error Handling

### Error States
1. Network errors - Retry button
2. Form validation - Inline messages
3. Empty states - Helpful illustrations
4. Loading states - Skeleton screens

## Testing Strategy

1. **Unit Tests** - Component logic
2. **Integration Tests** - User flows
3. **E2E Tests** - Critical paths
4. **Accessibility Tests** - WCAG compliance

## Deployment

### Docker Images
- `dice26/decrown-public:latest`
- `dice26/decrown-admin:latest`
- `dice26/decrown-mobile:latest`

### Domains
- www.gowithdecrown.com
- app.gowithdecrown.com
- driver.gowithdecrown.com
- worker.gowithdecrown.com

## Performance Targets

- First Contentful Paint < 1.5s
- Time to Interactive < 3s
- Lighthouse Score > 90
- Bundle size < 500KB per app

## Security

- HTTPS only
- JWT authentication
- CSRF protection
- Input sanitization
- Rate limiting

## Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- Color contrast ratios
- Touch target sizes (44x44px minimum)

---

This design provides the blueprint for building three professional, user-friendly applications that work together as a cohesive ecosystem.
