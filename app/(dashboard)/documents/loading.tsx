import { SkeletonTable } from "@/components/feedback/skeletonTable"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-md" />
      <SkeletonTable rows={5} columns={5} />
    </div>
  )
}
