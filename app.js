const $=s=>document.querySelector(s);
let token=localStorage.getItem('cn_token'),me=null,editId=null,authMode='login';

const api=async(url,opt={})=>{
  opt.headers={...(opt.headers||{}),...(token?{Authorization:'Bearer '+token}:{})};
  const r=await fetch(url,opt);
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw Error(d.error||'Request failed');
  return d
};

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=m=>{$('#toast').textContent=m;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2600)};

function card(m,admin=false){
  const poster=m.poster_url||'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=900';
  return `<article class="card tilt-card">
    <img loading="lazy" src="${escapeHtml(poster)}" alt="${escapeHtml(m.title)} poster">
    <div class="card-body">
      <small>${escapeHtml(m.genre||'Movie')} · ${escapeHtml(m.year||'')}</small>
      <h3>${escapeHtml(m.title)}</h3>
      <p>${escapeHtml(m.description||'')}</p>
      <div class="card-actions">
        <button onclick="play(${m.id})">▶ Play</button>
        <button onclick="saveMovie(${m.id})">＋ My List</button>
        ${admin?`<button onclick="editMovie(${m.id})">Edit</button><button onclick="deleteMovie(${m.id})">Delete</button>`:''}
      </div>
    </div>
  </article>`
}

function applyTilt(){
  document.querySelectorAll('.tilt-card').forEach(card=>{
    if(card.dataset.tiltBound) return;
    card.dataset.tiltBound='1';
    card.addEventListener('mousemove',e=>{
      if(window.innerWidth<800) return;
      const r=card.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5;
      const y=(e.clientY-r.top)/r.height-.5;
      card.style.transform=`rotateX(${(-y*7).toFixed(2)}deg) rotateY(${(x*8).toFixed(2)}deg) translateY(-5px)`;
    });
    card.addEventListener('mouseleave',()=>card.style.transform='');
  })
}

async function loadMovies(){
  try{
    const q=$('#search').value,genre=$('#genre').value;
    const ms=await api('/api/movies?q='+encodeURIComponent(q)+'&genre='+encodeURIComponent(genre));
    $('#movies').innerHTML=ms.map(card).join('')||'<p class="empty-state">No titles found.</p>';
    applyTilt()
  }catch(e){
    $('#movies').innerHTML='<p class="empty-state">Unable to load movies. Make sure the server is running.</p>'
  }
}

async function loadList(){
  if(!token){$('#myMovies').innerHTML='<p class="empty-state">Login to build your watchlist.</p>';return}
  try{
    const ms=await api('/api/my-list');
    $('#myMovies').innerHTML=ms.map(card).join('')||'<p class="empty-state">Your list is empty.</p>';
    applyTilt()
  }catch(e){$('#myMovies').innerHTML='<p class="empty-state">Please log in again.</p>'}
}

window.play=async id=>{
  try{
    const m=await api('/api/movies/'+id);
    $('#playerTitle').textContent=m.title;
    $('#playerDescription').textContent=m.description||'';
    $('#video').src=m.video_path?'/stream/'+m.id:(m.video_url||'');
    $('#player').hidden=false;
    $('#video').play().catch(()=>{})
  }catch(e){toast(e.message)}
};

window.saveMovie=async id=>{
  if(!token)return openAuth();
  try{await api('/api/my-list/'+id,{method:'POST'});toast('Added to My List');loadList()}catch(e){toast(e.message)}
};

function openAuth(){$('#auth').hidden=false}
$('#authBtn').onclick=()=>{if(me){token=null;me=null;localStorage.removeItem('cn_token');location.reload()}else openAuth()};

$('#switchAuth').onclick=()=>{
  authMode=authMode==='login'?'register':'login';
  $('#authTitle').textContent=authMode==='login'?'Welcome back':'Create your account';
  $('#switchAuth').textContent=authMode==='login'?'Create an account':'Back to login';
  $('#authForm [name=name]').hidden=authMode==='login'
};

$('#authForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const body=Object.fromEntries(f);
  body.name=String(body.name||'').trim();
  body.email=String(body.email||'').trim().toLowerCase();
  body.password=String(body.password||'');
  if(authMode==='register' && !body.name){toast('Please enter your full name');return;}
  if(body.password.length<6){toast('Password must be at least 6 characters');return;}
  try{
    const d=await api('/api/'+(authMode==='login'?'login':'register'),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    token=d.token;localStorage.setItem('cn_token',token);$('#auth').hidden=true;await init();toast('Welcome to Movie Site')
  }catch(err){toast(err.message || 'Something went wrong. Check that the server is running.')}
};

async function init(){
  try{
    me=token?await api('/api/me'):null;
    $('#authBtn').textContent=me?'Logout':'Login';
    if(me?.role==='admin'){$('#adminLink').hidden=false;$('#admin').hidden=false;loadAdmin()}
    else{$('#adminLink').hidden=true;$('#admin').hidden=true}
  }catch{token=null;me=null;localStorage.removeItem('cn_token')}
  loadMovies();loadList()
}

$('#search').oninput=loadMovies;
$('#genre').onchange=loadMovies;
$('#searchBtn').onclick=()=>{location.hash='catalog';setTimeout(()=>$('#search').focus(),350)};

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{
  b.closest('.modal').hidden=true;
  if($('#video')) $('#video').pause()
});

async function loadAdmin(){
  try{
    const s=await api('/api/admin/stats');
    $('#stats').innerHTML=Object.entries(s).map(([k,v])=>`<div><b>${escapeHtml(v)}</b><span>${escapeHtml(k)}</span></div>`).join('');
    const ms=await api('/api/movies?status=all');
    $('#adminMovies').innerHTML=ms.map(m=>`<div class="admin-row"><span>${escapeHtml(m.title)}<small>${escapeHtml(m.status)} · ${escapeHtml(m.views||0)} views</small></span><span><button onclick="editMovie(${m.id})">Edit</button> <button onclick="deleteMovie(${m.id})">×</button></span></div>`).join('');
    const us=await api('/api/admin/users');
    $('#users').innerHTML=us.map(u=>`<div class="admin-row"><span>${escapeHtml(u.name)}<small>${escapeHtml(u.email)} · ${escapeHtml(u.role)}</small></span></div>`).join('')
  }catch(e){toast(e.message)}
}

window.deleteMovie=async id=>{
  if(confirm('Delete this movie permanently?')){
    try{await api('/api/admin/movies/'+id,{method:'DELETE'});toast('Movie deleted');loadAdmin();loadMovies()}catch(e){toast(e.message)}
  }
};

window.editMovie=async id=>{
  try{
    const m=await api('/api/movies/'+id);editId=id;
    const f=$('#movieForm');
    for(const k of ['title','description','genre','year','duration','status','poster_url','video_url']) if(f.elements[k]) f.elements[k].value=m[k]||'';
    $('#formTitle').textContent='Edit Movie #'+id;location.hash='admin'
  }catch(e){toast(e.message)}
};

$('#movieForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    const fd=new FormData(e.target),url=editId?'/api/admin/movies/'+editId:'/api/admin/movies';
    await api(url,{method:editId?'PUT':'POST',body:fd});
    toast('Movie saved successfully');e.target.reset();editId=null;$('#formTitle').textContent='Add a New Movie';loadAdmin();loadMovies()
  }catch(err){toast(err.message)}
};

$('#cancelEdit').onclick=()=>{$('#movieForm').reset();editId=null;$('#formTitle').textContent='Add a New Movie'};
$('#refreshAdmin').onclick=loadAdmin;
$('#year').textContent=new Date().getFullYear();

const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting)entry.target.classList.add('visible')
}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

const scene=$('#heroScene');
if(scene){
  scene.addEventListener('mousemove',e=>{
    if(window.innerWidth<900)return;
    const r=scene.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    scene.style.transform=`rotateX(${(-y*6).toFixed(2)}deg) rotateY(${(x*8).toFixed(2)}deg)`
  });
  scene.addEventListener('mouseleave',()=>scene.style.transform='')
}

init();

document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();location.hash='catalog';$('#search').focus()}
});
document.querySelectorAll('.nav a').forEach(link=>{
  link.addEventListener('click',()=>document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a===link)));
});
