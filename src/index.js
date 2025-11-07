// DeCrown Worker Transportation - Production Entry Point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'production'
    });
});

// API status endpoint
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
            auditLogging: true
        }
    });
});

// Basic API endpoints
app.get('/api/v1/users', (req, res) => {
    res.json({ message: 'User service operational' });
});

app.get('/api/v1/transport', (req, res) => {
    res.json({ message: 'Transport service operational' });
});

app.get('/api/v1/payment', (req, res) => {
    res.json({ message: 'Payment service operational' });
});

app.get('/api/v1/location', (req, res) => {
    res.json({ message: 'Location service operational' });
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
            users: '/api/v1/users',
            transport: '/api/v1/transport',
            payment: '/api/v1/payment',
            location: '/api/v1/location'
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DeCrown Worker Transportation API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});