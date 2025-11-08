import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RoleSelector from './pages/RoleSelector'
import DriverApp from './pages/DriverApp'
import WorkerApp from './pages/WorkerApp'
import BookRide from './pages/BookRide'
import Welcome from './pages/registration/Welcome'
import PersonalInfoForm from './pages/registration/PersonalInfoForm'
import KYCUpload from './pages/registration/KYCUpload'
import FaceVerification from './pages/registration/FaceVerification'
import AccountPending from './pages/registration/AccountPending'
import AccountApproved from './pages/registration/AccountApproved'

function App() {
    return (
        <Routes>
            <Route path="/" element={<RoleSelector />} />
            <Route path="/login" element={<RoleSelector />} />

            {/* Registration Flow */}
            <Route path="/register" element={<Welcome />} />
            <Route path="/register/personal-info" element={<PersonalInfoForm />} />
            <Route path="/register/kyc" element={<KYCUpload />} />
            <Route path="/register/face-verify" element={<FaceVerification />} />
            <Route path="/register/pending" element={<AccountPending />} />
            <Route path="/register/approved" element={<AccountApproved />} />

            {/* Main Apps */}
            <Route path="/driver/*" element={<DriverApp />} />
            <Route path="/worker/*" element={<WorkerApp />} />
            <Route path="/book-ride" element={<BookRide />} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}

export default App
