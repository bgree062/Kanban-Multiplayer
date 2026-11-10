import React,{useState,useEffect,useMemo,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {AreaChart,Area,BarChart,Bar,LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer,ReferenceLine} from 'recharts';
import {Layers3,Users,ArrowRight,Printer,CheckCircle,Copy,RotateCcw,Clock,AlertTriangle,ShieldCheck,Info,ExternalLink} from 'lucide-react';
import {COLUMNS,tally,age,reportPeriod,drawCard,limitAt,validActions} from './simulation.js';
import './style.css';
import './navigation-sync.css';

const SUPA_URL=import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured=Boolean(SUPA_URL&&SUPA_KEY&&!SUPA_URL.includes('YOUR-'));
const db=configured?createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const AVATARS=['🚀','🧙','🦊','🛡️','🐉','🦉','🐢','🐺'];
const initialCredentials=()=>{try{return JSON.parse(sessionStorage.getItem('kanban_mp_current')||'null')}catch{return null}};
const fmt=x=>x==null?'—':`${Number.isInteger(x)?x:x.toFixed(1)}d`;
const prettify=t=>({pull:'Pull task',advance:'Advance own task',unblock:'Unblock own task',block:'Block own task',helpAdvance:'Help advance',helpUnblock:'Help unblock'})[t]||t;
const takeLabel=k=>({lobby:'Lobby',playing:'Playing',dsu:'Daily stand-up',duration:'Phase 3 choice',wip:'Day 31 choice',done:'Completed'})[k]||k;
const metricLesson={inProgress:'wip',blocked:'blocked',completed:'throughput',short:'lead-time',long:'lead-time',mean:'lead-time',p75:'percentiles',p85:'percentiles',p95:'percentiles',oldest:'age'};
function MetricLearn({id,label='Understand this metric'}){return <a href={`https://kanbanflowlab.com/#metric-${id}`} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'#99621d',fontWeight:700,marginLeft:8,textDecoration:'underline',textUnderlineOffset:3}} aria-label={`${label} (opens in a new tab)`}>{label} ↗</a>}
function ChartResults({game,players,code}){
  const records=game.history;
  const maxDay=game.phaseLength===20?40:30;
  const one=reportPeriod(records,0,20);
  const three=reportPeriod(records,20,maxDay,true);
  const first=game.phaseLength===20?reportPeriod(records,20,30,true):null;
  const second=game.phaseLength===20?reportPeriod(records,30,40):null;
  if(!one||!three)return <p className="muted">Report is being prepared.</p>;
  const leadMax=Math.max(1,...one.leadTimes,...three.leadTimes);
  const maxCount=Math.max(4,...one.daily.map(x=>x.count),...three.daily.map(x=>x.count));
  const bins=p=>Array.from({length:leadMax},(_,i)=>({days:i+1,tasks:p.leadTimes.filter(v=>v===i+1).length}));
  const trend=p=>p.cfd.map(d=>({day:d.day,Done:d.completed,Review:d.review,'Working on':d.working,'To-Do':d.backlog}));
  const keys=[['Backlog','backlog'],['In progress','inProgress'],['Blocked','blocked'],['Completed','completed'],['Shortest lead time','short'],['Longest lead time','long'],['Average lead time','mean'],['75th percentile','p75'],['85th percentile','p85'],['95th percentile','p95'],['Oldest unfinished age','oldest']];
  const leadKeys=['short','long','mean','p75','p85','p95','oldest'];
  const format=(o,k)=>leadKeys.includes(k)?fmt(o[k]):o[k];
  return <section className="panel results print-report">
    <div className="report-header"><div><p className="eyebrow dark">FINAL REPORT</p><h2>Kanban multiplayer results</h2><p className="muted">Room {code} · {players.map(p=>`${p.avatar} ${p.name}`).join(' · ')}</p></div><button className="btn primary no-print" onClick={()=>window.print()}><Printer size={17}/> Print / Save as PDF</button></div>
    <p className="muted">Phases 1 + 2 use the same original board for 20 days. Phase 3 uses a fresh board for {game.phaseLength} days. Compare daily throughput rather than raw totals when durations differ.</p>
    <div className="table-scroller"><table><thead><tr><th>Metric</th><th>Phases 1 + 2</th><th>Phase 3</th></tr></thead><tbody>
      <tr><td>Days</td><td>20</td><td>{game.phaseLength}</td></tr>
      {keys.map(([k,key])=><tr key={key}><td>{k}{metricLesson[key]&&<MetricLearn id={metricLesson[key]} label="Learn"/>}</td><td>{format(one,key)}</td><td>{format(three,key)}</td></tr>)}
      <tr><td>Throughput / day <MetricLearn id="throughput" label="Learn"/></td><td>{one.rate.toFixed(2)}</td><td>{three.rate.toFixed(2)}</td></tr>
    </tbody></table></div>
    <h3>Cumulative Flow Diagrams <MetricLearn id="cfd"/></h3><div className="legend">{[['Done','#31977b'],['Review','#588fcc'],['Working on','#e7aa60'],['Backlog','#a8afb9']].map(([t,c])=><span key={t}><i style={{background:c}}/>{t}</span>)}</div>
    {[{label:'Phases 1 + 2',report:one},{label:'Phase 3',report:three}].map(({label,report})=><div className="chart-card" key={label}><h4>{label} · {report.days} days</h4><div className="plot"><ResponsiveContainer width="100%" height={250}><AreaChart data={trend(report)} margin={{top:12,right:16,left:-15,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="#e9edf3"/><XAxis dataKey="day" tick={{fontSize:11}}/><YAxis domain={[0,30]} tick={{fontSize:11}}/><Tooltip/>{[['Done','#31977b'],['Review','#588fcc'],['Working on','#e7aa60'],['To-Do','#a8afb9']].map(([k,c])=><Area key={k} type="linear" dataKey={k} stackId="1" stroke={c} fill={c}/>) }{report.days===20&&<ReferenceLine x={10} stroke="#273a50" strokeDasharray="5 4"/>}</AreaChart></ResponsiveContainer></div></div>)}
    <h3>Daily Throughput <MetricLearn id="throughput"/></h3><p className="muted">Each dot is one day, including zero completions. Charts share a vertical scale.</p>
    {[{label:'Phases 1 + 2',report:one,color:'#588fcc'},{label:'Phase 3',report:three,color:'#31977b'}].map(({label,report,color})=><div className="chart-card" key={label}><h4>{label} · {report.completed} completed · {report.rate.toFixed(2)} / day</h4><div className="plot"><ResponsiveContainer width="100%" height={235}><LineChart data={report.daily} margin={{top:15,right:16,left:-15,bottom:5}}><CartesianGrid strokeDasharray="3 3" stroke="#e9edf3"/><XAxis dataKey="day" interval={0} tick={{fontSize:10}}/><YAxis allowDecimals={false} domain={[0,maxCount]} tick={{fontSize:11}}/><Tooltip/><Line type="linear" dataKey="count" name="Tasks finished" stroke={color} strokeWidth={2.5} dot={{r:4,fill:color}} activeDot={{r:6}}/>{report.days===20&&<ReferenceLine x={10.5} stroke="#273a50" strokeDasharray="5 4"/>}</LineChart></ResponsiveContainer></div></div>)}
    {first&&second&&<><h3>Phase 3 — WIP experiment</h3><div className="table-scroller"><table><thead><tr><th>Metric</th><th>Days 21–30 · WIP 3</th><th>Days 31–40 · WIP {game.wip}</th></tr></thead><tbody><tr><td>Completions in period</td><td>{first.completed}</td><td>{second.completed-first.completed}</td></tr><tr><td>Throughput / day</td><td>{first.rate.toFixed(2)}</td><td>{((second.completed-first.completed)/10).toFixed(2)}</td></tr><tr><td>End in progress</td><td>{first.inProgress}</td><td>{second.inProgress}</td></tr><tr><td>End blocked</td><td>{first.blocked}</td><td>{second.blocked}</td></tr><tr><td>End backlog</td><td>{first.backlog}</td><td>{second.backlog}</td></tr></tbody></table></div></>}
    <h3>Lead-Time Histograms</h3><p className="muted">Same day buckets in both charts. Only completed tasks are counted.</p>
    {[{label:'Phases 1 + 2',report:one,color:'#588fcc'},{label:'Phase 3',report:three,color:'#31977b'}].map(({label,report,color})=><div className="chart-card" key={label}><h4>{label} · {report.completed} completed</h4><div className="plot"><ResponsiveContainer width="100%" height={250}><BarChart data={bins(report)} margin={{top:15,right:16,bottom:12,left:-15}}><CartesianGrid strokeDasharray="3 3" stroke="#e9edf3"/><XAxis dataKey="days" tick={{fontSize:10}} label={{value:'Lead time (days)',position:'insideBottom',offset:-6,fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="tasks" fill={color} maxBarSize={43}/></BarChart></ResponsiveContainer></div><div className="mini-summary"><span>Shortest: <b>{fmt(report.short)}</b></span><span>Average: <b>{fmt(report.mean)}</b></span><span>Longest: <b>{fmt(report.long)}</b></span></div></div>)}
    <p className="muted disclaimer">Observed percentiles describe completed work, not guaranteed future confidence. Unfinished tasks are excluded from histograms. Results are temporary and available for printing only while the room remains active.</p>
  </section>;
}
function App(){
  const [credential,setCredential]=useState(initialCredentials);
  const [navMenu,setNavMenu]=useState(null);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [room,setRoom]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [capacity,setCapacity]=useState(5);
  const [joinRole,setJoinRole]=useState('player');
  const [flow,setFlow]=useState((new URLSearchParams(window.location.search)).get('room')?'join':null);
  const [setupStep,setSetupStep]=useState((new URLSearchParams(window.location.search)).get('room')?2:1);
  const [name,setName]=useState('');
  const [avatar,setAvatar]=useState(AVATARS[0]);
  const [roomCode,setRoomCode]=useState((new URLSearchParams(window.location.search)).get('room')||'');
  const [screen,setScreen]=useState('home');
  const [selected,setSelected]=useState(null);
  const [dragging,setDragging]=useState(null);
  const [dropTarget,setDropTarget]=useState(null);
  const [phaseChoice,setPhaseChoice]=useState(10);
  const [wipChoice,setWipChoice]=useState(3);
  const [dsuChecks,setDsuChecks]=useState([false,false,false]);
  const [notes,setNotes]=useState('');
  const [copied,setCopied]=useState(false);
  const [inspect,setInspect]=useState(null);
  const [online,setOnline]=useState(true);
  const chRef=useRef(null);
  const lastError=useRef('');
  const token=credential?.token;
  const code=credential?.code;
  const roomMembers=room?.players||[];
  const observers=room?.observers||[];
  const isObserver=credential?.role==='observer';
  const self=roomMembers.find(p=>p.token===token)||roomMembers.find(p=>p.id===credential?.id);
  // The server deliberately never exposes member tokens, so persist own player id after joining.
  const myId=credential?.id;
  const host=Boolean(credential?.host);
  const game=room?.game;
  const gate=game?.gate;
  const day=game?.day||1;
  const n=game?.capacity||capacity;
  const donePlayers=game?.turns_done||[];
  const myDone=donePlayers.includes(myId);
  const allDone=donePlayers.length>=n;
  const card=game&&!isObserver?drawCard(game.cards,day,n,myId):null;
  const hand=game?Array.from({length:n},(_,i)=>({p:i+1,c:drawCard(game.cards,day,n,i+1)})):[];
  const isMyTurn=!isObserver&&gate==='playing'&&!myDone;
  const legal=game&&isMyTurn?validActions(game.tasks,myId,day,game.cards,n,game.wip,game?.steps?.[String(myId)]||'block'):{options:[],canPass:false,part:'red'};
  const legalIds=new Set(legal.options.map(a=>a.id));
  const legalForSelected=legal.options.filter(x=>x.id===selected);
  const board=game?.tasks||[];
  const stats=tally(board);
  const complete=gate==='done';
  const showDay=game?.day||1;
  const leader=game&&day>10?roomMembers.find(p=>p.id===game.leaders[day]):null;
  const printLink='';

  async function refresh(c=code){if(!db||!c)return;const {data,error:err}=await db.rpc('mp_get',{room_code:c});if(err){if(err.message!==lastError.current){setError(err.message);lastError.current=err.message}setOnline(false);return}if(data){setRoom(data);setOnline(true);if(!credential){setScreen('join')}}else{setError('Room expired or cannot be found. Start a new room.');setOnline(false)}}
  useEffect(()=>{if(!credential?.code||!db)return;refresh(credential.code);const channel=db.channel(`mp-${credential.code}`,{config:{private:false,broadcast:{self:false}}});chRef.current=channel;channel.on('broadcast',{event:'refresh'},()=>refresh(credential.code)).subscribe();const ticker=setInterval(()=>refresh(credential.code),5000);return()=>{clearInterval(ticker);db.removeChannel(channel);chRef.current=null}},[credential?.code]);
  const emit=()=>{chRef.current?.send({type:'broadcast',event:'refresh',payload:{at:Date.now()}})};
  async function call(fn,args,saveIdentity){setLoading(true);setError('');try{if(!db)throw new Error('Configure your Supabase environment variables before starting a game');const {data,error:err}=await db.rpc(fn,args);if(err)throw err;if(saveIdentity){const cred={code:data.code,token:data.token||null,id:(saveIdentity==='observer'||saveIdentity==='hostObserver')?data.observer_id:saveIdentity==='host'?1:data.room.players.length,host:saveIdentity==='host'||saveIdentity==='hostObserver',role:(saveIdentity==='observer'||saveIdentity==='hostObserver')?'observer':'player'};sessionStorage.setItem('kanban_mp_current',JSON.stringify(cred));setCredential(cred);setRoom(data.room);setScreen('room');history.replaceState(null,'',`?room=${data.code}`)}else if(data?.game){setRoom(data)}emit();setCopied(false);setSelected(null)}catch(e){setError(e.message||String(e))}finally{setLoading(false)}}
  const create=()=>joinRole==='observer'?call('mp_create_observer',{name:name.trim(),avatar,capacity},'hostObserver'):call('mp_create',{name:name.trim(),avatar,capacity},'host');
  const join=()=>call(joinRole==='observer'?'mp_observe':'mp_join',{room_code:roomCode.toUpperCase().trim(),name:name.trim(),avatar},joinRole);
  const cmd=(kind,taskId=null,val=null)=>call('mp_command',{room_code:code,actor_token:token,kind,task_id:taskId,val});
  const leave=()=>{sessionStorage.removeItem('kanban_mp_current');setCredential(null);setRoom(null);setScreen('home');setFlow(null);setSetupStep(1);setError('');history.replaceState(null,'',window.location.pathname)};
  const copyInvite=async()=>{const link=`${window.location.origin}${window.location.pathname}?room=${code}`;try{await navigator.clipboard.writeText(link);setCopied(true)}catch{setError(`Copy this address: ${link}`)}};
  const moveOnBoard=async(task,destination)=>{
    if(!isMyTurn||loading)return;
    const types=task.status===0&&destination===1?['pull']:
      (task.status===1&&destination===2)||(task.status===2&&destination===3)?['advance','helpAdvance']:[];
    const action=legal.options.find(a=>a.id===task.id&&types.includes(a.type));
    if(action)await cmd('move',task.id,action.type);
  };
  const toggleBlock=async(task)=>{
    if(!isMyTurn||loading)return;
    const types=task.blocked?['unblock','helpUnblock']:['block'];
    const action=legal.options.find(a=>a.id===task.id&&types.includes(a.type));
    if(action)await cmd('move',task.id,action.type);
  };
  const dropInto=async(destination)=>{
    setDropTarget(null);
    const task=board.find(t=>t.id===dragging);
    setDragging(null);
    if(task)await moveOnBoard(task,destination);
  };
  const canMoveTo=(task,destination)=>legal.options.some(a=>a.id===task.id&&(
    (a.type==='pull'&&task.status===0&&destination===1)||
    (['advance','helpAdvance'].includes(a.type)&&destination===task.status+1)
  ));
  const canToggleBlock=task=>legal.options.some(a=>a.id===task.id&&(task.blocked?['unblock','helpUnblock']:['block']).includes(a.type));
  const status=(col)=>{if(col===0||col===3)return null;const used=board.filter(t=>t.status===col).length;const limit=limitAt(day,game?.wip);if(!Number.isFinite(limit))return {used,limit:'∞',name:'unlimited',label:'Unlimited WIP'};return {used,limit,name:used>limit?'exceeded':used===limit?'full':'available',label:used>limit?'WIP LIMIT EXCEEDED':used===limit?'AT CAPACITY — FINISH FIRST':'CAPACITY AVAILABLE'}};

  return <><header className="site-nav"><div className="wrap bar"><a className="brand" href="/"><Layers3 color="#d2a14e"/><span><strong>Kanban Flow Lab</strong><small>MULTIPLAYER LAB</small></span></a><nav className="mp-top-links" aria-label="Website navigation">
    <a className="mp-top-link" href="https://kanbanflowlab.com/#home">Home</a>
    <div className="mp-nav-group mp-nav-group-active">
      <button className="mp-nav-trigger" type="button" aria-haspopup="true" aria-expanded={navMenu==='simulations'} onClick={()=>setNavMenu(v=>v==='simulations'?null:'simulations')}>Simulations <span aria-hidden="true">⌄</span></button>
      <div className={'mp-nav-popover'+(navMenu==='simulations'?' mp-nav-open':'')}>
        <a href="https://kanbanflowlab.com/#facilitated">Facilitated Simulation</a>
        <a href="/" aria-current="page">Collaborative Simulation <span className="mp-current">Current</span></a>
        <a href="https://kanbanflowlab.com/#flow-evolution">Flow Evolution Lab</a>
      </div>
    </div>
    <a className="mp-top-link" href="https://kanbanflowlab.com/#flow-assessment">Flow Assessment</a>
    <a className="mp-top-link" href="https://kanbanflowlab.com/#data-and-story">The Data &amp; The Story</a>
    <div className="mp-nav-group">
      <button className="mp-nav-trigger" type="button" aria-haspopup="true" aria-expanded={navMenu==='more'} onClick={()=>setNavMenu(v=>v==='more'?null:'more')}>More <span aria-hidden="true">⌄</span></button>
      <div className={'mp-nav-popover mp-nav-popover-right'+(navMenu==='more'?' mp-nav-open':'')}><a href="https://kanbanflowlab.com/#journey">The Journey</a><a href="https://kanbanflowlab.com/#about-me">About Me</a></div>
    </div>
    {credential&&<button className="text-button mp-exit" onClick={leave}>Exit room</button>}
  </nav>
  <button className="mp-mobile-toggle" type="button" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(v=>!v)}>{mobileNavOpen?'Close ×':'Menu ☰'}</button></div>
  {mobileNavOpen&&<nav className="mp-mobile-nav" aria-label="Mobile website navigation">
    <a href="https://kanbanflowlab.com/#home">Home</a>
    <strong>Simulations</strong>
    <a href="https://kanbanflowlab.com/#facilitated">Facilitated Simulation</a>
    <a href="/" aria-current="page" onClick={()=>setMobileNavOpen(false)}>Collaborative Simulation</a>
    <a href="https://kanbanflowlab.com/#flow-evolution">Flow Evolution Lab</a>
    <a href="https://kanbanflowlab.com/#flow-assessment">Flow Assessment</a>
    <a href="https://kanbanflowlab.com/#data-and-story">The Data &amp; The Story</a>
    <a href="https://kanbanflowlab.com/#journey">The Journey</a>
    <a href="https://kanbanflowlab.com/#about-me">About Me</a>
    {credential&&<button className="text-button" onClick={leave}>Exit room</button>}
  </nav>}</header>
  <main className="wrap app-layout">
    {!credential?<><div className="intro"><p className="eyebrow dark">MULTIPLAYER SIMULATION</p><h1>Same board.<br/><em>Different computers.</em></h1><p>Create a room for your class or join a team already playing. Choose how to participate, then personalize your identity. The original simulator remains unchanged.</p></div>
      {!configured&&<div className="notice warning"><AlertTriangle size={20}/> Setup required: add your Supabase URL and publishable key to Vercel.</div>}
      <section className="panel setup-panel">
        <div className="setup-progress" aria-label="Setup progress">{['Start or join','Participation','Identity','Room details'].map((label,i)=><div key={label} className={setupStep===i+1?'current':setupStep>i+1?'finished':''}><span>{i+1}</span><small>{label}</small></div>)}</div>
        {setupStep===1&&<><p className="eyebrow dark">STEP 1 OF 4</p><h2>What would you like to do?</h2><p className="muted">Facilitators can prepare a room before students arrive. Students can join using the shared link or room code.</p><div className="setup-choices"><button className="setup-choice" onClick={()=>{setFlow('start');setJoinRole('observer');setSetupStep(2)}}><Users size={27}/><strong>Start New Room</strong><span>Create a room, invite your students, and control when the simulation begins.</span><b>Continue →</b></button><button className="setup-choice" onClick={()=>{setFlow('join');setJoinRole('player');setSetupStep(2)}}><ArrowRight size={27}/><strong>Join Room</strong><span>Enter a room code or use an invitation link from your facilitator.</span><b>Continue →</b></button></div></>}
        {setupStep===2&&<><p className="eyebrow dark">STEP 2 OF 4</p><h2>How will you participate?</h2><div className="setup-choices"><button className={'setup-choice '+(joinRole==='player'?'chosen':'')} onClick={()=>setJoinRole('player')}><Users size={26}/><strong>{flow==='start'?'Player Host':'Player'}</strong><span>{flow==='start'?'Play as Player 1 and manage room progression.':'Occupy one of the 3–5 player seats and make decisions during your turn.'}</span></button><button className={'setup-choice '+(joinRole==='observer'?'chosen':'')} onClick={()=>setJoinRole('observer')}><Info size={26}/><strong>{flow==='start'?'Facilitator Host':'Observer'}</strong><span>{flow==='start'?'Set up and control the room without using a player seat. Ideal for instructors.':'Watch the board and report without taking a player seat.'}</span></button></div><div className="setup-navigation"><button className="btn outline" onClick={()=>setSetupStep(1)}>Back</button><button className="btn primary" onClick={()=>setSetupStep(3)}>Continue <ArrowRight size={16}/></button></div></>}
        {setupStep===3&&<><p className="eyebrow dark">STEP 3 OF 4</p><h2>Your identity</h2><label className="field-label" htmlFor="player-name">Your name</label><input id="player-name" className="field" maxLength={32} placeholder="Enter your name" value={name} onChange={e=>setName(e.target.value)}/><label className="field-label">Choose an avatar</label><div className="avatars">{AVATARS.map(a=><button key={a} className={'avatar-choice '+(avatar===a?'selected':'')} aria-label={'Choose '+a} aria-pressed={avatar===a} onClick={()=>setAvatar(a)}>{a}</button>)}</div><div className="setup-navigation"><button className="btn outline" onClick={()=>setSetupStep(2)}>Back</button><button className="btn primary" disabled={!name.trim()} onClick={()=>setSetupStep(4)}>Continue <ArrowRight size={16}/></button></div></>}
        {setupStep===4&&<><p className="eyebrow dark">STEP 4 OF 4</p><h2>{flow==='start'?'Create your team room':'Join your team room'}</h2><p className="muted">{avatar} <strong>{name.trim()}</strong> · {flow==='start'?(joinRole==='observer'?'Facilitator Host':'Player Host'):(joinRole==='observer'?'Observer':'Player')}</p>{flow==='start'?<><label className="field-label">Number of player seats</label><div className="options-row">{[3,4,5].map(x=><button key={x} className={'pill '+(capacity===x?'active':'')} onClick={()=>setCapacity(x)}>{x} players</button>)}</div><p className="muted small">{joinRole==='observer'?'You will not occupy a player seat. All seats remain available to students.':'You will occupy Player 1, leaving the other seats for students.'} After creation, copy the invitation link to share with the class.</p><button className="btn primary wide" disabled={loading||!configured||!name.trim()} onClick={create}><Users size={18}/> {loading?'Creating room…':'Create room & get invite link'}</button></>:<><label className="field-label" htmlFor="join-code">8-character room code</label><input id="join-code" className="field uppercase" maxLength={8} placeholder="AB12CD34" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}/><button className="btn primary wide" disabled={loading||!configured||!name.trim()||roomCode.length!==8} onClick={join}>{loading?'Joining…':joinRole==='observer'?'Observe room':'Join as player'} <ArrowRight size={17}/></button></>}<div className="setup-navigation"><button className="btn outline" onClick={()=>setSetupStep(3)}>Back</button></div></>}
      </section>
      <p className="muted footnote">Facilitator hosts control progression without occupying a player seat. Game rooms expire after inactivity and no permanent results archive is required.</p>
    </>:<>
      <div className="room-banner"><div><p className="eyebrow dark">TEAM ROOM</p><h1>{code}</h1><p className="muted">{takeLabel(gate)} · {online?'Connected':'Connection needs attention'} · {isObserver?<><strong>{host?'Facilitator / Host':'Observer'}</strong> · {host?'Controls game progression':'Read-only access'}</>:<>Your seat: <strong>Player {myId}</strong>{host?' (Host)':''}</>}</p></div><div className="banner-actions"><button className="btn outline no-print" onClick={copyInvite}><Copy size={16}/>{copied?'Copied!':'Copy join link'}</button><span className="room-code">{code}</span></div></div>
      <div className="members">{Array.from({length:n},(_,i)=>{const p=roomMembers.find(x=>x.id===i+1);return <div className={'member '+(p?.id===myId&&gate==='playing'?'active':'')} key={i}><span className="member-avatar">{p?.avatar||'·'}</span><b>{p?.name||'Waiting...'}</b><small>Player {i+1}{p?.id===myId?' · YOU':''}</small></div>})}</div>
      <div className="observer-strip"><div><b>Observers ({observers.length})</b><span className="muted small">Read-only · Do not occupy player seats</span></div><div className="observer-list">{observers.length?observers.map(o=><span className="observer-tag" key={o.id}>{o.avatar} {o.name}{o.id===myId?' · YOU':''}</span>):<span className="muted small">No observers yet</span>}</div></div>
      {gate==='lobby'&&<section className="panel decision"><p className="eyebrow dark">WAITING FOR PLAYERS</p><h2>Room lobby</h2><p className="muted">Your room is ready. Copy the invitation link and share it with students. They will join as players; you can remain a facilitator without taking a seat.</p><p><strong>{roomMembers.length} / {n}</strong> player seats filled</p>{host&&<button className="btn outline no-print" onClick={copyInvite}><Copy size={16}/>{copied?"Invite link copied!":"Copy student invitation link"}</button>}{host?<button className="btn primary" disabled={loading||roomMembers.length!==n} onClick={()=>cmd('start')}>Start simulation <ArrowRight size={17}/></button>:<div className="notice"><Clock size={18}/> {isObserver?'Observing the lobby. The host will start when player seats are full.':'Waiting for the host to start the game.'}</div>}</section>}
      {gate==='duration'&&<section className="panel decision"><p className="eyebrow dark">DAY 20 COMPLETED</p><h2>Phase 3 — Choose your experiment</h2><p>Fresh board, 30 new tasks and WIP 3. The original Phases 1 + 2 results are preserved.</p><div className="options-row">{[10,20].map(v=><button className={'pill '+(phaseChoice===v?'active':'')} key={v} onClick={()=>setPhaseChoice(v)}>{v} days — end Day {20+v}</button>)}</div>{host?<button className="btn primary" disabled={loading} onClick={()=>cmd('duration',null,String(phaseChoice))}>Begin Phase 3</button>:<div className="notice">Waiting for the host's choice.</div>}</section>}
      {gate==='wip'&&<section className="panel decision"><p className="eyebrow dark">START OF DAY 31</p><h2>Experiment with WIP</h2><p>Keep the same tasks, blockers, and workflow ages. Choose a WIP limit for both Working on and Review during Days 31–40. Try a lower limit to test whether finishing and helping improves flow—or whether too little capacity creates bottlenecks.</p><div className="options-row">{Array.from({length:Math.max(4,n)-1},(_,i)=>i+2).map(v=><button className={'pill '+(wipChoice===v?'active':'')} key={v} onClick={()=>setWipChoice(v)}>WIP {v}</button>)}</div>{host?<button className="btn primary" disabled={loading} onClick={()=>cmd('wip',null,String(wipChoice))}>Apply WIP {wipChoice} and begin Day 31</button>:<div className="notice">Waiting for the host's WIP decision.</div>}</section>}
      {gate==='dsu'&&<section className="panel decision"><p className="eyebrow dark">DAY {day} · DAILY STAND-UP</p><h2>{leader?.avatar} {leader?.name||`Player ${game.leaders[day]}`} leads the DSU</h2><p className="muted">Talk before revealing cards. Discuss what the team completed, the goal for today, and blockers or people who need help. The host confirms when the conversation is complete.</p>{['What did we accomplish?','What should we focus on today?','Who needs help with blockers?'].map((t,i)=><label className="check-row" key={i}><input type="checkbox" disabled={!host} checked={dsuChecks[i]} onChange={e=>setDsuChecks(a=>a.map((v,j)=>i===j?e.target.checked:v))}/>{t}</label>)}{host&&<><label className="field-label">Optional discussion notes (not permanently saved)</label><textarea className="field" rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Key concerns or decisions"/><button className="btn primary wide" disabled={!dsuChecks.every(Boolean)||loading} onClick={()=>{cmd('dsu',null,notes);setDsuChecks([false,false,false]);setNotes('')}}>Complete DSU · Reveal cards <ArrowRight size={17}/></button></>}{!host&&<div className="notice">The host will reveal the cards after the DSU.</div>}</section>}
      {gate==='playing'&&<>
        <section className="panel compact"><div className="phase-strip"><div className={phase(day)===1?'current':''}>Phase 1 <small>Unlimited WIP</small></div><div className={phase(day)===2?'current':''}>Phase 2 <small>WIP 3 + DSU</small></div><div className={phase(day)===3?'current':''}>Phase 3 <small>Fresh board + DSU</small></div></div><div className="day-banner"><h2>Day {day} {game.phaseLength!=null?`of ${20+game.phaseLength}`:''}</h2><span>Working on / Review WIP: <b>{day<=10?'Unlimited':day<=30?'3 / 3':`${game.wip} / ${game.wip}`}</b></span></div><p className="muted small" style={{margin:'8px 0 12px'}}>The day advances automatically after everyone completes their card actions.</p>{day>10&&<p className="dsu-summary">DSU led by {leader?.avatar} {leader?.name||`Player ${game.leaders[day]}`}</p>}
          <div className="cards-grid">{hand.map(({p,c})=>{const member=roomMembers.find(x=>x.id===p);const done=donePlayers.includes(p);return <div className={'playing-card '+(c.red?'red':'black')+(p===myId&&!done?' focused':'')+(done?' completed':'')} key={p}><small>{member?.avatar} {member?.name||`P${p}`}</small><b>{c.rank}{c.suit}</b><span>{c.red?'RED':'BLACK'}</span>{done?<em>✓ Done today</em>:p===myId&&!isObserver?<em>● YOU CAN ACT</em>:<em>Ready</em>}</div>})}</div>
          {allDone?<div className="turn-callout success"><b><CheckCircle size={18}/> Everyone finished — day advancing automatically</b><p>All connected players will see the next day or phase decision shortly.</p></div>:<div className="turn-callout"><b>{isObserver?'Observing players':myDone?'You have completed your turn':`${card?.red?'Red card':'Black card'} · Your turn is available`}</b><p>{isObserver?'Players can act in any order.':myDone?'Other players can act at any time.':card?.red?'Drag a highlighted task to its next column, or use the unblock control on a blocked ticket. Help others when your own moves are unavailable.':legal.part==='block'?'First block one of your unblocked active tickets using its Block button. Then pull a To-Do ticket.':'Drag a highlighted To-Do ticket into Working on. If pulling is unavailable, help a teammate.'}</p>{!isObserver&&!myDone&&<span className="turn-note">Use drag-and-drop or the buttons directly on each ticket. No turn order is enforced.</span>}{!isObserver&&!myDone&&!legal.options.length&&<button className="btn outline no-print" disabled={loading} onClick={()=>cmd('move',null,'pass')}>No legal moves · Finish my turn</button>}</div>}

        </section>
      </>}
      {(gate==='playing'||gate==='duration'||gate==='wip'||gate==='dsu')&&<>
        <div className="section-row"><h2>Shared Kanban board</h2><span className="muted small">Changes synchronize across all participants</span></div>
        <div className="board-scroller"><div className="board">{COLUMNS.map((col,s)=>{const st=status(s);const canDrop=Boolean(isMyTurn&&!loading&&board.some(t=>t.id===dragging&&canMoveTo(t,s)));return <div className={'column '+(st?`wip-${st.name}`:'')+(dropTarget===s&&canDrop?' valid-drop':'')} key={col} onDragOver={e=>{if(canDrop){e.preventDefault();e.dataTransfer.dropEffect='move';setDropTarget(s)}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{e.preventDefault();if(canDrop)dropInto(s)}}><div className="column-title"><b>{col}</b><span>{board.filter(t=>t.status===s).length}</span></div>{st&&<div className="wip-data"><small>WIP {st.used} / {st.limit}</small>{st.limit!=='∞'&&<div className="wip-track"><div style={{width:`${Math.min(100,100*st.used/st.limit)}%`}}/></div>}<b>{st.label}</b></div>}<div className="sticky-stack">{board.filter(t=>t.status===s).map(t=>{const canAdvance=canMoveTo(t,t.status+1);const canBlock=canToggleBlock(t);const available=isMyTurn&&!loading&&(canAdvance||canBlock);return <div key={t.id} role="group" aria-label={`Task ${t.id}`} draggable={isMyTurn&&!loading&&canAdvance} onDragStart={e=>{if(!canAdvance)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(t.id));setDragging(t.id)}} onDragEnd={()=>{setDragging(null);setDropTarget(null)}} className={'sticky mp-ticket '+(available?'eligible ':'')+(canAdvance?'can-drag ':'')}><strong>Task #{t.id}</strong>{t.owner&&<small>{roomMembers.find(p=>p.id===t.owner)?.avatar} {roomMembers.find(p=>p.id===t.owner)?.name||`Player ${t.owner}`}</small>}{t.started!=null&&<small>◷ {age(t,day)} days</small>}{t.blocked&&<span className="blocked">BLOCKED</span>}{isMyTurn&&!loading&&(canAdvance||canBlock)&&<div className="ticket-actions">{canAdvance&&<button className="ticket-action advance" onClick={()=>moveOnBoard(t,t.status+1)} title={`Move to ${COLUMNS[t.status+1]}`}>Move → {COLUMNS[t.status+1]}</button>}{canBlock&&<button className="ticket-action blocker" onClick={()=>toggleBlock(t)}>{t.blocked?'Remove blocker':'Add blocker'}</button>}</div>}</div>})}</div></div>})}</div></div>
        <div className="metrics"><div><b>{stats.backlog}</b><span>Backlog</span></div><div><b>{stats.inProgress}</b><span>In progress</span></div><div><b>{stats.blocked}</b><span>Blocked</span></div><div><b>{stats.completed}</b><span>Completed</span></div></div>
        {game.events?.length>0&&<details className="panel log"><summary>Today's action log ({game.events.length})</summary>{game.events.map((x,i)=><p key={i}>{x}</p>)}</details>}
      </>}
      {complete&&<ChartResults game={game} players={roomMembers} code={code}/>}
    </>}
    {error&&<div className="notice error no-print"><AlertTriangle size={18}/><span>{error}</span><button className="text-button" onClick={()=>setError('')}>Dismiss</button></div>}
  </main><footer className="site-footer no-print"><div className="wrap">Kanban Flow Lab · Multiplayer classroom experiment · Each room is temporary. Original simulator is separate.</div></footer></>;
}
function phase(d){return d<=10?1:d<=20?2:3}
createRoot(document.getElementById('root')).render(<App/>);
