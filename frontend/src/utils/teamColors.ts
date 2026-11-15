export const TEAM_COLORS: Record<string, string> = {
  ATL: '#E03A3E',
  BKN: '#000000',
  BOS: '#007A33',
  CHA: '#1D1160',
  CHI: '#CE1141',
  CLE: '#6F263D',
  DAL: '#00538C',
  DEN: '#0E2240',
  DET: '#C8102E',
  GSW: '#1D428A',
  HOU: '#CE1141',
  IND: '#002D62',
  LAC: '#1D428A',
  LAL: '#552583',
  MEM: '#5D76A9',
  MIA: '#98002E',
  MIL: '#00471B',
  MIN: '#0C2340',
  NOP: '#B4975A',
  NYK: '#F58426',
  OKC: '#007AC1',
  ORL: '#0077C0',
  PHI: '#006BB6',
  PHX: '#1D1160',
  POR: '#E03A3E',
  SAC: '#5A2D81',
  SAS: '#7F7F7F',
  TOR: '#CE1141',
  UTA: '#002B5C',
  WAS: '#E31837',
}

export function teamColor(team: string): string {
  const aliases: Record<string, string> = { GS: 'GSW', SA: 'SAS', NO: 'NOP', NY: 'NYK', UTAH: 'UTA', WSH: 'WAS' }
  return TEAM_COLORS[aliases[team] ?? team] ?? '#4B5563'
}

const SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'])

export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(p => !SUFFIXES.has(p))
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
