'use client'

// ============================================================
// Shared PDF helpers — used by payslip and commission PDF exports.
// All functions are async-safe and browser-only (uses FileReader, Image).
// ============================================================

// Standard table style used across all payslip PDFs.
export const PDF_TABLE_STYLE = {
  styles: { fontSize: 10 },
  headStyles: { fillColor: [220, 38, 38] as [number, number, number] },
  columnStyles: { 1: { halign: 'right' as const, fontStyle: 'bold' as const } },
}

// ── loadLogoAsBase64 ─────────────────────────────────────────
// Fetches a logo URL and converts it to a base64 data URL.
// Returns null if the fetch or conversion fails.
export async function loadLogoAsBase64(url: string): Promise<string | null> {
  try {
    const blob = await fetch(url).then(r => r.blob())
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result as string)
      fr.onerror = rej
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── getImageDimensions ───────────────────────────────────────
// Returns natural width and height of a base64/URL image.
export async function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => res({ w: img.width, h: img.height })
    img.onerror = () => res({ w: 1, h: 1 })
    img.src = src
  })
}

// ── addLogoHeader ────────────────────────────────────────────
// Renders the gym logo + document title (e.g. 'PAYSLIP') in the
// top-left of a jsPDF document. Supports rectangular logos at
// natural aspect ratio (max 25mm tall, max 60mm wide).
// Returns the Y position after the header block.
export async function addLogoHeader(
  doc: any,
  logoUrl: string | null,
  title: string,
  fontSize = 18
): Promise<number> {
  if (logoUrl) {
    const dataUrl = await loadLogoAsBase64(logoUrl)
    if (dataUrl) {
      try {
        const { w: nW, h: nH } = await getImageDimensions(dataUrl)
        const maxH = 25; const maxW = 60
        let w = (nW / nH) * maxH
        if (w > maxW) w = maxW
        doc.addImage(dataUrl, 'PNG', 14, 8, w, maxH)
        doc.setFontSize(fontSize); doc.setFont('helvetica', 'bold')
        doc.text(title, 14 + w + 4, 22)
        doc.setFont('helvetica', 'normal')
        return 38
      } catch { /* fall through to no-logo path */ }
    }
  }
  doc.setFontSize(fontSize); doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 22)
  doc.setFont('helvetica', 'normal')
  return 30
}

// ── resolvePayslipBranding ───────────────────────────────────
// Resolves the logo URL and gym/company name for payslip PDFs
// based on staff role:
//   - business_ops  → group-level logo from app_settings
//   - manager/staff → their assigned gym via manager_gym_id
//   - trainer       → their primary gym via trainer_gyms
// Returns { logoUrl, gymName, companyName }.
export async function resolvePayslipBranding(
  supabase: any,
  staffData: { role: string; manager_gym_id?: string | null; id: string }
): Promise<{ logoUrl: string | null; gymName: string; companyName: string }> {
  const { data: settings } = await supabase
    .from('app_settings')
    .select('payslip_logo_url, company_name')
    .eq('id', 'global')
    .single()
  const companyName: string = settings?.company_name || 'Gym Operations'

  if (staffData.role === 'business_ops') {
    return { logoUrl: settings?.payslip_logo_url || null, gymName: companyName, companyName }
  }

  if (staffData.manager_gym_id) {
    const { data: gym } = await supabase
      .from('gyms')
      .select('name, logo_url')
      .eq('id', staffData.manager_gym_id)
      .single()
    return {
      logoUrl: gym?.logo_url || null,
      gymName: gym?.name || companyName,
      companyName,
    }
  }

  if (staffData.role === 'trainer' || staffData.role === 'staff') {
    const { data: tg } = await supabase
      .from('trainer_gyms')
      .select('gyms(name, logo_url)')
      .eq('trainer_id', staffData.id)
      .eq('is_primary', true)
      .single()
    return {
      logoUrl: (tg as any)?.gyms?.logo_url || null,
      gymName: (tg as any)?.gyms?.name || companyName,
      companyName,
    }
  }

  return { logoUrl: null, gymName: companyName, companyName }
}
