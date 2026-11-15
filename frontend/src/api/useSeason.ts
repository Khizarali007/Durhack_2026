import { useSyncExternalStore } from 'react'
import { apiFetch, errorDetail } from './rest'
import { getSessionSnapshot } from './useSession'
import { refreshAccount } from './accountStore'

export interface Timeline {t:number;start_t:number;end_t:number;paused:boolean;busy:boolean;rate:number;session_id:string;error:string|null}
export interface Contributor {symbol:string;name:string;contribution:number;investment_gain:number;payouts:number;pending:number;injury_status:string|null;analyst_estimate:number}
export interface SeasonScore {quoted_equity:number;score:number;cash:number;starting_cash:number;net_sale_proceeds:number;pending_payouts:number;payouts_received:number;return_pct:number;finished:boolean;unsold_shares:Record<string,number>;fees_paid:number;contributors:Contributor[];t:number;session_id:string}
export interface Round {before:SeasonScore;after:SeasonScore}
interface Snapshot {clock:Timeline|null;score:SeasonScore|null;round:Round|null;working:boolean;rewinding:boolean;error:string}
let state:Snapshot={clock:null,score:null,round:null,working:false,rewinding:false,error:''}
let owner=''
let pending:{before:SeasonScore;target:number}|null=null
let timer:ReturnType<typeof setInterval>|null=null
let loading=false
const listeners=new Set<()=>void>()
function update(patch:Partial<Snapshot>){state={...state,...patch};listeners.forEach(fn=>fn())}
function save(){try{sessionStorage.setItem(`season-round:${owner}`,JSON.stringify({pending,round:state.round}))}catch{/* Storage is optional. */}}
async function load(){
 if(loading||state.working)return
 loading=true
 try{
  const uid=getSessionSnapshot().session?.user_id
  const clock=await apiFetch<Timeline>('/market/timeline')
  if(uid!==getSessionSnapshot().session?.user_id)return
  const key=`${clock.session_id}:${uid??''}`
  if(owner!==key){
   owner=key;pending=null
   let round:Round|null=null
   try{const saved=JSON.parse(sessionStorage.getItem(`season-round:${key}`)??'null');pending=saved?.pending??null;round=saved?.round??null}catch{/* Fresh round. */}
   update({score:null,round,error:''})
  }
  update({clock,error:'',...(!clock.busy?{rewinding:false}:{})})
  if(!uid||clock.busy)return
  const score=await apiFetch<SeasonScore>('/season-score')
  if(uid!==getSessionSnapshot().session?.user_id||score.session_id!==clock.session_id)return
  update({score})
  if(pending && !clock.error && score.t>=pending.target){
   update({round:{before:pending.before,after:score}});pending=null;save();void refreshAccount()
  }
 }catch(e){update({error:errorDetail(e)})}finally{loading=false}
}
function subscribe(fn:()=>void){listeners.add(fn);if(!timer){void load();timer=setInterval(()=>void load(),1500)}return()=>{listeners.delete(fn);if(!listeners.size&&timer){clearInterval(timer);timer=null}}}
export function useSeason(){return useSyncExternalStore(subscribe,()=>state)}

/** Pause first so the before/after report starts at a consistent market instant. */
export async function changeTimeline(body:{paused?:boolean;rate?:number;target_t?:number},report=false){
 if(state.working||state.clock?.busy)return false
 update({working:true,error:'',rewinding:body.target_t!==undefined&&state.clock!==null&&body.target_t<state.clock.t})
 try{
  if(report){
   await apiFetch('/market/timeline',{method:'POST',body:JSON.stringify({paused:true})})
   const before=await apiFetch<SeasonScore>('/season-score')
   pending={before,target:body.target_t!}
  }
  const clock=await apiFetch<Timeline>('/market/timeline',{method:'POST',body:JSON.stringify(body)})
  if(!report&&body.target_t!==undefined){pending=null;update({round:null})}
  update({clock});save();return true
 }catch(e){pending=null;save();update({error:errorDetail(e)});return false}
 finally{update({working:false});void load()}
}
