import { useState } from 'react'
import { usePlayers } from '../api'
import { playerInitials, teamColor } from '../utils/teamColors'
import './PlayerIdentity.css'

type Identity = { player_id?: number; symbol?: string; name?: string | null; team?: string | null }

/** ESPN athlete IDs already key the SportsDataverse data; never infer an ID from a name. */
export function PlayerAvatar({ player, size = 'md' }: { player: Identity; size?: 'sm' | 'md' | 'lg' }) {
  const { bySymbol } = usePlayers()
  const resolved = player.symbol ? bySymbol.get(player.symbol) : undefined
  const id = player.player_id ?? resolved?.player_id
  const name = player.name ?? resolved?.name ?? ''
  const team = player.team ?? resolved?.team ?? ''
  const src = id && id > 0 ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : ''
  const [failed, setFailed] = useState('')
  return <span className={`player-avatar player-avatar-${size}`} style={{ borderColor: teamColor(team) }} aria-hidden="true">
    <span>{playerInitials(name)}</span>
    {src && failed !== src && <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(src)}/>}
  </span>
}

export function PlayerName({ symbol }: { symbol: string }) {
  const { bySymbol } = usePlayers()
  return <>{bySymbol.get(symbol)?.name ?? symbol}</>
}
