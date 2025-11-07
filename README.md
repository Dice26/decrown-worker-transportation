# DeCrown Workers Transportation

A comprehensive worker transportation management system with real-time tracking, automated billing, and payment processing.

## Features

### Core Transportation Management
- **Trip Planning & Optimization**: Intelligent route optimization for worker pickups
- **Real-time Tracking**: GPS-based location tracking with privacy controls
- **Driver Management**: Driver assignment, capacity management, and performance tracking
- **Incident Reporting**: Real-time incident reporting and delay management

### Automated Billing & Payments
- **Usage-based Billing**: Automatic calculation based on rides, distance, and time
- **Invoice Generation**: Monthly automated invoice generation with detailed line items
- **Payment Processing**: Integrated payment processing with Stripe/PayMongo
- **Payment Retry Logic**: Exponential backoff retry mechanism for failed payments
- **Dunning Management**: Automated overdue notice system with escalation

### Security & Compliance
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Granular permissions for different user types
- **Data Privacy**: GDPR-compliant location data handling with consent management
- **Audit Logging**: Comprehensive audit trail for all system activities

### Real-time Features
- **WebSocket Support**: Real-time location updates and notifications
- **Live Trip Tracking**: Real-time trip status updates
- **Instant Notifications**: Push notifications for trip assignments and updates

## Technology Stack

- **Backend**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with TimescaleDB for time-series data
- **Cache**: Redis for session management and caching
- **Payment Processing**: Stripe/PayMongo integration
- **Real-time**: WebSocket connections
- **Testing**: Vitest with comprehensive test coverage
- **Documentation**: OpenAPI/Swagger specifications

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Redis (v6 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd decrown-workers-transportation
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
# Create databases
createdb decrown_transport
createdb decrown_transport_test

# Run migrations
npm run migrate
```

5. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### Testing

Run the test suite:
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/test/services/paymentService.test.ts
```

### Building for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

## API Documentation

### Authentication Endpoints
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/logout` - User logout

### Transportation Endpoints
- `POST /api/v1/transport/trips` - Create new trip
- `GET /api/v1/transport/trips/:id` - Get trip details
- `PUT /api/v1/transport/trips/:id/status` - Update trip status
- `POST /api/v1/transport/incidents` - Report incident

### Payment Endpoints
- `GET /api/v1/payment/usage/:userId/:year/:month` - Get usage data
- `POST /api/v1/payment/invoices/generate` - Generate invoice
- `GET /api/v1/payment/invoices/:id` - Get invoice details
- `POST /api/v1/payment/process` - Process payment
- `POST /api/v1/payment/billing-cycle` - Run billing cycle

### Location Endpoints
- `POST /api/v1/location/update` - Update user location
- `GET /api/v1/location/history/:userId` - Get location history
- `POST /api/v1/location/consent` - Update location consent

## Database Schema

### Core Tables
- `users` - User accounts and profiles
- `devices` - Registered user devices
- `trips` - Transportation trips
- `trip_stops` - Individual trip stops
- `location_points` - GPS location data (TimescaleDB)

### Payment Tables
- `invoices` - Monthly billing invoices
- `payment_attempts` - Payment processing attempts
- `usage_ledgers` - Monthly usage aggregation
- `dunning_notices` - Overdue payment notices

### Security Tables
- `audit_events` - System audit log
- `device_security_events` - Device security events

## Configuration

### Environment Variables

Key configuration options:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_NAME=decrown_transport
DB_USER=postgres
DB_PASSWORD=your_password

# Payment Processing
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
BASE_FARE_PER_RIDE=50.00
DISTANCE_FEE_PER_KM=15.00
TIME_FEE_PER_MINUTE=2.00

# Security
JWT_SECRET=your-jwt-secret
BCRYPT_ROUNDS=12
```

## Development

### Project Structure

```
src/
├── config/          # Configuration files
├── database/        # Database migrations and seeds
├── middleware/      # Express middleware
├── routes/          # API route handlers
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── test/            # Test files
```

### Adding New Features

1. Define types in `src/types/`
2. Create database migrations in `src/database/migrations/`
3. Implement business logic in `src/services/`
4. Add API routes in `src/routes/`
5. Write comprehensive tests in `src/test/`

### Testing Strategy

- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test API endpoints and database interactions
- **Service Tests**: Test business logic and service interactions
- **Mock Testing**: Use mock payment providers for testing

## Deployment

### Docker Deployment

```bash
# Build Docker image
docker build -t decrown-transport .

# Run with Docker Compose
docker-compose up -d
```

### Environment Setup

1. Set up PostgreSQL with TimescaleDB extension
2. Configure Redis for caching
3. Set up payment provider webhooks
4. Configure environment variables for production
5. Set up SSL certificates
6. Configure reverse proxy (nginx)

## Monitoring & Logging

- **Structured Logging**: Winston-based logging with correlation IDs
- **Health Checks**: Built-in health check endpoints
- **Metrics**: Performance and business metrics tracking
- **Error Tracking**: Comprehensive error handling and reporting

## Security Considerations

- **Input Validation**: Joi-based request validation
- **Rate Limiting**: Express rate limiting middleware
- **CORS Configuration**: Configurable CORS policies
- **Helmet Security**: Security headers with Helmet.js
- **Data Encryption**: Encrypted sensitive data storage
- **Audit Trail**: Complete audit logging for compliance

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation wiki

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.