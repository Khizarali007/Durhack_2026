import type { Player } from '../api/types'

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CONFIRMED_STAR_PRICES: Record<string, number> = {
  OKC: 150, DEN: 160, MIL: 145, DAL: 140, BOS: 115,
  MIN: 110, SAS: 105, LAL: 110, GSW: 105, NYK: 105, DET: 100, SAC: 95,
}
const SLOT_SCALE = 0.82

function slotPrice(team: string, teamSeed: number, slot: number): number {
  if (slot === 0 && team in CONFIRMED_STAR_PRICES) return CONFIRMED_STAR_PRICES[team]
  const base = team in CONFIRMED_STAR_PRICES
    ? CONFIRMED_STAR_PRICES[team]
    : (() => { const rng = mulberry32(teamSeed); return Math.round(rng() * 60 + 70) })()
  return Math.max(10, Math.round(base * Math.pow(SLOT_SCALE, slot)))
}

const SUFFIXES = new Set(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'])

function extractSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  const filtered = parts.filter(p => !SUFFIXES.has(p))
  return filtered[filtered.length - 1] ?? parts[parts.length - 1]
}

const taken = new Set<string>([
  'SGA', 'JOKIC', 'GIANNIS', 'LUKA', 'TATUM', 'ANT',
  'WEMBY', 'LEBRON', 'CURRY', 'BRUNSON', 'CADE', 'FOX',
])

function makeSymbol(fullName: string, teamAbbr: string): string {
  const clean = extractSurname(fullName).normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z]/g, '')
  for (const n of [3, 4, 5]) {
    const c = clean.slice(0, n)
    if (c.length === n && !taken.has(c)) { taken.add(c); return c }
  }
  const c4 = clean.slice(0, 3) + teamAbbr[0]
  if (!taken.has(c4)) { taken.add(c4); return c4 }
  const c5 = clean.slice(0, 3) + teamAbbr.slice(0, 2)
  taken.add(c5); return c5
}

interface RosterEntry { name: string; symbol?: string }

const TEAMS: Array<{ abbr: string; seed: number; roster: RosterEntry[] }> = [
  {
    abbr: 'OKC', seed: 101, roster: [
      { name: 'Shai Gilgeous-Alexander', symbol: 'SGA' },
      { name: 'Chet Holmgren' },
      { name: 'Jalen Williams' },
      { name: 'Lu Dort' },
      { name: 'Isaiah Hartenstein' },
      { name: 'Isaiah Joe' },
      { name: 'Aaron Wiggins' },
      { name: 'Kenrich Williams' },
      { name: 'Ousmane Dieng' },
      { name: 'OKC Player 10' },
    ],
  },
  {
    abbr: 'DEN', seed: 103, roster: [
      { name: 'Nikola Jokic', symbol: 'JOKIC' },
      { name: 'Jamal Murray' },
      { name: 'Michael Porter Jr.' },
      { name: 'Aaron Gordon' },
      { name: 'Kentavious Caldwell-Pope' },
      { name: 'Christian Braun' },
      { name: 'Reggie Jackson' },
      { name: 'Peyton Watson' },
      { name: 'Julian Strawther' },
      { name: 'DEN Player 10' },
    ],
  },
  {
    abbr: 'MIL', seed: 107, roster: [
      { name: 'Giannis Antetokounmpo', symbol: 'GIANNIS' },
      { name: 'Damian Lillard' },
      { name: 'Khris Middleton' },
      { name: 'Bobby Portis' },
      { name: 'Brook Lopez' },
      { name: 'Malik Beasley' },
      { name: 'Gary Trent Jr.' },
      { name: 'Patrick Beverley' },
      { name: 'AJ Green' },
      { name: 'MarJon Beauchamp' },
    ],
  },
  {
    abbr: 'DAL', seed: 109, roster: [
      { name: 'Luka Doncic', symbol: 'LUKA' },
      { name: 'Kyrie Irving' },
      { name: 'PJ Washington' },
      { name: 'Daniel Gafford' },
      { name: 'Derrick Jones Jr.' },
      { name: 'Tim Hardaway Jr.' },
      { name: 'Naji Marshall' },
      { name: 'Dante Exum' },
      { name: 'Maxi Kleber' },
      { name: 'DAL Player 10' },
    ],
  },
  {
    abbr: 'BOS', seed: 113, roster: [
      { name: 'Jayson Tatum', symbol: 'TATUM' },
      { name: 'Jaylen Brown' },
      { name: 'Kristaps Porzingis' },
      { name: 'Jrue Holiday' },
      { name: 'Al Horford' },
      { name: 'Derrick White' },
      { name: 'Payton Pritchard' },
      { name: 'Sam Hauser' },
      { name: 'Xavier Tillman' },
      { name: 'Luke Kornet' },
    ],
  },
  {
    abbr: 'MIN', seed: 127, roster: [
      { name: 'Anthony Edwards', symbol: 'ANT' },
      { name: 'Rudy Gobert' },
      { name: 'Jaden McDaniels' },
      { name: 'Mike Conley' },
      { name: 'Naz Reid' },
      { name: 'Nickeil Alexander-Walker' },
      { name: 'Donte DiVincenzo' },
      { name: 'Joe Ingles' },
      { name: 'Leonard Miller' },
      { name: 'Monte Morris' },
    ],
  },
  {
    abbr: 'SAS', seed: 131, roster: [
      { name: 'Victor Wembanyama', symbol: 'WEMBY' },
      { name: 'Devin Vassell' },
      { name: 'Keldon Johnson' },
      { name: 'Jeremy Sochan' },
      { name: 'Tre Jones' },
      { name: 'Chris Paul' },
      { name: 'Julian Champagnie' },
      { name: 'Blake Wesley' },
      { name: 'Malaki Branham' },
      { name: 'Charles Bassey' },
    ],
  },
  {
    abbr: 'LAL', seed: 137, roster: [
      { name: 'LeBron James', symbol: 'LEBRON' },
      { name: 'Anthony Davis' },
      { name: 'Austin Reaves' },
      { name: "D'Angelo Russell" },
      { name: 'Rui Hachimura' },
      { name: 'Gabe Vincent' },
      { name: 'Cam Reddish' },
      { name: 'LAL Player 8' },
      { name: 'LAL Player 9' },
      { name: 'Jaxson Hayes' },
    ],
  },
  {
    abbr: 'GSW', seed: 139, roster: [
      { name: 'Stephen Curry', symbol: 'CURRY' },
      { name: 'Draymond Green' },
      { name: 'Andrew Wiggins' },
      { name: 'Jonathan Kuminga' },
      { name: 'Brandin Podziemski' },
      { name: 'Moses Moody' },
      { name: 'Gary Payton II' },
      { name: 'Kevon Looney' },
      { name: 'Trayce Jackson-Davis' },
      { name: 'GSW Player 10' },
    ],
  },
  {
    abbr: 'NYK', seed: 149, roster: [
      { name: 'Jalen Brunson', symbol: 'BRUNSON' },
      { name: 'Karl-Anthony Towns' },
      { name: 'Josh Hart' },
      { name: 'OG Anunoby' },
      { name: 'Mikal Bridges' },
      { name: 'Mitchell Robinson' },
      { name: 'Precious Achiuwa' },
      { name: 'Miles McBride' },
      { name: 'Landry Shamet' },
      { name: 'Dalen Terry' },
    ],
  },
  {
    abbr: 'DET', seed: 151, roster: [
      { name: 'Cade Cunningham', symbol: 'CADE' },
      { name: 'Jalen Duren' },
      { name: 'Ausar Thompson' },
      { name: 'Jaden Ivey' },
      { name: 'Bojan Bogdanovic' },
      { name: 'Simone Fontecchio' },
      { name: 'Ron Holland' },
      { name: 'Marcus Sasser' },
      { name: 'DET Player 9' },
      { name: 'Isaiah Stewart' },
    ],
  },
  {
    abbr: 'SAC', seed: 157, roster: [
      { name: "De'Aaron Fox", symbol: 'FOX' },
      { name: 'Domantas Sabonis' },
      { name: 'Malik Monk' },
      { name: 'Keegan Murray' },
      { name: 'Kevin Huerter' },
      { name: 'Harrison Barnes' },
      { name: 'Alex Len' },
      { name: 'Colby Jones' },
      { name: 'Sasha Vezenkov' },
      { name: 'Chris Duarte' },
    ],
  },
  {
    abbr: 'ATL', seed: 163, roster: [
      { name: 'Trae Young' },
      { name: 'Dejounte Murray' },
      { name: 'Bogdan Bogdanovic' },
      { name: 'Clint Capela' },
      { name: 'Onyeka Okongwu' },
      { name: "De'Andre Hunter" },
      { name: 'Jalen Johnson' },
      { name: 'Larry Nance Jr.' },
      { name: 'Garrison Mathews' },
      { name: 'Seth Lundy' },
    ],
  },
  {
    abbr: 'BKN', seed: 167, roster: [
      { name: 'Cam Thomas' },
      { name: 'Dennis Schroder' },
      { name: 'Nic Claxton' },
      { name: "Day'Ron Sharpe" },
      { name: 'Dorian Finney-Smith' },
      { name: 'Noah Clowney' },
      { name: 'Trendon Watford' },
      { name: 'BKN Player 8' },
      { name: 'BKN Player 9' },
      { name: 'BKN Player 10' },
    ],
  },
  {
    abbr: 'CHA', seed: 173, roster: [
      { name: 'LaMelo Ball' },
      { name: 'Brandon Miller' },
      { name: 'Mark Williams' },
      { name: 'Miles Bridges' },
      { name: 'CHA Player 5' },
      { name: 'Josh Green' },
      { name: 'Nick Richards' },
      { name: 'Tre Mann' },
      { name: 'Seth Curry' },
      { name: 'CHA Player 10' },
    ],
  },
  {
    abbr: 'CHI', seed: 179, roster: [
      { name: 'DeMar DeRozan' },
      { name: 'Zach LaVine' },
      { name: 'Nikola Vucevic' },
      { name: 'Patrick Williams' },
      { name: 'Coby White' },
      { name: 'Ayo Dosunmu' },
      { name: 'CHI Player 7' },
      { name: 'Torrey Craig' },
      { name: 'Andre Drummond' },
      { name: 'Terry Taylor' },
    ],
  },
  {
    abbr: 'CLE', seed: 181, roster: [
      { name: 'Donovan Mitchell' },
      { name: 'Darius Garland' },
      { name: 'Evan Mobley' },
      { name: 'Jarrett Allen' },
      { name: 'Max Strus' },
      { name: 'Caris LeVert' },
      { name: 'Isaac Okoro' },
      { name: 'Georges Niang' },
      { name: 'Craig Porter Jr.' },
      { name: 'Sam Merrill' },
    ],
  },
  {
    abbr: 'HOU', seed: 191, roster: [
      { name: 'Alperen Sengun' },
      { name: 'Jalen Green' },
      { name: 'Fred VanVleet' },
      { name: 'Dillon Brooks' },
      { name: 'Amen Thompson' },
      { name: 'Jabari Smith Jr.' },
      { name: 'Tari Eason' },
      { name: 'Aaron Holiday' },
      { name: 'Jeff Green' },
      { name: 'Cam Whitmore' },
    ],
  },
  {
    abbr: 'IND', seed: 193, roster: [
      { name: 'Tyrese Haliburton' },
      { name: 'Pascal Siakam' },
      { name: 'Myles Turner' },
      { name: 'Bennedict Mathurin' },
      { name: 'Andrew Nembhard' },
      { name: 'Aaron Nesmith' },
      { name: 'T.J. McConnell' },
      { name: 'Obi Toppin' },
      { name: 'Ben Sheppard' },
      { name: 'Isaiah Jackson' },
    ],
  },
  {
    abbr: 'LAC', seed: 197, roster: [
      { name: 'Kawhi Leonard' },
      { name: 'Norman Powell' },
      { name: 'Ivica Zubac' },
      { name: 'Terance Mann' },
      { name: 'Mason Plumlee' },
      { name: 'Nicolas Batum' },
      { name: 'Bones Hyland' },
      { name: 'Amir Coffey' },
      { name: 'LAC Player 9' },
      { name: 'LAC Player 10' },
    ],
  },
  {
    abbr: 'MEM', seed: 199, roster: [
      { name: 'Ja Morant' },
      { name: 'Desmond Bane' },
      { name: 'Jaren Jackson Jr.' },
      { name: 'Marcus Smart' },
      { name: 'GG Jackson' },
      { name: 'Ziaire Williams' },
      { name: 'Luke Kennard' },
      { name: 'Brandon Clarke' },
      { name: 'Santi Aldama' },
      { name: 'John Konchar' },
    ],
  },
  {
    abbr: 'MIA', seed: 211, roster: [
      { name: 'Jimmy Butler' },
      { name: 'Bam Adebayo' },
      { name: 'Tyler Herro' },
      { name: 'Kyle Lowry' },
      { name: 'Duncan Robinson' },
      { name: 'Caleb Martin' },
      { name: 'Terry Rozier' },
      { name: 'Thomas Bryant' },
      { name: 'Jaime Jaquez Jr.' },
      { name: 'Kevin Love' },
    ],
  },
  {
    abbr: 'NOP', seed: 223, roster: [
      { name: 'Zion Williamson' },
      { name: 'Brandon Ingram' },
      { name: 'CJ McCollum' },
      { name: 'Herb Jones' },
      { name: 'Jonas Valanciunas' },
      { name: 'Trey Murphy III' },
      { name: 'Larry Nance Jr.' },
      { name: 'Jordan Hawkins' },
      { name: 'Jose Alvarado' },
      { name: 'NOP Player 10' },
    ],
  },
  {
    abbr: 'ORL', seed: 227, roster: [
      { name: 'Paolo Banchero' },
      { name: 'Franz Wagner' },
      { name: 'Wendell Carter Jr.' },
      { name: 'Markelle Fultz' },
      { name: 'Jalen Suggs' },
      { name: 'Gary Harris' },
      { name: 'Jonathan Isaac' },
      { name: 'Moritz Wagner' },
      { name: 'Cole Anthony' },
      { name: 'ORL Player 10' },
    ],
  },
  {
    abbr: 'PHI', seed: 229, roster: [
      { name: 'Joel Embiid' },
      { name: 'Tyrese Maxey' },
      { name: 'Kelly Oubre Jr.' },
      { name: 'Tobias Harris' },
      { name: "De'Anthony Melton" },
      { name: 'MO Bamba' },
      { name: 'KJ Martin' },
      { name: 'PHI Player 8' },
      { name: 'Robert Covington' },
      { name: 'PHI Player 10' },
    ],
  },
  {
    abbr: 'PHX', seed: 233, roster: [
      { name: 'Kevin Durant' },
      { name: 'Devin Booker' },
      { name: 'Bradley Beal' },
      { name: 'Jusuf Nurkic' },
      { name: 'Grayson Allen' },
      { name: 'Eric Gordon' },
      { name: 'Drew Eubanks' },
      { name: "Royce O'Neale" },
      { name: 'Bol Bol' },
      { name: 'Jordan Goodwin' },
    ],
  },
  {
    abbr: 'POR', seed: 239, roster: [
      { name: 'Anfernee Simons' },
      { name: 'Scoot Henderson' },
      { name: 'Jerami Grant' },
      { name: 'Robert Williams III' },
      { name: 'Shaedon Sharpe' },
      { name: 'Matisse Thybulle' },
      { name: 'Malcolm Brogdon' },
      { name: 'Kris Murray' },
      { name: 'Toumani Camara' },
      { name: 'Jabari Walker' },
    ],
  },
  {
    abbr: 'TOR', seed: 241, roster: [
      { name: 'Scottie Barnes' },
      { name: 'RJ Barrett' },
      { name: 'Immanuel Quickley' },
      { name: 'Jakob Poeltl' },
      { name: 'Kelly Olynyk' },
      { name: 'Bruce Brown' },
      { name: 'Gradey Dick' },
      { name: 'Garrett Temple' },
      { name: 'Markquis Nowell' },
      { name: 'Chris Boucher' },
    ],
  },
  {
    abbr: 'UTA', seed: 251, roster: [
      { name: 'Lauri Markkanen' },
      { name: 'John Collins' },
      { name: 'Collin Sexton' },
      { name: 'Jordan Clarkson' },
      { name: 'Walker Kessler' },
      { name: 'Keyonte George' },
      { name: 'Talen Horton-Tucker' },
      { name: 'Taylor Hendricks' },
      { name: 'Micah Potter' },
      { name: 'Luka Samanic' },
    ],
  },
  {
    abbr: 'WAS', seed: 257, roster: [
      { name: 'Kyle Kuzma' },
      { name: 'Jordan Poole' },
      { name: 'Deni Avdija' },
      { name: 'WAS Player 4' },
      { name: 'Corey Kispert' },
      { name: 'Patrick Baldwin Jr.' },
      { name: 'Marvin Bagley III' },
      { name: 'Johnny Davis' },
      { name: 'WAS Player 9' },
      { name: 'WAS Player 10' },
    ],
  },
]

// Coarse positions (G / F / C), one letter per roster slot, in roster order.
// Mock only: `position` is not in the backend contract yet.
const POSITIONS: Record<string, string> = {
  OKC: 'GCFGCGGFFG', DEN: 'CGFFGGGFGF', MIL: 'FGFFCGGGGF', DAL: 'GGFCFGFGFC',
  BOS: 'FFCGCGGFFC', MIN: 'GCFGCGGFFG', SAS: 'CGFFGGFGGC', LAL: 'FCGGFGFGFC',
  GSW: 'GFFFGGGCCG', NYK: 'GCGFFCFGGG', DET: 'GCFGFFFGGC', SAC: 'GCGFGFCGFG',
  ATL: 'GGGCCFFFGF', BKN: 'GGCCFFFGFC', CHA: 'GFCFGGCGGF', CHI: 'FGCFGGFFCF',
  CLE: 'GGFCGGFFGG', HOU: 'CGGFFFFGFF', IND: 'GFCGGFGFGC', LAC: 'FGCGCFGFGF',
  MEM: 'GGFGFFGFFG', MIA: 'FCGGFFGCFF', NOP: 'FFGFCFFGGC', ORL: 'FFCGGGFCGF',
  PHI: 'CGFFGCFGFG', PHX: 'FGGCGGCFCG', POR: 'GGFCGFGFFF', TOR: 'FFGCCGGGGF',
  UTA: 'FFGGCGGFCF', WAS: 'FGFCFFFGGF',
}
const POSITION_NAMES: Record<string, string> = { G: 'Guard', F: 'Forward', C: 'Center' }

export const PLAYERS: Player[] = []
let _pid = 1

for (const team of TEAMS) {
  for (let slot = 0; slot < team.roster.length; slot++) {
    const entry = team.roster[slot]
    const symbol = entry.symbol ?? makeSymbol(entry.name, team.abbr)
    const start_price = entry.symbol != null
      ? (CONFIRMED_STAR_PRICES[team.abbr] ?? slotPrice(team.abbr, team.seed, slot))
      : slotPrice(team.abbr, team.seed, slot)
    const position = POSITION_NAMES[POSITIONS[team.abbr]?.[slot] ?? '']
    PLAYERS.push({ player_id: _pid++, symbol, name: entry.name, team: team.abbr, start_price, position })
  }
}

export const PLAYERS_BY_SYMBOL: ReadonlyMap<string, Player> = new Map(PLAYERS.map(p => [p.symbol, p]))
