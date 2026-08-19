export function SubmissionListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-line bg-bg-raised p-5">
          <div className="mb-3 h-3 w-24 rounded-sm bg-line" />
          <div className="mb-2 h-4 w-3/4 rounded-sm bg-line" />
          <div className="h-3 w-1/2 rounded-sm bg-line" />
        </div>
      ))}
    </div>
  );
}

export function SubmissionDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      <div className="h-3 w-32 rounded-sm bg-line" />
      <div className="h-6 w-2/3 rounded-sm bg-line" />
      <div className="h-24 w-full rounded-sm bg-line" />
      <div className="h-3 w-1/3 rounded-sm bg-line" />
    </div>
  );
}
