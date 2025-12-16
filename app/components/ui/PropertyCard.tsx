"use client";

import type { PropertyLocation } from '@/app/lib/types';
import Image from 'next/image';

interface PropertyCardProps {
  property: PropertyLocation;
  isSelected?: boolean;
  onClick?: () => void;
}

/**
 * Individual property card for the sidebar
 */
export default function PropertyCard({ property, isSelected = false, onClick }: PropertyCardProps) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      className={`
        bg-p10-blue-dark rounded-md overflow-hidden shadow-md cursor-pointer
        transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-p10-blue-munsell
        ${isSelected
          ? 'ring-2 ring-p10-blue-munsell shadow-lg shadow-p10-blue-munsell/20 scale-[1.02]'
          : 'hover:ring-1 hover:ring-p10-maya/50 hover:shadow-lg hover:scale-[1.01]'
        }
      `}
    >
      {/* Property Image */}
      <div className="relative w-full h-32 bg-p10-dark overflow-hidden">
        <Image
          src={property.image}
          alt={property.title}
          fill
          className={`object-cover transition-transform duration-300 ${isSelected ? 'scale-105' : ''}`}
          sizes="450px"
        />
      </div>

      {/* Property Details */}
      <div className="p-4 space-y-2.5">
        {/* Title - Poppins Bold */}
        <h3 className="text-white font-poppins font-bold text-sm leading-snug line-clamp-2">
          {property.title}
        </h3>

        {/* Location - Work Sans Regular */}
        <div className="flex items-center gap-2 text-p10-text-muted text-xs font-work-sans">
          <svg width="12" height="15" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 0C2.69 0 0 2.69 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
          </svg>
          <span>{property.name}</span>
        </div>

        {/* Price & Size */}
        <div className="flex items-center gap-3 text-xs">
          {/* Price - Poppins SemiBold */}
          <span className="text-white font-poppins font-semibold text-sm">{property.price}</span>
          {/* Size - Work Sans Regular */}
          <span className="text-p10-text-muted font-work-sans flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 1L1 13M13 1H7M13 1V7M1 13H7M1 13V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {property.size}
          </span>
        </div>

        {/* Tags - Work Sans Regular */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {property.tags.map((tag, idx) => (
            <span
              key={idx}
              className="bg-p10-accent/15 text-p10-text-muted text-[11px] px-2 py-0.5 rounded-md font-work-sans"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Add to Preferences Button - Poppins SemiBold */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="w-full mt-3 flex items-center justify-center gap-2 bg-transparent border border-p10-text-muted/30 text-white text-xs py-2.5 rounded-md hover:bg-p10-accent/10 hover:border-p10-accent transition-all font-poppins font-semibold"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor"/>
          </svg>
          Add to Preferences
        </button>
      </div>
    </div>
  );
}
