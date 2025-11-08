import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import CountrySelector from './pages/CountrySelector'
import MainApp from './pages/MainApp'

function App() {
    const [country, setCountry] = useState(localStorage.getItem('decrown_country'))

    if (!country) {
        return <CountrySelector onSelect={setCountry} />
    }

    return (
        <Routes>
            <Route path="/app/*" element={<MainApp />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
    )
}

export default App
