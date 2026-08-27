// Colombian public holidays calculator (Ley 51 de 1983)

function nextMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  if (day === 1) return d // already Monday
  const daysUntilMonday = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntilMonday)
  return d
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const g = Math.floor((8 * b + 13) / 25)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 19 * l) / 433)
  const n = Math.floor((h + l - 7 * m + 90) / 25)
  const p = (h + l - 7 * m + 33 * n + 19) % 32
  return new Date(year, n - 1, p)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function fmt(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Fixed holidays that don't move even if they fall on weekends
function fixedHolidays(year: number): string[] {
  return [
    `${year}-01-01`, // Año Nuevo
    `${year}-05-01`, // Día del Trabajo
    `${year}-07-20`, // Independencia
    `${year}-08-07`, // Batalla de Boyacá
    `${year}-12-08`, // Inmaculada Concepción
    `${year}-12-25`, // Navidad
  ]
}

// Movable holidays (transferred to next Monday if not Monday)
function movableHolidays(year: number): string[] {
  const movable = [
    new Date(year, 0, 6),   // Reyes Magos (Jan 6)
    new Date(year, 2, 19),  // San José (Mar 19)
    new Date(year, 5, 29),  // San Pedro y San Pablo (Jun 29)
    new Date(year, 7, 15),  // Asunción (Aug 15)
    new Date(year, 9, 12),  // Día de la Raza (Oct 12)
    new Date(year, 10, 1),  // Todos los Santos (Nov 1)
    new Date(year, 10, 11), // Independencia de Cartagena (Nov 11)
  ]
  return movable.map((d) => fmt(nextMonday(d)))
}

// Easter-based holidays
function easterHolidays(year: number): string[] {
  const easter = easterSunday(year)
  return [
    fmt(addDays(easter, -3)), // Jueves Santo
    fmt(addDays(easter, -2)), // Viernes Santo
    fmt(nextMonday(addDays(easter, 39))),  // Ascensión
    fmt(nextMonday(addDays(easter, 60))),  // Corpus Christi
    fmt(nextMonday(addDays(easter, 68))),  // Sagrado Corazón
  ]
}

export function getColombianHolidays(year: number): Set<string> {
  const all = [
    ...fixedHolidays(year),
    ...movableHolidays(year),
    ...easterHolidays(year),
  ]
  return new Set(all)
}
