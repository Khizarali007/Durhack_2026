import { useSyncExternalStore } from 'react'
import { apiFetch, errorDetail } from './rest'
import { getSessionSnapshot } from './useSession'

export interface Timeline {t:number;start_t:number;end_t:number;paused:boolean;busy:boolean;rate:number;session_id:string;error:string|null}
export interface Contributor {symbol:string;name:string;contribution:number;investment_gain:number;payouts:number;pending:number;injury_status:string|null;analyst_estimate:number}
export interface SeasonScore {quoted_equity:number;score:number;cash:number;starting_cash:number;net_sale_proceeds:number;pending_payouts:number;payouts_received:number;return_pct:number;finished:boolean;unsold_shares:Record<string,number>;fees_paid:number;contributors:Contributor[];t:number;session_id:string}
export interface Round {before:SeasonScore;after:SeasonScore}
interface Updates {session_id:string;reports:Round[];next_t:number|null}
interface Snapshot {clock:Timeline|null;score:SeasonScore|null;reports:Round[];nextReport:number|null;working:boolean;rewinding:boolean;error:string}
let state:Snapshot={clock:null,score:null,reports:[],nextReport:null,working:false,rewinding:false,error:''}
let owner=''
let timer:ReturnType<typeof setInterval>|null=null
let loading=false
const listeners=new Set<()=>void>()
function update(patch:Partial<Snapshot>){state={...state,...patch};listeners.forEach(fn=>fn())}
async function load(){
 if(loading||state.working)return
 loading=true
 try{
  const uid=getSessionSnapshot().session?.user_id
  const clock=await apiFetch<Timeline>('/market/timeline')
  if(uid!==getSessionSnapshot().session?.user_id)return
  const key=`${clock.session_id}:${uid??''}`
  if(owner!==key){owner=key;update({score:null,reports:[],nextReport:null,error:''})}
  update({clock,error:'',...(!clock.busy?{rewinding:false}:{})})
  if(!uid||clock.busy)return
  const [score,updates]=await Promise.all([apiFetch<SeasonScore>('/season-score'),apiFetch<Updates>('/season-updates')])
  if(uid!==getSessionSnapshot().session?.user_id||score.session_id!==clock.session_id||updates.session_id!==clock.session_id)return
  update({score,reports:updates.reports,nextReport:updates.next_t})
 }catch(e){update({error:errorDetail(e)})}finally{loading=false}
}
function subscribe(fn:()=>void){listeners.add(fn);if(!timer){void load();timer=setInterval(()=>void load(),1500)}return()=>{listeners.delete(fn);if(!listeners.size&&timer){clearInterval(timer);timer=null}}}
export function useSeason(){return useSyncExternalStore(subscribe,()=>state)}

export async function changeTimeline(body:{paused?:boolean;rate?:number;target_t?:number}){
 if(state.working||state.clock?.busy)return false
 update({working:true,error:'',rewinding:body.target_t!==undefined&&state.clock!==null&&body.target_t<state.clock.t})
 try{
  const clock=await apiFetch<Timeline>('/market/timeline',{method:'POST',body:JSON.stringify(body)})
  update({clock});return true
 }catch(e){update({error:errorDetail(e)});return false}
 finally{update({working:false});void load()}
}
