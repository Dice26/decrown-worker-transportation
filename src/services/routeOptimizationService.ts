import { logger } from '@/utils/logger';
import {
    RouteOptimizationConfig,
    RouteConstraints,
    TripStop,
    DriverCapacity,
    ETACalculation
} from '@/types/transport';

export interface OptimizationResult {
    optimizedStops: TripStop[];
    totalDistance: number;
    estimatedDuration: number;
    optimizationScore: number;
    algorithm: string;
    metadata: Record<string, any>;
}

export interface LocationWithId {
    id: string;
    latitude: number;
    longitude: number;
    timeWindow?: {
        earliest: Date;
        latest: Date;
    };
}

export class RouteOptimizationService {
    /**
     * Optimize route using specified algorithm
     */
    async optimizeRoute(
        locations: LocationWithId[],
        config: RouteOptimizationConfig,
        constraints: RouteConstraints,
        startLocation?: { latitude: number; longitude: number }
    ): Promise<OptimizationResult> {
        logger.info(`Starting route optimization`, {
            locationCount: locations.length,
            algorithm: config.algorithm,
            constraints
        });

        let result: OptimizationResult;

        switch (config.algorithm) {
            case 'nearest_neighbor':
                result = await this.nearestNeighborOptimization(locations, config, constraints, startLocation);
                break;
            case 'genetic':
                result = await this.geneticAlgorithmOptimization(locations, config, constraints, startLocation);
                break;
            case 'simulated_annealing':
                result = await this.simulatedAnnealingOptimization(locations, config, constraints, startLocation);
                break;
            default:
                throw new Error(`Unsupported optimization algorithm: ${config.algorithm}`);
        }

        logger.info(`Route optimization completed`, {
            algorithm: config.algorithm,
            totalDistance: result.totalDistance,
            estimatedDuration: result.estimatedDuration,
            optimizationScore: result.optimizationScore
        });

        return result;
    }

    /**
     * Calculate ETA for each stop in a route
     */
    async calculateETAs(
        stops: TripStop[],
        startTime: Date,
        averageSpeed: number = 30, // km/h
        stopDuration: number = 5 // minutes per stop
    ): Promise<ETACalculation[]> {
        const etas: ETACalculation[] = [];
        let currentTime = new Date(startTime);

        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];

            if (i > 0) {
                // Calculate travel time from previous stop
                const distance = this.calculateDistance(
                    stops[i - 1].location,
                    stop.location
                );
                const travelTimeMinutes = (distance / 1000) / averageSpeed * 60;
                currentTime = new Date(currentTime.getTime() + travelTimeMinutes * 60 * 1000);
            }

            // Add stop duration
            if (i > 0) {
                currentTime = new Date(currentTime.getTime() + stopDuration * 60 * 1000);
            }

            etas.push({
                tripId: '', // Will be set by caller
                stopId: stop.userId,
                estimatedArrival: new Date(currentTime),
                confidence: this.calculateETAConfidence(i, stops.length),
                factors: {
                    distance: i > 0 ? this.calculateDistance(stops[i - 1].location, stop.location) : 0,
                    traffic: 1.0, // Simplified - would integrate with traffic APIs
                    weather: 1.0, // Simplified - would integrate with weather APIs
                    historical: 1.0 // Simplified - would use historical data
                },
                calculatedAt: new Date()
            });
        }

        return etas;
    }

    /**
     * Assess driver capacity and availability
     */
    async assessDriverCapacity(
        driverId: string,
        requiredCapacity: number,
        currentLocation?: { latitude: number; longitude: number }
    ): Promise<DriverCapacity> {
        // This would typically query the database for driver information
        // For now, returning a mock implementation
        return {
            driverId,
            maxPassengers: 8, // Default van capacity
            currentLoad: 0,
            availableSlots: 8,
            vehicleType: 'van',
            isAvailable: true,
            currentLocation,
            lastUpdated: new Date()
        };
    }

    // Private optimization algorithms

    private async nearestNeighborOptimization(
        locations: LocationWithId[],
        config: RouteOptimizationConfig,
        constraints: RouteConstraints,
        startLocation?: { latitude: number; longitude: number }
    ): Promise<OptimizationResult> {
        if (locations.length === 0) {
            return this.createEmptyResult('nearest_neighbor');
        }

        const unvisited = [...locations];
        const route: LocationWithId[] = [];
        let currentLocation = startLocation || locations[0];

        // Start from the specified start location or first location
        if (startLocation) {
            // Find closest location to start
            const startIndex = this.findNearestLocationIndex(currentLocation, unvisited);
            route.push(unvisited[startIndex]);
            unvisited.splice(startIndex, 1);
            currentLocation = route[0];
        } else {
            route.push(unvisited[0]);
            unvisited.splice(0, 1);
            currentLocation = route[0];
        }

        // Build route using nearest neighbor
        while (unvisited.length > 0 && route.length < constraints.maxStops) {
            const nearestIndex = this.findNearestLocationIndex(currentLocation, unvisited);
            const nearestLocation = unvisited[nearestIndex];

            route.push(nearestLocation);
            unvisited.splice(nearestIndex, 1);
            currentLocation = nearestLocation;
        }

        const optimizedStops = this.convertToTripStops(route);
        const totalDistance = this.calculateRouteDistance(route);
        const estimatedDuration = this.estimateRouteDuration(totalDistance, route.length);

        return {
            optimizedStops,
            totalDistance,
            estimatedDuration,
            optimizationScore: this.calculateOptimizationScore(totalDistance, estimatedDuration, route.length),
            algorithm: 'nearest_neighbor',
            metadata: {
                locationsProcessed: route.length,
                locationsSkipped: unvisited.length
            }
        };
    }

    private async geneticAlgorithmOptimization(
        locations: LocationWithId[],
        config: RouteOptimizationConfig,
        constraints: RouteConstraints,
        startLocation?: { latitude: number; longitude: number }
    ): Promise<OptimizationResult> {
        const populationSize = 50;
        const generations = config.maxIterations || 100;
        const mutationRate = 0.1;
        const eliteSize = 10;

        if (locations.length <= 2) {
            // Fall back to nearest neighbor for small sets
            return this.nearestNeighborOptimization(locations, config, constraints, startLocation);
        }

        // Initialize population
        let population = this.initializePopulation(locations, populationSize, constraints.maxStops);

        for (let generation = 0; generation < generations; generation++) {
            // Evaluate fitness
            const fitness = population.map(route => this.calculateRouteFitness(route));

            // Select elite
            const elite = this.selectElite(population, fitness, eliteSize);

            // Create new generation
            const newPopulation = [...elite];

            while (newPopulation.length < populationSize) {
                const parent1 = this.tournamentSelection(population, fitness);
                const parent2 = this.tournamentSelection(population, fitness);
                const child = this.crossover(parent1, parent2);

                if (Math.random() < mutationRate) {
                    this.mutate(child);
                }

                newPopulation.push(child);
            }

            population = newPopulation;
        }

        // Select best route
        const fitness = population.map(route => this.calculateRouteFitness(route));
        const bestIndex = fitness.indexOf(Math.max(...fitness));
        const bestRoute = population[bestIndex];

        const optimizedStops = this.convertToTripStops(bestRoute);
        const totalDistance = this.calculateRouteDistance(bestRoute);
        const estimatedDuration = this.estimateRouteDuration(totalDistance, bestRoute.length);

        return {
            optimizedStops,
            totalDistance,
            estimatedDuration,
            optimizationScore: this.calculateOptimizationScore(totalDistance, estimatedDuration, bestRoute.length),
            algorithm: 'genetic',
            metadata: {
                generations,
                populationSize,
                finalFitness: fitness[bestIndex]
            }
        };
    }

    private async simulatedAnnealingOptimization(
        locations: LocationWithId[],
        config: RouteOptimizationConfig,
        constraints: RouteConstraints,
        startLocation?: { latitude: number; longitude: number }
    ): Promise<OptimizationResult> {
        if (locations.length <= 2) {
            return this.nearestNeighborOptimization(locations, config, constraints, startLocation);
        }

        const maxIterations = config.maxIterations || 1000;
        const initialTemp = 1000;
        const coolingRate = 0.995;

        // Start with a random route
        let currentRoute = this.shuffleArray([...locations.slice(0, constraints.maxStops)]);
        let currentDistance = this.calculateRouteDistance(currentRoute);

        let bestRoute = [...currentRoute];
        let bestDistance = currentDistance;

        let temperature = initialTemp;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            // Generate neighbor by swapping two random cities
            const newRoute = [...currentRoute];
            const i = Math.floor(Math.random() * newRoute.length);
            const j = Math.floor(Math.random() * newRoute.length);
            [newRoute[i], newRoute[j]] = [newRoute[j], newRoute[i]];

            const newDistance = this.calculateRouteDistance(newRoute);

            // Accept or reject the new route
            if (newDistance < currentDistance || Math.random() < Math.exp((currentDistance - newDistance) / temperature)) {
                currentRoute = newRoute;
                currentDistance = newDistance;

                if (newDistance < bestDistance) {
                    bestRoute = [...newRoute];
                    bestDistance = newDistance;
                }
            }

            temperature *= coolingRate;
        }

        const optimizedStops = this.convertToTripStops(bestRoute);
        const estimatedDuration = this.estimateRouteDuration(bestDistance, bestRoute.length);

        return {
            optimizedStops,
            totalDistance: bestDistance,
            estimatedDuration,
            optimizationScore: this.calculateOptimizationScore(bestDistance, estimatedDuration, bestRoute.length),
            algorithm: 'simulated_annealing',
            metadata: {
                iterations: maxIterations,
                finalTemperature: temperature,
                improvementFound: bestDistance < this.calculateRouteDistance(locations.slice(0, constraints.maxStops))
            }
        };
    }

    // Helper methods

    private findNearestLocationIndex(current: { latitude: number; longitude: number }, locations: LocationWithId[]): number {
        let nearestIndex = 0;
        let nearestDistance = this.calculateDistance(current, locations[0]);

        for (let i = 1; i < locations.length; i++) {
            const distance = this.calculateDistance(current, locations[i]);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }

        return nearestIndex;
    }

    private calculateDistance(coord1: { latitude: number; longitude: number }, coord2: { latitude: number; longitude: number }): number {
        const R = 6371000; // Earth's radius in meters
        const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
        const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private calculateRouteDistance(route: LocationWithId[]): number {
        let totalDistance = 0;
        for (let i = 1; i < route.length; i++) {
            totalDistance += this.calculateDistance(route[i - 1], route[i]);
        }
        return totalDistance;
    }

    private estimateRouteDuration(distance: number, stopCount: number): number {
        const averageSpeed = 30; // km/h
        const stopTime = 5; // minutes per stop
        const travelTime = (distance / 1000) / averageSpeed * 60; // minutes
        return travelTime + (stopCount * stopTime);
    }

    private calculateOptimizationScore(distance: number, duration: number, stopCount: number): number {
        // Higher score is better - inverse of normalized distance and duration
        const normalizedDistance = distance / (stopCount * 1000); // distance per stop in km
        const normalizedDuration = duration / stopCount; // duration per stop in minutes
        return 1000 / (normalizedDistance + normalizedDuration);
    }

    private calculateETAConfidence(stopIndex: number, totalStops: number): number {
        // Confidence decreases with distance from start
        return Math.max(0.5, 1 - (stopIndex / totalStops) * 0.5);
    }

    private convertToTripStops(locations: LocationWithId[]): TripStop[] {
        return locations.map((location, index) => ({
            userId: location.id,
            location: {
                latitude: location.latitude,
                longitude: location.longitude
            },
            estimatedArrival: new Date(Date.now() + (index + 1) * 15 * 60 * 1000), // 15 minutes apart
            status: 'pending'
        }));
    }

    private createEmptyResult(algorithm: string): OptimizationResult {
        return {
            optimizedStops: [],
            totalDistance: 0,
            estimatedDuration: 0,
            optimizationScore: 0,
            algorithm,
            metadata: {}
        };
    }

    // Genetic Algorithm helpers

    private initializePopulation(locations: LocationWithId[], populationSize: number, maxStops: number): LocationWithId[][] {
        const population: LocationWithId[][] = [];
        const availableLocations = locations.slice(0, maxStops);

        for (let i = 0; i < populationSize; i++) {
            population.push(this.shuffleArray([...availableLocations]));
        }

        return population;
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private calculateRouteFitness(route: LocationWithId[]): number {
        const distance = this.calculateRouteDistance(route);
        return 1 / (1 + distance); // Higher fitness for shorter routes
    }

    private selectElite(population: LocationWithId[][], fitness: number[], eliteSize: number): LocationWithId[][] {
        const indexed = fitness.map((fit, index) => ({ fitness: fit, index }));
        indexed.sort((a, b) => b.fitness - a.fitness);
        return indexed.slice(0, eliteSize).map(item => population[item.index]);
    }

    private tournamentSelection(population: LocationWithId[][], fitness: number[], tournamentSize: number = 3): LocationWithId[] {
        let best = Math.floor(Math.random() * population.length);
        let bestFitness = fitness[best];

        for (let i = 1; i < tournamentSize; i++) {
            const candidate = Math.floor(Math.random() * population.length);
            if (fitness[candidate] > bestFitness) {
                best = candidate;
                bestFitness = fitness[candidate];
            }
        }

        return population[best];
    }

    private crossover(parent1: LocationWithId[], parent2: LocationWithId[]): LocationWithId[] {
        const start = Math.floor(Math.random() * parent1.length);
        const end = Math.floor(Math.random() * (parent1.length - start)) + start;

        const child = new Array(parent1.length);
        const segment = parent1.slice(start, end);

        // Copy segment from parent1
        for (let i = start; i < end; i++) {
            child[i] = parent1[i];
        }

        // Fill remaining positions with parent2 genes not in segment
        let parent2Index = 0;
        for (let i = 0; i < parent1.length; i++) {
            if (child[i] === undefined) {
                while (segment.some(loc => loc.id === parent2[parent2Index].id)) {
                    parent2Index++;
                }
                child[i] = parent2[parent2Index];
                parent2Index++;
            }
        }

        return child;
    }

    private mutate(route: LocationWithId[]): void {
        const i = Math.floor(Math.random() * route.length);
        const j = Math.floor(Math.random() * route.length);
        [route[i], route[j]] = [route[j], route[i]];
    }
}