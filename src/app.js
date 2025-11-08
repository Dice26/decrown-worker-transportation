// DeCrown Worker Transportation - Main Express App
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'production'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'DeCrown Worker Transportation API',
        version: '1.0.0',
        status: 'Production Ready',
        endpoints: {
            health: '/health',
            status: '/api/v1/status',
            worker: '/api/worker/*',
            dispatcher: '/api/dispatcher/*',
            owner: '/api/owner/*'
        }
    });
});

// API v1 status endpoint
app.get('/api/v1/status', (req, res) => {
    res.json({
        api: 'DeCrown Worker Transport',
        version: '1.0.0',
        status: 'operational',
        timestamp: new Date().toISOString(),
        features: {
            locationTracking: true,
            paymentProcessing: true,
            routeOptimization: true,
            auditLogging: true,
            dryRunMode: true,
            roleBasedAccess: true
        }
    });
});

// Role-based API routes
const workerRoutes = require('./routes/worker');
const dispatcherRoutes = require('./routes/dispatcher');
const ownerRoutes = require('./routes/owner');

app.use('/api/worker', workerRoutes);
app.use('/api/dispatcher', dispatcherRoutes);
app.use('/api/owner', ownerRoutes);

// Legacy endpoints for backward compatibility
app.get('/api/v1/users', (req, res) => {
    res.json({ message: 'User service operational - Use /api/worker, /api/dispatcher, or /api/owner endpoints' });
});

app.get('/api/v1/transport', (req, res) => {
    res.json({ message: 'Transport service operational - Use /api/dispatcher/active-rides' });
});

app.get('/api/v1/payment', (req, res) => {
    res.json({ message: 'Payment service operational - Use /api/owner/financial' });
});

app.get('/api/v1/location', (req, res) => {
    res.json({ message: 'Location service operational - Use /api/worker/location' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.originalUrl,
        message: 'The requested endpoint does not exist',
        availableEndpoints: {
            worker: '/api/worker/*',
            dispatcher: '/api/dispatcher/*',
            owner: '/api/owner/*'
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
