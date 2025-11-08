# Design Document - DeCrown User Interfaces

## Overview

This design document outlines the architecture and implementation details for DeCrown's user-facing interfaces: Worker Interface (with registration and KYC), Driver Interface (standalone), and their integration with the backend API.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    DeCrown System                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Worker Interface (Userfront)                                │
│  ├─ Registration Flow                                        │
│  │  ├─ Personal Information Form                            │
│  │  ├─ KYC Verification                                     │
│  │  └─ Face Verification                                    │
│  ├─ Ride Booking                                             │
│  │  ├─ Interactive Map (Pickup Location)                    │
│  │  ├─ Address Input (Destination)                          │
│  │  └─ Ride Confirmation                                    │
│  └─ Dashboard                                                │
│     ├─ Active Ride Tracking                                 │
│     ├─ Ride History                                          │
│     └─ Profile Management                                    │
│                                                               │
│  Driver Interface (Driverfront) - STANDALONE                │
│  ├─ Driver Login                                             │
│  ├─ Available Rides Dashboard                               │
│  ├─ Ride Acceptance                                          │
│  ├─ Navigation                                               │
│  └─ Ride Status Management                                   │
│                                                               │
│  Backend API                                                 │
│  ├─ /api/auth/register                                      │
│  ├─ /api/auth/kyc-verify                                    │
│  ├─ /api/auth/face-verify                                   │
│  ├─ /api/worker/* (Worker endpoints)                        │
│  ├─ /api/driver/* (Driver endpoints - NEW)                  │
│  └─ /api/rides/* (Ride management)                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Worker Interface (Userfront)

#### 1.1 Registration Flow

**Pages:**
1. **Welcome Screen**
   - App introduction
   - "Get Started" button
   - "Already have an account?" login link

2. **Personal Information Form**
   - Full Name (required)
   - Email Address (required, validated)
   - Phone Number (required, validated)
   - Date of Birth (required)
   - Company/Employer (required)
   - Work Site Location (dropdown)
   - Password (required, min 8 chars, complexity rules)
   - Terms & Conditions checkbox

3. **KYC Verification Screen**
   - Document upload (ID, Driver's License, or Passport)
   - Document type selection
   - Photo capture (front and back)
   - Real-time validation
   - Progress indicator

4. **Face Verification Screen**
   - Camera access request
   - Live face capture
   - Liveness detection (blink, turn head)
   - Face matching with ID photo
   - Verification result

5. **Approval Pending Screen**
   - "Your account is under review" message
   - Estimated approval time
   - Contact support option

6. **Account Approved Screen**
   - Welcome message
   - "Start Booking Rides" button
   - Quick tutorial option

#### 1.2 Ride Booking Interface

**Main Booking Screen:**
```
┌─────────────────────────────────────────┐
│  [≡] DeCrown        [Profile Icon]      │
├─────────────────────────────────────────┤
│                                          │
│  Where are you going?                   │
│  ┌────────────────────────────────────┐ │
│  │ 📍 Pickup Location                 │ │
│  │ [Current Location ▼]               │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │ 📌 Destination                     │ │
│  │ [Enter destination address...]     │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │                                    │ │
│  │        [Interactive Map]           │ │
│  │                                    │ │
│  │    📍 (Draggable Pin)              │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  [Book Ride] ────────────────────────   │
│                                          │
└─────────────────────────────────────────┘
```

**Features:**
- Interactive map (Google Maps / Mapbox)
- Current location detection (GPS)
- Draggable pin for precise pickup location
- Address autocomplete for destination
- Reverse geocoding (coordinates → address)
- Estimated fare display
- Estimated time display
- Ride type selection (Standard, Premium)

#### 1.3 Active Ride Tracking

**Tracking Screen:**
```
┌─────────────────────────────────────────┐
│  [←] Ride in Progress                   │
├─────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐ │
│  │                                    │ │
│  │    [Live Map with Driver]          │ │
│  │                                    │ │
│  │    🚗 Driver Location              │ │
│  │    📍 Your Location                │ │
│  │    📌 Destination                  │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Driver: John Smith ⭐ 4.8              │
│  Vehicle: Toyota Camry (ABC-1234)       │
│                                          │
│  Status: En Route to Pickup             │
│  ETA: 5 minutes                          │
│                                          │
│  [📞 Call Driver] [💬 Message]          │
│  [❌ Cancel Ride]                        │
│                                          │
└─────────────────────────────────────────┘
```

#### 1.4 Dashboard

**Main Dashboard:**
- Active ride card (if any)
- Quick book button
- Upcoming scheduled rides
- Recent rides (last 5)
- Profile summary
- Notifications badge

### 2. Driver Interface (Driverfront) - STANDALONE

#### 2.1 Driver Login

**Login Screen:**
- Driver ID / Email input
- Password input
- "Remember me" checkbox
- Forgot password link
- Biometric login option (fingerprint/face)

#### 2.2 Available Rides Dashboard

**Main Screen:**
```
┌─────────────────────────────────────────┐
│  [≡] DeCrown Driver  [Status: Online ▼] │
├─────────────────────────────────────────┤
│                                          │
│  Available Rides (3)                     │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 📍 123 Main St → 456 Work Ave     │ │
│  │ Worker: Jane Doe                   │ │
│  │ Distance: 5.2 mi | Fare: $15.50   │ │
│  │ Pickup in: 10 min                  │ │
│  │                                    │ │
│  │ [Accept Ride] ──────────────────   │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 📍 789 Oak St → 321 Site Blvd     │ │
│  │ Worker: John Smith                 │ │
│  │ Distance: 3.8 mi | Fare: $12.00   │ │
│  │ Pickup in: 15 min                  │ │
│  │                                    │ │
│  │ [Accept Ride] ──────────────────   │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Today's Stats:                          │
│  Rides: 8 | Earnings: $124.00           │
│                                          │
└─────────────────────────────────────────┘
```

#### 2.3 Active Ride Screen

**Navigation View:**
```
┌─────────────────────────────────────────┐
│  [←] Active Ride                        │
├─────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐ │
│  │                                    │ │
│  │    [Navigation Map]                │ │
│  │                                    │ │
│  │    🚗 You                          │ │
│  │    📍 Pickup (2.3 mi)              │ │
│  │    ─────────────→                  │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Turn right on Main St in 500 ft        │
│  ETA: 5 minutes                          │
│                                          │
│  Worker: Jane Doe                        │
│  Pickup: 123 Main St                     │
│  Destination: 456 Work Ave               │
│                                          │
│  [📞 Call Worker] [🧭 Navigate]          │
│  [✓ Arrived at Pickup]                   │
│                                          │
└─────────────────────────────────────────┘
```

**Status Flow:**
1. En Route to Pickup → [Arrived at Pickup]
2. Waiting for Worker → [Worker Picked Up]
3. En Route to Destination → [Arrived at Destination]
4. Ride Complete → [Complete Ride]

### 3. Backend API Endpoints

#### 3.1 Authentication & Registration

```javascript
// Worker Registration
POST /api/auth/register
Body: {
  fullName: string,
  email: string,
  phone: string,
  dateOfBirth: string,
  company: string,
  workSite: string,
  password: string
}
Response: {
  userId: string,
  status: "pending_kyc",
  message: "Please complete KYC verification"
}

// KYC Document Upload
POST /api/auth/kyc-verify
Headers: { Authorization: "Bearer token" }
Body: FormData {
  documentType: "id" | "license" | "passport",
  frontImage: File,
  backImage: File
}
Response: {
  kycStatus: "pending" | "approved" | "rejected",
  verificationId: string
}

// Face Verification
POST /api/auth/face-verify
Headers: { Authorization: "Bearer token" }
Body: {
  faceImage: base64String,
  livenessData: object
}
Response: {
  faceVerified: boolean,
  matchScore: number,
  accountStatus: "approved" | "pending_review"
}
```

#### 3.2 Worker Endpoints

```javascript
// Get Worker Profile
GET /api/worker/profile
Response: {
  userId: string,
  fullName: string,
  email: string,
  phone: string,
  company: string,
  workSite: string,
  accountStatus: string,
  kycVerified: boolean,
  faceVerified: boolean
}

// Book Ride
POST /api/worker/book-ride
Body: {
  pickupLocation: {
    lat: number,
    lng: number,
    address: string
  },
  destination: {
    lat: number,
    lng: number,
    address: string
  },
  scheduledTime: string (ISO 8601),
  rideType: "standard" | "premium"
}
Response: {
  rideId: string,
  status: "pending",
  estimatedFare: number,
  estimatedDuration: number
}

// Get Active Ride
GET /api/worker/active-ride
Response: {
  rideId: string,
  status: string,
  driver: {
    name: string,
    phone: string,
    vehicle: string,
    rating: number,
    currentLocation: { lat, lng }
  },
  pickup: { lat, lng, address },
  destination: { lat, lng, address },
  eta: number
}

// Get Ride History
GET /api/worker/rides?page=1&limit=10
Response: {
  rides: [{
    rideId: string,
    date: string,
    pickup: string,
    destination: string,
    fare: number,
    status: string
  }],
  total: number,
  page: number
}
```

#### 3.3 Driver Endpoints (NEW)

```javascript
// Driver Login
POST /api/driver/login
Body: {
  driverId: string,
  password: string
}
Response: {
  token: string,
  driver: {
    id: string,
    name: string,
    vehicle: string,
    rating: number
  }
}

// Get Available Rides
GET /api/driver/available-rides
Headers: { Authorization: "Bearer token" }
Response: {
  rides: [{
    rideId: string,
    worker: { name, phone },
    pickup: { lat, lng, address },
    destination: { lat, lng, address },
    estimatedFare: number,
    distance: number,
    pickupTime: string
  }]
}

// Accept Ride
POST /api/driver/accept-ride
Body: {
  rideId: string
}
Response: {
  success: boolean,
  ride: {
    rideId: string,
    worker: object,
    pickup: object,
    destination: object
  }
}

// Update Ride Status
PUT /api/driver/ride/:rideId/status
Body: {
  status: "arrived_pickup" | "worker_picked_up" | "arrived_destination" | "completed",
  currentLocation: { lat, lng }
}
Response: {
  success: boolean,
  ride: object
}

// Update Driver Location
POST /api/driver/location
Body: {
  lat: number,
  lng: number,
  heading: number
}
Response: {
  success: boolean
}
```

## Data Models

### Worker Model
```typescript
interface Worker {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  company: string;
  workSite: string;
  accountStatus: 'pending_kyc' | 'pending_approval' | 'approved' | 'suspended';
  kycVerified: boolean;
  faceVerified: boolean;
  kycDocuments: {
    type: string;
    frontImageUrl: string;
    backImageUrl: string;
    verificationStatus: string;
  };
  faceData: {
    faceImageUrl: string;
    verificationScore: number;
    verifiedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### Driver Model
```typescript
interface Driver {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    color: string;
  };
  status: 'online' | 'offline' | 'on_ride';
  rating: number;
  totalRides: number;
  currentLocation: {
    lat: number;
    lng: number;
    heading: number;
    updatedAt: Date;
  };
  createdAt: Date;
}
```

### Ride Model
```typescript
interface Ride {
  id: string;
  workerId: string;
  driverId: string | null;
  status: 'pending' | 'accepted' | 'en_route_pickup' | 'arrived_pickup' | 
          'worker_picked_up' | 'en_route_destination' | 'arrived_destination' | 
          'completed' | 'cancelled';
  pickup: {
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  scheduledTime: Date;
  rideType: 'standard' | 'premium';
  estimatedFare: number;
  actualFare: number | null;
  estimatedDuration: number;
  actualDuration: number | null;
  distance: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
```

## Technology Stack

### Worker Interface (Userfront)
- **Framework**: React 18
- **Styling**: Tailwind CSS
- **Maps**: Google Maps API / Mapbox GL JS
- **State Management**: React Context + Hooks
- **HTTP Client**: Axios
- **Real-time**: Socket.io-client
- **Face Verification**: WebRTC + Face-api.js
- **Build Tool**: Vite
- **Deployment**: Docker + Nginx

### Driver Interface (Driverfront)
- **Framework**: React 18
- **Styling**: Tailwind CSS
- **Maps**: Google Maps API (with Navigation)
- **State Management**: React Context + Hooks
- **HTTP Client**: Axios
- **Real-time**: Socket.io-client
- **Geolocation**: Browser Geolocation API
- **Build Tool**: Vite
- **Deployment**: Docker + Nginx

### Backend API
- **Runtime**: Node.js 18
- **Framework**: Express.js
- **Database**: PostgreSQL (with PostGIS for location data)
- **Cache**: Redis
- **Real-time**: Socket.io
- **Authentication**: JWT
- **File Storage**: AWS S3 / Cloudinary (for KYC documents)
- **Face Verification**: AWS Rekognition / Face++ API
- **Maps**: Google Maps API (Geocoding, Distance Matrix)

## Security Considerations

### Authentication
- JWT tokens with 15-minute expiration
- Refresh tokens with 7-day expiration
- Secure HTTP-only cookies
- CSRF protection

### KYC Data Protection
- Encrypted storage (AES-256)
- Separate secure storage for biometric data
- GDPR compliance
- Data retention policies (delete after verification)

### API Security
- Rate limiting (100 requests/minute per user)
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration

### Real-time Communication
- WebSocket authentication
- Encrypted connections (WSS)
- Message validation

## Error Handling

### Registration Errors
- Invalid email format
- Duplicate email/phone
- Weak password
- Missing required fields
- KYC document upload failures
- Face verification failures

### Booking Errors
- Invalid location coordinates
- Destination too far
- No available drivers
- Insufficient balance
- Duplicate booking

### Driver Errors
- Ride already accepted
- Invalid ride status transition
- Location update failures
- Network connectivity issues

## Testing Strategy

### Unit Tests
- Component rendering
- Form validation
- API client functions
- Utility functions

### Integration Tests
- Registration flow end-to-end
- Ride booking flow
- Driver acceptance flow
- Real-time updates

### E2E Tests
- Complete worker registration
- Book and complete a ride
- Driver accepts and completes ride
- Error scenarios

### Performance Tests
- Map rendering performance
- Real-time update latency
- API response times
- Concurrent user load

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Render Deployment                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Worker Interface (decrown-userfront.onrender.com)          │
│  └─ Docker: dice26/decrown-userfront:latest                 │
│                                                               │
│  Driver Interface (decrown-driverfront.onrender.com)        │
│  └─ Docker: dice26/decrown-driverfront:latest               │
│                                                               │
│  Backend API (decrown-worker-transportation.onrender.com)   │
│  └─ Docker: dice26/decrown-backend:latest                   │
│                                                               │
│  PostgreSQL Database (Render Managed)                        │
│  Redis Cache (Render Managed)                                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Worker Registration
- Registration form
- KYC document upload
- Face verification
- Account approval workflow

### Phase 2: Ride Booking
- Interactive map integration
- Location selection
- Address input and validation
- Ride booking API

### Phase 3: Driver Interface
- Driver login
- Available rides dashboard
- Ride acceptance
- Navigation integration

### Phase 4: Real-time Features
- Live location tracking
- Status updates
- Push notifications
- WebSocket integration

### Phase 5: Polish & Testing
- Error handling
- Loading states
- Offline support
- Comprehensive testing
