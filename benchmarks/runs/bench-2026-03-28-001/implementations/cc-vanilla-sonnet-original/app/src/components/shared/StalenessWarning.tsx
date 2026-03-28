interface Props {
  onRefresh: () => void;
}

export function StalenessWarning({ onRefresh }: Props) {
  return (
    <div className="bg-amber-900/40 border border-amber-700 text-amber-300 text-sm rounded-lg px-4 py-2 flex items-center justify-between gap-4 mb-4">
      <span>Data may be outdated — last refresh was over 10 minutes ago.</span>
      <button
        onClick={onRefresh}
        className="text-amber-200 underline whitespace-nowrap hover:text-white"
      >
        Refresh now
      </button>
    </div>
  );
}
