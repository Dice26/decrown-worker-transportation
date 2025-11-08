import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle, Mail, Phone, RefreshCw } from 'lucide-react'

const AccountPending = () => {
    const navigate = useNavigate()
    const [timeElapsed, setTimeElapsed] = useState(0)
    const [checkingStatus, setCheckingStatus] = useState(false)

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeElapsed(prev => prev + 1)
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const checkStatus = async () => {
        setCheckingStatus(true)
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            if (timeElapsed > 30) {
                navigate('/register/approved')
            } else {
                setCheckingStatus(false)
            }
        } catch (error) {
            setCheckingStatus(false)
        }
    }

    const registrationData = JSON.parse(localStorage.getItem('registrationData') || '{}')

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-deep-blue p-4">
                <h1 className="text-center text-xl font-bold text-white">Account Review</h1>
            </div>

            <div className="flex-1 p-6 space-y-8">
                <div className="text-center">
                    <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-12 h-12 text-yellow-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Under Review</h2>
                    <p className="text-gray-600">
                        We're reviewing your information and documents. This usually takes a few minutes.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">Personal Information</h3>
                            <p className="text-sm text-gray-600">Completed</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">Document Verification</h3>
                            <p className="text-sm text-gray-600">Under review</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">Face Verification</h3>
                            <p className="text-sm text-gray-600">Under review</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border">
                        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">Final Approval</h3>
                            <p className="text-sm text-gray-600">Pending</p>
                        </div>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="text-center">
                        <h3 className="font-semibold text-blue-900 mb-2">Review Time</h3>
                        <div className="text-3xl font-bold text-blue-600 mb-1">{formatTime(timeElapsed)}</div>
                        <p className="text-sm text-blue-700">Average review time: 2-5 minutes</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl border p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">We'll notify you when ready</h3>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-600">{registrationData.email}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-600">{registrationData.phone}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-white border-t space-y-3">
                <button
                    onClick={checkStatus}
                    disabled={checkingStatus}
                    className="w-full bg-orange hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    {checkingStatus ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Checking Status...</span>
                        </>
                    ) : (
                        <>
                            <RefreshCw className="w-5 h-5" />
                            <span>Check Status</span>
                        </>
                    )}
                </button>
                <button
                    onClick={() => navigate('/login')}
                    className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-4 rounded-xl transition-colors"
                >
                    Back to Login
                </button>
            </div>
        </div>
    )
}

export default AccountPending
