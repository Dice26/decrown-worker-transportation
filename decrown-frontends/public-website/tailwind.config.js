/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'deep-blue': '#003366',
                'orange': '#FF6600',
                'gold': '#E3BB56',
                'success-green': '#2E8B57',
            },
        },
    },
    plugins: [],
}
