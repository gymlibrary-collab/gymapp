import { useState, useCallback } from 'react'

// ============================================================
// useToast — shared success/error notification state.
//
// Replaces the repeated pattern in every page:
//   const [success, setSuccess] = useState('')
//   const [error, setError] = useState('')
//   const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
//
// Usage:
//   const { success, error, showMsg, showError, clearMessages } = useToast()
// ============================================================

export function useToast(duration = 3000) {
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const showMsg = useCallback((msg: string) => {
    setError('')
    setSuccess(msg)
    setTimeout(() => setSuccess(''), duration)
  }, [duration])

  const showError = useCallback((msg: string) => {
    setSuccess('')
    setError(msg)
    setTimeout(() => setError(''), duration)
  }, [duration])

  const clearMessages = useCallback(() => {
    setSuccess('')
    setError('')
  }, [])

  return { success, error, showMsg, showError, clearMessages, setError, setSuccess }
}
