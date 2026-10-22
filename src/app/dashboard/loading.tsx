// The boundary for dashboard page content. The sidebar and top bar stay in place while a page streams in.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-56 animate-pulse rounded-[12px] bg-white" />
      <div className="h-64 animate-pulse rounded-[12px] bg-white" />
    </div>
  );
}
