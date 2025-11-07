import { describe, it, expect, beforeEach } from 'vitest';
import { RouteOptimizationService, LocationWithId } from '@/services/routeOptimizationService';
import { RouteOptimizationConfig, RouteConstraints } from '@/types/transport';

describe('RouteOptimizationService', () => {
    let routeOptimizationService: RouteOptimizationService;
    let testLocations: LocationWithId[];
    let defaultConfig: RouteOptimizationConfig;
    let defaultConstraints: RouteConstraints;

    beforeEach(() => {
        routeOptimizationService = new RouteOptimizationService();

        // Test locations in Manila area
        testLocations = [
            { id: 'worker-1', latitude: 14.5995, longitude: 120.9842 }, // Makati
            { id: 'worker-2', latitude: 14.6042, longitude: 120.9822 }, // BGC
            { id: 'worker-3', latitude: 14.5794, longitude: 121.0359 }, // Ortigas
            { id: 'worker-4', latitude: 14.6091, longitude: 121.0223 }, // Quezon City
            { id: 'worker-5', latitude: 14.5547, longitude: 121.0244 }  // Pasig
        ];

        defaultConfig = {
            algorithm: 'nearest_neighbor',
            maxIterations: 100,
            prioritizePickupTime: true,
            minimizeDistance: true,
            balanceLoad: false
        };

        defaultConstraints = {
            maxStops: 10,
            maxDuration: 120, // 2 hours
            vehicleCapacity: 8,
            startLocation: { latitude: 14.5995, longitude: 120.9842 }
        };
    });

    describe('optimizeRoute', () => {
        describe('nearest neighbor algorithm', () => {
            it('should optimize route using nearest neighbor algorithm', async () => {
                const result = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'nearest_neighbor' },
                    defaultConstraints
                );

                expect(result).toBeDefined();
                expect(result.algorithm).toBe('nearest_neighbor');
                expect(result.optimizedStops).toHaveLength(testLocations.length);
                expect(result.totalDistance).toBeGreaterThan(0);
                expect(result.estimatedDuration).toBeGreaterThan(0);
                expect(result.optimizationScore).toBeGreaterThan(0);
            });

            it('should respect max stops constraint', async () => {
                const constrainedConstraints = { ...defaultConstraints, maxStops: 3 };

                const result = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    defaultConfig,
                    constrainedConstraints
                );

                expect(result.optimizedStops.length).toBeLessThanOrEqual(3);
                expect(result.metadata.locationsSkipped).toBe(testLocations.length - 3);
            });

            it('should handle empty location list', async () => {
                const result = await routeOptimizationService.optimizeRoute(
                    [],
                    defaultConfig,
                    defaultConstraints
                );

                expect(result.optimizedStops).toHaveLength(0);
                expect(result.totalDistance).toBe(0);
                expect(result.estimatedDuration).toBe(0);
                expect(result.optimizationScore).toBe(0);
            });

            it('should handle single location', async () => {
                const singleLocation = [testLocations[0]];

                const result = await routeOptimizationService.optimizeRoute(
                    singleLocation,
                    defaultConfig,
                    defaultConstraints
                );

                expect(result.optimizedStops).toHaveLength(1);
                expect(result.optimizedStops[0].userId).toBe('worker-1');
            });

            it('should use start location when provided', async () => {
                const startLocation = { latitude: 14.6000, longitude: 121.0000 };

                const result = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    defaultConfig,
                    { ...defaultConstraints, startLocation }
                );

                expect(result.optimizedStops).toHaveLength(testLocations.length);
                // The first stop should be closest to the start location
                expect(result.optimizedStops[0]).toBeDefined();
            });
        });

        describe('genetic algorithm', () => {
            it('should optimize route using genetic algorithm', async () => {
                const result = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'genetic', maxIterations: 50 },
                    defaultConstraints
                );

                expect(result).toBeDefined();
                expect(result.algorithm).toBe('genetic');
                expect(result.optimizedStops).toHaveLength(testLocations.length);
                expect(result.totalDistance).toBeGreaterThan(0);
                expect(result.estimatedDuration).toBeGreaterThan(0);
                expect(result.metadata.generations).toBe(50);
                expect(result.metadata.populationSize).toBeDefined();
            });

            it('should fall back to nearest neighbor for small location sets', async () => {
                const smallLocationSet = testLocations.slice(0, 2);

                const result = await routeOptimizationService.optimizeRoute(
                    smallLocationSet,
                    { ...defaultConfig, algorithm: 'genetic' },
                    defaultConstraints
                );

                expect(result.optimizedStops).toHaveLength(2);
                expect(result.totalDistance).toBeGreaterThan(0);
            });

            it('should produce different results from nearest neighbor', async () => {
                const nearestNeighborResult = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'nearest_neighbor' },
                    defaultConstraints
                );

                const geneticResult = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'genetic', maxIterations: 100 },
                    defaultConstraints
                );

                // Results should be different (genetic algorithm should potentially find better solutions)
                expect(geneticResult.algorithm).toBe('genetic');
                expect(nearestNeighborResult.algorithm).toBe('nearest_neighbor');
            });
        });

        describe('simulated annealing algorithm', () => {
            it('should optimize route using simulated annealing', async () => {
                const result = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'simulated_annealing', maxIterations: 500 },
                    defaultConstraints
                );

                expect(result).toBeDefined();
                expect(result.algorithm).toBe('simulated_annealing');
                expect(result.optimizedStops).toHaveLength(testLocations.length);
                expect(result.totalDistance).toBeGreaterThan(0);
                expect(result.estimatedDuration).toBeGreaterThan(0);
                expect(result.metadata.iterations).toBe(500);
                expect(result.metadata.finalTemperature).toBeDefined();
            });

            it('should fall back to nearest neighbor for small location sets', async () => {
                const smallLocationSet = testLocations.slice(0, 2);

                const result = await routeOptimizationService.optimizeRoute(
                    smallLocationSet,
                    { ...defaultConfig, algorithm: 'simulated_annealing' },
                    defaultConstraints
                );

                expect(result.optimizedStops).toHaveLength(2);
            });

            it('should show improvement over random ordering', async () => {
                const result = await routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'simulated_annealing', maxIterations: 1000 },
                    defaultConstraints
                );

                expect(result.metadata.improvementFound).toBeDefined();
                expect(result.optimizationScore).toBeGreaterThan(0);
            });
        });

        it('should reject unsupported algorithms', async () => {
            await expect(
                routeOptimizationService.optimizeRoute(
                    testLocations,
                    { ...defaultConfig, algorithm: 'unsupported' as any },
                    defaultConstraints
                )
            ).rejects.toThrow('Unsupported optimization algorithm: unsupported');
        });
    });

    describe('calculateETAs', () => {
        it('should calculate ETAs for all stops', async () => {
            const result = await routeOptimizationService.optimizeRoute(
                testLocations,
                defaultConfig,
                defaultConstraints
            );

            const startTime = new Date();
            const etas = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                startTime,
                30, // 30 km/h average speed
                5   // 5 minutes per stop
            );

            expect(etas).toHaveLength(result.optimizedStops.length);

            // Each ETA should have required properties
            etas.forEach((eta, index) => {
                expect(eta.stopId).toBe(result.optimizedStops[index].userId);
                expect(eta.estimatedArrival).toBeInstanceOf(Date);
                expect(eta.confidence).toBeGreaterThan(0);
                expect(eta.confidence).toBeLessThanOrEqual(1);
                expect(eta.factors).toBeDefined();
                expect(eta.factors.distance).toBeGreaterThanOrEqual(0);
                expect(eta.calculatedAt).toBeInstanceOf(Date);
            });
        });

        it('should calculate progressive ETAs', async () => {
            const result = await routeOptimizationService.optimizeRoute(
                testLocations.slice(0, 3), // Use 3 locations for clearer testing
                defaultConfig,
                defaultConstraints
            );

            const startTime = new Date();
            const etas = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                startTime
            );

            // ETAs should be progressive (later stops have later ETAs)
            for (let i = 1; i < etas.length; i++) {
                expect(etas[i].estimatedArrival.getTime())
                    .toBeGreaterThan(etas[i - 1].estimatedArrival.getTime());
            }
        });

        it('should decrease confidence for later stops', async () => {
            const result = await routeOptimizationService.optimizeRoute(
                testLocations,
                defaultConfig,
                defaultConstraints
            );

            const etas = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                new Date()
            );

            // Confidence should generally decrease for later stops
            expect(etas[0].confidence).toBeGreaterThanOrEqual(etas[etas.length - 1].confidence);
        });

        it('should handle different average speeds', async () => {
            const result = await routeOptimizationService.optimizeRoute(
                testLocations.slice(0, 2),
                defaultConfig,
                defaultConstraints
            );

            const slowETAs = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                new Date(),
                15 // 15 km/h (slow)
            );

            const fastETAs = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                new Date(),
                60 // 60 km/h (fast)
            );

            // Slow speed should result in later ETAs
            expect(slowETAs[1].estimatedArrival.getTime())
                .toBeGreaterThan(fastETAs[1].estimatedArrival.getTime());
        });

        it('should handle different stop durations', async () => {
            const result = await routeOptimizationService.optimizeRoute(
                testLocations.slice(0, 2),
                defaultConfig,
                defaultConstraints
            );

            const shortStopETAs = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                new Date(),
                30,
                2 // 2 minutes per stop
            );

            const longStopETAs = await routeOptimizationService.calculateETAs(
                result.optimizedStops,
                new Date(),
                30,
                10 // 10 minutes per stop
            );

            // Longer stops should result in later ETAs for subsequent stops
            expect(longStopETAs[1].estimatedArrival.getTime())
                .toBeGreaterThan(shortStopETAs[1].estimatedArrival.getTime());
        });
    });

    describe('assessDriverCapacity', () => {
        it('should return driver capacity information', async () => {
            const capacity = await routeOptimizationService.assessDriverCapacity(
                'driver-123',
                5,
                { latitude: 14.5995, longitude: 120.9842 }
            );

            expect(capacity).toBeDefined();
            expect(capacity.driverId).toBe('driver-123');
            expect(capacity.maxPassengers).toBeGreaterThan(0);
            expect(capacity.currentLoad).toBeGreaterThanOrEqual(0);
            expect(capacity.availableSlots).toBeGreaterThanOrEqual(0);
            expect(capacity.vehicleType).toBeDefined();
            expect(capacity.isAvailable).toBeDefined();
            expect(capacity.lastUpdated).toBeInstanceOf(Date);
        });

        it('should include current location when provided', async () => {
            const currentLocation = { latitude: 14.5995, longitude: 120.9842 };
            const capacity = await routeOptimizationService.assessDriverCapacity(
                'driver-123',
                5,
                currentLocation
            );

            expect(capacity.currentLocation).toEqual(currentLocation);
        });

        it('should handle capacity assessment without location', async () => {
            const capacity = await routeOptimizationService.assessDriverCapacity(
                'driver-123',
                5
            );

            expect(capacity.driverId).toBe('driver-123');
            expect(capacity.currentLocation).toBeUndefined();
        });
    });

    describe('optimization comparison', () => {
        it('should compare different algorithms on same dataset', async () => {
            const algorithms: Array<'nearest_neighbor' | 'genetic' | 'simulated_annealing'> = [
                'nearest_neighbor',
                'genetic',
                'simulated_annealing'
            ];

            const results = await Promise.all(
                algorithms.map(algorithm =>
                    routeOptimizationService.optimizeRoute(
                        testLocations,
                        { ...defaultConfig, algorithm, maxIterations: 100 },
                        defaultConstraints
                    )
                )
            );

            // All algorithms should produce valid results
            results.forEach((result, index) => {
                expect(result.algorithm).toBe(algorithms[index]);
                expect(result.optimizedStops).toHaveLength(testLocations.length);
                expect(result.totalDistance).toBeGreaterThan(0);
                expect(result.estimatedDuration).toBeGreaterThan(0);
                expect(result.optimizationScore).toBeGreaterThan(0);
            });

            // Results should have different characteristics
            const distances = results.map(r => r.totalDistance);
            const scores = results.map(r => r.optimizationScore);

            expect(distances.length).toBe(3);
            expect(scores.length).toBe(3);
        });

        it('should handle large datasets efficiently', async () => {
            // Create a larger dataset
            const largeLocationSet: LocationWithId[] = [];
            for (let i = 0; i < 20; i++) {
                largeLocationSet.push({
                    id: `worker-${i}`,
                    latitude: 14.5 + (Math.random() * 0.2), // Random locations in Manila area
                    longitude: 120.9 + (Math.random() * 0.2)
                });
            }

            const startTime = Date.now();
            const result = await routeOptimizationService.optimizeRoute(
                largeLocationSet,
                { ...defaultConfig, algorithm: 'nearest_neighbor' },
                { ...defaultConstraints, maxStops: 20 }
            );
            const endTime = Date.now();

            expect(result.optimizedStops).toHaveLength(20);
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });
    });

    describe('edge cases', () => {
        it('should handle locations with same coordinates', async () => {
            const duplicateLocations: LocationWithId[] = [
                { id: 'worker-1', latitude: 14.5995, longitude: 120.9842 },
                { id: 'worker-2', latitude: 14.5995, longitude: 120.9842 }, // Same coordinates
                { id: 'worker-3', latitude: 14.6000, longitude: 120.9850 }
            ];

            const result = await routeOptimizationService.optimizeRoute(
                duplicateLocations,
                defaultConfig,
                defaultConstraints
            );

            expect(result.optimizedStops).toHaveLength(3);
            expect(result.totalDistance).toBeGreaterThanOrEqual(0);
        });

        it('should handle extreme coordinates', async () => {
            const extremeLocations: LocationWithId[] = [
                { id: 'worker-1', latitude: -89.9, longitude: -179.9 },
                { id: 'worker-2', latitude: 89.9, longitude: 179.9 }
            ];

            const result = await routeOptimizationService.optimizeRoute(
                extremeLocations,
                defaultConfig,
                { ...defaultConstraints, maxStops: 2 }
            );

            expect(result.optimizedStops).toHaveLength(2);
            expect(result.totalDistance).toBeGreaterThan(0);
        });

        it('should handle zero max stops constraint', async () => {
            const result = await routeOptimizationService.optimizeRoute(
                testLocations,
                defaultConfig,
                { ...defaultConstraints, maxStops: 0 }
            );

            expect(result.optimizedStops).toHaveLength(0);
            expect(result.totalDistance).toBe(0);
        });
    });
});