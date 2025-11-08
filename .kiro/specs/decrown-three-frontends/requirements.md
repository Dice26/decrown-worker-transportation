# Requirements Document - DeCrown Three Frontend Applications

## Introduction

This specification defines the requirements for three distinct web applications for the DeCrown Worker Transportation system:
1. **Public Marketing Website** (www.gowithdecrown.com)
2. **Admin Dashboard** (app.gowithdecrown.com)
3. **Mobile Web Apps** (driver.gowithdecrown.com / worker.gowithdecrown.com)

The UI/UX design will be inspired by the Maxim ride-hailing app, featuring a modern, dark-themed interface with clean navigation and intuitive user flows.

## Glossary

- **DeCrown System**: The complete worker transportation management platform
- **Public Website**: Marketing and informational website for potential customers
- **Admin Dashboard**: Web application for company administrators and dispatchers
- **Mobile Web App**: Progressive web application for drivers and workers
- **Booking Interface**: The ride/transport request system
- **Fleet Management**: System for managing vehicles and drivers
- **Real-time Tracking**: Live GPS location monitoring
- **Dispatcher**: Company administrator who manages transportation assignments

---

## Requirements

### Requirement 1: Public Marketing Website

**User Story:** As a potential customer, I want to learn about DeCrown's services and pricing, so that I can decide if I want to use their transportation services.

#### Acceptance Criteria

1. WHEN a visitor accesses www.gowithdecrown.com, THE Public Website SHALL display a professional homepage with company branding
2. THE Public Website SHALL provide a services overview section describing all transportation offerings
3. THE Public Website SHALL include a contact form that allows visitors to submit inquiries
4. THE Public Website SHALL display pricing information in a clear, transparent format
5. THE Public Website SHALL include an "About Us" section with company information and values
6. THE Public Website SHALL be fully responsive and accessible on mobile, tablet, and desktop devices
7. THE Public Website SHALL load within 2 seconds on standard broadband connections
8. THE Public Website SHALL use DeCrown brand colors (Deep Blue #003366 and Orange #FF6600)

---

### Requirement 2: Country and Language Selection

**User Story:** As a user accessing any DeCrown application, I want to select my country and preferred language, so that I can use the system in my region and language.

#### Acceptance Criteria

1. WHEN a user first accesses the Admin Dashboard or Mobile Web App, THE System SHALL display a country selector screen
2. THE Country Selector SHALL display all supported countries in a two-column grid layout
3. THE Country Selector SHALL provide a language dropdown with all supported languages
4. WHEN a user selects a country, THE System SHALL store the selection in local storage
5. WHEN a user selects a language, THE System SHALL apply the language to all interface text
6. THE Country Selector SHALL use the DeCrown logo with crown and location pin symbols
7. THE Country Selector SHALL have smooth hover effects on country names
8. WHEN a country is selected, THE System SHALL navigate to the main application within 300ms

---

### Requirement 3: Admin Dashboard - Main Interface

**User Story:** As a dispatcher, I want to access a comprehensive dashboard with navigation, so that I can manage all aspects of worker transportation.

#### Acceptance Criteria

1. THE Admin Dashboard SHALL display a dark-themed sidebar with navigation menu
2. THE Sidebar SHALL include menu items for: Book Transport, History, Fleet Management, Analytics, and Profile
3. WHEN a menu item is clicked, THE Dashboard SHALL highlight the active item with the accent color
4. THE Dashboard SHALL display the DeCrown logo in the sidebar header
5. THE Sidebar SHALL include a logout button at the bottom
6. THE Dashboard SHALL use a black (#000000) sidebar with gold accent (#E3BB56) for active items
7. THE Main content area SHALL have a dark gray background (#1F2937)
8. THE Dashboard SHALL be responsive and collapse the sidebar on mobile devices

---

### Requirement 4: Admin Dashboard - Transport Booking Interface

**User Story:** As a dispatcher, I want to book transportation for workers, so that I can assign rides efficiently.

#### Acceptance Criteria

1. THE Booking Interface SHALL display a map view showing available vehicles and workers
2. THE Booking Interface SHALL provide input fields for pickup location and destination
3. WHEN locations are entered, THE System SHALL display available vehicle types with pricing
4. THE Booking Interface SHALL show saved places (Home, Work, etc.) for quick selection
5. WHEN a vehicle type is selected, THE Interface SHALL highlight it with the accent color
6. THE Booking Interface SHALL display vehicle details: name, capacity, ETA, and price
7. WHEN the "Book Transport" button is clicked, THE System SHALL create a transport assignment
8. THE Booking Interface SHALL show a loading state while finding a driver
9. THE Interface SHALL use location pin icons with different colors for pickup (gold) and destination (orange)
10. THE Booking Interface SHALL animate the vehicle selection cards when they appear

---

### Requirement 5: Admin Dashboard - Active Transport Tracking

**User Story:** As a dispatcher, I want to track active transports in real-time, so that I can monitor worker safety and arrival times.

#### Acceptance Criteria

1. WHEN a transport is active, THE Dashboard SHALL display a full-screen tracking view
2. THE Tracking View SHALL show driver information: name, photo, rating, and phone number
3. THE Tracking View SHALL display vehicle details: type, make, model, color, and plate number
4. THE Tracking View SHALL show real-time ETA and distance to destination
5. THE Tracking View SHALL provide action buttons: Call Driver, Cancel Ride, Share Location
6. WHEN the transport is completed, THE System SHALL return to the booking interface
7. THE Tracking View SHALL update location data every 5 seconds
8. THE Tracking View SHALL display a map with the current route

---

### Requirement 6: Admin Dashboard - Transport History

**User Story:** As a dispatcher, I want to view past transports, so that I can review completed assignments and generate reports.

#### Acceptance Criteria

1. THE History Screen SHALL display a list of all completed transports
2. EACH history item SHALL show: date, time, pickup, destination, driver, vehicle type, and price
3. THE History Screen SHALL display driver ratings for each completed transport
4. THE History Screen SHALL allow filtering by date range
5. THE History Screen SHALL allow searching by worker name or location
6. WHEN a history item is clicked, THE System SHALL display detailed transport information
7. THE History Screen SHALL support exporting data to CSV format
8. THE History Screen SHALL paginate results showing 20 items per page

---

### Requirement 7: Admin Dashboard - Fleet Management

**User Story:** As an administrator, I want to manage vehicles and drivers, so that I can maintain an efficient fleet.

#### Acceptance Criteria

1. THE Fleet Management Screen SHALL display a list of all registered vehicles
2. THE Fleet Management Screen SHALL show vehicle status: active, inactive, maintenance
3. THE Fleet Management Screen SHALL allow adding new vehicles with details
4. THE Fleet Management Screen SHALL display driver assignments for each vehicle
5. THE Fleet Management Screen SHALL show vehicle location on a map
6. THE Fleet Management Screen SHALL allow editing vehicle information
7. THE Fleet Management Screen SHALL display vehicle utilization statistics
8. THE Fleet Management Screen SHALL support filtering vehicles by status and type

---

### Requirement 8: Admin Dashboard - Analytics and Reports

**User Story:** As an administrator, I want to view analytics and reports, so that I can make data-driven business decisions.

#### Acceptance Criteria

1. THE Analytics Screen SHALL display key metrics: total transports, revenue, active drivers
2. THE Analytics Screen SHALL show charts for transport trends over time
3. THE Analytics Screen SHALL display driver performance metrics
4. THE Analytics Screen SHALL show peak usage times and routes
5. THE Analytics Screen SHALL allow selecting date ranges for reports
6. THE Analytics Screen SHALL support exporting reports to PDF
7. THE Analytics Screen SHALL display real-time statistics that update every 30 seconds
8. THE Analytics Screen SHALL show cost per transport and profit margins

---

### Requirement 9: Mobile Web App - Driver Interface

**User Story:** As a driver, I want to access a mobile-optimized interface, so that I can accept and complete transport assignments.

#### Acceptance Criteria

1. THE Driver App SHALL display available transport requests on a map
2. THE Driver App SHALL show transport details: pickup, destination, worker name, and payment
3. WHEN a transport request is received, THE App SHALL send a push notification
4. THE Driver App SHALL allow accepting or declining transport requests
5. WHEN a transport is accepted, THE App SHALL provide turn-by-turn navigation
6. THE Driver App SHALL allow marking pickup and drop-off as complete
7. THE Driver App SHALL display earnings for the current day and week
8. THE Driver App SHALL show driver rating and feedback from workers
9. THE Driver App SHALL work offline and sync when connection is restored
10. THE Driver App SHALL use large, touch-friendly buttons for mobile use

---

### Requirement 10: Mobile Web App - Worker Interface

**User Story:** As a worker, I want to check in for my assigned transport, so that I can confirm my pickup and track my ride.

#### Acceptance Criteria

1. THE Worker App SHALL display assigned transport details
2. THE Worker App SHALL show driver information and vehicle details
3. THE Worker App SHALL display real-time location of the assigned vehicle
4. THE Worker App SHALL allow checking in when the vehicle arrives
5. THE Worker App SHALL provide a button to call the driver
6. THE Worker App SHALL show ETA to destination
7. THE Worker App SHALL allow rating the driver after transport completion
8. THE Worker App SHALL display transport history for the worker
9. THE Worker App SHALL send notifications for transport updates
10. THE Worker App SHALL work on iOS and Android mobile browsers

---

### Requirement 11: User Profile Management

**User Story:** As a user of any DeCrown application, I want to manage my profile, so that I can update my information and preferences.

#### Acceptance Criteria

1. THE Profile Screen SHALL display user information: name, email, phone, and photo
2. THE Profile Screen SHALL allow editing personal information
3. THE Profile Screen SHALL display user statistics: total transports, rating, member since
4. THE Profile Screen SHALL allow managing payment methods
5. THE Profile Screen SHALL provide options to change password
6. THE Profile Screen SHALL allow managing notification preferences
7. THE Profile Screen SHALL display saved places and allow adding new ones
8. THE Profile Screen SHALL show account activity log

---

### Requirement 12: Responsive Design and Accessibility

**User Story:** As a user with accessibility needs, I want all applications to be accessible, so that I can use the system regardless of my abilities.

#### Acceptance Criteria

1. ALL applications SHALL meet WCAG 2.1 AA accessibility standards
2. ALL interactive elements SHALL be keyboard navigable
3. ALL images SHALL have descriptive alt text
4. ALL color combinations SHALL meet minimum contrast ratios of 4.5:1
5. ALL forms SHALL have proper labels and error messages
6. THE applications SHALL support screen readers
7. ALL applications SHALL be fully responsive on devices from 320px to 2560px width
8. ALL touch targets SHALL be at least 44x44 pixels on mobile devices

---

### Requirement 13: Performance and Loading States

**User Story:** As a user, I want fast, responsive applications, so that I can complete tasks efficiently.

#### Acceptance Criteria

1. ALL page transitions SHALL complete within 300ms
2. ALL API calls SHALL show loading indicators
3. THE applications SHALL implement skeleton screens for content loading
4. ALL images SHALL use lazy loading
5. THE applications SHALL cache frequently accessed data
6. ALL animations SHALL use CSS transforms for smooth 60fps performance
7. THE applications SHALL work on 3G network connections
8. ALL critical resources SHALL load within 3 seconds

---

### Requirement 14: Branding Consistency

**User Story:** As a DeCrown stakeholder, I want consistent branding across all applications, so that users recognize our brand.

#### Acceptance Criteria

1. ALL applications SHALL use the DeCrown color palette: Deep Blue (#003366) and Orange (#FF6600)
2. ALL applications SHALL display the crown 👑 and location pin 📍 logo
3. ALL applications SHALL use the Inter font family for body text
4. ALL applications SHALL use consistent button styles and hover effects
5. THE Admin Dashboard SHALL use a dark theme with gold accents (#E3BB56)
6. THE Public Website SHALL use a light theme with brand colors
7. ALL applications SHALL use consistent spacing and border radius values
8. ALL applications SHALL display the DeCrown tagline: "Reliable transportation that puts workers first"

---

## Non-Functional Requirements

### Security
- All applications must use HTTPS
- All API calls must include authentication tokens
- All user data must be encrypted in transit and at rest
- All forms must include CSRF protection

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile Safari (iOS 14+)
- Chrome Mobile (Android 10+)

### Technology Stack
- React 18+ for all frontend applications
- Tailwind CSS for styling
- React Router for navigation
- Lucide React for icons
- Shadcn/ui for UI components
- Vite for build tooling

---

## Success Criteria

The three frontend applications will be considered complete when:
1. All 14 requirements are fully implemented
2. All applications pass accessibility audits
3. All applications achieve 90+ Lighthouse scores
4. All applications are deployed to their respective domains
5. All applications successfully integrate with the backend API
6. User acceptance testing is completed with positive feedback
