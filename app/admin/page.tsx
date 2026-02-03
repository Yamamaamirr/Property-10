"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const router = useRouter();

  // Redirect to state selector immediately - this is just a redirect page
  useEffect(() => {
    const selectedState = localStorage.getItem('selectedState');
    const fromStateSelector = sessionStorage.getItem('fromStateSelector');

    if (!selectedState || !fromStateSelector) {
      router.replace('/admin/state-selector');
    } else {
      // Clear the flag and go to dashboard
      sessionStorage.removeItem('fromStateSelector');
      router.replace('/admin/dashboard');
    }
  }, [router]);

  // Render nothing - this page just redirects
  return null;
}
