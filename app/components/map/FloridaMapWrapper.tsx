"use client";

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const FloridaMap = dynamic(() => import("./FloridaMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-p10-dark flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-p10-text-muted text-sm">Loading map...</p>
    </div>
  )
});

export default function FloridaMapWrapper() {
  return <FloridaMap />;
}
