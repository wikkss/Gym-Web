/* Gym details. Set cap to the number of people the floor holds. */
const GYM={name:"APATNATAO",hours:"Open daily, 6 AM to 8 PM",cap:40};

const PG=document.body.dataset.page;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const tm=i=>new Date(i).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
const dt=i=>new Date(i).toLocaleDateString([],{month:"short",day:"numeric"});
const dur=(a,b)=>Math.max(1,Math.round((new Date(b)-new Date(a))/60000));
const fmt=m=>m<60?m+" min":Math.floor(m/60)+"h "+(m%60)+"m";
const hr=h=>(h%12||12)+(h<12?" AM":" PM");
const sameDay=i=>ymd(new Date(i))===ymd(new Date());
const stOf=u=>u.status==="suspended"?"Suspended":!u.expires?"No membership":u.expires<ymd(new Date())?"Expired":"Active";

/* Gym: the one module the screens talk to. Interface: refresh, signUp, logIn, logOut, register, scan, manage,
   plus the read-only me, floor, overview, mine. It calls the API in /api and keeps the last answer in a cache. */
const Gym=(()=>{
  const H0=6,H1=20,CAP=GYM.cap,STALE=14*36e5;
  let S={me:null,inside:0,users:[],visits:[],anon:[],log:[]};
  let mode=null,fail="";
  const LK="gymlog:demo";
  const okForm=f=>{
    const name=(f.name||"").trim(),email=(f.email||"").trim().toLowerCase(),mobile=(f.mobile||"").trim();
    if(!name)return "Enter the full name.";
    if(!/^\S+@\S+\.\S+$/.test(email))return "Enter a valid email address.";
    if(!/^\+?[\d\s-]{10,15}$/.test(mobile))return "Enter a valid mobile number with 10 to 15 digits.";
    return null;
  };
  /* Second adapter for the same API contract. Keeps everything in this browser. Used only when no server exists,
     for example when the file is opened directly. Passwords are stored as typed, so this is for demos only. */
  const local=(path,b)=>{
    b=b||{};
    let D;try{D=JSON.parse(localStorage.getItem(LK))}catch(e){}
    if(!D||!D.users)D={n:2,sess:0,visits:[],users:[{id:1,name:"Front Desk",email:"staff@apatnatao.com",mobile:"",pass:"staff123",role:"staff",plan:null,expires:null,suspended:false}]};
    D.log=D.log||[];D.lg=D.lg||1;
    const save=()=>{try{localStorage.setItem(LK,JSON.stringify(D))}catch(e){}};
    const code=u=>(u.role==="staff"?"ST-":"GM-")+String(u.id).padStart(3,"0");
    const pub=u=>({id:code(u),name:u.name,email:u.email,mobile:u.mobile,role:u.role,plan:u.plan,expires:u.expires,status:u.suspended?"suspended":"active",deleted:!!u.deleted});
    const idOf=c=>{const m=/^GM-(\d+)$/.exec(c||"");return m?+m[1]:null};
    const me=D.users.find(u=>u.id===D.sess&&!u.deleted),today=ymd(new Date()),cut=Date.now()-STALE;
    const live=v=>v.ok&&!v.out&&new Date(v.in)>cut;
    const inside=D.visits.filter(live).length;
    if(path==="auth"){
      if(b.action==="logout"){D.sess=0;save();return {ok:1}}
      const email=(b.email||"").trim().toLowerCase();
      if(b.action==="signup"){
        const e=okForm(b)||((b.pass||"").length<6?"Use a password with at least 6 characters.":null);
        if(e)return {err:e};
        if(D.users.some(u=>u.email===email))return {err:"That email already has an account. Log in instead."};
        const u={id:D.n++,name:b.name.trim(),email,mobile:b.mobile.trim(),pass:b.pass,role:"member",plan:null,expires:null,suspended:false};
        D.users.push(u);D.sess=u.id;save();return {ok:1};
      }
      const u=D.users.find(x=>x.email===email&&x.pass===(b.pass||"")&&!x.deleted);
      if(!u)return {err:"Email or password is incorrect."};
      D.sess=u.id;save();return {ok:1};
    }
    if(path==="data"){
      if(!me)return {me:null,inside,users:[],visits:[],anon:[],log:[]};
      const anon=D.visits.filter(v=>v.ok).map(v=>({in:v.in}));
      const row=v=>{const u=D.users.find(x=>x.id===v.uid);return {m:u?code(u):v.tried,name:u?u.name:"Unknown ID",in:v.in,out:v.out,ok:v.ok}};
      const all=[...D.visits].reverse();
      return me.role==="staff"
        ?{me:pub(me),inside,anon,users:D.users.filter(u=>u.role==="member").map(pub),visits:all.map(row),log:[...D.log].reverse().map(e=>({id:e.id,m:e.m,by:e.by,summary:e.summary,note:e.note,before:e.before,after:e.after,undone:e.undone,at:e.at}))}
        :{me:pub(me),inside,anon,users:[],visits:all.filter(v=>v.uid===me.id&&v.ok).map(row),log:[]};
    }
    if(!me)return {err:"Please log in again."};
    const staff=me.role==="staff";
    if(b.op==="scan"){
      const raw=String(b.id||"").toUpperCase(),n=idOf(raw);
      if(!staff&&n!==me.id)return {err:"You can only check yourself in."};
      const m=D.users.find(u=>u.id===n&&u.role==="member"&&!u.deleted),now=new Date().toISOString();
      if(!m){D.visits.push({tried:raw.slice(0,40),in:now,out:null,ok:false});save();return {k:"no",why:"unknown"}}
      const open=D.visits.find(v=>v.uid===m.id&&live(v));
      if(open){open.out=now;save();return {k:"out",name:m.name,mins:Math.max(1,Math.round((new Date(now)-new Date(open.in))/6e4))}}
      const why=m.suspended?"suspended":!m.expires?"none":m.expires<today?"expired":null;
      D.visits.push({uid:m.id,in:now,out:null,ok:!why});save();
      return why?{k:"no",why,name:m.name}:{k:"ok",name:m.name};
    }
    if(!staff)return {err:"Staff only."};
    if(b.op==="manage"){
      const snap=u=>({plan:u.plan,expires:u.expires,suspended:u.suspended,deleted:!!u.deleted});
      const put=(u,s)=>{u.plan=s.plan;u.expires=s.expires;u.suspended=s.suspended;u.deleted=s.deleted};
      const rec=(u,sum,note,bf,af)=>D.log.push({id:D.lg++,m:code(u),uid:u.id,by:me.name,summary:sum,note,before:bf,after:af,undone:false,at:new Date().toISOString()});
      const add=(s,k)=>{const d=new Date(s+"T00:00:00");d.setDate(d.getDate()+k);return ymd(d)};
      if(b.act==="undo"){
        const e=D.log.find(x=>x.id===+b.logId),u=e&&D.users.find(x=>x.id===e.uid),last=e&&D.log.filter(x=>x.uid===e.uid).pop();
        if(!e||e.undone||last.id!==e.id)return {err:"Only the latest change to a member can be undone."};
        const cur=snap(u);put(u,e.before);e.undone=true;rec(u,"Undid: "+e.summary,"",cur,{...e.before});save();
        return {ok:1,summary:"Undid: "+e.summary};
      }
      const u=D.users.find(x=>x.id===idOf(String(b.id||"").toUpperCase())&&x.role==="member");
      if(!u)return {err:"Member not found."};
      const before=snap(u),after={...before},day=/^\d{4}-\d{2}-\d{2}$/.test(b.today||"")?b.today:today,note=String(b.note||"").trim().slice(0,200);
      let sum;
      if(b.act==="adjust"){
        if(before.deleted)return {err:"Restore this member first."};
        const days=Math.trunc(Number(b.days));
        if(!days||Math.abs(days)>3650)return {err:"Enter a number of days from 1 to 3650. Use a minus sign to remove days."};
        if(days<0&&!before.expires)return {err:"This member has no membership to reduce."};
        after.expires=days>0?add(before.expires&&before.expires>day?before.expires:day,days):add(before.expires,days);
        after.plan=["Monthly","Annual"].includes(b.plan)?b.plan:(before.plan||"Custom");
        sum=(days>0?"Added ":"Removed ")+Math.abs(days)+" day"+(Math.abs(days)===1?"":"s");
      }else if(b.act==="toggle"){
        if(before.deleted)return {err:"Restore this member first."};
        after.suspended=!before.suspended;sum=after.suspended?"Suspended account":"Restored account";
      }else if(b.act==="remove"){
        if(before.deleted)return {err:"Already removed."};
        after.deleted=true;sum="Removed member";
      }else if(b.act==="restore"){
        if(!before.deleted)return {err:"This member is not removed."};
        after.deleted=false;sum="Restored removed member";
      }else return {err:"Unknown action."};
      put(u,after);
      if(b.act==="remove"){if(D.sess===u.id)D.sess=0;D.visits.forEach(v=>{if(v.uid===u.id&&live(v))v.out=new Date().toISOString()})}
      rec(u,sum,note,before,after);save();
      return {ok:1,summary:sum,expires:after.expires};
    }
    if(b.op==="register"){
      const e=okForm(b);if(e)return {err:e};
      const email=b.email.trim().toLowerCase();
      if(D.users.some(u=>u.email===email))return {err:"That email already has an account."};
      D.users.push({id:D.n++,name:b.name.trim(),email,mobile:b.mobile.trim(),pass:"welcome123",role:"member",plan:null,expires:null,suspended:false});
      save();return {ok:1};
    }
    return {err:"Unknown request."};
  };
  /* Picks the adapter on the first call. A JSON answer from /api means the server exists, even if it reports an error.
     No JSON (a 404 page, or no network) means no server, so the browser adapter takes over. */
  const call=async(path,body)=>{
    if(mode!=="local"){
      try{
        const r=await fetch("/api/"+path,body?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{});
        const j=await r.json().catch(()=>null);
        if(j){mode="remote";return j}
      }catch(e){}
      if(mode==="remote")return {err:"Cannot reach the server. Check the connection and try again."};
      mode="local";
    }
    return local(path,body);
  };
  const refresh=async()=>{const d=await call("data");fail=d&&d.err?d.err:"";if(d&&!d.err)S=d};
  const act=async b=>{const r=await call("act",b);await refresh();return r};
  const live=v=>v.ok&&!v.out&&Date.now()-new Date(v.in)<STALE;
  const hours=()=>{const c=Array(H1-H0).fill(0);(S.anon||[]).forEach(v=>{const h=new Date(v.in).getHours();if(h>=H0&&h<H1)c[h-H0]++});return c};
  const avg=a=>a.length?Math.round(a.reduce((t,v)=>t+dur(v.in,v.out),0)/a.length):0;
  const line=r=>{
    if(r.err)return {k:"no",t:r.err};
    const n=r.name;
    if(r.k==="ok")return {k:"ok",t:"Welcome, "+n+". Checked in at "+tm(new Date())+"."};
    if(r.k==="out")return {k:"out",t:"Goodbye, "+n+". Visit logged: "+fmt(r.mins)+"."};
    return {k:"no",t:({unknown:"Unknown member ID. Entry denied.",suspended:"Account suspended. Entry denied for "+n+". See the front desk.",none:"No active membership for "+n+". See the front desk.",expired:"Membership expired for "+n+". See the front desk."})[r.why]};
  };
  return {
    refresh,
    mode:()=>mode,
    problem:()=>fail,
    sig:()=>S.inside+"|"+(S.visits||[]).length+"|"+(S.visits||[]).filter(v=>v.out).length+"|"+(S.log||[]).length,
    me:()=>S.me,
    async signUp(f){const r=await call("auth",{action:"signup",...f});await refresh();return r},
    async logIn(email,pass){const r=await call("auth",{action:"login",email,pass});await refresh();return r},
    async logOut(){await call("auth",{action:"logout"});await refresh()},
    register:f=>act({op:"register",...f}),
    async scan(raw){const id=(raw||"").trim();if(!id)return null;return line(await act({op:"scan",id}))},
    manage:(id,a,extra)=>act({op:"manage",id,act:a,today:ymd(new Date()),...(extra||{})}),
    floor(){return {n:S.inside,cap:CAP,pct:Math.min(100,Math.round(S.inside/CAP*100))}},
    overview(){
      const vs=S.visits||[],ok=vs.filter(v=>v.ok),td=vs.filter(v=>sameDay(v.in)),done=ok.filter(v=>v.out&&sameDay(v.in));
      return {inside:vs.filter(live),today:td.filter(v=>v.ok).length,denied:td.filter(v=>!v.ok).length,avg:avg(done),hours:hours(),H0,recent:vs.slice(0,12),members:S.users||[],log:S.log||[]};
    },
    mine(id){
      const v=(S.visits||[]).filter(x=>x.m===id&&x.ok),hc=hours();
      return {total:v.length,last30:v.filter(x=>new Date(x.in)>Date.now()-30*864e5).length,avg:avg(v.filter(x=>x.out)),inside:v.some(live),visits:v.slice(0,15),quiet:hc.indexOf(Math.min(...hc))+H0};
    }
  };
})();

/* Screens */
let tab=PG==="signup"?"signup":"login",page=({member:"overview",staff:"overview"})[PG]||PG,err="",note=null,reg=null,q="",fe={},vals={},mfilter="all",openId=null,openKind=null,mmsg=null,confirmId=null;
const lvl=p=>p<40?["Quiet","var(--ok)"]:p<75?["Moderate","var(--warn)"]:["Busy","var(--bad)"];
const tag=s=>`<span class="tag ${s==="Active"?"a":"e"}">${s}</span>`;
const IC={overview:'<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',members:'<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 010 8M22 21c0-3-2-5-4-6"/>',reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',visits:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
const daysLeft=u=>{
  if(!u.expires||stOf(u)!=="Active")return "";
  const left=Math.max(0,Math.ceil((new Date(u.expires+"T00:00:00")-new Date())/864e5)),span=u.plan==="Annual"?365:30;
  return `<div class="days"><i style="width:0" data-w="${Math.min(100,Math.round(left/span*100))}"></i></div><small>${left} day${left===1?"":"s"} left</small>`;
};
const stat=(l,v)=>`<div><b${typeof v==="number"?` data-count="${v}" data-k="s-${l}"`:""}>${v}</b><small>${l}</small></div>`;
const noteHtml=()=>note?`<div class="msg ${note.k}" role="status">${esc(note.t)}</div>`:"";

let prevPct=0,lastView="",shownNote=null,seenRows=null;
const seen={};
function ring(){
  const f=Gym.floor(),l=lvl(f.pct);
  return `<div class="ring" role="img" aria-label="${f.n} of ${f.cap} people on the floor, ${l[0]}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52" pathLength="100"/><circle class="arc" cx="60" cy="60" r="52" pathLength="100" data-to="${f.pct}" style="stroke:${l[1]};stroke-dasharray:${prevPct} 100"/></svg>
  <div class="rt"><b data-count="${f.n}" data-k="floor">${f.n}</b><span><i class="live"></i>of ${f.cap} on the floor</span><em style="color:${l[1]}">${l[0]}</em></div></div>`;
}
const field=(l,n,type,auto)=>`<label>${l}<span class="ctl"><input name="${n}" type="${type}" autocomplete="${auto}" value="${n==="pass"?"":esc(vals[n]||"")}"${fe[n]?` aria-invalid="true" aria-describedby="e-${n}"`:""}>${n==="pass"?'<button type="button" class="peek" data-act="peek">Show</button>':""}</span>${fe[n]?`<span class="ferr" id="e-${n}">${fe[n]}</span>`:""}</label>`;
const fieldErrs=(f,signup)=>{
  const e={};
  if(signup&&!(f.name||"").trim())e.name="Enter your full name.";
  if(!/^\S+@\S+\.\S+$/.test((f.email||"").trim()))e.email="Enter a valid email address, for example name@example.com.";
  if(signup&&!/^\+?[\d\s-]{10,15}$/.test((f.mobile||"").trim()))e.mobile="Enter a mobile number with 10 to 15 digits.";
  if(!f.pass)e.pass=signup?"Choose a password with at least 6 characters.":"Enter your password.";
  else if(signup&&f.pass.length<6)e.pass="Use at least 6 characters.";
  return e;
};
function authScreen(){
  const li=tab==="login";
  return `<div class="authwrap"><section class="hero"><div class="brand">${esc(GYM.name)}</div><h1><span>Walk in.</span><span>We log it.</span></h1>
  <p>Scan at the door and your visit records itself. See how busy the floor is before you leave home.</p>${ring()}<small style="color:#9fb0b4">${esc(GYM.hours)}</small></section>
  <section class="fside">
  <div class="tabs"><a href="index.html" class="${li?"on":""}">Log in</a><a href="signup.html" class="${li?"":"on"}">Create account</a></div>
  <form id="${li?"loginForm":"signupForm"}" novalidate>
  ${li?"":field("Full name","name","text","name")}
  ${field("Email","email","email","email")}
  ${li?"":field("Mobile number","mobile","tel","tel")}
  ${field("Password","pass","password",li?"current-password":"new-password")}
  <button class="btn lg" style="width:100%">${li?"Log in":"Create my account"}</button><p class="err" role="alert">${esc(err||Gym.problem())}</p></form>
  ${Gym.mode()==="local"?'<p class="mut">Demo mode: no server found, so accounts are saved only in this browser. Staff login: staff@apatnatao.com, password staff123.</p>':""}</section></div>`;
}
function memberPage(u){
  const m=Gym.mine(u.id);
  if(page==="visits")return `<h1>My visits</h1><p class="mut">Your last ${m.visits.length} visits.</p><div class="blk wrap"><table><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Length</th></tr></thead><tbody>${
    m.visits.map(v=>`<tr><td>${dt(v.in)}</td><td>${tm(v.in)}</td><td>${v.out?tm(v.out):"Inside"}</td><td>${v.out?fmt(dur(v.in,v.out)):"-"}</td></tr>`).join("")||'<tr><td colspan="4" class="mut">No visits yet. Press Check in on the Today page.</td></tr>'}</tbody></table></div>`;
  return `<h1>Hello, ${esc(u.name.split(" ")[0])}</h1><p class="mut">${u.expires?`${u.plan} plan, ${tag(stOf(u))} until ${u.expires}`:`${tag(stOf(u))} Pay at the front desk to start your membership.`}</p>
  ${daysLeft(u)}
  <div class="pass"><b>${u.id}</b><span>Show this ID at the front desk.<br>${esc(u.mobile)}</span></div>
  <div class="two"><div>${ring()}<p class="mut">Usually quietest around ${hr(m.quiet)}.</p></div>
  <div><h2>${m.inside?"You are checked in":"Ready when you are"}</h2><button class="btn lg" data-act="self"${stOf(u)==="Active"||m.inside?"":" disabled"}>${m.inside?"Check out":"Check in"}</button>${stOf(u)==="Active"||m.inside?"":'<p class="mut">Check-in unlocks when staff activate your membership at the front desk.</p>'}${noteHtml()}</div></div>
  <div class="stats">${stat("Total visits",m.total)+stat("Last 30 days",m.last30)+stat("Average visit",m.avg?fmt(m.avg):"-")}</div>`;
}
const parseDays=s=>{const t=String(s).trim().replace(/[\u2212\u2013]/g,"-");return /^[+-]?\d{1,4}$/.test(t)?parseInt(t,10):NaN};
const leftText=u=>{
  if(!u.expires)return "";
  const d=Math.ceil((new Date(u.expires+"T00:00:00")-new Date())/864e5);
  return d>=0?d+" day"+(d===1?"":"s")+" left":"expired "+(-d)+" day"+(d===-1?"":"s")+" ago";
};
const latestLog=l=>{const r={};l.forEach(e=>{if(!(e.m in r))r[e.m]=e.id});return r};
function logRow(e,latest,names){
  const a=e.after,b=e.before,ch=[];
  if(a.expires!==b.expires)ch.push("Expires "+(b.expires||"none")+" to "+(a.expires||"none"));
  if(a.plan!==b.plan)ch.push("Plan "+(b.plan||"none")+" to "+(a.plan||"none"));
  if(a.suspended!==b.suspended)ch.push(a.suspended?"Suspended":"No longer suspended");
  if(a.deleted!==b.deleted)ch.push(a.deleted?"Removed from the list":"Back on the list");
  return `<tr${e.undone?' class="undone"':""}><td>${dt(e.at)}, ${tm(e.at)}</td>${names?`<td>${esc(names[e.m]||e.m)}<br><small>${esc(e.m)}</small></td>`:""}<td><b class="sum">${esc(e.summary)}</b>${e.note?`<br><small>${esc(e.note)}</small>`:""}<br><small>${esc(ch.join(". "))}</small></td><td><small>${esc(e.by)}</small></td><td>${e.undone?"<small>Undone</small>":latest[e.m]===e.id?`<button class="btn alt sm" data-act="undo" data-log="${e.id}">Undo</button>`:""}</td></tr>`;
}
function memberPanel(u,o){
  if(openId!==u.id)return "";
  const latest=latestLog(o.log);
  if(openKind==="history"){
    const rows=o.log.filter(e=>e.m===u.id);
    return `<tr class="panel-row"><td colspan="6"><div class="subpanel"><h3>History for ${esc(u.name)}</h3><div class="wrap"><table><thead><tr><th>When</th><th>Change</th><th>By</th><th></th></tr></thead><tbody>${rows.map(e=>logRow(e,latest)).join("")||'<tr><td colspan="4" class="mut">No changes recorded yet.</td></tr>'}</tbody></table></div><button class="btn alt sm" data-act="close">Close</button></div></td></tr>`;
  }
  return `<tr class="panel-row"><td colspan="6"><form id="adjForm" class="subpanel" data-m="${u.id}"><h3>Change membership time for ${esc(u.name)}</h3>
  <p class="mut">Now: ${u.expires?`expires ${u.expires}, ${leftText(u)}`:"no membership"}. Every change is kept in the history and can be undone.</p>
  <div class="row"><button type="button" class="btn alt sm" data-act="quick" data-days="30" data-plan="Monthly">Add 30 days</button><button type="button" class="btn alt sm" data-act="quick" data-days="365" data-plan="Annual">Add 1 year</button><button type="button" class="btn alt sm" data-act="quick" data-days="-30">Remove 30 days</button></div>
  <div class="row" style="margin-top:12px"><label>Days (+ adds, - removes)<input id="adjDays" name="days" type="text" inputmode="numeric" autocomplete="off" placeholder="+10 or -5" data-exp="${u.expires||""}"></label><label>Reason (optional)<input name="note" maxlength="200" placeholder="For example: paid at the desk"></label><button class="btn" style="margin-bottom:12px">Apply</button></div>
  <p class="mut" id="adjPreview" aria-live="polite"></p><button type="button" class="btn alt sm" data-act="close">Cancel</button></form></td></tr>`;
}
const memberRows=()=>{
  const o=Gym.overview(),qq=q.toLowerCase();
  return o.members.filter(u=>(mfilter==="removed"?u.deleted:!u.deleted)&&(mfilter!=="needs"||!u.expires)&&(u.name+u.id+u.email+u.mobile).toLowerCase().includes(qq)).map(u=>`<tr${u.deleted?' class="gone"':""}><td>${u.id}</td><td>${esc(u.name)}<br><small>${esc(u.email)}<br>${esc(u.mobile)}</small></td><td>${u.plan||"None"}</td><td>${u.expires||"-"}<br><small>${leftText(u)}</small></td><td>${u.deleted?'<span class="tag e">Removed</span>':tag(stOf(u))}</td><td class="acts">${u.deleted?`<button class="btn alt sm" data-m="${u.id}" data-act="restore">Restore member</button>`:`<form class="rowadj" data-m="${u.id}"><input name="days" inputmode="numeric" autocomplete="off" placeholder="+10 or -5" aria-label="Days to add or remove for ${esc(u.name)}"><button class="btn sm">Apply</button></form><button class="btn alt sm" data-m="${u.id}" data-act="open-adjust">Add a reason</button><button class="btn alt sm" data-m="${u.id}" data-act="toggle">${u.status==="suspended"?"Restore":"Suspend"}</button><button class="btn alt sm danger" data-m="${u.id}" data-act="remove">${confirmId===u.id?"Click again to remove":"Remove"}</button>`}<button class="btn alt sm" data-m="${u.id}" data-act="open-history">History</button></td></tr>${memberPanel(u,o)}`).join("")||`<tr><td colspan="6" class="mut">${mfilter==="removed"?"No removed members.":"No members match."}</td></tr>`;
};
function membersPage(o){
  const live=o.members.filter(u=>!u.deleted),c={all:live.length,needs:live.filter(u=>!u.expires).length,removed:o.members.length-live.length};
  const names={};o.members.forEach(u=>{names[u.id]=u.name});
  const latest=latestLog(o.log);
  return `<h1>Members</h1><p class="mut">Register walk-ins, change membership time, suspend, or remove accounts. Every change is saved in the history and can be undone.</p>
  <form id="addForm" class="blk"><h2>Register a member</h2><div class="row"><label>Full name<input name="name"></label><label>Email<input name="email" type="email"></label><label>Mobile number<input name="mobile" type="tel"></label><button class="btn" style="margin-bottom:12px">Register member</button></div>
  ${reg?`<div class="msg ${reg.k}" role="status">${esc(reg.t)}</div>`:'<p class="mut">New members get the temporary password welcome123.</p>'}</form>
  <div class="blk"><h2>Members</h2><div class="row" style="margin-bottom:10px"><input id="search" placeholder="Search by name, ID, email, or mobile" aria-label="Search members" value="${esc(q)}" style="max-width:360px"><div class="seg" role="group" aria-label="Filter members">${[["all","All ("+c.all+")"],["needs","Needs membership ("+c.needs+")"],["removed","Removed ("+c.removed+")"]].map(f=>`<button data-act="filter" data-f="${f[0]}" class="${mfilter===f[0]?"on":""}">${f[1]}</button>`).join("")}</div></div>
  <div class="wrap"><table><thead><tr><th>ID</th><th>Member</th><th>Plan</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead><tbody id="mrows">${memberRows()}</tbody></table></div></div>
  <div class="blk"><h2>Recent changes</h2><p class="mut">Newest first. Undo works on the latest change to each member.</p><div class="wrap"><table><thead><tr><th>When</th><th>Member</th><th>Change</th><th>By</th><th></th></tr></thead><tbody>${o.log.slice(0,15).map(e=>logRow(e,latest,names)).join("")||'<tr><td colspan="5" class="mut">No changes yet.</td></tr>'}</tbody></table></div></div>`;
}
function staffPage(){
  const o=Gym.overview(),mx=Math.max(1,...o.hours);
  if(page==="members")return membersPage(o);
  if(page==="reports")return `<h1>Reports</h1><p class="mut">Attendance across all recorded days.</p>
  <div class="blk"><h2>Visits by hour of day</h2><div class="bars">${o.hours.map((c,i)=>`<div title="${hr(o.H0+i)}: ${c} visits" style="height:${c/mx*100}%"></div>`).join("")}</div>
  <div class="axis">${o.hours.map((c,i)=>`<span>${(o.H0+i)%12||12}</span>`).join("")}</div><p class="mut">Taller bars are peak hours.</p></div>
  <div class="blk"><h2>Recent activity</h2><div class="wrap"><table><thead><tr><th>Time</th><th>Member</th><th>Result</th></tr></thead><tbody>${
  o.recent.map(v=>`<tr data-r="${esc("r"+v.m+v.in)}"><td>${dt(v.in)}, ${tm(v.in)}</td><td>${esc(v.name)}</td><td>${v.ok?(v.out?"Out after "+fmt(dur(v.in,v.out)):"Inside"):'<span class="tag e">Denied</span>'}</td></tr>`).join("")}</tbody></table></div></div>`;
  return `<h1>Front desk</h1><p class="mut">${esc(GYM.hours)}</p>
  <div class="stats">${stat("Inside now",o.inside.length)+stat("Visits today",o.today)+stat("Average visit today",o.avg?fmt(o.avg):"-")+stat("Denied today",o.denied)+stat("Awaiting membership",o.members.filter(u=>!u.expires&&!u.deleted).length)}</div>
  <div class="two"><div>${ring()}</div><form id="scanForm"><h2>Scan a member</h2><div class="row"><label style="margin:0">Member ID<input name="id" placeholder="For example GM-001" autocomplete="off"></label><button class="btn">Scan</button></div>${noteHtml()}</form></div>
  <div class="blk"><h2>Inside now</h2><div class="wrap"><table><thead><tr><th>Member</th><th>ID</th><th>Checked in</th></tr></thead><tbody>${
  o.inside.map(v=>`<tr data-r="${esc("i"+v.m+v.in)}"><td>${esc(v.name)}</td><td>${esc(v.m)}</td><td>${tm(v.in)}</td></tr>`).join("")||'<tr><td colspan="3" class="mut">Nobody is inside right now. Scan a member ID to check someone in.</td></tr>'}</tbody></table></div></div>`;
}
function shell(u){
  const st=u.role==="staff",nav=st?[["overview","Front desk","staff.html"],["members","Members","members.html"],["reports","Reports","reports.html"]]:[["overview","Today","member.html"],["visits","My visits","visits.html"]];
  if(!nav.some(n=>n[0]===page))page="overview";
  return `<aside class="side"><div class="brand">${esc(GYM.name)}</div>
  <nav class="nav" aria-label="Main">${nav.map(n=>`<a href="${n[2]}" class="${n[0]===page?"on":""}"${n[0]===page?' aria-current="page"':""}>${icon(n[0])}${n[1]}</a>`).join("")}</nav>
  <div class="foot"><div><b style="font-size:1.2rem">${esc(u.name)}</b><br><small>${st?"Staff":"Member "+u.id}</small></div><button class="btn alt" data-act="logout">Log out</button></div></aside>
  <main>${Gym.mode()==="local"?'<p class="mut">Demo mode: data stays in this browser.</p>':""}${st?staffPage():memberPage(u)}</main>`;
}
function motion(view){
  const root=$("#root"),first=view!==lastView,calm=matchMedia("(prefers-reduced-motion: reduce)").matches;
  lastView=view;
  document.body.classList.toggle("enter",first);
  if(first){
    const host=root.querySelector("main")||root.querySelector(".fside");
    [...(host?host.children:[])].forEach((el,i)=>{el.classList.add("rise");el.style.setProperty("--i",i)});
    root.querySelectorAll(".bars div").forEach((el,i)=>el.style.setProperty("--i",i));
  }
  root.querySelectorAll("[data-count]").forEach(el=>{
    const to=+el.dataset.count,k=el.dataset.k,from=first?0:(k in seen?seen[k]:0);
    seen[k]=to;
    if(from===to||calm)return;
    const t0=performance.now();
    const step=t=>{const p=Math.min(1,(t-t0)/700);el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step)};
    el.textContent=from;requestAnimationFrame(step);
  });
  const arc=root.querySelector(".arc");
  if(arc){const to=+arc.dataset.to;prevPct=to;requestAnimationFrame(()=>requestAnimationFrame(()=>{arc.style.strokeDasharray=to+" 100"}))}
  root.querySelectorAll("[data-w]").forEach(el=>requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.width=el.dataset.w+"%"})));
  const m=root.querySelector(".msg");
  if(m&&note&&note!==shownNote){
    m.classList.add("pop");shownNote=note;
    const r=root.querySelector(".ring");if(r&&note.k!=="no")r.classList.add("pulse");
  }
  if(!note)shownNote=null;
  const rows=[...root.querySelectorAll("tr[data-r]")],keys=new Set(rows.map(r=>r.dataset.r));
  if(seenRows&&!first)rows.forEach(r=>{if(!seenRows.has(r.dataset.r))r.classList.add("fresh")});
  seenRows=keys;
}
function app(){
  const u=Gym.me(),view=u?u.role+page:"auth"+tab;
  if(view!==lastView)prevPct=0;
  document.body.className=u?"app":"auth";
  $("#root").innerHTML=u?shell(u):authScreen();
  motion(view);
}

const reduced=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
function go(url){
  if(reduced()||!document.querySelector("main,.fside")){location.href=url;return}
  document.body.classList.add("leaving");
  setTimeout(()=>{location.href=url},170);
}
let toastT;
function toast(t,k,undoId){
  let el=$("#toast");
  if(!el){el=document.createElement("div");el.id="toast";el.setAttribute("role","status");document.body.appendChild(el)}
  el.className="toast "+k;
  el.innerHTML=esc(t)+(undoId?` <button class="btn alt sm" data-act="undo" data-log="${undoId}">Undo</button>`:"");
  clearTimeout(toastT);toastT=setTimeout(()=>{el.className="toast gone"},9000);
}
async function doManage(id,a,extra){
  const r=await Gym.manage(id,a,extra);
  if(r.err){toast(r.err,"no");return app()}
  if(a==="adjust"||a==="remove")openId=null;
  app();
  toast(r.summary+(r.expires?". Expires "+r.expires+".":"."),"ok",a==="undo"?null:latestLog(Gym.overview().log)[id]);
}
document.addEventListener("click",async e=>{
  const lk=e.target.closest("a[href]");
  if(lk&&lk.closest(".nav,.tabs")&&!lk.classList.contains("on")&&e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();return go(lk.getAttribute("href"))}
  const t=e.target.closest("button");if(!t)return;
  const d=t.dataset;
  if(d.act!=="remove")confirmId=null;
  if(d.act==="peek"){const i=t.closest("label").querySelector("input");i.type=i.type==="password"?"text":"password";t.textContent=i.type==="password"?"Show":"Hide";return}
  if(d.act==="filter"){mfilter=d.f;openId=null;return app()}
  if(d.act==="open-adjust"||d.act==="open-history"){openId=d.m;openKind=d.act==="open-adjust"?"adjust":"history";return app()}
  if(d.act==="close"){openId=null;return app()}
  if(d.act==="quick")return doManage(t.closest("form").dataset.m,"adjust",{days:+d.days,plan:d.plan,note:"Quick change"});
  if(d.act==="undo")return doManage(null,"undo",{logId:+d.log});
  if(d.act==="toggle"||d.act==="restore")return doManage(d.m,d.act);
  if(d.act==="remove"){if(confirmId!==d.m){confirmId=d.m;return app()}confirmId=null;return doManage(d.m,"remove")}
  if(d.act==="logout"){await Gym.logOut();return go("index.html")}
  if(d.act==="self"){note=await Gym.scan(Gym.me().id);return app()}
});
document.addEventListener("submit",async e=>{
  e.preventDefault();
  const form=e.target,f=Object.fromEntries(new FormData(form)),id=form.id,btn=form.querySelector(".btn");
  if(id==="scanForm"){note=await Gym.scan(f.id);return app()}
  if(id==="addForm"){const r=await Gym.register(f);reg=r.err?{k:"no",t:r.err}:{k:"ok",t:f.name.trim()+" is registered. Temporary password: welcome123."};return app()}
  if(form.classList.contains("rowadj")||id==="adjForm"){
    const days=parseDays(f.days);
    if(!days)return toast("Type a whole number of days, like +10 or -5.","no");
    return doManage(form.dataset.m,"adjust",{days,note:f.note||"Typed number"});
  }
  const signup=id==="signupForm";
  fe=fieldErrs(f,signup);vals={name:f.name,email:f.email,mobile:f.mobile};err="";
  if(Object.keys(fe).length)return app();
  btn.disabled=true;btn.textContent="Please wait...";
  const r=signup?await Gym.signUp(f):await Gym.logIn(f.email,f.pass);
  if(r.err){err=r.err;return app()}
  if(signup){try{sessionStorage.setItem("gl:note",JSON.stringify({k:"ok",t:"Account created. Staff will activate your membership at the front desk, then you can check in here."}))}catch(e){}}
  go(Gym.me().role==="staff"?"staff.html":"member.html");
});
document.addEventListener("pointerdown",e=>{
  const el=e.target.closest(".btn,.seg button,.nav a");
  if(!el||el.disabled||reduced())return;
  const r=el.getBoundingClientRect(),d=Math.max(r.width,r.height)*2,s=document.createElement("span");
  s.className="ripple";
  s.style.cssText="width:"+d+"px;height:"+d+"px;left:"+(e.clientX-r.left-d/2)+"px;top:"+(e.clientY-r.top-d/2)+"px";
  el.appendChild(s);setTimeout(()=>s.remove(),650);
});
document.addEventListener("input",e=>{
  if(e.target.id==="search"){q=e.target.value;$("#mrows").innerHTML=memberRows()}
  if(e.target.id==="adjDays"){
    const v=parseDays(e.target.value),exp=e.target.dataset.exp,today=ymd(new Date()),at=s=>new Date(s+"T00:00:00"),p=$("#adjPreview");
    p.textContent=!v?"":v>0?"New expiry: "+ymd(addDays(at(exp&&exp>today?exp:today),v)):exp?"New expiry: "+ymd(addDays(at(exp),v)):"This member has no membership to reduce.";
  }
});
$("#root").innerHTML='<main><p class="mut">Loading...</p></main>';
const home=u=>u.role==="staff"?"staff.html":"member.html";
const NEEDS={login:null,signup:null,member:"member",visits:"member",staff:"staff",members:"staff",reports:"staff"};
Gym.refresh().then(()=>{
  const u=Gym.me(),need=NEEDS[PG];
  if(!u&&need)return location.replace("index.html");
  if(u&&(!need||u.role!==need))return location.replace(home(u));
  try{const n=sessionStorage.getItem("gl:note");if(n){note=JSON.parse(n);sessionStorage.removeItem("gl:note")}}catch(e){}
  app();
});
setInterval(async()=>{
  if(document.hidden)return;
  const a=document.activeElement,typing=a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName),before=Gym.sig();
  await Gym.refresh();
  if(!Gym.me()&&NEEDS[PG])return location.replace("index.html");
  if(Gym.sig()!==before&&!typing)app();
},20000);
