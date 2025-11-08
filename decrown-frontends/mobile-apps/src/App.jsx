import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RoleSelector from './pages/RoleSelector'
import DriverApp from './pages/DriverApp'
import WorkerApp from './pages/WorkerApp'

function App() {
    return (
        <Routes>
            <Route path="/" element={<RoleSelector />} />
            <Route path="/driver/*" element={<DriverApp />} />
            <Route path="/worker/*" element={<WorkerApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}

export default App
