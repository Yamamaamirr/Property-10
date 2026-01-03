"use client"

import { useEffect, useState } from "react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return (
    <Sonner
      className="toaster group"
      position={isMobile ? "top-center" : props.position}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg md:group-[.toaster]:text-sm group-[.toaster]:text-xs md:group-[.toaster]:py-2.5 group-[.toaster]:py-2 md:group-[.toaster]:px-3 group-[.toaster]:px-2.5 md:group-[.toaster]:min-h-[44px] group-[.toaster]:min-h-[36px]",
          description: "group-[.toast]:text-muted-foreground md:group-[.toast]:text-xs group-[.toast]:text-[10px] group-[.toast]:leading-tight",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground md:group-[.toast]:text-xs group-[.toast]:text-[10px] md:group-[.toast]:h-8 group-[.toast]:h-7 md:group-[.toast]:px-3 group-[.toast]:px-2",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground md:group-[.toast]:text-xs group-[.toast]:text-[10px] md:group-[.toast]:h-8 group-[.toast]:h-7 md:group-[.toast]:px-3 group-[.toast]:px-2",
        },
        style: isMobile ? {
          maxWidth: "85vw",
          width: "auto",
          minWidth: "240px",
        } : {
          maxWidth: "420px",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
