"use client";

import { propertyLocations } from '@/app/data/locations';
import PropertyCard from './PropertyCard';

interface PropertySidebarProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
}

/**
 * Left sidebar showing all available properties
 */
export default function PropertySidebar({ isOpen, onToggle }: PropertySidebarProps) {
  return (
    <>
      {/* Open sidebar button - only show when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => onToggle(true)}
          className="fixed left-4 top-4 z-40 bg-p10-dark/90 text-white p-3 rounded hover:bg-p10-dark transition-colors backdrop-blur-sm"
          aria-label="Open sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Sidebar - always in DOM, slides in/out */}
      <div
        className={`fixed left-0 top-0 h-screen w-[450px] bg-p10-blue overflow-y-auto z-40 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      {/* Header */}
      <div className="w-full bg-p10-dark flex items-center justify-between px-6 py-5 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg">LOGO</span>
        </div>

        {/* Close Button */}
        <button
          onClick={() => onToggle(false)}
          className="w-10 h-10 bg-p10-border rounded hover:bg-p10-accent transition-colors flex items-center justify-center text-white group"
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Properties List */}
      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-5">
        {propertyLocations.map((property, index) => (
          <PropertyCard key={index} property={property} />
        ))}
      </div>
    </div>
    </>
  );
}
