import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'

const FaceVerification = () => {
    const navigate = useNavigate()
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const [stream, setStream] = useState(null)
    const [capturedImage, setCapturedImage] = useState(null)
    const [verifying, setVerifying] = useState(false)
    const [cameraError, setCameraError] = useState(null)
    const [step, setStep] = useState('instructions') // instructions, capture, verify

    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop())
            }
        }
    }, [stream])

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 1280, height: 720 }
            })
            setStream(mediaStream)
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream
            }
            setStep('capture')
            setCameraError(null)
        } catch (error) {
            setCameraError('Unable to access camera. Please grant camera permissions.')
        }
    }

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current
            const canvas = canvasRef.current
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0)
            const imageData = canvas.toDataURL('image/jpeg', 0.8)
            setCapturedImage(imageData)

            // Stop camera
            if (stream) {
                stream.getTracks().forEach(track => track.stop())
            }
            setStep('verify')
        }
    }

    const retakePhoto = () => {
        setCapturedImage(null)
        startCamera()
    }

    const handleVerify = async () => {
        setVerifying(true)

        // Simulate face verification
        setTimeout(() => {
            const registrationData = JSON.parse(localStorage.getItem('registrationData') || '{}')
            registrationData.faceVerification = {
                faceImage: capturedImage,
                verified: true,
                verifiedAt: new Date().toISOString(),
                matchScore: 0.95
            }
            localStorage.setItem('registrationData', JSON.stringify(registrationData))

            setVerifying(false)
            navigate('/register/pending')
        }, 3000)
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-deep-blue p-4 flex items-center">
                <button onClick={() => navigate(-1)} className="p-2 text-white">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="flex-1 text-center text-xl font-bold text-white pr-10">
                    Face Verification
                </h1>
            </div>

            {/* Progress */}
            <div className="bg-white p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Step 3 of 3</span>
                    <span className="text-sm text-gray-500">Face Verification</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-orange h-2 rounded-full" style={{ width: '100%' }}></div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {step === 'instructions' && (
                    <div className="space-y-6">
                        {/* Info Card */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                            <Camera className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-blue-900 mb-1">Face Verification</h3>
                                <p className="text-sm text-blue-700">
                                    We'll take a photo of your face to verify your identity. This helps keep everyone safe.
                                </p>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="bg-white rounded-xl p-6 shadow-sm">
                            <h3 className="font-semibold text-gray-900 mb-4">Before you start:</h3>
                            <ul className="space-y-3">
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <span className="text-gray-700">Find a well-lit area</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <span className="text-gray-700">Remove glasses and hats</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <span className="text-gray-700">Look directly at the camera</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <span className="text-gray-700">Keep a neutral expression</span>
                                </li>
                            </ul>
                        </div>

                        {cameraError && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{cameraError}</p>
                            </div>
                        )}
                    </div>
                )}

                {step === 'capture' && (
                    <div className="space-y-4">
                        {/* Camera View */}
                        <div className="relative bg-black rounded-2xl overflow-hidden">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-auto"
                            />
                            {/* Face Oval Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-64 h-80 border-4 border-white/50 rounded-full"></div>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                            <p className="text-blue-900 font-medium">
                                Position your face within the oval
                            </p>
                        </div>
                    </div>
                )}

                {step === 'verify' && capturedImage && (
                    <div className="space-y-4">
                        {/* Captured Image */}
                        <div className="bg-white rounded-2xl overflow-hidden shadow-lg">
                            <img
                                src={capturedImage}
                                alt="Captured face"
                                className="w-full h-auto"
                            />
                        </div>

                        {/* Verification Status */}
                        {verifying ? (
                            <div className="bg-blue-50 rounded-xl p-6 text-center">
                                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                                <p className="text-blue-900 font-medium">Verifying your identity...</p>
                                <p className="text-sm text-blue-700 mt-1">This may take a few seconds</p>
                            </div>
                        ) : (
                            <div className="bg-green-50 rounded-xl p-4 text-center">
                                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                                <p className="text-green-900 font-medium">Photo looks good!</p>
                            </div>
                        )}
                    </div>
                )}

                <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Bottom Buttons */}
            <div className="p-6 bg-white border-t space-y-3">
                {step === 'instructions' && (
                    <button
                        onClick={startCamera}
                        className="w-full bg-orange hover:bg-orange-600 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        <Camera className="w-5 h-5" />
                        <span>Start Camera</span>
                    </button>
                )}

                {step === 'capture' && (
                    <button
                        onClick={capturePhoto}
                        className="w-full bg-orange hover:bg-orange-600 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        <Camera className="w-5 h-5" />
                        <span>Capture Photo</span>
                    </button>
                )}

                {step === 'verify' && !verifying && (
                    <>
                        <button
                            onClick={handleVerify}
                            className="w-full bg-orange hover:bg-orange-600 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                        >
                            <span>Verify & Continue</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                        <button
                            onClick={retakePhoto}
                            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                        >
                            <RefreshCw className="w-5 h-5" />
                            <span>Retake Photo</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

export default FaceVerification
