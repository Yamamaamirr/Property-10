"use client";

import { useRef, useEffect } from 'react';
import { propertyLocations } from '@/app/data/locations';
import PropertyCard from './PropertyCard';

interface PropertySidebarProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedPropertyIndex: number | null;
  onPropertySelect: (index: number) => void;
}

/**
 * Left sidebar showing all available properties
 */
export default function PropertySidebar({ isOpen, onToggle, selectedPropertyIndex, onPropertySelect }: PropertySidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll to selected card when selection changes
  useEffect(() => {
    if (selectedPropertyIndex !== null && cardRefs.current[selectedPropertyIndex] && scrollContainerRef.current) {
      const card = cardRefs.current[selectedPropertyIndex];
      const container = scrollContainerRef.current;

      if (card) {
        const cardTop = card.offsetTop;
        const cardHeight = card.offsetHeight;
        const containerHeight = container.clientHeight;
        const scrollTop = container.scrollTop;

        // Check if card is not fully visible
        if (cardTop < scrollTop || cardTop + cardHeight > scrollTop + containerHeight) {
          // Scroll to center the card in the container
          container.scrollTo({
            top: cardTop - containerHeight / 2 + cardHeight / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [selectedPropertyIndex]);
  return (
    <>
      {/* Open sidebar button - only show when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => onToggle(true)}
          className="fixed left-4 top-4 z-40 w-10 h-10 bg-p10-border rounded transition-colors flex items-center justify-center text-white hover:bg-p10-maya/20 hover:text-p10-maya"
          aria-label="Open sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Sidebar - always in DOM, slides in/out */}
      <div
        className={`fixed left-0 top-0 h-screen w-[440px] bg-p10-blue overflow-y-auto z-40 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      {/* Header */}
      <div className="w-full bg-p10-dark flex items-center justify-between px-6 py-5 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="text-white font-poppins font-bold text-lg tracking-wide">LOGO</span>
        </div>

        {/* Close Button */}
        <button
          onClick={() => onToggle(false)}
          className="group w-10 h-10 bg-p10-border rounded transition-colors flex items-center justify-center text-white hover:bg-p10-maya/20 hover:text-p10-maya"
          aria-label="Close sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Properties List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-6 space-y-5">
        {propertyLocations.map((property, index) => (
          <div
            key={index}
            ref={(el) => { cardRefs.current[index] = el; }}
          >
            <PropertyCard
              property={property}
              isSelected={selectedPropertyIndex === index}
              onClick={() => onPropertySelect(index)}
            />
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
