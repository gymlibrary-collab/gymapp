// Shared loading spinner used across all dashboard pages.
// Usage:
//   import { PageSpinner } from '@/components/PageSpinner'
//   if (loading || dataLoading) return <PageSpinner />
//   if (loading || dataLoading) return <PageSpinner size="lg" />

export function PageSpinner({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const spinnerClass = size === 'lg'
    ? 'animate-spin rounded-full h-8 w-8 border-b-2 border-red-600'
    : 'animate-spin rounded-full h-6 w-6 border-b-2 border-red-600'
  return (
    <div className="flex items-center justify-center h-48">
      <div className={spinnerClass} />
    </div>
  )
}
