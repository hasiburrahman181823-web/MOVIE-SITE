/* Movie Site real-demo feature layer: profile, progress, ratings and demo subscriptions. */
(() => {
  const $ = s => document.querySelector(s);
  const token = () => localStorage.getItem('cn_token');
  const api = async (url, options={}) => {
    options.headers = {...(options.headers||{}), ...(token()?{Authorization:'Bearer '+token()}:{})};
    const r = await fetch(url, options); const d = await r.json().catch(()=>({}));
    if(!r.ok) throw Error(d.error||'Request failed'); return d;
  };
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style = document.createElement('style');
  style.textContent = `.demo-center{margin:30px auto;max-width:1180px;padding:24px;border:1px solid #ffffff18;border-radius:24px;background:#ffffff08;backdrop-filter:blur(18px)}.demo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.demo-box{padding:16px;border-radius:16px;background:#0005;border:1px solid #ffffff12}.demo-box input,.demo-box textarea,.demo-box select{width:100%;margin:6px 0;padding:10px;border-radius:10px;background:#111;color:#fff;border:1px solid #ffffff22}.demo-box button{cursor:pointer;padding:10px 14px;border:0;border-radius:10px;background:#e50914;color:#fff}.demo-muted{opacity:.65;font-size:13px}`;
  document.head.appendChild(style);
  const main=document.querySelector('main'); if(!main)return;
  const section=document.createElement('section'); section.className='demo-center reveal'; section.id='demoCenter';
  section.innerHTML=`<div class="section-top"><div><span class="section-kicker">REAL DEMO FEATURES</span><h2>Your Movie Site account</h2><p>Functional local demo: profile, watch progress, ratings and subscription simulation.</p></div></div><div class="demo-grid"><div class="demo-box"><h3>Profile</h3><div id="demoProfile">Login to manage your profile.</div></div><div class="demo-box"><h3>Continue Watching</h3><div id="demoProgress">Login to see your progress.</div></div><div class="demo-box"><h3>Subscription</h3><p class="demo-muted">No real payment is taken.</p><select id="demoPlan"><option>Basic</option><option selected>Standard</option><option>Premium</option></select><button id="demoSubscribe">Activate Demo Plan</button><div id="demoSubscription"></div></div><div class="demo-box"><h3>Movie Rating</h3><input id="demoMovieId" type="number" min="1" placeholder="Movie ID"><select id="demoRating"><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select><textarea id="demoReview" placeholder="Write a review..."></textarea><button id="demoRate">Submit Rating</button><div id="demoRatingResult"></div></div></div>`;
  main.appendChild(section);
  async function load(){
    if(!token())return;
    try{
      const p=await api('/api/profile');
      $('#demoProfile').innerHTML=`<input id="dpName" value="${esc(p.name)}"><input id="dpAvatar" placeholder="Avatar URL" value="${esc(p.avatar_url||'')}"><textarea id="dpBio" placeholder="Short bio">${esc(p.bio||'')}</textarea><button id="dpSave">Save Profile</button>`;
      $('#dpSave').onclick=async()=>{await api('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#dpName').value,avatar_url:$('#dpAvatar').value,bio:$('#dpBio').value})});alert('Profile saved');};
      const pr=await api('/api/progress'); $('#demoProgress').innerHTML=pr.length?pr.slice(0,4).map(x=>`<p>${esc(x.title)} — ${Math.round(x.seconds)} sec ${x.completed?'✓':''}</p>`).join(''):'No watch progress yet.';
      const subs=await api('/api/subscription'); $('#demoSubscription').innerHTML=subs[0]?`<p>${esc(subs[0].plan)} · ${esc(subs[0].status)}<br>Expires: ${new Date(subs[0].expires_at).toLocaleDateString()}</p>`:'No active demo plan';
    }catch(e){console.warn(e)}
  }
  $('#demoSubscribe').onclick=async()=>{if(!token())return alert('Please login first');const d=await api('/api/subscription/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:$('#demoPlan').value})});alert(d.message);load();};
  $('#demoRate').onclick=async()=>{if(!token())return alert('Please login first');if(!$('#demoMovieId').value)return alert('Enter Movie ID');await api('/api/movies/'+$('#demoMovieId').value+'/ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:Number($('#demoRating').value),review:$('#demoReview').value})});$('#demoRatingResult').textContent='Rating saved successfully.';};
  load();
})();
