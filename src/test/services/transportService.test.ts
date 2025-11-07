import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransportService } from '@/services/transportService';
import { TestDataFactory } from '@/test/helpers/testData';
import { getDatabase } from '@/config/database';
import {
    TripCreationRequest,
    TripUpdateRequest,
    IncidentReportRequest,
    TripStatus,
    TripStop
} from '@/types/transport';

describe('TransportService', () => {
    let transportService: TransportService;
    let db: any;
    let testWorker: any;
    let testDriver: any;
    let testDispatcher: any;

    beforeEach(async () => {
        transportService = new TransportService();
        db = getDatabase();

        // Create test users
        testWorker = await TestDataFactory.createUser({
            role: 'worker',
            consent_flags: {
                locationTracking: true,
                dataProcessing: true,
                marketingCommunications: false,
                consentVersion: '1.0',
                consentDate: new Date()
            }
        });

        testDriver = await TestDataFactory.createUser({
            role: 'driver'
        });

        testDispatcher = await TestDataFactory.createUser({
            role: 'dispatcher'
        });

        // Insert test location data for worker
        await db.raw(`
            INSERT INTO location_points (
                user_id, device_id, coordinates, accuracy, source, 
                timestamp, consent_version, hash_chain, retention_date
            ) VALUES (?, ?, ST_GeogFromText(?), ?, ?, ?, ?, ?, ?)
        `, [
            testWorker.id,
            'test-device',
            'POINT(120.9842 14.5995)',
            10,
            'gps',
            new Date(),
            '1.0',
            'test-hash',
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        ]);
    });

    describe('createTrip', () => {
        it('should successfully create a trip with worker selection', async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000), // 1 hour from now
                driverId: testDriver.id,
                notes: 'Test trip creation'
            };

            const trip = await transportService.createTrip(tripRequest, testDispatcher.id);

            expect(trip).toBeDefined();
            expect(trip.status).toBe('planned');
            expect(trip.driverId).toBe(testDriver.id);
            expect(trip.plannedStops).toHaveLength(1);
            expect(trip.plannedStops[0].userId).toBe(testWorker.id);
            expect(trip.plannedStops[0].status).toBe('pending');
            expect(trip.scheduledAt).toBeInstanceOf(Date);
            expect(trip.createdAt).toBeInstanceOf(Date);
        });

        it('should create trip without driver assignment', async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                notes: 'Trip without driver'
            };

            const trip = await transportService.createTrip(tripRequest, testDispatcher.id);

            expect(trip).toBeDefined();
            expect(trip.status).toBe('planned');
            expect(trip.driverId).toBeUndefined();
            expect(trip.plannedStops).toHaveLength(1);
        });

        it('should create optimized stops based on worker locations', async () => {
            // Create additional workers with locations
            const worker2 = await TestDataFactory.createUser({
                role: 'worker',
                consent_flags: {
                    locationTracking: true,
                    dataProcessing: true,
                    marketingCommunications: false,
                    consentVersion: '1.0',
                    consentDate: new Date()
                }
            });

            await db.raw(`
                INSERT INTO location_points (
                    user_id, device_id, coordinates, accuracy, source, 
                    timestamp, consent_version, hash_chain, retention_date
                ) VALUES (?, ?, ST_GeogFromText(?), ?, ?, ?, ?, ?, ?)
            `, [
                worker2.id,
                'test-device-2',
                'POINT(120.9850 14.6000)',
                10,
                'gps',
                new Date(),
                '1.0',
                'test-hash-2',
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ]);

            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id, worker2.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            const trip = await transportService.createTrip(tripRequest, testDispatcher.id);

            expect(trip.plannedStops).toHaveLength(2);
            expect(trip.plannedStops.map(stop => stop.userId)).toContain(testWorker.id);
            expect(trip.plannedStops.map(stop => stop.userId)).toContain(worker2.id);
        });

        it('should create trip notifications for workers and driver', async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            const trip = await transportService.createTrip(tripRequest, testDispatcher.id);

            // Check notifications were created
            const notifications = await db('trip_notifications')
                .where('trip_id', trip.id);

            expect(notifications.length).toBeGreaterThanOrEqual(2); // Worker + Driver

            const recipientIds = notifications.map((n: any) => n.recipient_id);
            expect(recipientIds).toContain(testWorker.id);
            expect(recipientIds).toContain(testDriver.id);
        });
    });

    describe('updateTripStatus', () => {
        let testTrip: any;

        beforeEach(async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            testTrip = await transportService.createTrip(tripRequest, testDispatcher.id);
        });

        it('should update trip status from planned to assigned', async () => {
            const updatedTrip = await transportService.updateTripStatus(
                testTrip.id,
                'assigned',
                testDispatcher.id
            );

            expect(updatedTrip.status).toBe('assigned');
            expect(updatedTrip.id).toBe(testTrip.id);
        });

        it('should update trip status from assigned to in_progress', async () => {
            // First update to assigned
            await transportService.updateTripStatus(testTrip.id, 'assigned', testDispatcher.id);

            // Then update to in_progress
            const updatedTrip = await transportService.updateTripStatus(
                testTrip.id,
                'in_progress',
                testDriver.id
            );

            expect(updatedTrip.status).toBe('in_progress');
            expect(updatedTrip.startedAt).toBeInstanceOf(Date);
        });

        it('should update trip status to completed with metrics', async () => {
            // Progress through states
            await transportService.updateTripStatus(testTrip.id, 'assigned', testDispatcher.id);
            await transportService.updateTripStatus(testTrip.id, 'in_progress', testDriver.id);

            const updatedTrip = await transportService.updateTripStatus(
                testTrip.id,
                'completed',
                testDriver.id
            );

            expect(updatedTrip.status).toBe('completed');
            expect(updatedTrip.completedAt).toBeInstanceOf(Date);
            expect(updatedTrip.metrics).toBeDefined();
        });

        it('should reject invalid status transitions', async () => {
            // Try to go directly from planned to completed
            await expect(
                transportService.updateTripStatus(testTrip.id, 'completed', testDriver.id)
            ).rejects.toThrow('Invalid status transition from planned to completed');
        });

        it('should handle trip cancellation', async () => {
            const updatedTrip = await transportService.updateTripStatus(
                testTrip.id,
                'cancelled',
                testDispatcher.id
            );

            expect(updatedTrip.status).toBe('cancelled');

            // Check cancellation record was created
            const cancellation = await db('trip_cancellations')
                .where('trip_id', testTrip.id)
                .first();

            expect(cancellation).toBeDefined();
            expect(cancellation.cancelled_by).toBe(testDispatcher.id);
        });

        it('should create status update notifications', async () => {
            await transportService.updateTripStatus(testTrip.id, 'assigned', testDispatcher.id);

            const notifications = await db('trip_notifications')
                .where('trip_id', testTrip.id)
                .where('type', 'status_update');

            expect(notifications.length).toBeGreaterThan(0);
        });

        it('should update additional trip data', async () => {
            const additionalData: TripUpdateRequest = {
                notes: 'Updated trip notes',
                metrics: {
                    delayMinutes: 15
                }
            };

            const updatedTrip = await transportService.updateTripStatus(
                testTrip.id,
                'assigned',
                testDispatcher.id,
                additionalData
            );

            expect(updatedTrip.notes).toBe('Updated trip notes');
            expect(updatedTrip.metrics.delayMinutes).toBe(15);
        });
    });

    describe('completeTrip', () => {
        let testTrip: any;

        beforeEach(async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            testTrip = await transportService.createTrip(tripRequest, testDispatcher.id);

            // Progress to in_progress state
            await transportService.updateTripStatus(testTrip.id, 'assigned', testDispatcher.id);
            await transportService.updateTripStatus(testTrip.id, 'in_progress', testDriver.id);
        });

        it('should complete trip with final metrics', async () => {
            const finalStops: TripStop[] = [
                {
                    userId: testWorker.id,
                    location: {
                        latitude: 14.5995,
                        longitude: 120.9842
                    },
                    estimatedArrival: new Date(Date.now() - 300000),
                    actualArrival: new Date(Date.now() - 240000),
                    status: 'picked_up'
                }
            ];

            const completedTrip = await transportService.completeTrip(
                testTrip.id,
                testDriver.id,
                finalStops
            );

            expect(completedTrip.status).toBe('completed');
            expect(completedTrip.actualStops).toEqual(finalStops);
            expect(completedTrip.completedAt).toBeInstanceOf(Date);
            expect(completedTrip.metrics).toBeDefined();
            expect(completedTrip.metrics.pickupCount).toBe(1);
            expect(completedTrip.metrics.noShowCount).toBe(0);
        });

        it('should calculate completion metrics correctly', async () => {
            const finalStops: TripStop[] = [
                {
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(Date.now() - 300000),
                    actualArrival: new Date(Date.now() - 240000),
                    status: 'picked_up'
                }
            ];

            const completedTrip = await transportService.completeTrip(
                testTrip.id,
                testDriver.id,
                finalStops
            );

            expect(completedTrip.metrics.pickupCount).toBe(1);
            expect(completedTrip.metrics.noShowCount).toBe(0);
            expect(completedTrip.metrics.onTimePercentage).toBe(100);
            expect(completedTrip.metrics.totalDuration).toBeGreaterThan(0);
        });

        it('should handle no-show scenarios', async () => {
            const finalStops: TripStop[] = [
                {
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(Date.now() - 300000),
                    actualArrival: new Date(Date.now() - 240000),
                    status: 'no_show'
                }
            ];

            const completedTrip = await transportService.completeTrip(
                testTrip.id,
                testDriver.id,
                finalStops
            );

            expect(completedTrip.metrics.pickupCount).toBe(0);
            expect(completedTrip.metrics.noShowCount).toBe(1);
            expect(completedTrip.metrics.onTimePercentage).toBe(0);
        });

        it('should reject completion of non-in-progress trips', async () => {
            // Create a new planned trip
            const newTripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            const newTrip = await transportService.createTrip(newTripRequest, testDispatcher.id);

            const finalStops: TripStop[] = [
                {
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    actualArrival: new Date(),
                    status: 'picked_up'
                }
            ];

            await expect(
                transportService.completeTrip(newTrip.id, testDriver.id, finalStops)
            ).rejects.toThrow('Trip must be in progress to complete');
        });

        it('should create completion notifications', async () => {
            const finalStops: TripStop[] = [
                {
                    userId: testWorker.id,
                    location: { latitude: 14.5995, longitude: 120.9842 },
                    estimatedArrival: new Date(),
                    actualArrival: new Date(),
                    status: 'picked_up'
                }
            ];

            await transportService.completeTrip(testTrip.id, testDriver.id, finalStops);

            const notifications = await db('trip_notifications')
                .where('trip_id', testTrip.id)
                .where('type', 'completion');

            expect(notifications.length).toBeGreaterThan(0);
        });
    });

    describe('reportIncident', () => {
        let testTrip: any;

        beforeEach(async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            testTrip = await transportService.createTrip(tripRequest, testDispatcher.id);
        });

        it('should successfully report an incident', async () => {
            const incidentRequest: IncidentReportRequest = {
                tripId: testTrip.id,
                incidentType: 'delay',
                severity: 'medium',
                description: 'Traffic jam causing delay',
                location: {
                    latitude: 14.5995,
                    longitude: 120.9842
                },
                estimatedDelay: 15
            };

            const incident = await transportService.reportIncident(incidentRequest, testDriver.id);

            expect(incident).toBeDefined();
            expect(incident.tripId).toBe(testTrip.id);
            expect(incident.reportedBy).toBe(testDriver.id);
            expect(incident.incidentType).toBe('delay');
            expect(incident.severity).toBe('medium');
            expect(incident.description).toBe('Traffic jam causing delay');
            expect(incident.estimatedDelay).toBe(15);
            expect(incident.resolved).toBe(false);
            expect(incident.reportedAt).toBeInstanceOf(Date);
        });

        it('should update trip with delay information', async () => {
            const incidentRequest: IncidentReportRequest = {
                tripId: testTrip.id,
                incidentType: 'delay',
                severity: 'high',
                description: 'Vehicle breakdown',
                estimatedDelay: 30
            };

            await transportService.reportIncident(incidentRequest, testDriver.id);

            // Check that trip metrics were updated with delay
            const updatedTrip = await transportService.getTripById(testTrip.id);
            expect(updatedTrip?.metrics.delayMinutes).toBe(30);
        });

        it('should create delay notifications for significant delays', async () => {
            const incidentRequest: IncidentReportRequest = {
                tripId: testTrip.id,
                incidentType: 'delay',
                severity: 'high',
                description: 'Major traffic incident',
                estimatedDelay: 20 // >= 10 minutes threshold
            };

            await transportService.reportIncident(incidentRequest, testDriver.id);

            const notifications = await db('trip_notifications')
                .where('trip_id', testTrip.id)
                .where('type', 'delay');

            expect(notifications.length).toBeGreaterThan(0);
        });

        it('should not create notifications for minor delays', async () => {
            const incidentRequest: IncidentReportRequest = {
                tripId: testTrip.id,
                incidentType: 'delay',
                severity: 'low',
                description: 'Minor traffic',
                estimatedDelay: 5 // < 10 minutes threshold
            };

            await transportService.reportIncident(incidentRequest, testDriver.id);

            const notifications = await db('trip_notifications')
                .where('trip_id', testTrip.id)
                .where('type', 'delay');

            expect(notifications).toHaveLength(0);
        });

        it('should handle incidents without location', async () => {
            const incidentRequest: IncidentReportRequest = {
                tripId: testTrip.id,
                incidentType: 'other',
                severity: 'low',
                description: 'General issue without specific location'
            };

            const incident = await transportService.reportIncident(incidentRequest, testDriver.id);

            expect(incident.location).toBeUndefined();
        });
    });

    describe('getTripById', () => {
        let testTrip: any;

        beforeEach(async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id,
                notes: 'Test trip for retrieval'
            };

            testTrip = await transportService.createTrip(tripRequest, testDispatcher.id);
        });

        it('should retrieve trip by ID', async () => {
            const retrievedTrip = await transportService.getTripById(testTrip.id);

            expect(retrievedTrip).toBeDefined();
            expect(retrievedTrip?.id).toBe(testTrip.id);
            expect(retrievedTrip?.status).toBe('planned');
            expect(retrievedTrip?.driverId).toBe(testDriver.id);
            expect(retrievedTrip?.notes).toBe('Test trip for retrieval');
        });

        it('should return null for non-existent trip', async () => {
            const nonExistentId = 'non-existent-id';
            const retrievedTrip = await transportService.getTripById(nonExistentId);

            expect(retrievedTrip).toBeNull();
        });
    });

    describe('getTripsByStatus', () => {
        beforeEach(async () => {
            // Create trips with different statuses
            const tripRequest1: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            const tripRequest2: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 7200000),
                driverId: testDriver.id
            };

            const trip1 = await transportService.createTrip(tripRequest1, testDispatcher.id);
            const trip2 = await transportService.createTrip(tripRequest2, testDispatcher.id);

            // Update one trip to assigned status
            await transportService.updateTripStatus(trip1.id, 'assigned', testDispatcher.id);
        });

        it('should retrieve trips by status', async () => {
            const plannedTrips = await transportService.getTripsByStatus('planned');
            const assignedTrips = await transportService.getTripsByStatus('assigned');

            expect(plannedTrips).toHaveLength(1);
            expect(assignedTrips).toHaveLength(1);
            expect(plannedTrips[0].status).toBe('planned');
            expect(assignedTrips[0].status).toBe('assigned');
        });

        it('should respect limit parameter', async () => {
            const trips = await transportService.getTripsByStatus('planned', 1);
            expect(trips).toHaveLength(1);
        });

        it('should respect offset parameter', async () => {
            const allTrips = await transportService.getTripsByStatus('planned', 10, 0);
            const offsetTrips = await transportService.getTripsByStatus('planned', 10, 1);

            expect(offsetTrips.length).toBe(Math.max(0, allTrips.length - 1));
        });
    });

    describe('getDriverActiveTrips', () => {
        beforeEach(async () => {
            // Create trips for the test driver
            const tripRequest1: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000),
                driverId: testDriver.id
            };

            const tripRequest2: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 7200000),
                driverId: testDriver.id
            };

            const trip1 = await transportService.createTrip(tripRequest1, testDispatcher.id);
            const trip2 = await transportService.createTrip(tripRequest2, testDispatcher.id);

            // Update trips to active statuses
            await transportService.updateTripStatus(trip1.id, 'assigned', testDispatcher.id);
            await transportService.updateTripStatus(trip2.id, 'assigned', testDispatcher.id);
            await transportService.updateTripStatus(trip2.id, 'in_progress', testDriver.id);
        });

        it('should retrieve active trips for driver', async () => {
            const activeTrips = await transportService.getDriverActiveTrips(testDriver.id);

            expect(activeTrips).toHaveLength(2);
            expect(activeTrips.every(trip => ['assigned', 'in_progress'].includes(trip.status))).toBe(true);
            expect(activeTrips.every(trip => trip.driverId === testDriver.id)).toBe(true);
        });

        it('should return empty array for driver with no active trips', async () => {
            const otherDriver = await TestDataFactory.createUser({ role: 'driver' });
            const activeTrips = await transportService.getDriverActiveTrips(otherDriver.id);

            expect(activeTrips).toHaveLength(0);
        });

        it('should order trips by scheduled time', async () => {
            const activeTrips = await transportService.getDriverActiveTrips(testDriver.id);

            expect(activeTrips).toHaveLength(2);
            expect(new Date(activeTrips[0].scheduledAt).getTime())
                .toBeLessThanOrEqual(new Date(activeTrips[1].scheduledAt).getTime());
        });
    });

    describe('assignDriver', () => {
        let testTrip: any;
        let otherDriver: any;

        beforeEach(async () => {
            const tripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 3600000)
                // No driver initially assigned
            };

            testTrip = await transportService.createTrip(tripRequest, testDispatcher.id);
            otherDriver = await TestDataFactory.createUser({ role: 'driver' });
        });

        it('should assign driver to planned trip', async () => {
            const updatedTrip = await transportService.assignDriver(
                testTrip.id,
                testDriver.id,
                testDispatcher.id
            );

            expect(updatedTrip.driverId).toBe(testDriver.id);
            expect(updatedTrip.status).toBe('assigned');
        });

        it('should create assignment notification', async () => {
            await transportService.assignDriver(testTrip.id, testDriver.id, testDispatcher.id);

            const notifications = await db('trip_notifications')
                .where('trip_id', testTrip.id)
                .where('recipient_id', testDriver.id)
                .where('type', 'assignment');

            expect(notifications.length).toBeGreaterThan(0);
        });

        it('should reject assignment to non-planned trip', async () => {
            // Update trip to assigned status first
            await transportService.updateTripStatus(testTrip.id, 'assigned', testDispatcher.id);

            await expect(
                transportService.assignDriver(testTrip.id, otherDriver.id, testDispatcher.id)
            ).rejects.toThrow('Trip must be in planned status to assign driver');
        });

        it('should reject assignment to busy driver', async () => {
            // Create another trip and assign the driver
            const otherTripRequest: TripCreationRequest = {
                workerIds: [testWorker.id],
                scheduledAt: new Date(Date.now() + 7200000),
                driverId: testDriver.id
            };

            await transportService.createTrip(otherTripRequest, testDispatcher.id);

            // Try to assign the same driver to the first trip
            await expect(
                transportService.assignDriver(testTrip.id, testDriver.id, testDispatcher.id)
            ).rejects.toThrow('Driver is already assigned to an active trip');
        });
    });

    describe('getDashboardStats', () => {
        beforeEach(async () => {
            // Create trips with various statuses
            const tripRequests = [
                { status: 'assigned' },
                { status: 'in_progress' },
                { status: 'completed' },
                { status: 'completed' }
            ];

            for (const request of tripRequests) {
                const tripRequest: TripCreationRequest = {
                    workerIds: [testWorker.id],
                    scheduledAt: new Date(Date.now() + 3600000),
                    driverId: testDriver.id
                };

                const trip = await transportService.createTrip(tripRequest, testDispatcher.id);

                if (request.status !== 'planned') {
                    await transportService.updateTripStatus(trip.id, 'assigned', testDispatcher.id);
                }

                if (request.status === 'in_progress') {
                    await transportService.updateTripStatus(trip.id, 'in_progress', testDriver.id);
                }

                if (request.status === 'completed') {
                    await transportService.updateTripStatus(trip.id, 'in_progress', testDriver.id);
                    await transportService.updateTripStatus(trip.id, 'completed', testDriver.id);
                }
            }
        });

        it('should return dashboard statistics', async () => {
            const stats = await transportService.getDashboardStats();

            expect(stats).toBeDefined();
            expect(stats.activeTrips).toBe(2); // assigned + in_progress
            expect(stats.availableDrivers).toBeGreaterThanOrEqual(0);
            expect(stats.completedToday).toBe(2);
            expect(stats.averageDelay).toBeGreaterThanOrEqual(0);
            expect(stats.activeWorkers).toBe(0); // Simplified implementation
        });

        it('should count active trips correctly', async () => {
            const stats = await transportService.getDashboardStats();
            expect(stats.activeTrips).toBe(2);
        });

        it('should count completed trips for today', async () => {
            const stats = await transportService.getDashboardStats();
            expect(stats.completedToday).toBe(2);
        });
    });
});