interface Props {
  message: string
  onOpenSettings: () => void
}

export function OnboardingPrompt({ message, onOpenSettings }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
      <p className="text-gray-500 text-sm">{message}</p>
      <button
        onClick={onOpenSettings}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
      >
        Open Settings
      </button>
    </div>
  )
}
