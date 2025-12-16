"use client";

import dynamic from 'next/dynamic';
import Spinner from '../ui/Spinner';

const FloridaMap = dynamic(() => import("./FloridaMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-p10-dark flex flex-col items-center justify-center gap-4">
      <Spinner />
      <p className="text-p10-text-muted text-sm">Loading map...</p>
    </div>
  )
});

export default function FloridaMapWrapper() {
  return <FloridaMap />;
}
