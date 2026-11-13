import { Bone, PageLoading, TripCardSkeleton } from "@/components/skeletons/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <PageLoading label="Loading trips" />
      <div className="max-w-2xl space-y-3">
        <Bone className="h-3 w-48" />
        <Bone className="h-9 w-3/4" />
        <Bone className="h-4 w-full" />
      </div>
      <Bone className="h-14 w-full" />
      <div className="grid gap-6 sm:grid-cols-2">
        <TripCardSkeleton />
        <TripCardSkeleton />
        <TripCardSkeleton />
        <TripCardSkeleton />
      </div>
    </div>
  );
}
