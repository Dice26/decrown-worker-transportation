import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Shield, MapPin, CreditCard } from 'lucide-react'

const Welcome = () => {
    const navigate = useNavigate()

    const features = [
        {
            icon: MapPin,
            title: 'Easy Booking',
            description: 'Book rides with just a few taps'
        },
        {
            icon: Shield,
            title: 'Safe & Secure',
            description: 'Verified drivers and secure payments'
        },
        {
            icon: CreditCard,
            title: 'Transparent Pricing',
            description: 'Know your fare before you book'
        }
    ]

    return (
        <div className="min-h-screen bg-gradient-to-br from-deep-blue via-blue-900 to-deep-blue flex flex-col">
            {/* Logo */}
            <div className="p-6">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        👑 De<span className="text-orange">Crown</span> 📍
                    </h1>
                    <p className="text-white/80">Worker Transportation</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col justify-center px-6">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-white mb-4">
                        Reliable Transportation
                        <br />
                        <span className="text-orange">That Puts Workers First</span>
                    </h2>
                    <p className="text-white/80 text-lg">
                        Get to work safely and on time, every day
                    </p>
                </div>

                {/* Features */}
                <div className="space-y-4 mb-12">
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-4"
                        >
                            <div className="bg-orange rounded-xl p-3">
                                <feature.icon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-white font-semibold">{feature.title}</h3>
                                <p className="text-white/70 text-sm">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-6 space-y-3">
                <button
                    onClick={() => navigate('/register/personal-info')}
                    className="w-full bg-orange hover:bg-orange-600 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    <span>Get Started</span>
                    <ArrowRight className="w-5 h-5" />
                </button>
                <button
                    onClick={() => navigate('/login')}
                    className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-4 rounded-xl transition-colors"
                >
                    Already have an account? Login
                </button>
            </div>
        </div>
    )
}

export default Welcome
