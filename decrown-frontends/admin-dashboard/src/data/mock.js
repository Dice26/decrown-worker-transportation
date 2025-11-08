// Mock data for DeCrown Worker Transportation

export const countries = [
    { id: 1, name: 'United States', code: 'US' },
    { id: 2, name: 'Canada', code: 'CA' },
    { id: 3, name: 'United Kingdom', code: 'GB' },
    { id: 4, name: 'Australia', code: 'AU' },
    { id: 5, name: 'Germany', code: 'DE' },
    { id: 6, name: 'France', code: 'FR' },
    { id: 7, name: 'Spain', code: 'ES' },
    { id: 8, name: 'Italy', code: 'IT' },
    { id: 9, name: 'Netherlands', code: 'NL' },
    { id: 10, name: 'Belgium', code: 'BE' },
];

export const languages = [
    { id: 1, name: 'English', code: 'en' },
    { id: 2, name: 'Español', code: 'es' },
    { id: 3, name: 'Français', code: 'fr' },
    { id: 4, name: 'Deutsch', code: 'de' },
];

export const vehicleTypes = [
    {
        id: 1,
        name: 'Standard Van',
        icon: 'Car',
        price: 45.00,
        eta: '5 min',
        capacity: 8,
        description: 'Standard worker transport'
    },
    {
        id: 2,
        name: 'Comfort Van',
        icon: 'Car',
        price: 60.00,
        eta: '7 min',
        capacity: 8,
        description: 'More comfortable seating'
    },
    {
        id: 3,
        name: 'Premium Bus',
        icon: 'Car',
        price: 120.00,
        eta: '10 min',
        capacity: 20,
        description: 'Large group transport'
    },
    {
        id: 4,
        name: 'Executive Van',
        icon: 'Car',
        price: 85.00,
        eta: '8 min',
        capacity: 6,
        description: 'Premium comfort'
    },
];

export const transportHistory = [
    {
        id: 1,
        date: '2025-01-07',
        time: '06:30',
        from: 'Worker Housing Complex A',
        to: 'Construction Site - Downtown',
        driver: 'John Smith',
        vehicle: 'Standard Van',
        price: 45.00,
        rating: 5,
        status: 'completed',
        workers: 8
    },
    {
        id: 2,
        date: '2025-01-06',
        time: '06:15',
        from: 'Worker Housing Complex B',
        to: 'Manufacturing Plant - North',
        driver: 'Maria Garcia',
        vehicle: 'Comfort Van',
        price: 60.00,
        rating: 4,
        status: 'completed',
        workers: 7
    },
    {
        id: 3,
        date: '2025-01-05',
        time: '14:30',
        from: 'Construction Site - Downtown',
        to: 'Worker Housing Complex A',
        driver: 'Ahmed Khan',
        vehicle: 'Standard Van',
        price: 45.00,
        rating: 5,
        status: 'completed',
        workers: 8
    },
];

export const currentTransport = {
    id: 1001,
    status: 'arriving',
    driver: {
        name: 'David Johnson',
        rating: 4.9,
        photo: 'https://i.pravatar.cc/150?img=12',
        phone: '+1234567890'
    },
    vehicle: {
        type: 'Standard Van',
        make: 'Ford',
        model: 'Transit',
        color: 'White',
        plate: 'ABC 1234',
        capacity: 8
    },
    pickup: 'Worker Housing Complex A',
    destination: 'Construction Site - Downtown',
    eta: '5 min',
    distance: '8.2 km',
    price: 45.00,
    workers: 8
};

export const userProfile = {
    id: 1,
    name: 'Alex Thompson',
    email: 'alex@decrown.com',
    phone: '+1234567890',
    photo: 'https://i.pravatar.cc/150?img=33',
    role: 'dispatcher',
    company: 'DeCrown Transportation',
    totalTransports: 1247,
    memberSince: '2023-05-15'
};

export const savedPlaces = [
    { id: 1, label: 'Housing Complex A', address: '123 Worker Street, City', icon: 'Home' },
    { id: 2, label: 'Construction Site', address: '456 Building Ave, City', icon: 'Briefcase' },
    { id: 3, label: 'Manufacturing Plant', address: '789 Factory Rd, City', icon: 'Building' },
];
