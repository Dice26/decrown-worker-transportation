import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, User, Mail, Phone, Calendar, Building, MapPin, Lock, Eye, EyeOff } from 'lucide-react'

const PersonalInfoForm = () => {
    const navigate = useNavigate()
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        company: '',
        workSite: '',
        password: '',
        confirmPassword: '',
        agreeToTerms: false
    })
    const [errors, setErrors] = useState({})

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }))
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }))
        }
    }

    const validateForm = () => {
        const newErrors = {}

        if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required'
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required'
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Email is invalid'
        }
        if (!formData.phone.trim()) {
            newErrors.phone = 'Phone number is required'
        } else if (!/^\+?[\d\s-()]+$/.test(formData.phone)) {
            newErrors.phone = 'Phone number is invalid'
        }
        if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required'
        if (!formData.company.trim()) newErrors.company = 'Company is required'
        if (!formData.workSite) newErrors.workSite = 'Work site is required'
        if (!formData.password) {
            newErrors.password = 'Password is required'
        } else if (formData.password.length < 8) {
            newErrors.password = 'Password must be at least 8 characters'
        }
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match'
        }
        if (!formData.agreeToTerms) {
            newErrors.agreeToTerms = 'You must agree to the terms and conditions'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (validateForm()) {
            // Store form data in localStorage for now
            localStorage.setItem('registrationData', JSON.stringify(formData))
            navigate('/register/kyc')
        }
    }

    const workSites = [
        'Construction Site A - Downtown',
        'Construction Site B - Uptown',
        'Manufacturing Plant - Industrial Zone',
        'Warehouse - Port Area',
        'Office Complex - Business District'
    ]

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-deep-blue p-4 flex items-center">
                <button onClick={() => navigate(-1)} className="p-2 text-white">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="flex-1 text-center text-xl font-bold text-white pr-10">
                    Personal Information
                </h1>
            </div>

            {/* Progress */}
            <div className="bg-white p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Step 1 of 3</span>
                    <span className="text-sm text-gray-500">Personal Info</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-orange h-2 rounded-full" style={{ width: '33%' }}></div>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Full Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                    </label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            name="fullName"
                            value={formData.fullName}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.fullName ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                            placeholder="John Doe"
                        />
                    </div>
                    {errors.fullName && <p className="mt-1 text-sm text-red-500">{errors.fullName}</p>}
                </div>

                {/* Email */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                    </label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.email ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                            placeholder="john.doe@example.com"
                        />
                    </div>
                    {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number *
                    </label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.phone ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                            placeholder="+1 (555) 123-4567"
                        />
                    </div>
                    {errors.phone && <p className="mt-1 text-sm text-red-500">{errors.phone}</p>}
                </div>

                {/* Date of Birth */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date of Birth *
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="date"
                            name="dateOfBirth"
                            value={formData.dateOfBirth}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.dateOfBirth ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                        />
                    </div>
                    {errors.dateOfBirth && <p className="mt-1 text-sm text-red-500">{errors.dateOfBirth}</p>}
                </div>

                {/* Company */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Company/Employer *
                    </label>
                    <div className="relative">
                        <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            name="company"
                            value={formData.company}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.company ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                            placeholder="ABC Construction Co."
                        />
                    </div>
                    {errors.company && <p className="mt-1 text-sm text-red-500">{errors.company}</p>}
                </div>

                {/* Work Site */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Work Site Location *
                    </label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <select
                            name="workSite"
                            value={formData.workSite}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.workSite ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent appearance-none`}
                        >
                            <option value="">Select work site</option>
                            {workSites.map((site, index) => (
                                <option key={index} value={site}>{site}</option>
                            ))}
                        </select>
                    </div>
                    {errors.workSite && <p className="mt-1 text-sm text-red-500">{errors.workSite}</p>}
                </div>

                {/* Password */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Password *
                    </label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-12 py-3 border ${errors.password ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                            placeholder="Min. 8 characters"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                        >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                    {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm Password *
                    </label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className={`w-full pl-10 pr-4 py-3 border ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'} rounded-xl focus:ring-2 focus:ring-orange focus:border-transparent`}
                            placeholder="Re-enter password"
                        />
                    </div>
                    {errors.confirmPassword && <p className="mt-1 text-sm text-red-500">{errors.confirmPassword}</p>}
                </div>

                {/* Terms and Conditions */}
                <div>
                    <label className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            name="agreeToTerms"
                            checked={formData.agreeToTerms}
                            onChange={handleChange}
                            className="mt-1 w-5 h-5 text-orange border-gray-300 rounded focus:ring-orange"
                        />
                        <span className="text-sm text-gray-700">
                            I agree to the <a href="#" className="text-orange font-medium">Terms and Conditions</a> and <a href="#" className="text-orange font-medium">Privacy Policy</a>
                        </span>
                    </label>
                    {errors.agreeToTerms && <p className="mt-1 text-sm text-red-500">{errors.agreeToTerms}</p>}
                </div>
            </form>

            {/* Bottom Button */}
            <div className="p-6 bg-white border-t">
                <button
                    onClick={handleSubmit}
                    className="w-full bg-orange hover:bg-orange-600 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    <span>Continue to KYC Verification</span>
                    <ArrowRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    )
}

export default PersonalInfoForm
