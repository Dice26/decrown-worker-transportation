// DeCrown Worker Transportation - Dry Run Middleware
// Simulate actions without committing changes

/**
 * Dry-run toggle middleware
 * Checks for dry-run header or query parameter
 * If enabled, sets req.dryRun = true to simulate actions
 */
exports.dryRunToggle = (req, res, next) => {
    // Check for dry-run in header or query parameter
    const dryRunHeader = req.headers['x-dry-run'];
    const dryRunQuery = req.query.dryRun;

    // Enable dry-run if header is 'true' or query param is 'true'
    req.dryRun = dryRunHeader === 'true' || dryRunQuery === 'true';

    // Log dry-run status
    if (req.dryRun) {
        console.log(`[DRY-RUN] ${req.method} ${req.path} - Simulation mode enabled`);
    }

    next();
};

/**
 * Force dry-run for specific environments
 * Useful for staging/testing environments
 */
exports.forceDryRun = (req, res, next) => {
    const environment = process.env.NODE_ENV;

    // Force dry-run in development and test environments
    if (environment === 'development' || environment === 'test') {
        req.dryRun = true;
        console.log(`[DRY-RUN] Forced in ${environment} environment`);
    }

    next();
};

/**
 * Dry-run response wrapper
 * Wraps responses to indicate dry-run mode
 */
exports.dryRunResponse = (data, message = 'Action simulated successfully') => {
    return {
        success: true,
        dryRun: true,
        message,
        data,
        timestamp: new Date().toISOString()
    };
};
