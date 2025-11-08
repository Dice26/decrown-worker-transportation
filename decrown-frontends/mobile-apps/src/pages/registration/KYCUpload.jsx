import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Upload, FileText, CheckCircle, AlertCircle, Camera } from 'lucide-react'

const KYCUpload = () => {
    const navigate = useNavigate()
    const [documentType, setDocumentType] = useState('')
    const [frontImage, setFrontImage] = useState(null)
    const [backImage, setBackImage] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [errors, setErrors] = useState({})

    const documentTypes = [
        { value: 'id', label: 'National ID Card' },
        { value: 'license', label: 'Driver\'s License' },
        { value: 'passport', label: 'Passport' }
    ]

    const handleFileChange = (e, side) => {
        const file = e.target.files[0]
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                setErrors(prev => ({ ...prev, [side]: 'File size must be less than 5MB' }))
                return
            }
            if (!file.type.startsWith('image/')) {
                setErrors(prev => ({ ...prev, [side]: 'File must be an image' }))
                return
            }

            const reader = new FileReader()
            reader.onloadend = () => {
                if (side === 'front') {
                    setFrontImage({ file, preview: reader.result })
                } else {
                    setBackImage({ file, preview: reader.result })
                }
                setErrors(prev => ({ ...prev, [side]: '' }))
            }
            reader.readAsDataURL(file)
        }
    }

    const handleSubmit = async () => {
        const newErrors = {}
        if (!documentType) newErrors.documentType = 'Please select a document type'
        if (!frontImage) newErrors.front = 'Front image is required'
        if (!backImage && documentType !== 'passport') {
            newErrors.back = 'Back image is required'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        setUploading(true)

        // Simulate upload
        setTimeout(() => {
            // Store KYC data
            const registrationData = JSON.parse(localStorage.getItem('registrationData') || '{}')
            registrationData.kyc = {
                documentType,
                frontImage: frontImage.preview,
                backImage: backImage?.preview,
                uploadedAt: new Date().toISOString()
            }
            localStorage.setItem('registrationData', JSON.stringify(registrationData))

            setUploading(false)
            navigate('/register/face-verify')
        }, 2000)
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-deep-blue p-4 flex items-center">
                <button onClick={() => navigate(-1)} className="p-2 text-white">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="flex-1 text-center text-xl font-bold text-white pr-10">
                    KYC Verification
                </h1>
            </div>

            {/* Progress */}
            <div className="bg-white p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Step 2 of 3</span>
                    <span className="text-sm text-gray-500">Document Verification</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-orange h-2 rounded-full" style={{ width: '66%' }}></div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Info Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-blue-900 mb-1">Why do we need this?</h3>
                        <p className="text-sm text-blue-700">
                            We verify your identity to ensure the safety and security of all users on our platform.
                        </p>
                    </div>
                </div>

                {/* Document Type Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                        Select Document Type *
                    </label>
                    <div className="space-y-2">
                        {documentTypes.map((type) => (
                            <label
                                key={type.value}
                                className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${documentType === type.value
                                        ? 'border-orange bg-orange/5'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="documentType"
                                    value={type.value}
                                    checked={documentType === type.value}
                                    onChange={(e) => setDocumentType(e.target.value)}
                                    className="w-5 h-5 text-orange focus:ring-orange"
                                />
                                <span className="ml-3 font-medium text-gray-900">{type.label}</span>
                            </label>
                        ))}
                    </div>
                    {errors.documentType && (
                        <p className="mt-2 text-sm text-red-500">{errors.documentType}</p>
                    )}
                </div>

                {/* Front Image Upload */}
                {documentType && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Front of Document *
                        </label>
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'front')}
                                className="hidden"
                                id="front-upload"
                            />
                            <label
                                htmlFor="front-upload"
                                className={`block border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${frontImage
                                        ? 'border-green-500 bg-green-50'
                                        : errors.front
                                            ? 'border-red-500 bg-red-50'
                                            : 'border-gray-300 hover:border-orange'
                                    }`}
                            >
                                {frontImage ? (
                                    <div className="space-y-3">
                                        <img
                                            src={frontImage.preview}
                                            alt="Front"
                                            className="w-full h-48 object-cover rounded-lg"
                                        />
                                        <div className="flex items-center justify-center gap-2 text-green-600">
                                            <CheckCircle className="w-5 h-5" />
                                            <span className="font-medium">Front uploaded</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <Camera className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                                        <p className="text-gray-600 font-medium mb-1">
                                            Take or upload front photo
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            Max file size: 5MB
                                        </p>
                                    </div>
                                )}
                            </label>
                        </div>
                        {errors.front && (
                            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-4 h-4" />
                                {errors.front}
                            </p>
                        )}
                    </div>
                )}

                {/* Back Image Upload */}
                {documentType && documentType !== 'passport' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Back of Document *
                        </label>
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'back')}
                                className="hidden"
                                id="back-upload"
                            />
                            <label
                                htmlFor="back-upload"
                                className={`block border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${backImage
                                        ? 'border-green-500 bg-green-50'
                                        : errors.back
                                            ? 'border-red-500 bg-red-50'
                                            : 'border-gray-300 hover:border-orange'
                                    }`}
                            >
                                {backImage ? (
                                    <div className="space-y-3">
                                        <img
                                            src={backImage.preview}
                                            alt="Back"
                                            className="w-full h-48 object-cover rounded-lg"
                                        />
                                        <div className="flex items-center justify-center gap-2 text-green-600">
                                            <CheckCircle className="w-5 h-5" />
                                            <span className="font-medium">Back uploaded</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <Camera className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                                        <p className="text-gray-600 font-medium mb-1">
                                            Take or upload back photo
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            Max file size: 5MB
                                        </p>
                                    </div>
                                )}
                            </label>
                        </div>
                        {errors.back && (
                            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-4 h-4" />
                                {errors.back}
                            </p>
                        )}
                    </div>
                )}

                {/* Tips */}
                <div className="bg-gray-100 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Tips for best results:</h4>
                    <ul className="space-y-1 text-sm text-gray-600">
                        <li>• Ensure good lighting</li>
                        <li>• Place document on a flat surface</li>
                        <li>• Make sure all text is clearly visible</li>
                        <li>• Avoid glare and shadows</li>
                    </ul>
                </div>
            </div>

            {/* Bottom Button */}
            <div className="p-6 bg-white border-t">
                <button
                    onClick={handleSubmit}
                    disabled={uploading}
                    className="w-full bg-orange hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    {uploading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Uploading...</span>
                        </>
                    ) : (
                        <>
                            <span>Continue to Face Verification</span>
                            <ArrowRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

export default KYCUpload
