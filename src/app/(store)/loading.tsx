// The boundary for storefront page content. The header, footer and bottom navigation stay in place while a page streams in.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded-[12px] bg-white" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-[24px] bg-white" />)}
      </div>
    </div>
  );
}
