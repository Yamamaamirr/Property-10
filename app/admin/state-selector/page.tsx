"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import StateGlobe from '@/app/components/admin/StateGlobe';

export default function StateSelectorPage() {
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Clear any previous state selection when landing on state selector
    localStorage.removeItem('selectedState');

    // Show instructions after map animation completes (1800ms animation + 300ms delay + 200ms buffer)
    const timer = setTimeout(() => {
      setShowInstructions(true);
    }, 2300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#0a1132]">
      {/* Top bar - hidden on mobile */}
      <div className="absolute top-0 left-0 right-0 z-30 hidden md:flex items-center pr-6 py-4 bg-gradient-to-b from-[#0a1132] to-transparent">
        {/* Logo */}
        <div className="flex items-center">
          <Image src="/1.svg" alt="Property 10" width={144} height={48} className="h-12 w-36" />
        </div>
      </div>

      {/* Instructions overlay - adjusted position for mobile */}
      <div
        className={`absolute top-4 md:top-8 left-1/2 transform -translate-x-1/2 z-20 text-center pointer-events-none transition-opacity duration-700 px-4 ${
          showInstructions ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <h1 className="text-white text-base md:text-lg font-semibold mb-1">
          Select Your State
        </h1>
        <p className="text-[#8b9dc3] text-xs">
          Click on Florida to explore properties
        </p>
      </div>

      {/* Map */}
      <div className="absolute inset-0 w-full h-full">
        <StateGlobe />
      </div>
    </div>
  );
}
