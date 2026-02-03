"use client";

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useStateSelection() {
  const router = useRouter();

  const selectState = useCallback((stateName: string) => {
    if (stateName === 'Florida') {
      // Store selection in localStorage and set flag for coming from state selector
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedState', 'florida');
        sessionStorage.setItem('fromStateSelector', 'true');
      }

      // Animate then navigate after delay
      setTimeout(() => {
        router.push('/admin');
      }, 1200);
    }
  }, [router]);

  const skipSelection = useCallback(() => {
    // Store default Florida selection
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedState', 'florida');
    }
    router.push('/admin');
  }, [router]);

  const clearSelection = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedState');
    }
  }, []);

  return { selectState, skipSelection, clearSelection };
}
