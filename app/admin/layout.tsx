"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/app/lib/utils";
import {
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
  X,
  Hexagon,
  LogOut,
} from "lucide-react";
import { Toaster } from "@/app/components/ui/sonner";

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Regions", href: "/admin/regions", icon: Hexagon },
  { name: "Cities", href: "/admin/cities", icon: MapPin },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col shadow-xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          backgroundColor: '#0f1a34',
          borderRight: '1px solid #575c63'
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6" style={{ borderBottom: '1px solid #575c63' }}>
          <Link href="/admin" className="flex items-center">
            <span className="font-poppins font-bold text-xl text-white">
              LOGO
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/70 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Info - at bottom */}
        <div className="mt-auto p-4" style={{ borderTop: '1px solid #575c63' }}>
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Admin User</p>
              <p className="text-xs text-white/60 truncate">admin@property10.com</p>
            </div>
            <button
              className="text-white/60 hover:text-white hover:bg-white/10 p-2 rounded-md transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Page content */}
        <main className="min-h-screen">
          {children}
        </main>
      </div>

      {/* Floating Menu Button (Mobile Only) */}
      <div className="absolute top-3 left-3 md:top-4 md:left-4 z-20 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-9 h-9 md:w-10 md:h-10 rounded-md shadow-lg flex items-center justify-center text-white/70 hover:text-white transition-colors"
          style={{ backgroundColor: '#0f1a34' }}
        >
          <Menu className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
