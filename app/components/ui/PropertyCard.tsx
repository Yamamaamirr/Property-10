"use client";

import type { PropertyLocation } from '@/app/lib/types';
import Image from 'next/image';

interface PropertyCardProps {
  property: PropertyLocation;
}

/**
 * Individual property card for the sidebar
 */
export default function PropertyCard({ property }: PropertyCardProps) {
  return (
    <div className="bg-p10-blue-dark rounded overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
      {/* Property Image */}
      <div className="relative w-full h-36 bg-p10-dark overflow-hidden">
        <Image
          src={property.image}
          alt={property.title}
          fill
          className="object-cover"
          sizes="450px"
        />
        <button className="absolute top-2 left-2 bg-p10-dark/85 text-p10-accent text-xs px-3 py-1.5 rounded hover:bg-p10-dark/95 transition-colors backdrop-blur-sm font-medium">
          View full Map
        </button>
      </div>

      {/* Property Details */}
      <div className="p-4 space-y-2">
        {/* Title */}
        <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2">
          {property.title}
        </h3>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-p10-text-muted text-xs">
          <svg width="10" height="13" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 0C2.69 0 0 2.69 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
          </svg>
          <span>{property.name}</span>
        </div>

        {/* Price & Size */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-white font-semibold">{property.price}</span>
          <span className="text-p10-text-muted flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 1L1 13M13 1H7M13 1V7M1 13H7M1 13V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {property.size}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {property.tags.map((tag, idx) => (
            <span
              key={idx}
              className="bg-p10-accent/15 text-p10-text-muted text-[10px] px-2 py-1 rounded font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Add to Preferences Button */}
        <button className="w-full mt-3 flex items-center justify-center gap-2 bg-transparent border border-p10-text-muted/30 text-white text-xs py-2.5 rounded hover:bg-p10-accent/10 hover:border-p10-accent transition-all font-medium">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor"/>
          </svg>
          Add to Preferences
        </button>
      </div>
    </div>
  );
}
