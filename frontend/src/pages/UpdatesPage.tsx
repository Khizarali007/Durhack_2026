import { useSeason } from '../api/useSeason'
import SeasonReview from '../components/SeasonReview'
import '../components/season.css'

export default function UpdatesPage(){
 const {reports,score,nextReport,error}=useSeason()
 return <div className="overview-page updates-page">
  <header className="overview-heading"><h1>Updates</h1><span className="quiet-label">Weekly portfolio reports</span></header>
  {error&&<p role="alert">{error}</p>}
  {!score?.finished&&nextReport&&<p className="quiet-label">Next report · {new Date(nextReport*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})}</p>}
  {score?.finished&&<SeasonReview/>}
  {!reports.length&&!score?.finished&&<SeasonReview/>}
  <div className="updates-list">{[...reports].reverse().map(report=><SeasonReview key={report.after.t} report={report}/>)}</div>
 </div>
}
