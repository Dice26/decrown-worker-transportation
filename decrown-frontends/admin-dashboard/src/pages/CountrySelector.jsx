import React, { useState } from 'react'
import { Globe } from 'lucide-react'
import { countries, languages } from '../data/mock'

const CountrySelector = ({ onSelect }) => {
    const [selectedLanguage, setSelectedLanguage] = useState('en')
    const [selectedCountry, setSelectedCountry] = useState(null)

    const handleCountrySelect = (country) => {
        setSelectedCountry(country)
        setTimeout(() => {
            localStorage.setItem('decrown_country', country.code)
            localStorage.setItem('decrown_language', selectedLanguage)
            onSelect(country.code)
        }, 300)
    }

    const midPoint = Math.ceil(countries.length / 2)
    const leftColumn = countries.slice(0, midPoint)
    const rightColumn = countries.slice(midPoint)

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <div className="p-6">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-4xl font-bold text-deep-blue">
                        👑 DeCrown 📍
                    </h1>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex items-start justify-center pt-20">
                <div className="w-full max-w-3xl px-6">
                    <h2 className="text-2xl font-medium text-center mb-8 text-gray-900">
                        Please select your country and language
                    </h2>

                    {/* Language Selector */}
                    <div className="flex justify-center mb-12">
                        <div className="w-64">
                            <select
                                value={selectedLanguage}
                                onChange={(e) => setSelectedLanguage(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                            >
                                {languages.map((lang) => (
                                    <option key={lang.id} value={lang.code}>
                                        🌐 {lang.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Countries Grid */}
                    <div className="grid grid-cols-2 gap-x-32 gap-y-5 max-w-2xl mx-auto">
                        <div className="space-y-5">
                            {leftColumn.map((country) => (
                                <button
                                    key={country.id}
                                    onClick={() => handleCountrySelect(country)}
                                    className={`text-left text-gray-700 hover:text-orange transition-colors duration-200 text-base ${selectedCountry?.id === country.id ? 'text-orange font-medium' : ''
                                        }`}
                                >
                                    {country.name}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-5">
                            {rightColumn.map((country) => (
                                <button
                                    key={country.id}
                                    onClick={() => handleCountrySelect(country)}
                                    className={`text-left text-gray-700 hover:text-orange transition-colors duration-200 text-base ${selectedCountry?.id === country.id ? 'text-orange font-medium' : ''
                                        }`}
                                >
                                    {country.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CountrySelector
