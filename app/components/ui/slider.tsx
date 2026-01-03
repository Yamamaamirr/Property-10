"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/app/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gradient-to-r from-gray-100 via-gray-150 to-gray-200 shadow-inner">
      <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-[#0085C9] via-[#006BA6] to-[#004B6B] rounded-full shadow-sm" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-white bg-gradient-to-br from-[#0085C9] via-[#006BA6] to-[#004B6B] shadow-md ring-1 ring-[#0085C9]/20 ring-offset-1 ring-offset-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#0085C9]/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 hover:ring-3 hover:ring-[#0085C9]/25 hover:shadow-lg hover:scale-105 active:scale-95" />
    <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-white bg-gradient-to-br from-[#0085C9] via-[#006BA6] to-[#004B6B] shadow-md ring-1 ring-[#0085C9]/20 ring-offset-1 ring-offset-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#0085C9]/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 hover:ring-3 hover:ring-[#0085C9]/25 hover:shadow-lg hover:scale-105 active:scale-95" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
