/* Radiance Car Wash - customer booking app + admin console (Supabase backend) */
(function(){
  'use strict';
  var app=document.getElementById('app'), CFG=window.RCW_CONFIG||{};
  if(!CFG.SUPABASE_URL||/YOUR-PROJECT/.test(CFG.SUPABASE_URL)||!window.supabase){
    app.innerHTML='<header class="hero"><h1><img class="banner" alt="Radiance 360 Car Wash" src="assets/banner.jpg"></h1></header><div class="hazard"></div><div class="narrow stack" style="margin-top:24px"><section class="panel"><h3 class="h">Setup needed</h3><p style="clear:both">Open <b>js/config.js</b> and paste your Supabase project URL and anon key. The steps are in README.md.</p></section></div>';
    return;
  }
  var sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
  var DOMAIN=CFG.LOGIN_EMAIL_DOMAIN||new URL(CFG.SUPABASE_URL).hostname;
  var SIZES=[{id:'small',name:'Small',hint:'Hatchback'},{id:'sedan',name:'Sedan / SUV',hint:'Sedan, compact SUV'},{id:'large',name:'Large',hint:'MUV, 7-seater'},{id:'premium',name:'Premium',hint:'Luxury car'},{id:'bike',name:'Bike',hint:'Bike or scooter'}];

  /* ---------- helpers ---------- */
  function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function rupee(n){return '₹'+Math.round(n).toLocaleString('en-IN')}
  function today(){var d=new Date();d.setHours(0,0,0,0);return d}
  function addDays(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x}
  function ymd(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
  function parse(s){var a=s.split('-');return new Date(+a[0],+a[1]-1,+a[2])}
  function fmtDate(s,long){return parse(s).toLocaleDateString('en-IN',long?{weekday:'long',day:'numeric',month:'long'}:{weekday:'short',day:'numeric',month:'short'})}
  function fmtTime(t){return (t%12||12)+':00 '+(t<12?'AM':'PM')}
  function daysSince(s){return Math.round((today()-parse(s))/864e5)}
  function sizeName(v){for(var i=0;i<SIZES.length;i++)if(SIZES[i].id===v)return SIZES[i].name;return v}
  function cleanPhone(s){var d=String(s).replace(/\D/g,'');if(d.length===12&&d.indexOf('91')===0)d=d.slice(2);if(d.length===11&&d[0]==='0')d=d.slice(1);return d}
  function emailFor(phone){return phone+'@'+DOMAIN}
  function wa(phone,text){return 'https://wa.me/91'+phone+'?text='+encodeURIComponent(text)}
  function first(name){return String(name).split(' ')[0]}
  var DONE_MSG='Hi {name}, your {package} at Radiance Car Wash is done and your vehicle is ready. Thank you for choosing us! If you are happy with the service, please leave us a quick review: {link}';
  function doneText(b){var S=DB.settings,t=S.done_message||DONE_MSG,link=(S.review_link||'').trim(),u=user(b.userId);
    if(!link)t=t.replace(/[^.!?]*\{link\}[^.!?]*[.!?]?/,'').trim();
    return t.replace(/\{name\}/g,first(u.name)).replace(/\{package\}/g,packName(b.pack)).replace(/\{link\}/g,link)}
  function doneLink(b,label,cls){var u=user(b.userId);return u.phone?'<a class="btn sm '+(cls||'')+'" target="_blank" rel="noopener" href="'+wa(u.phone,doneText(b))+'">'+label+'</a>':''}
  function val(id){var el=document.getElementById(id);return el?el.value.trim():''}
  function ok(res){if(res.error)throw res.error;return res.data}
  function msg(x){var m=(x&&x.message)||String(x);
    if(/Invalid login credentials/i.test(m))return 'Mobile number or password is wrong.';
    if(/already registered|already been registered/i.test(m))return 'This mobile number is already registered. Log in instead.';
    if(/has_login|promo_ok|vehicle_type|profiles_id_fkey|row-level security policy for table "profiles"/i.test(m))return 'One-time database update needed: run update-2-add-customers.sql in Supabase, then try again.';
    if(/profiles_phone_key|duplicate key/i.test(m))return 'A customer with this mobile number already exists. Search for them in the list below.';
    if(/review_link|done_message/i.test(m))return 'One-time database update needed: run the two-line SQL from the instructions in Supabase, then try again.';
    if(/Failed to fetch|NetworkError|Load failed/i.test(m))return 'No internet connection. Check your network and try again.';
    return m}

  /* ---------- data ---------- */
  var ME=null, DB={users:[],bookings:[],coupons:[],monthly:[],slots:{},price:{},car:[],bike:[],
    settings:{banner_text:'',banner_active:false,open_hour:9,close_hour:19,slot_capacity:2,booking_days:7}};
  function isAdmin(){return ME&&ME.role==='admin'}
  function mapU(r){return {id:r.id,name:r.name,phone:r.phone,reg:r.reg,role:r.role,monthlyReq:r.monthly_req,hasLogin:r.has_login!==false,vehicleType:r.vehicle_type||'',promoOk:r.promo_ok!==false,created:ymd(new Date(r.created_at))}}
  function mapB(r){return {id:r.id,userId:r.user_id,v:r.vehicle,pack:r.pack,price:r.price,discount:r.discount,coupon:r.coupon,date:r.date,time:r.time,status:r.status,notes:r.notes,cancelledBy:r.cancelled_by,cancelledOn:r.cancelled_on}}
  function mapM(r){return {id:r.id,userId:r.user_id,plan:r.plan,washes:r.washes,used:r.used,amount:+r.amount,start:r.start_date,end:r.end_date}}
  async function pages(make){var out=[],from=0,r;for(;;){r=ok(await make().range(from,from+999));out=out.concat(r);if(r.length<1000)break;from+=1000}return out}
  function setPrices(rows){DB.price={};DB.car=[];DB.bike=[];rows.forEach(function(r){DB.price[r.vehicle+'|'+r.pack]=r.price;var l=r.vehicle==='bike'?DB.bike:DB.car;if(!l.some(function(p){return p.id===r.pack}))l.push({id:r.pack,name:r.pack_name,sort:r.sort})});
    DB.car.sort(function(a,b){return a.sort-b.sort});DB.bike.sort(function(a,b){return a.sort-b.sort})}
  async function loadSlots(){var T=today(),rows=ok(await sb.rpc('slot_counts',{p_from:ymd(T),p_to:ymd(addDays(T,DB.settings.booking_days))}));DB.slots={};rows.forEach(function(r){DB.slots[r.d+'|'+r.t]=r.n})}
  async function load(){
    var base=await Promise.all([sb.from('settings').select('*').eq('id',1).single(),sb.from('prices').select('*').order('sort')]);
    DB.settings=ok(base[0]);setPrices(ok(base[1]));
    if(isAdmin()){
      var since=ymd(addDays(today(),-400));
      var a=await Promise.all([
        pages(function(){return sb.from('profiles').select('*').order('created_at').order('id')}),
        pages(function(){return sb.from('bookings').select('*').gte('date',since).order('date').order('id')}),
        sb.from('coupons').select('*').order('created_at'),
        sb.from('monthly_packages').select('*').order('end_date',{ascending:false})]);
      DB.users=a[0].map(mapU);DB.bookings=a[1].map(mapB);DB.coupons=ok(a[2]);DB.monthly=ok(a[3]).map(mapM);
    }else{
      var c=await Promise.all([
        sb.from('bookings').select('*').eq('user_id',ME.id).order('date',{ascending:false}).limit(300),
        sb.from('monthly_packages').select('*').eq('user_id',ME.id),loadSlots()]);
      DB.users=[ME];DB.bookings=ok(c[0]).map(mapB);DB.monthly=ok(c[1]).map(mapM);DB.coupons=[];
    }
  }
  function user(id){for(var i=0;i<DB.users.length;i++)if(DB.users[i].id===id)return DB.users[i];return {name:'Removed customer',phone:'',reg:''}}
  function packList(v){return (v==='bike'?DB.bike:DB.car).filter(function(p){return DB.price[v+'|'+p.id]!=null})}
  function packName(id){var l=DB.car.concat(DB.bike);for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i].name;return id}
  function priceOf(v,id){return DB.price[v+'|'+id]||0}
  function taken(date,t){return DB.slots[date+'|'+t]||0}
  function slotOpen(day,t){var d=ymd(addDays(today(),day));if(taken(d,t)>=DB.settings.slot_capacity)return false;if(day!==0)return true;var n=new Date();return t*60>n.getHours()*60+n.getMinutes()+30}
  function activePkg(uid){var t=ymd(today());return DB.monthly.filter(function(m){return m.userId===uid&&m.end>=t})[0]||null}
  function couponOk(c){return c&&c.active&&(!c.expires||c.expires>=ymd(today()))}

  /* ---------- UI state ---------- */
  var U={auth:'login',cTab:'book',aTab:'upcoming',err:'',msg:'',confirm:null,reset:null,busy:false,
    form:{v:'sedan',pack:'full',day:0,time:null,notes:'',code:'',applied:null,codeErr:''},
    q:'',cq:'',status:'all',group:'all',promo:'Hi {name}, Radiance Car Wash here. Give your vehicle the ultimate glow up this week. Reply to book your slot.',
    remind:15,remindText:'Hi {name}, it has been a while since your last wash at Radiance Car Wash. Shall we book your next slot?'};
  function quote(){var f=U.form,base=priceOf(f.v,f.pack),c=f.applied,disc=0;if(c)disc=c.type==='pct'?Math.round(base*c.value/100):Math.min(Math.round(c.value),base);return {base:base,disc:disc,total:base-disc}}

  /* ---------- shared bits ---------- */
  var ERR='<p class="err" data-err hidden role="alert"></p>';
  function radio(g,v,on,html,dis){return '<label class="opt"><input class="sr" type="radio" name="'+g+'" id="'+g+'-'+v+'" value="'+v+'"'+(on?' checked':'')+(dis?' disabled':'')+'>'+html+'</label>'}
  function seg(act,cur,items){return items.map(function(i){return '<button type="button" role="tab" aria-selected="'+(cur===i[0])+'" data-act="'+act+'" data-id="'+i[0]+'">'+i[1]+'</button>'}).join('')}
  function pill(s){return '<span class="pill '+s+'">'+s+'</span>'}
  function banner(){return '<header class="hero"><h1><img class="banner" alt="Radiance 360 Car Wash. The Ultimate Glow Up" width="1024" height="314" src="assets/banner.jpg"></h1></header><div class="hazard"></div>'}
  function topbar(name){return '<div class="top"><img class="logo" alt="Radiance 360 Car Wash" src="assets/logo.jpg"><div class="row" style="flex-wrap:nowrap;min-width:0"><div class="who">'+h(name)+'</div><button type="button" class="btn sm" data-act="refresh">Refresh</button><button type="button" class="btn sm" data-act="logout">Log out</button></div></div><div class="hazard"></div>'}
  function notices(){return (U.err?'<p class="err" role="alert">'+h(U.err)+'</p>':'')+(U.msg?'<div class="note" role="status">'+h(U.msg)+'</div>':'')+sentNote()}
  function sentNote(){var b=U.sent&&DB.bookings.filter(function(x){return x.id===U.sent})[0];if(!b)return '';var u=user(b.userId);
    return '<div class="note" role="status"><div class="row between"><div><b>Marked as done.</b> Send '+h(first(u.name))+' the update'+((DB.settings.review_link||'').trim()?' with your review link.':'.')+'</div>'+doneLink(b,'Send on WhatsApp','gold')+'</div>'+((DB.settings.review_link||'').trim()?'':'<p class="small muted" style="margin-top:8px">No review link saved yet. Add it under Settings to include it in this message.</p>')+'</div>'}
  function cancelBtns(b){return U.confirm===b.id?'<span class="small">Cancel this booking?</span><button type="button" class="btn sm danger" data-act="docancel" data-id="'+b.id+'">Yes, cancel</button><button type="button" class="btn sm" data-act="keep">Keep</button>':'<button type="button" class="btn sm" data-act="askcancel" data-id="'+b.id+'">Cancel</button>'}
  function bars(rows,fmt){var max=Math.max.apply(null,rows.map(function(r){return r[1]}).concat([1]));return '<div class="bars">'+rows.map(function(r){return '<div class="bar"><span>'+h(r[0])+'</span><span class="track"><span class="fill" style="display:block;width:'+(r[1]/max*100)+'%"></span></span><span class="n">'+(fmt?fmt(r[1]):r[1])+'</span></div>'}).join('')+'</div>'}
  function byDateAsc(a,b){return a.date<b.date?-1:a.date>b.date?1:a.time-b.time}
  function byDateDesc(a,b){return -byDateAsc(a,b)}

  /* ---------- sign in ---------- */
  function viewAuth(){
    var f=U.auth==='login'
      ?'<form class="fields" data-form="login"><div class="field"><label for="l-phone">Mobile number</label><input type="tel" id="l-phone" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile" required></div><div class="field"><label for="l-pass">Password</label><input type="password" id="l-pass" autocomplete="current-password" required></div>'+ERR+'<button class="btn gold wide">Log in</button><p class="small muted">Forgot your password? Call the shop on 7449250989 and we will reset it.</p></form>'
      :'<form class="fields" data-form="register"><div class="field"><label for="r-name">Name</label><input type="text" id="r-name" autocomplete="name" required></div><div class="field"><label for="r-phone">Mobile number</label><input type="tel" id="r-phone" inputmode="numeric" autocomplete="tel" placeholder="10-digit mobile" required></div><div class="field"><label for="r-reg">Vehicle number <span>(optional)</span></label><input type="text" id="r-reg" autocapitalize="characters" placeholder="TN 11 AB 1234"></div><div class="field"><label for="r-pass">Create a password</label><input type="password" id="r-pass" autocomplete="new-password" placeholder="At least 6 characters" required></div><label class="check"><input type="checkbox" id="r-promo" checked> Send me offers and wash reminders on WhatsApp</label>'+ERR+'<button class="btn gold wide">Create account</button></form>';
    return banner()+'<div class="narrow stack" style="margin-top:24px"><div class="seg" role="tablist">'+seg('auth',U.auth,[['login','Log in'],['register','Register']])+'</div><section class="panel stack">'+notices()+f+'</section>'+
      '<section class="panel"><p>Ruby Vairam, Paduvanchery Main Rd, Shantha Nagar, Madambakkam, Tambaram, Tamil Nadu 600126</p><p class="price" style="margin-top:8px;user-select:all">7449250989 &nbsp; 8056032929</p></section></div>';
  }

  /* ---------- customer ---------- */
  function viewCustomer(){
    var body=U.cTab==='book'?custBook():U.cTab==='mine'?custMine():custAccount();
    return topbar(ME.name)+'<div class="narrow stack" style="margin-top:20px">'+notices()+body+'</div><nav class="nav"><div class="seg" role="tablist">'+seg('ctab',U.cTab,[['book','Book'],['mine','My bookings'],['account','Account']])+'</div></nav>';
  }
  function custBook(){
    var f=U.form,l=packList(f.v),S=DB.settings,pkg=activePkg(ME.id),q,i,days='',slots='';
    if(!l.some(function(p){return p.id===f.pack}))f.pack=l.some(function(p){return p.id==='full'})?'full':(l[0]?l[0].id:'');
    if(f.day>=S.booking_days)f.day=0;
    if(f.time!==null&&!slotOpen(f.day,f.time))f.time=null;
    q=quote();
    for(i=0;i<S.booking_days;i++){var d=addDays(today(),i);days+=radio('day',i,f.day===i,'<span><b>'+(i===0?'Today':i===1?'Tomorrow':d.toLocaleDateString('en-IN',{weekday:'short'}))+'</b><small>'+d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+'</small></span>')}
    for(i=S.open_hour;i<=S.close_hour;i++)slots+=radio('time',i,f.time===i,'<b>'+fmtTime(i)+'</b>',!slotOpen(f.day,i));
    return (S.banner_active&&S.banner_text?'<div class="offer"><b>Offer</b> &nbsp;'+h(S.banner_text)+'</div>':'')+
      (pkg?'<div class="panel"><span class="pill gold">Monthly package</span><p style="margin-top:8px"><b>'+h(pkg.plan)+'</b> &middot; '+(pkg.washes-pkg.used)+' of '+pkg.washes+' washes left &middot; valid till '+fmtDate(pkg.end)+'</p></div>':'')+
      '<h2 class="ribbon">Book your wash</h2>'+
      '<fieldset class="panel"><legend><span class="num">1</span>Your vehicle</legend><div class="opts">'+SIZES.map(function(s){return radio('v',s.id,f.v===s.id,'<span><b>'+s.name+'</b><small>'+s.hint+'</small></span>')}).join('')+'</div></fieldset>'+
      '<fieldset class="panel"><legend><span class="num">2</span>Wash package</legend><div class="opts list">'+l.map(function(p){return radio('pack',p.id,f.pack===p.id,'<span><b>'+h(p.name)+'</b></span><span class="price">'+rupee(priceOf(f.v,p.id))+'</span>')}).join('')+'</div></fieldset>'+
      '<fieldset class="panel"><legend><span class="num">3</span>Date and time</legend><p class="sub">Day</p><div class="opts days">'+days+'</div><p class="sub">Arrival time</p><div class="opts slots">'+slots+'</div><p class="small muted" style="margin-top:10px">Greyed-out times are full or already past.</p></fieldset>'+
      '<section class="panel stack"><h3 class="h" style="margin:0"><span class="num">4</span>Confirm</h3>'+
        '<div class="field"><label for="notes">Anything we should know? <span>(optional)</span></label><textarea id="notes" maxlength="500" placeholder="Car model, stains, pickup time">'+h(f.notes)+'</textarea></div>'+
        '<div class="field"><label for="code">Coupon code <span>(optional)</span></label><div class="row" style="flex-wrap:nowrap"><input type="text" id="code" autocapitalize="characters" value="'+h(f.code)+'" placeholder="Enter code"><button type="button" class="btn" data-act="applycode">Apply</button></div>'+
          (f.applied?'<p class="good small">'+h(f.applied.code)+' applied. You save '+rupee(q.disc)+'.</p>':'')+(f.codeErr?'<p class="err">'+h(f.codeErr)+'</p>':'')+'</div>'+
        '<div class="row between"><div><div class="small muted">'+h(packName(f.pack))+' &middot; '+h(sizeName(f.v))+(f.time!==null?' &middot; '+fmtTime(f.time):'')+'</div><div class="total">'+(q.disc?'<s>'+rupee(q.base)+'</s> ':'')+rupee(q.total)+'</div></div><button type="button" class="btn gold" data-act="book">Confirm booking</button></div></section>';
  }
  function bookingLine(b){return '<div class="main"><span class="when">'+fmtDate(b.date)+' &middot; '+fmtTime(b.time)+'</span><b>'+h(packName(b.pack))+' &middot; '+h(sizeName(b.v))+'</b><span class="small muted">'+rupee(b.price)+(b.coupon?' with '+h(b.coupon):'')+'</span></div>'}
  function custMine(){
    var t=ymd(today()),up=DB.bookings.filter(function(b){return b.status==='booked'&&b.date>=t}).sort(byDateAsc),past=DB.bookings.filter(function(b){return !(b.status==='booked'&&b.date>=t)}).sort(byDateDesc);
    return '<section class="panel"><h3 class="h">Upcoming</h3><div style="clear:both">'+(up.length?up.map(function(b){return '<div class="item">'+bookingLine(b)+'<div class="row">'+cancelBtns(b)+'</div></div>'}).join(''):'<p class="muted">No upcoming bookings. Tap Book to fix an appointment.</p>')+'</div></section>'+
      '<section class="panel"><h3 class="h">History</h3><div style="clear:both">'+(past.length?past.map(function(b){return '<div class="item">'+bookingLine(b)+pill(b.status)+'</div>'}).join(''):'<p class="muted">Your past washes will appear here.</p>')+'</div></section>';
  }
  function custAccount(){
    var pkg=activePkg(ME.id);
    return '<section class="panel"><h3 class="h">Your details</h3><form class="fields" data-form="profile" style="clear:both"><div class="field"><label for="p-name">Name</label><input type="text" id="p-name" value="'+h(ME.name)+'" required></div><div class="field"><label for="p-phone">Mobile number</label><input type="tel" id="p-phone" value="'+h(ME.phone)+'" disabled></div><div class="field"><label for="p-reg">Vehicle number</label><input type="text" id="p-reg" autocapitalize="characters" value="'+h(ME.reg||'')+'"></div><label class="check"><input type="checkbox" id="p-promo"'+(ME.promoOk?' checked':'')+'> Send me offers and wash reminders on WhatsApp</label>'+ERR+'<button class="btn gold">Save details</button></form></section>'+
      '<section class="panel"><h3 class="h">Change password</h3><form class="fields" data-form="mypass" style="clear:both"><div class="field"><label for="np">New password</label><input type="password" id="np" autocomplete="new-password" placeholder="At least 6 characters" required></div>'+ERR+'<button class="btn">Update password</button></form></section>'+
      '<section class="panel stack"><h3 class="h" style="margin:0">Monthly package</h3>'+(pkg?'<p><b>'+h(pkg.plan)+'</b><br>'+(pkg.washes-pkg.used)+' of '+pkg.washes+' washes left. Valid till '+fmtDate(pkg.end,true)+'.</p>':ME.monthlyReq?'<p class="good">Request sent. The shop will contact you with package details.</p>':'<p>Regular customer? Monthly packages are available with a special discount.</p><div><button type="button" class="btn" data-act="reqmonthly">Request monthly package</button></div>')+'</section>';
  }

  /* ---------- admin ---------- */
  function viewAdmin(){
    var v={upcoming:admUpcoming,all:admAll,cancelled:admCancelled,monthly:admMonthly,stats:admStats,marketing:admMarketing,customers:admCustomers,settings:admSettings}[U.aTab]();
    return topbar(ME.name+' (admin)')+'<div class="stack" style="margin-top:16px"><div class="tabs" role="tablist">'+seg('atab',U.aTab,[['upcoming','Upcoming'],['all','All bookings'],['cancelled','Cancelled'],['monthly','Monthly packages'],['stats','Last month'],['marketing','Marketing'],['customers','Customers'],['settings','Settings']])+'</div>'+notices()+v+'</div>';
  }
  function admUpcoming(){
    var t=ymd(today()),wk=ymd(addDays(today(),6)),up=DB.bookings.filter(function(b){return b.status==='booked'}).sort(byDateAsc),html='',last='';
    up.forEach(function(b){var u=user(b.userId);
      if(b.date!==last){last=b.date;html+='<div class="day">'+(b.date===t?'Today, ':b.date<t?'Not closed yet, ':'')+fmtDate(b.date,true)+'</div>'}
      html+='<div class="item"><div class="main"><span class="when">'+fmtTime(b.time)+'</span><b>'+h(u.name)+' &middot; '+h(u.phone)+'</b><span class="small muted">'+h(packName(b.pack))+' &middot; '+h(sizeName(b.v))+(u.reg?' &middot; '+h(u.reg):'')+' &middot; '+rupee(b.price)+(b.coupon?' ('+h(b.coupon)+')':'')+(b.notes?'<br>Note: '+h(b.notes):'')+'</span></div><div class="row"><button type="button" class="btn sm gold" data-act="complete" data-id="'+b.id+'">Mark done</button>'+cancelBtns(b)+'</div></div>'});
    return '<div class="tiles"><div class="tile"><div class="k">Today</div><div class="v">'+up.filter(function(b){return b.date===t}).length+'</div></div><div class="tile"><div class="k">Next 7 days</div><div class="v">'+up.filter(function(b){return b.date>=t&&b.date<=wk}).length+'</div></div><div class="tile"><div class="k">Customers</div><div class="v">'+DB.users.filter(function(u){return u.role!=='admin'}).length+'</div></div></div>'+
      '<section class="panel"><h3 class="h">Upcoming schedule</h3><div style="clear:both">'+(html||'<p class="muted">No upcoming bookings yet. New customer bookings will appear here.</p>')+'</div></section>';
  }
  function allRows(){
    var q=U.q.trim().toLowerCase(),rows=DB.bookings.filter(function(b){var u=user(b.userId);return (U.status==='all'||b.status===U.status)&&(!q||u.name.toLowerCase().indexOf(q)>=0||u.phone.indexOf(q)>=0||(u.reg||'').toLowerCase().indexOf(q)>=0)}).sort(byDateDesc);
    if(!rows.length)return '<tr><td colspan="7" class="muted">No bookings match.</td></tr>';
    return rows.map(function(b){var u=user(b.userId);return '<tr><td>'+fmtDate(b.date)+'</td><td>'+fmtTime(b.time)+'</td><td>'+h(u.name)+'</td><td>'+h(u.phone)+'</td><td>'+h(sizeName(b.v))+' &middot; '+h(packName(b.pack))+'</td><td class="r">'+rupee(b.price)+'</td><td>'+pill(b.status)+(b.status==='completed'?' '+doneLink(b,'Send review message'):'')+'</td></tr>'}).join('');
  }
  function admAll(){
    return '<section class="panel stack"><div class="fields two"><div class="field"><label for="q">Search customer</label><input type="search" id="q" value="'+h(U.q)+'" placeholder="Name, mobile or vehicle number"></div><div class="field"><label for="status">Status</label><select id="status">'+[['all','All bookings'],['booked','Booked'],['completed','Completed'],['cancelled','Cancelled']].map(function(o){return '<option value="'+o[0]+'"'+(U.status===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></div></div><p class="small muted">Shows bookings from the last 400 days.</p>'+
      '<div class="scroll"><table><thead><tr><th>Date</th><th>Time</th><th>Customer</th><th>Mobile</th><th>Service</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody id="allrows">'+allRows()+'</tbody></table></div></section>';
  }
  function admCancelled(){
    var c=DB.bookings.filter(function(b){return b.status==='cancelled'}).sort(byDateDesc),lost=c.reduce(function(s,b){return s+b.price},0);
    return '<div class="tiles"><div class="tile"><div class="k">Cancelled bookings</div><div class="v">'+c.length+'</div></div><div class="tile"><div class="k">Value lost</div><div class="v">'+rupee(lost)+'</div></div><div class="tile"><div class="k">By customer / by shop</div><div class="v">'+c.filter(function(b){return b.cancelledBy!=='admin'}).length+' / '+c.filter(function(b){return b.cancelledBy==='admin'}).length+'</div></div></div>'+
      '<section class="panel"><div class="scroll"><table><thead><tr><th>Booked for</th><th>Customer</th><th>Mobile</th><th>Service</th><th class="r">Amount</th><th>Cancelled by</th><th>Cancelled on</th></tr></thead><tbody>'+(c.length?c.map(function(b){var u=user(b.userId);return '<tr><td>'+fmtDate(b.date)+', '+fmtTime(b.time)+'</td><td>'+h(u.name)+'</td><td>'+h(u.phone)+'</td><td>'+h(sizeName(b.v))+' &middot; '+h(packName(b.pack))+'</td><td class="r">'+rupee(b.price)+'</td><td>'+(b.cancelledBy==='admin'?'Shop':'Customer')+'</td><td>'+(b.cancelledOn?fmtDate(b.cancelledOn):'')+'</td></tr>'}).join(''):'<tr><td colspan="7" class="muted">No cancellations.</td></tr>')+'</tbody></table></div></section>';
  }
  function custOptions(){return DB.users.filter(function(u){return u.role!=='admin'}).map(function(u){return '<option value="'+u.id+'">'+h(u.name)+' ('+h(u.phone)+')</option>'}).join('')}
  function admMonthly(){
    var t=ymd(today()),req=DB.users.filter(function(u){return u.monthlyReq&&!activePkg(u.id)});
    var rows=DB.monthly.map(function(m){var u=user(m.userId),live=m.end>=t,left=m.washes-m.used;
      return '<tr><td>'+h(u.name)+'</td><td>'+h(u.phone)+'</td><td>'+h(m.plan)+'</td><td class="r">'+m.used+' / '+m.washes+'</td><td class="r">'+rupee(m.amount)+'</td><td>'+fmtDate(m.end)+'</td><td>'+(live?'<span class="pill completed">Active</span>':'<span class="pill cancelled">Expired</span>')+'</td><td>'+(live&&left>0?'<button type="button" class="btn sm" data-act="usewash" data-id="'+m.id+'">Use 1 wash</button>':'')+'</td></tr>'}).join('');
    return (req.length?'<section class="panel"><h3 class="h">Package requests</h3><div style="clear:both">'+req.map(function(u){return '<div class="item"><div class="main"><b>'+h(u.name)+'</b><span class="small muted">'+h(u.phone)+'</span></div><a class="btn sm" target="_blank" rel="noopener" href="'+wa(u.phone,'Hi '+first(u.name)+', thanks for asking about the Radiance Car Wash monthly package. Here are the details:')+'">Reply on WhatsApp</a></div>'}).join('')+'</div></section>':'')+
      '<section class="panel"><h3 class="h">Package holders</h3><div class="scroll" style="clear:both"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Plan</th><th class="r">Washes used</th><th class="r">Paid</th><th>Valid till</th><th>Status</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="muted">No monthly packages yet. Add the first one below.</td></tr>')+'</tbody></table></div></section>'+
      '<section class="panel"><h3 class="h">Add a monthly package</h3><form class="fields" data-form="addpkg" style="clear:both"><div class="fields two"><div class="field"><label for="m-user">Customer</label><select id="m-user" required>'+custOptions()+'</select></div><div class="field"><label for="m-plan">Plan name</label><input type="text" id="m-plan" placeholder="4 Full Washes"></div></div><div class="fields three"><div class="field"><label for="m-washes">Washes included</label><input type="number" id="m-washes" min="1" value="4" required></div><div class="field"><label for="m-amount">Amount paid (₹)</label><input type="number" id="m-amount" min="0" required></div><div class="field"><label for="m-start">Start date</label><input type="date" id="m-start" value="'+t+'" required></div></div><p class="small muted">The package runs for 30 days from the start date.</p>'+ERR+'<div><button class="btn gold">Add package</button></div></form></section>';
  }
  function admStats(){
    var T=today(),s=ymd(new Date(T.getFullYear(),T.getMonth()-1,1)),e=ymd(new Date(T.getFullYear(),T.getMonth(),0)),label=parse(s).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    var all=DB.bookings.filter(function(b){return b.date>=s&&b.date<=e}),done=all.filter(function(b){return b.status==='completed'}),canc=all.filter(function(b){return b.status==='cancelled'});
    var rev=done.reduce(function(x,b){return x+b.price},0),fresh=DB.users.filter(function(u){return u.role!=='admin'&&u.created>=s&&u.created<=e}).length;
    function count(list,key,names){var m={};list.forEach(function(b){m[b[key]]=(m[b[key]]||0)+1});return names.map(function(n){return [n[1],m[n[0]]||0]})}
    var byPack=count(done,'pack',DB.car.concat(DB.bike).map(function(p){return [p.id,p.name]})).sort(function(a,b){return b[1]-a[1]});
    var revV=SIZES.map(function(z){return [z.name,done.filter(function(b){return b.v===z.id}).reduce(function(x,b){return x+b.price},0)]}).sort(function(a,b){return b[1]-a[1]});
    var hrs=[],t,spend={};for(t=DB.settings.open_hour;t<=DB.settings.close_hour;t++)hrs.push([t,fmtTime(t)]);
    done.forEach(function(b){spend[b.userId]=(spend[b.userId]||0)+b.price});
    var topC=Object.keys(spend).map(function(id){return [user(id).name,spend[id]]}).sort(function(a,b){return b[1]-a[1]}).slice(0,5);
    return '<h2 class="ribbon">'+h(label)+'</h2>'+
      '<div class="tiles"><div class="tile"><div class="k">Washes completed</div><div class="v">'+done.length+'</div></div><div class="tile"><div class="k">Revenue</div><div class="v">'+rupee(rev)+'</div></div><div class="tile"><div class="k">Average bill</div><div class="v">'+rupee(done.length?rev/done.length:0)+'</div></div><div class="tile"><div class="k">Cancelled</div><div class="v">'+canc.length+' <span class="small muted">('+(all.length?Math.round(canc.length/all.length*100):0)+'%)</span></div></div><div class="tile"><div class="k">New customers</div><div class="v">'+fresh+'</div></div></div>'+
      (done.length?'<div class="cols"><section class="panel"><h3 class="h">Washes by package</h3><div style="clear:both">'+bars(byPack)+'</div></section><section class="panel"><h3 class="h">Revenue by vehicle type</h3><div style="clear:both">'+bars(revV,rupee)+'</div></section><section class="panel"><h3 class="h">Washes by arrival time</h3><div style="clear:both">'+bars(count(done,'time',hrs))+'</div></section><section class="panel"><h3 class="h">Top customers by spend</h3><div style="clear:both">'+bars(topC,rupee)+'</div></section></div>':'<section class="panel"><p class="muted">No completed washes were recorded in '+h(label)+'. Revenue counts bookings you have marked done.</p></section>');
  }
  function customers(){return DB.users.filter(function(u){return u.role!=='admin'})}
  function promoGroup(){
    var cut=ymd(addDays(today(),-30));
    var ok=customers().filter(function(u){return u.promoOk});
    if(U.group==='monthly')return ok.filter(function(u){return activePkg(u.id)});
    if(U.group==='inactive')return ok.filter(function(u){return !DB.bookings.some(function(b){return b.userId===u.id&&b.status!=='cancelled'&&b.date>=cut})});
    return ok;
  }
  function recips(list,text,extra){
    if(!list.length)return '<p class="muted">No customers in this group right now.</p>';
    return list.map(function(u){return '<div class="item"><div class="main"><b>'+h(u.name)+'</b><span class="small muted">'+h(u.phone)+(extra?' &middot; '+extra(u):'')+'</span></div><a class="btn sm" target="_blank" rel="noopener" href="'+wa(u.phone,text.replace(/\{name\}/g,first(u.name)))+'">Open WhatsApp</a></div>'}).join('');
  }
  function lastWash(u){var d='';DB.bookings.forEach(function(b){if(b.userId===u.id&&b.status==='completed'&&b.date>d)d=b.date});return d}
  function dueList(){var t=ymd(today());return customers().filter(function(u){var d=lastWash(u);return u.promoOk&&d&&daysSince(d)>=U.remind&&!DB.bookings.some(function(b){return b.userId===u.id&&b.status==='booked'&&b.date>=t})})}
  function dueHtml(){return recips(dueList(),U.remindText,function(u){return 'last wash '+daysSince(lastWash(u))+' days ago'})}
  function admMarketing(){
    var S=DB.settings;
    return '<div class="cols">'+
      '<section class="panel"><h3 class="h">Offer banner in customer app</h3><form class="fields" data-form="banner" style="clear:both"><div class="field"><label for="bn-text">Banner text</label><textarea id="bn-text" placeholder="Festival offer: 10% off all washes this week">'+h(S.banner_text)+'</textarea></div><label class="check"><input type="checkbox" id="bn-on"'+(S.banner_active?' checked':'')+'> Show the banner to customers</label>'+ERR+'<div><button class="btn gold">Save banner</button></div></form></section>'+
      '<section class="panel"><h3 class="h">Offers and coupon codes</h3><div style="clear:both">'+(DB.coupons.length?DB.coupons.map(function(c){return '<div class="item"><div class="main"><b>'+h(c.code)+'</b><span class="small muted">'+(c.type==='pct'?(+c.value)+'% off':rupee(c.value)+' off')+(c.expires?' &middot; till '+fmtDate(c.expires):' &middot; no expiry')+'</span></div><div class="row">'+(couponOk(c)?'<span class="pill completed">Active</span>':'<span class="pill cancelled">'+(c.active?'Expired':'Off')+'</span>')+'<button type="button" class="btn sm" data-act="togglecoupon" data-id="'+h(c.code)+'">'+(c.active?'Turn off':'Turn on')+'</button></div></div>'}).join(''):'<p class="muted">No coupons yet. Create the first one below.</p>')+'</div>'+
        '<form class="fields" data-form="coupon" style="margin-top:16px"><div class="fields two"><div class="field"><label for="c-code">New code</label><input type="text" id="c-code" autocapitalize="characters" placeholder="DIWALI20" required></div><div class="field"><label for="c-type">Discount type</label><select id="c-type"><option value="pct">Percent off</option><option value="flat">Rupees off</option></select></div><div class="field"><label for="c-value">Value</label><input type="number" id="c-value" min="1" required></div><div class="field"><label for="c-exp">Expires <span>(optional)</span></label><input type="date" id="c-exp"></div></div>'+ERR+'<div><button class="btn gold">Create coupon</button></div></form></section>'+
      '<section class="panel stack"><h3 class="h" style="margin:0">WhatsApp promo message</h3><div class="field"><label for="group">Send to</label><select id="group">'+[['all','All customers'],['inactive','No visit in the last 30 days'],['monthly','Monthly package holders']].map(function(o){return '<option value="'+o[0]+'"'+(U.group===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></div><div class="field"><label for="promo">Message <span>({name} becomes the customer’s first name)</span></label><textarea id="promo">'+h(U.promo)+'</textarea></div><p class="small muted">Customers who turned off offers are left out. Each button opens WhatsApp with the message typed for that customer. You press send.</p><div id="recips">'+recips(promoGroup(),U.promo)+'</div></section>'+
      '<section class="panel stack"><h3 class="h" style="margin:0">Service reminders</h3><div class="field"><label for="remind">Remind customers whose last wash was at least</label><select id="remind">'+[7,15,30,45].map(function(n){return '<option value="'+n+'"'+(U.remind===n?' selected':'')+'>'+n+' days ago</option>'}).join('')+'</select></div><div class="field"><label for="remindtext">Reminder message</label><textarea id="remindtext">'+h(U.remindText)+'</textarea></div><p class="small muted">Customers who already have an upcoming booking are left out.</p><div id="due">'+dueHtml()+'</div></section></div>';
  }
  function custRows(){
    var q=U.cq.trim().toLowerCase(),list=customers().filter(function(u){return !q||u.name.toLowerCase().indexOf(q)>=0||u.phone.indexOf(q)>=0||(u.reg||'').toLowerCase().indexOf(q)>=0});
    if(!list.length)return '<p class="muted">'+(q?'No customers match.':'No customers have registered yet.')+'</p>';
    return list.map(function(u){var n=DB.bookings.filter(function(b){return b.userId===u.id&&b.status==='completed'}).length,lw=lastWash(u);
      return '<div class="item"><div class="main"><b>'+h(u.name)+' &middot; '+h(u.phone)+'</b><span class="small muted">'+(u.vehicleType?(u.vehicleType==='bike'?'Bike':'Car')+' &middot; ':'')+(u.reg?h(u.reg)+' &middot; ':'')+(u.hasLogin?'':'added by shop, no app login &middot; ')+(activePkg(u.id)?'monthly package &middot; ':'')+(u.promoOk?'':'no offers &middot; ')+'joined '+fmtDate(u.created)+' &middot; '+n+' washes'+(lw?' &middot; last on '+fmtDate(lw):'')+'</span></div>'+
        (U.reset===u.id?'<form class="row" data-form="resetpw" data-id="'+u.id+'"><input type="text" id="rp-new" placeholder="New password (6+)" style="width:190px" required><button class="btn sm gold">Set</button><button type="button" class="btn sm" data-act="noreset">Close</button>'+ERR+'</form>':'<div class="row"><button type="button" class="btn sm" data-act="togglepromo" data-id="'+u.id+'">'+(u.promoOk?'Stop offers':'Allow offers')+'</button>'+(u.hasLogin?'<button type="button" class="btn sm" data-act="askreset" data-id="'+u.id+'">Reset password</button>':'')+'</div>')+'</div>'}).join('');
  }
  function addCustForm(){var t=ymd(today());
    return '<section class="panel"><h3 class="h">Add a customer</h3><form class="fields" data-form="addcust" style="clear:both">'+
      '<div class="fields two"><div class="field"><label for="nc-name">Name</label><input type="text" id="nc-name" autocomplete="off" required></div><div class="field"><label for="nc-phone">Mobile number</label><input type="tel" id="nc-phone" inputmode="numeric" autocomplete="off" placeholder="10-digit mobile" required></div></div>'+
      '<div class="fields two"><div class="field"><span class="sub" style="margin:0">Vehicle type</span><div class="opts" style="grid-template-columns:1fr 1fr">'+radio('nc-vtype','car',true,'<b>Car</b>')+radio('nc-vtype','bike',false,'<b>Bike</b>')+'</div></div><div class="field"><label for="nc-reg">Vehicle number</label><input type="text" id="nc-reg" autocapitalize="characters" placeholder="TN 11 AB 1234"></div></div>'+
      '<div class="field"><span class="sub" style="margin:0">Monthly subscription</span><div class="opts" style="grid-template-columns:1fr 1fr">'+radio('nc-monthly','no',true,'<b>No</b>')+radio('nc-monthly','yes',false,'<b>Yes</b>')+'</div></div>'+
      '<div class="fields three" id="nc-plan" hidden><div class="field"><label for="nc-washes">Washes included</label><input type="number" id="nc-washes" min="1" value="4"></div><div class="field"><label for="nc-amount">Amount paid (\u20B9)</label><input type="number" id="nc-amount" min="0"></div><div class="field"><label for="nc-start">Start date</label><input type="date" id="nc-start" value="'+t+'"></div></div>'+
      '<label class="check"><input type="checkbox" id="nc-promo" checked> Customer agrees to receive offers and reminders on WhatsApp</label>'+
      '<p class="small muted">The customer does not need the app. If they register later with this mobile number, their bookings and package carry over.</p>'+ERR+'<div><button class="btn gold">Add customer</button></div></form></section>';
  }
  function admCustomers(){return addCustForm()+'<section class="panel stack"><div class="field"><label for="cq">Search customer</label><input type="search" id="cq" value="'+h(U.cq)+'" placeholder="Name, mobile or vehicle number"></div><div id="custrows">'+custRows()+'</div></section>'}
  function admSettings(){
    var S=DB.settings;function hours(id,cur){var o='',t;for(t=5;t<=23;t++)o+='<option value="'+t+'"'+(cur===t?' selected':'')+'>'+fmtTime(t)+'</option>';return '<select id="'+id+'">'+o+'</select>'}
    return '<section class="panel"><h3 class="h">Booking settings</h3><form class="fields" data-form="settings" style="clear:both"><div class="fields two"><div class="field"><label for="s-open">First arrival slot</label>'+hours('s-open',S.open_hour)+'</div><div class="field"><label for="s-close">Last arrival slot</label>'+hours('s-close',S.close_hour)+'</div><div class="field"><label for="s-cap">Vehicles per time slot</label><input type="number" id="s-cap" min="1" max="50" value="'+S.slot_capacity+'" required></div><div class="field"><label for="s-days">Days customers can book ahead</label><input type="number" id="s-days" min="1" max="60" value="'+S.booking_days+'" required></div></div>'+ERR+'<div><button class="btn gold">Save settings</button></div></form></section>'+
      '<section class="panel"><h3 class="h">Message after a wash is done</h3><form class="fields" data-form="review" style="clear:both"><div class="field"><label for="s-review">Review link <span>(your Google review link)</span></label><input type="text" id="s-review" inputmode="url" autocapitalize="none" placeholder="https://g.page/r/.../review" value="'+h(S.review_link||'')+'"></div><div class="field"><label for="s-donemsg">Message <span>({name}, {package} and {link} are filled in for each customer)</span></label><textarea id="s-donemsg" style="min-height:130px">'+h(S.done_message||DONE_MSG)+'</textarea></div><p class="small muted">After you tap Mark done, a Send on WhatsApp button appears with this message typed for that customer. You press send.</p>'+ERR+'<div><button class="btn gold">Save message</button></div></form></section>'+
      '<section class="panel"><h3 class="h">Prices</h3><p style="clear:both" class="muted">To change prices or add a package, edit the <b>prices</b> table in your Supabase dashboard (Table Editor). The app picks up the change on the next refresh.</p></section>';
  }

  /* ---------- render and events ---------- */
  function render(top){app.innerHTML=!ME?viewAuth():isAdmin()?viewAdmin():viewCustomer();if(top)window.scrollTo(0,0)}
  function go(patch,top){U.err='';U.msg='';U.confirm=null;U.reset=null;U.sent=null;for(var k in patch)U[k]=patch[k];render(top)}
  async function enter(session){
    var p=ok(await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle());
    if(!p)throw new Error('Your account has no profile yet. Please contact the shop.');
    ME=mapU(p);await load();
  }
  async function reload(){if(isAdmin())await load();else{ME=mapU(ok(await sb.from('profiles').select('*').eq('id',ME.id).single()));await load()}}

  var ACT={
    auth:function(id){go({auth:id})},
    ctab:async function(id){go({cTab:id},true);if(id==='book'){await loadSlots();render()}},
    atab:function(id){go({aTab:id},true)},
    refresh:async function(){await reload();U.msg='Updated.'},
    logout:async function(){await sb.auth.signOut();ME=null;U.auth='login'},
    applycode:async function(){var f=U.form;f.code=val('code').toUpperCase();f.applied=null;f.codeErr='';
      if(!f.code){f.codeErr='Enter a coupon code first.';return}
      try{var q=ok(await sb.rpc('price_quote',{p_vehicle:f.v,p_pack:f.pack,p_code:f.code}));f.applied={code:q.code,type:q.type,value:+q.value}}catch(x){f.codeErr=msg(x)}},
    book:async function(){var f=U.form;
      if(f.time===null)throw new Error('Pick an arrival time in step 3.');
      var d=ymd(addDays(today(),f.day)),t=f.time;
      try{ok(await sb.rpc('create_booking',{p_vehicle:f.v,p_pack:f.pack,p_date:d,p_time:t,p_notes:f.notes.trim(),p_code:f.applied?f.applied.code:''}))}
      catch(x){await loadSlots().catch(function(){});throw x}
      U.form={v:f.v,pack:f.pack,day:0,time:null,notes:'',code:'',applied:null,codeErr:''};
      await reload();U.cTab='mine';U.msg='Booked. See you on '+fmtDate(d,true)+' at '+fmtTime(t)+'.';window.scrollTo(0,0)},
    askcancel:function(id){U.confirm=id},
    keep:function(){U.confirm=null},
    docancel:async function(id){
      if(isAdmin())ok(await sb.from('bookings').update({status:'cancelled',cancelled_by:'admin',cancelled_on:ymd(today())}).eq('id',id));
      else ok(await sb.rpc('cancel_booking',{p_id:id}));
      U.confirm=null;await reload();U.msg='Booking cancelled.'},
    complete:async function(id){ok(await sb.from('bookings').update({status:'completed'}).eq('id',id));await reload();U.sent=id},
    reqmonthly:async function(){ok(await sb.from('profiles').update({monthly_req:true}).eq('id',ME.id));await reload()},
    usewash:async function(id){var m=DB.monthly.filter(function(x){return x.id===id})[0];if(!m||m.used>=m.washes)return;ok(await sb.from('monthly_packages').update({used:m.used+1}).eq('id',id));await reload()},
    togglecoupon:async function(code){var c=DB.coupons.filter(function(x){return x.code===code})[0];if(!c)return;ok(await sb.from('coupons').update({active:!c.active}).eq('code',code));await reload()},
    askreset:function(id){U.reset=id},
    togglepromo:async function(id){var u=user(id);ok(await sb.from('profiles').update({promo_ok:!u.promoOk}).eq('id',id));await reload();U.msg=u.name+(u.promoOk?' will no longer get offers.':' will now get offers.')},
    noreset:function(){U.reset=null}
  };
  var FORMS={
    login:async function(){var p=cleanPhone(val('l-phone'));
      if(!/^[6-9]\d{9}$/.test(p))throw new Error('Enter a valid 10-digit mobile number.');
      var d=ok(await sb.auth.signInWithPassword({email:emailFor(p),password:document.getElementById('l-pass').value}));
      await enter(d.session);go({cTab:'book',aTab:'upcoming'},true)},
    register:async function(){var n=val('r-name'),p=cleanPhone(val('r-phone')),pw=document.getElementById('r-pass').value;
      if(n.length<2)throw new Error('Enter your name.');
      if(!/^[6-9]\d{9}$/.test(p))throw new Error('Enter a valid 10-digit mobile number.');
      if(pw.length<6)throw new Error('Password needs at least 6 characters.');
      var d=ok(await sb.auth.signUp({email:emailFor(p),password:pw,options:{data:{name:n,phone:p,reg:val('r-reg').toUpperCase(),promo:document.getElementById('r-promo').checked}}}));
      if(d.user&&d.user.identities&&d.user.identities.length===0)throw new Error('This mobile number is already registered. Log in instead.');
      if(!d.session)throw new Error('Registration is not switched on fully yet. Shop owner: turn off "Confirm email" in Supabase (see README).');
      await enter(d.session);go({cTab:'book'},true)},
    profile:async function(){var n=val('p-name');if(n.length<2)throw new Error('Enter your name.');
      ok(await sb.from('profiles').update({name:n,reg:val('p-reg').toUpperCase(),promo_ok:document.getElementById('p-promo').checked}).eq('id',ME.id));await reload();go({msg:'Details saved.'},true);U.msg='Details saved.';render()},
    mypass:async function(){var pw=document.getElementById('np').value;if(pw.length<6)throw new Error('Password needs at least 6 characters.');
      ok(await sb.auth.updateUser({password:pw}));go({},true);U.msg='Password updated.';render()},
    addpkg:async function(){var w=parseInt(val('m-washes'),10),a=parseFloat(val('m-amount')),s=val('m-start')||ymd(today()),uid=val('m-user');
      if(!uid)throw new Error('Pick a customer.');
      if(!(w>0)||!(a>=0))throw new Error('Enter the washes included and the amount paid.');
      ok(await sb.from('monthly_packages').insert({user_id:uid,plan:val('m-plan')||w+' washes',washes:w,amount:a,start_date:s,end_date:ymd(addDays(parse(s),30))}));
      ok(await sb.from('profiles').update({monthly_req:false}).eq('id',uid));await reload();go({},true);U.msg='Monthly package added.';render()},
    banner:async function(){ok(await sb.from('settings').update({banner_text:val('bn-text'),banner_active:document.getElementById('bn-on').checked}).eq('id',1));await reload();go({},true);U.msg='Banner saved.';render()},
    coupon:async function(){var code=val('c-code').toUpperCase().replace(/\s+/g,''),v=parseFloat(val('c-value')),t=val('c-type');
      if(code.length<3)throw new Error('Enter a code of at least 3 characters.');
      if(DB.coupons.some(function(c){return c.code===code}))throw new Error('That code already exists.');
      if(!(v>0)||(t==='pct'&&v>100))throw new Error('Enter a valid discount value.');
      ok(await sb.from('coupons').insert({code:code,type:t,value:v,expires:val('c-exp')||null}));await reload();go({},true);U.msg='Coupon '+code+' created.';render()},
    settings:async function(){var o=+val('s-open'),c=+val('s-close'),cap=parseInt(val('s-cap'),10),days=parseInt(val('s-days'),10);
      if(c<o)throw new Error('The last slot must be after the first slot.');
      if(!(cap>0)||!(days>0&&days<=60))throw new Error('Enter valid numbers for slot capacity and booking days.');
      ok(await sb.from('settings').update({open_hour:o,close_hour:c,slot_capacity:cap,booking_days:days}).eq('id',1));await reload();go({},true);U.msg='Settings saved.';render()},
    review:async function(){var link=val('s-review'),m=val('s-donemsg');
      if(link&&!/^https?:\/\/\S+$/i.test(link))throw new Error('The review link must start with https://');
      if(m.length<10)throw new Error('Enter the message to send.');
      ok(await sb.from('settings').update({review_link:link,done_message:m}).eq('id',1));await reload();go({},true);U.msg='Message saved.';render()},
    addcust:async function(){var n=val('nc-name'),p=cleanPhone(val('nc-phone')),vt=(document.querySelector('input[name=nc-vtype]:checked')||{}).value||'car',mon=(document.querySelector('input[name=nc-monthly]:checked')||{}).value==='yes';
      if(n.length<2)throw new Error('Enter the customer\u2019s name.');
      if(!/^[6-9]\d{9}$/.test(p))throw new Error('Enter a valid 10-digit mobile number.');
      if(DB.users.some(function(u){return u.phone===p}))throw new Error('A customer with this mobile number already exists. Search for them in the list below.');
      var w=parseInt(val('nc-washes'),10),a=parseFloat(val('nc-amount')),st=val('nc-start')||ymd(today());
      if(mon&&(!(w>0)||!(a>=0)))throw new Error('Enter the washes included and the amount paid for the monthly subscription.');
      var row=ok(await sb.from('profiles').insert({name:n,phone:p,reg:val('nc-reg').toUpperCase(),vehicle_type:vt,promo_ok:document.getElementById('nc-promo').checked,has_login:false}).select().single());
      if(mon)ok(await sb.from('monthly_packages').insert({user_id:row.id,plan:w+' washes',washes:w,amount:a,start_date:st,end_date:ymd(addDays(parse(st),30))}));
      await reload();go({},true);U.msg=n+' added'+(mon?' with a monthly subscription.':'.');render()},
    resetpw:async function(form){var pw=val('rp-new');if(pw.length<6)throw new Error('Password needs at least 6 characters.');
      var u=user(form.getAttribute('data-id'));ok(await sb.rpc('admin_set_password',{p_user:form.getAttribute('data-id'),p_password:pw}));
      go({},false);U.msg='New password set for '+u.name+'. Tell them the new password.';render()}
  };
  app.addEventListener('click',async function(e){
    var b=e.target.closest('[data-act]'),a=b&&b.getAttribute('data-act');if(!a||!ACT[a]||U.busy)return;
    U.busy=true;U.err='';if(a!=='askcancel'&&a!=='keep'&&a!=='askreset'&&a!=='noreset'){U.msg='';U.sent=null}
    try{await ACT[a](b.getAttribute('data-id'))}catch(x){U.err=msg(x)}
    U.busy=false;render();
  });
  app.addEventListener('submit',async function(e){
    e.preventDefault();var form=e.target,fn=FORMS[form.getAttribute('data-form')];if(!fn||U.busy)return;
    var errEl=form.querySelector('[data-err]'),btn=form.querySelector('button:not([type=button])');
    if(errEl)errEl.hidden=true;if(btn)btn.disabled=true;U.busy=true;
    try{await fn(form)}catch(x){if(btn)btn.disabled=false;if(errEl){errEl.textContent=msg(x);errEl.hidden=false}else{U.err=msg(x);render()}}
    U.busy=false;
  });
  app.addEventListener('change',function(e){var t=e.target,f=U.form;
    if(t.name==='nc-monthly'){var pl=document.getElementById('nc-plan');if(pl)pl.hidden=t.value!=='yes';return}
    if(t.name==='nc-vtype')return;
    if(t.name==='v'){f.v=t.value}else if(t.name==='pack'){f.pack=t.value}else if(t.name==='day'){f.day=+t.value}else if(t.name==='time'){f.time=+t.value}
    else if(t.id==='status'){U.status=t.value}else if(t.id==='group'){U.group=t.value}else if(t.id==='remind'){U.remind=+t.value}else return;
    U.err='';render()});
  app.addEventListener('input',function(e){var t=e.target,el;
    if(t.id==='notes')U.form.notes=t.value;
    else if(t.id==='code')U.form.code=t.value;
    else if(t.id==='q'){U.q=t.value;el=document.getElementById('allrows');if(el)el.innerHTML=allRows()}
    else if(t.id==='cq'){U.cq=t.value;U.reset=null;el=document.getElementById('custrows');if(el)el.innerHTML=custRows()}
    else if(t.id==='promo'){U.promo=t.value;el=document.getElementById('recips');if(el)el.innerHTML=recips(promoGroup(),U.promo)}
    else if(t.id==='remindtext'){U.remindText=t.value;el=document.getElementById('due');if(el)el.innerHTML=dueHtml()}
  });

  (async function start(){
    try{var s=ok(await sb.auth.getSession()).session;if(s)await enter(s)}
    catch(x){ME=null;U.err=msg(x)}
    render();
  })();
})();
