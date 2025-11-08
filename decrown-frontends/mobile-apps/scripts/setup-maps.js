#!/usr/bin/env node

/**
 * Google Maps API Setup Script
 * This script helps configure the Google Maps API key
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

const envPath = path.join(__dirname, '..', '.env')
const envExamplePath = path.join(__dirname, '..', '.env.example')

console.log('\n🗺️  Google Maps API Configuration\n')
console.log('This script will help you configure your Google Maps API key.\n')

// Check if .env already exists
if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists.')
    rl.question('Do you want to update it? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y') {
            promptForApiKey()
        } else {
            console.log('\n✅ Keeping existing configuration.')
            rl.close()
        }
    })
} else {
    promptForApiKey()
}

function promptForApiKey() {
    console.log('\n📝 To get your Google Maps API key:')
    console.log('1. Go to https://console.cloud.google.com/')
    console.log('2. Create a new project or select existing one')
    console.log('3. Enable these APIs:')
    console.log('   - Maps JavaScript API')
    console.log('   - Places API')
    console.log('   - Geocoding API')
    console.log('   - Distance Matrix API')
    console.log('4. Go to Credentials and create an API key\n')

    rl.question('Enter your Google Maps API key: ', (apiKey) => {
        if (!apiKey || apiKey.trim() === '') {
            console.log('\n❌ API key cannot be empty.')
            rl.close()
            return
        }

        // Read .env.example as template
        let envContent = ''
        if (fs.existsSync(envExamplePath)) {
            envContent = fs.readFileSync(envExamplePath, 'utf8')
            // Replace the placeholder with actual key
            envContent = envContent.replace(
                /VITE_GOOGLE_MAPS_API_KEY=.*/,
                `VITE_GOOGLE_MAPS_API_KEY=${apiKey.trim()}`
            )
        } else {
            // Create from scratch
            envContent = `# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=${apiKey.trim()}

# API Base URL
VITE_API_BASE_URL=http://localhost:3000/api

# WebSocket URL
VITE_WS_URL=ws://localhost:3000
`
        }

        // Write to .env
        fs.writeFileSync(envPath, envContent)

        console.log('\n✅ Configuration saved to .env')
        console.log('\n🚀 Next steps:')
        console.log('1. Restart your development server')
        console.log('2. Test the map functionality in the app')
        console.log('3. Check browser console for any errors\n')

        rl.close()
    })
}

rl.on('close', () => {
    process.exit(0)
})
