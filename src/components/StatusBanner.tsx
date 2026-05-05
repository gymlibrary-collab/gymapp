import { CheckCircle, AlertCircle, X } from 'lucide-react'

// ============================================================
// StatusBanner — shared success/error notification banner.
//
// Replaces the repeated JSX block in every page:
//   {success && <div className="...green...">{success}</div>}
//   {error && <div className="...red...">{error}</div>}
//
// Usage:
//   <StatusBanner success={success} error={error} onDismissError={() => setError('')} />
// ============================================================

interface StatusBannerProps {
  success?: string
  error?: string
  onDismissError?: () => void
}

export function StatusBanner({ success, error, onDismissError }: StatusBannerProps) {
  return (
    <>
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          {onDismissError && (
            <button onClick={onDismissError} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </>
  )
}
