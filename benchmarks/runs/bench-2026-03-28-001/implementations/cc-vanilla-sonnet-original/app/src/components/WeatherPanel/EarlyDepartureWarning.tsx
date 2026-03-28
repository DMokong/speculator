interface Props { reason: string }

export default function EarlyDepartureWarning({ reason }: Props) {
  return (
    <div className="mx-4 mb-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 flex items-start gap-2">
      <span className="text-yellow-500 mt-0.5">⚠️</span>
      <p className="text-sm text-yellow-800">{reason}</p>
    </div>
  );
}
