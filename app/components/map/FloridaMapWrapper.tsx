"use client";

import dynamic from 'next/dynamic';

const FloridaMap = dynamic(() => import("./FloridaMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen relative bg-p10-dark flex items-center justify-center text-p10-text-muted">
      Loading map...
    </div>
  )
});

export default function FloridaMapWrapper() {
  return <FloridaMap />;
}
