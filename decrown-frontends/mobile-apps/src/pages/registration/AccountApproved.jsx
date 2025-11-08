import React from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, ArrowRight, Gift, MapPin, Shield, CreditCard } from 'lucide-react'

const AccountApproved = () => {
    const navigate = useNavigate()

    const features = [
        {
            icon: MapPin,
            title: 'Book Rides',
            description: 'Easy pickup and destination selection'
        },
        {
            icon: Shield,
            title: 'Track Safely',
            description: 'Real-time location and driver info'
        },
        {
            icon: CreditCard,
            title: 'Pay Securely',
            description: 'Automated billing and receipts'
        }
    ]

    const handleGetStarted = () => {
        localStorage.removeItem('registrationData')
        navigate('/worker')
    }

    const registrationData = JSON.parse(localStorage.getItem('registrationData') || '{}')

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-500 via-green-600 to-green-700 flex flex-col">
            <div className="flex-1 p-6 flex flex-col justify-center space-y-8">
                <div className="text-center">
                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-20 h-20 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome to DeCrown!</h1>
                    <p className="text-green-100 text-lg">Your account has been approved</p>
                </div>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
                    <h2 className="text-xl font-semibold text-white mb-2">
                        Hi {registrationData.fullName?.split(' ')[0]}! 👋
                    </h2>
                    <p className="text-green-100">
                        You're all set to start booking reliable transportation to {registrationData.workSite}
                    </p>
                </div>

                <div className="bg-orange rounded-2xl p-6 text-center">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <Gift className="w-6 h-6 text-white" />
                        <h3 className="text-xl font-bold text-white">Welcome Bonus!</h3>
                    </div>
                    <p className="text-white/90 mb-2">Get 20% off your first ride</p>
                    <div className="bg-white/20 rounded-lg px-4 py-2 inline-block">
                        <span className="text-white font-mono font-bold">WELCOME20</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white text-center mb-4">What you can do now:</h3>
                    {features.map((feature, index) => (
                        <div key={index} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-4">
                            <div className="bg-white/20 rounded-xl p-3">
                                <feature.icon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-white font-semibold">{feature.title}</h4>
                                <p className="text-white/70 text-sm">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white text-center mb-4">Join thousands of workers</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-white">10K+</div>
                            <div className="text-white/70 text-sm">Daily Rides</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">99.9%</div>
                            <div className="text-white/70 text-sm">On-Time</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">4.8★</div>
                            <div className="text-white/70 text-sm">Rating</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-3">
                <button
                    onClick={handleGetStarted}
                    className="w-full bg-white hover:bg-gray-100 text-green-600 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    <span>Start Booking Rides</span>
                    <ArrowRight className="w-5 h-5" />
                </button>

                <div className="text-center">
                    <p className="text-white/70 text-sm">
                        Need help? Contact support at{' '}
                        <a href="mailto:support@gowithdecrown.com" className="text-white underline">
                            support@gowithdecrown.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default AccountApproved
