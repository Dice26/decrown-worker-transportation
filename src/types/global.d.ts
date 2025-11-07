
declare namespace GeoJSON {
    interface Polygon {
        type: 'Polygon';
        coordinates: number[][][];
    }
}

declare module 'vitest' {
    export function beforeAll(fn: () => void | Promise<void>): void;
    export function afterAll(fn: () => void | Promise<void>): void;
    export function beforeEach(fn: () => void | Promise<void>): void;
}

interface WebhookEvent {
    id: string;
    type: string;
    data: any;
}
