// ============================================================
// Field validators — centralised validation rules.
// All functions return null if valid, or an error string if invalid.
// Use at point of save, not on every keystroke.
// ============================================================

// ── Phone ────────────────────────────────────────────────────
// Must start with +, followed by digits and spaces only.
// Total digits (excluding spaces) must be 7–15.
export function validatePhone(value: string): string | null {
  if (!value) return 'Phone number is required'
  const trimmed = value.trim()
  if (!trimmed.startsWith('+')) return 'Phone number must start with +'
  const afterPlus = trimmed.slice(1)
  if (!/^\d+$/.test(afterPlus)) return 'Phone number must contain only digits after the + (no spaces)'
  if (afterPlus.length < 7 || afterPlus.length > 15) return 'Phone number must have 7–15 digits after the +'
  return null
}

// ── NRIC / FIN / Passport ────────────────────────────────────
// Alphanumeric only, 6–20 characters. Auto-uppercase handled in UI.
export function validateNric(value: string): string | null {
  if (!value) return null // optional field
  const v = value.toUpperCase().trim()
  if (!/^[A-Z0-9]{6,20}$/.test(v)) return 'Enter a valid NRIC, FIN, or passport number (6–20 alphanumeric characters)'
  return null
}

// ── Nationality ──────────────────────────────────────────────
// Letters, spaces, and hyphens only. 2–50 characters.
export function validateNationality(value: string): string | null {
  if (!value) return null // optional field
  if (!/^[A-Za-z\s\-]{2,50}$/.test(value.trim())) return 'Nationality should contain letters only (spaces and hyphens allowed)'
  return null
}

// ── Full name ────────────────────────────────────────────────
// Letters, spaces, hyphens, apostrophes, dots. 2–100 characters.
export function validateFullName(value: string): string | null {
  if (!value || value.trim().length < 2) return 'Full name is required (minimum 2 characters)'
  if (!/^[A-Za-z\s'\-\.]{2,100}$/.test(value.trim())) return 'Name should contain letters only (spaces, hyphens, apostrophes and dots allowed)'
  return null
}

// ── Hourly rate ──────────────────────────────────────────────
// $0.50–$100.00, must be a valid number.
export function validateHourlyRate(value: string | number): string | null {
  if (!value && value !== 0) return null // optional field
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(n)) return 'Enter a valid hourly rate'
  if (n < 0.5) return 'Hourly rate must be at least $0.50'
  if (n > 100) return 'Hourly rate cannot exceed $100.00'
  return null
}

// ── Membership number ────────────────────────────────────────
// Uppercase letters, numbers, hyphens. 3–30 characters.
export function validateMembershipNumber(value: string): string | null {
  if (!value) return null // optional field
  if (!/^[A-Z0-9\-]{3,30}$/.test(value.toUpperCase().trim())) return 'Membership number can only contain letters, numbers and hyphens (3–30 characters)'
  return null
}

// ── Address ──────────────────────────────────────────────────
// Optional. If provided, must be at least 5 characters.
// Allows alphanumeric + common punctuation.
export function validateAddress(value: string): string | null {
  if (!value || value.trim().length === 0) return null // optional
  if (value.trim().length < 5) return 'Address is too short (minimum 5 characters)'
  if (!/^[A-Za-z0-9\s,#\-\.\(\)\/\\]+$/.test(value.trim())) return 'Address contains invalid characters'
  return null
}

// ── validateAll ──────────────────────────────────────────────
// Runs multiple validators and returns the first error found, or null.
// Usage: const err = validateAll([validatePhone(phone), validateNric(nric)])
export function validateAll(results: (string | null)[]): string | null {
  return results.find(r => r !== null) ?? null
}
