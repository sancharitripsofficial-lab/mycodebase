import { Bone, PageLoading, TripCardSkeleton } from "@/components/skeletons/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <PageLoading />
      <div className="space-y-3">
        <Bone className="h-3 w-40" />
        <Bone className="h-9 w-2/3" />
        <Bone className="h-4 w-1/2" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <TripCardSkeleton />
        <TripCardSkeleton />
      </div>
    </div>
  );
}
