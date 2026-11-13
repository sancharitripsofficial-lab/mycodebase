import { Bone, PageLoading } from "@/components/skeletons/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <PageLoading label="Loading trip" />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <Bone className="h-3 w-56" />
          <Bone className="h-10 w-4/5" />
          <Bone className="h-4 w-full" />
          <Bone className="aspect-[16/10] w-full" />
          <div className="grid grid-cols-3 gap-3">
            <Bone className="aspect-[3/2]" />
            <Bone className="aspect-[3/2]" />
            <Bone className="aspect-[3/2]" />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Bone className="h-8 w-2/3" />
          <Bone className="h-20 w-full" />
          <Bone className="h-20 w-full" />
          <Bone className="h-28 w-full" />
          <Bone className="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
