export function TransportSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="w-6 h-6 bg-gray-700 rounded" />
          <div className="w-10 h-4 bg-gray-700 rounded" />
          <div className="flex-1 h-4 bg-gray-700 rounded" />
          <div className="w-12 h-4 bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
}
