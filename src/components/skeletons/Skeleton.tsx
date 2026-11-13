/** Shimmering placeholder blocks shown instantly while a page loads. */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} aria-hidden="true" />;
}

export function TripCardSkeleton() {
  return (
    <div className="card-soft overflow-hidden" aria-hidden="true">
      <Bone className="aspect-[16/10] rounded-none" />
      <div className="space-y-3 p-5">
        <Bone className="h-3 w-1/3" />
        <Bone className="h-6 w-3/4" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-5/6" />
        <div className="flex items-center justify-between pt-3">
          <Bone className="h-6 w-24" />
          <Bone className="h-9 w-36 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {label}…
    </span>
  );
}
