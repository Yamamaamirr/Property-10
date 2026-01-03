import { cn } from "@/app/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  )
}

function DropdownSkeleton() {
  return (
    <div className="w-full min-h-[32px] h-auto py-1 px-2 bg-gray-100 border border-gray-200 rounded-md animate-pulse">
      <div className="h-4 bg-gray-200 rounded-sm animate-pulse"></div>
    </div>
  )
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* Table header skeleton */}
      <div className="flex space-x-2 bg-gray-50 p-2 rounded">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 rounded flex-1"></div>
        ))}
      </div>
      
      {/* Table rows skeleton */}
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-2 p-2 border-b border-gray-100">
          {[...Array(8)].map((_, colIndex) => (
            <div 
              key={colIndex} 
              className={cn(
                "h-4 bg-gray-200 rounded flex-1 animate-pulse",
                `animation-delay-[${(rowIndex * 100 + colIndex * 50)}ms]`
              )}
            ></div>
          ))}
        </div>
      ))}
    </div>
  )
}

function FilterSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <DropdownSkeleton />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse animation-delay-100"></div>
        <DropdownSkeleton />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/5 animate-pulse animation-delay-200"></div>
        <DropdownSkeleton />
      </div>
    </div>
  )
}

export { Skeleton, DropdownSkeleton, TableSkeleton, FilterSkeleton }
