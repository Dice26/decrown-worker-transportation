// DeCrown Frontend - Main JavaScript

// API Configuration
const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://decrown-worker-transportation.onrender.com';

// Check API Status on load
async function checkAPIStatus() {
    const statusElement = document.getElementById('apiStatus');
    const apiInfoElement = document.getElementById('apiInfo');

    try {
        const response = await fetch(`${API_URL}/`);
        const data = await response.json();

        if (response.ok) {
            statusElement.classList.add('online');
            statusElement.innerHTML = '<span class="status-dot"></span><span>API Online</span>';

            apiInfoElement.innerHTML = `
                <p><strong>Status:</strong> ${data.status}</p>
                <p><strong>Version:</strong> ${data.version}</p>
                <p><strong>Message:</strong> ${data.message}</p>
                <p><strong>API URL:</strong> ${API_URL}</p>
            `;
        }
    } catch (error) {
        statusElement.classList.add('offline');
        statusElement.innerHTML = '<span class="status-dot"></span><span>API Offline</span>';

        apiInfoElement.innerHTML = `
            <p style="color: #f44336;"><strong>Error:</strong> Unable to connect to API</p>
            <p><strong>API URL:</strong> ${API_URL}</p>
            <p><strong>Details:</strong> ${error.message}</p>
        `;
    }
}

// Test individual endpoint
async function testEndpoint(path) {
    const responseOutput = document.getElementById('responseOutput');
    responseOutput.textContent = 'Loading...';

    try {
        const response = await fetch(`${API_URL}${path}`);
        const data = await response.json();

        const formatted = JSON.stringify(data, null, 2);
        responseOutput.textContent = `Status: ${response.status} ${response.statusText}\n\n${formatted}`;
        responseOutput.style.color = response.ok ? '#4caf50' : '#f44336';
    } catch (error) {
        responseOutput.textContent = `Error: ${error.message}`;
        responseOutput.style.color = '#f44336';
    }
}

// Make testEndpoint available globally
window.testEndpoint = testEndpoint;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAPIStatus();

    // Refresh API status every 30 seconds
    setInterval(checkAPIStatus, 30000);
});
