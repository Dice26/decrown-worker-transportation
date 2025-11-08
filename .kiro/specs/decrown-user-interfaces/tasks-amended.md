# Implementation Plan - Amend Existing User Interfaces

## Task List (Amending Existing Code)

- [-] 1. Add Worker Registration Flow to Existing WorkerApp


- [ ] 1.1 Create registration pages
  - Add Welcome/Landing page before WorkerApp
  - Create PersonalInfoForm.jsx component
  - Create KYCUpload.jsx component
  - Create FaceVerification.jsx component
  - Create AccountPending.jsx component
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 1.2 Build registration routing
  - Update App.jsx to add registration routes
  - Create /register route
  - Create /register/kyc route
  - Create /register/face-verify route
  - Create /register/pending route
  - Add protected route for WorkerApp (only after approval)
  - _Requirements: 1.1_

- [ ] 1.3 Integrate KYC verification
  - Add file upload component for ID documents
  - Implement image preview and compression
  - Create API call to /api/auth/kyc-verify
  - Add progress indicator
  - _Requirements: 1.3_

- [ ] 1.4 Implement face verification
  - Add camera access component
  - Implement face capture with WebRTC
  - Add liveness detection prompts (blink, turn)
  - Create API call to /api/auth/face-verify
  - Show verification result
  - _Requirements: 1.4_

- [ ] 2. Add Location Picker to WorkerApp
- [ ] 2.1 Create ride booking page
  - Create new BookRide.jsx component
  - Add route /worker/book-ride
  - Replace static ride display with booking interface
  - _Requirements: 2.1, 2.2_

- [ ] 2.2 Integrate interactive map
  - Install Google Maps or Mapbox library
  - Create MapPicker.jsx component
  - Add current location detection
  - Implement draggable pin for pickup
  - Add reverse geocoding (coordinates → address)
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 2.3 Build address input components
  - Create PickupLocationInput.jsx with map
  - Create DestinationInput.jsx with autocomplete
  - Add address validation
  - Implement Google Places Autocomplete
  - _Requirements: 2.3, 2.4_

- [ ] 2.4 Create ride confirmation flow
  - Build RideDetails.jsx component showing fare/time
  - Add ride type selector (Standard/Premium)
  - Create confirmation dialog
  - Implement POST /api/worker/book-ride API call
  - Show booking success/error states
  - _Requirements: 2.5, 2.6_

- [ ] 3. Enhance Existing WorkerApp Dashboard
- [ ] 3.1 Update active ride tracking
  - Replace mock map with real Google Maps
  - Add WebSocket connection for real-time updates
  - Implement live driver location markers
  - Update ETA dynamically
  - _Requirements: 5.2, 5.3_

- [ ] 3.2 Add profile management
  - Create Profile.jsx page
  - Add route /worker/profile
  - Build profile edit form
  - Implement PUT /api/worker/profile
  - Add password change functionality
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 3.3 Improve ride history
  - Create RideHistory.jsx page
  - Add route /worker/history
  - Implement pagination
  - Add ride details modal
  - Connect to GET /api/worker/rides
  - _Requirements: 5.1_

- [ ] 4. Separate Driver Interface Completely
- [ ] 4.1 Move DriverApp to separate project
  - Create new folder: decrown-frontends/driver-interface/
  - Copy DriverApp.jsx as base
  - Set up separate Vite config
  - Configure separate Tailwind
  - Create separate package.json
  - _Requirements: 3.1_

- [ ] 4.2 Add driver authentication
  - Create DriverLogin.jsx page
  - Build login form with driver ID/password
  - Implement POST /api/driver/login
  - Add biometric login option
  - Create session management
  - _Requirements: 6.1, 6.2_

- [ ] 4.3 Enhance available rides dashboard
  - Update existing ride request card
  - Add auto-refresh for new rides
  - Implement GET /api/driver/available-rides
  - Add ride filtering
  - Show today's stats (rides, earnings)
  - _Requirements: 3.2, 3.3_

- [ ] 4.4 Improve navigation interface
  - Replace mock map with Google Maps Navigation
  - Add turn-by-turn directions
  - Implement route visualization
  - Add ETA calculation
  - Create rerouting logic
  - _Requirements: 3.5, 3.6_

- [ ] 4.5 Build ride status management
  - Add status buttons (Arrived, Picked Up, Complete)
  - Implement PUT /api/driver/ride/:id/status
  - Add status transition validation
  - Create ride completion screen
  - _Requirements: 3.7_

- [ ] 4.6 Add driver profile
  - Create DriverProfile.jsx page
  - Add availability toggle (Online/Offline)
  - Show earnings display
  - Display ratings and reviews
  - Implement GET /api/driver/profile
  - _Requirements: 6.3, 6.4_

- [ ] 5. Update Backend API
- [ ] 5.1 Add registration endpoints
  - Create POST /api/auth/register
  - Implement POST /api/auth/kyc-verify
  - Create POST /api/auth/face-verify
  - Add account approval workflow
  - _Requirements: 1.1, 1.3, 1.4_

- [ ] 5.2 Add worker booking endpoints
  - Update POST /api/worker/book-ride with location data
  - Add geocoding service integration
  - Implement fare calculation
  - Create ride matching algorithm
  - _Requirements: 2.6_

- [ ] 5.3 Create driver endpoints
  - Build GET /api/driver/available-rides
  - Implement POST /api/driver/accept-ride
  - Create PUT /api/driver/ride/:id/status
  - Add POST /api/driver/location for tracking
  - _Requirements: 3.2, 3.4, 3.7_

- [ ] 6. Integrate Third-Party Services
- [ ] 6.1 Set up KYC service
  - Choose provider (Onfido, Jumio, or Stripe Identity)
  - Configure API keys
  - Implement document verification
  - Add webhook handlers
  - _Requirements: 1.3_

- [ ] 6.2 Integrate face verification
  - Choose provider (AWS Rekognition or Face++)
  - Configure API keys
  - Implement face comparison
  - Add liveness detection
  - Encrypt face data storage
  - _Requirements: 1.4, 7.2_

- [ ] 6.3 Configure maps service
  - Set up Google Maps API key
  - Enable required APIs (Maps, Places, Geocoding, Directions)
  - Implement geocoding service
  - Add place autocomplete
  - Create distance/duration calculations
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 7. Add Real-Time Features
- [ ] 7.1 Set up WebSocket server
  - Configure Socket.io on backend
  - Implement connection authentication
  - Create ride-specific rooms
  - Add reconnection logic
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 7.2 Implement location broadcasting
  - Add driver location updates (every 5 seconds)
  - Create worker location subscription
  - Update map markers in real-time
  - Add location update throttling
  - _Requirements: 5.2, 9.3_

- [ ] 7.3 Build notification system
  - Create ride status notifications
  - Add driver assignment notifications
  - Implement ETA update notifications
  - Add browser push notifications
  - _Requirements: 9.1, 9.2_

- [ ] 8. Build Docker Images
- [ ] 8.1 Update Userfront Docker
  - Update decrown-frontends/mobile-apps/Dockerfile
  - Build new image with registration flow
  - Test locally
  - Push dice26/decrown-userfront:latest
  - _Requirements: All_

- [ ] 8.2 Create Driverfront Docker
  - Create decrown-frontends/driver-interface/Dockerfile
  - Configure Nginx
  - Build image
  - Test locally
  - Push dice26/decrown-driverfront:latest
  - _Requirements: All_

- [ ] 8.3 Update Backend Docker
  - Update Dockerfile.direct with new endpoints
  - Rebuild dice26/decrown-backend:latest
  - Test all endpoints
  - Push to Docker Hub
  - _Requirements: All_

- [ ] 9. Deploy to Render
- [ ] 9.1 Update Userfront service
  - Trigger redeploy of decrown-userfront
  - Add environment variables (GOOGLE_MAPS_KEY, API_URL)
  - Verify registration flow works
  - Test ride booking
  - _Requirements: All_

- [ ] 9.2 Deploy Driverfront service
  - Create new service: decrown-driverfront
  - Use image: dice26/decrown-driverfront:latest
  - Add environment variables
  - Verify driver login works
  - Test ride acceptance
  - _Requirements: All_

- [ ] 9.3 Update Backend service
  - Trigger redeploy of decrown-worker-transportation
  - Add new environment variables (KYC_API_KEY, FACE_API_KEY, MAPS_API_KEY)
  - Verify new endpoints work
  - Test WebSocket connections
  - _Requirements: All_

- [ ]* 10. Testing
- [ ]* 10.1 Test registration flow
  - Test personal info form validation
  - Test KYC document upload
  - Test face verification
  - Test account approval
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ]* 10.2 Test ride booking
  - Test location picker
  - Test address autocomplete
  - Test ride confirmation
  - Test booking API
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ]* 10.3 Test driver flow
  - Test driver login
  - Test ride acceptance
  - Test navigation
  - Test status updates
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ]* 10.4 Test real-time features
  - Test location tracking
  - Test status notifications
  - Test WebSocket reconnection
  - Test concurrent users
  - _Requirements: 9.1, 9.2, 9.3_
