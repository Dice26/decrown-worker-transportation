import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import BookingScreen from '../components/BookingScreen'
import ActiveTransport from '../components/ActiveTransport'

const MainApp = () => {
    const [hasActiveTransport, setHasActiveTransport] = useState(false)

    return (
        <div className="flex h-screen bg-gray-900 overflow-hidden">
            {!hasActiveTransport && <Sidebar />}
            <div className="flex-1 overflow-auto">
                {hasActiveTransport ? (
                    <ActiveTransport onComplete={() => setHasActiveTransport(false)} />
                ) : (
                    <Routes>
                        <Route path="/" element={<BookingScreen onBook={() => setHasActiveTransport(true)} />} />
                        <Route path="*" element={<Navigate to="/app" replace />} />
                    </Routes>
                )}
            </div>
        </div>
    )
}

export default MainApp
