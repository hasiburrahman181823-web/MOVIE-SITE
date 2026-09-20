/**
 * MOVIE SITE — MASTER APPLICATION CONTROLLER
 * Full-stack interactive streaming, dual-theme engine, 3D card physics & audio synthesis.
 */

(() => {
  'use strict';

  // Helper selectors
  const $ = selector => document.querySelector(selector);
  const $$ = selector => document.querySelectorAll(selector);

  // Global State
  let token = localStorage.getItem('cinenova_token') || localStorage.getItem('cn_token');
  let currentUser = null;
  let allMovies = [];
  let watchlistIds = new Set();
  let currentMovie = null;
  let activeTheme = localStorage.getItem('cinenova_theme') || 'night';
  let sfxEnabled = localStorage.getItem('cinenova_sfx') === 'true';
  let selectedGenre = 'All';
  let currentSort = 'default';
  let selectedQuality = '';
  let spotlightMovies = [];
  let spotlightIndex = 0;
  let spotlightTimer = null;
  let selectedStarRating = 5;
  let authMode = 'login'; // 'login' | 'register'

  // ---------------------------------------------------------------------------
  // WEB AUDIO API SYNTHESIZER (Tactile micro-sound effects, zero external files)
  // ---------------------------------------------------------------------------
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type = 'click') {
    if (!sfxEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(850, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'chime') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'whoosh') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.09);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      }
    } catch (e) {
      // Ignore audio failure if restricted by browser autoplay policy
    }
  }

  // ---------------------------------------------------------------------------
  // API CLIENT
  // ---------------------------------------------------------------------------
  async function api(endpoint, options = {}) {
    options.headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    };
    const response = await fetch(endpoint, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Server request failed');
    }
    return data;
  }

  // Toast Notification
  function showToast(message, icon = '✦') {
    const toast = $('#toast');
    const toastIcon = $('#toastIcon');
    const toastMsg = $('#toastMsg');
    if (!toast) return;
    toastIcon.textContent = icon;
    toastMsg.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3400);
  }

  // Escape HTML helper
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------------------------------------------------------------------------
  // DUAL THEME ENGINE (Day & Night Mode)
  // ---------------------------------------------------------------------------
  function applyTheme(themeName) {
    activeTheme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('cinenova_theme', themeName);

    const sun = $('#themeIconSun');
    const moon = $('#themeIconMoon');
    if (themeName === 'day') {
      if (sun) sun.style.display = 'none';
      if (moon) moon.style.display = 'block';
    } else {
      if (sun) sun.style.display = 'block';
      if (moon) moon.style.display = 'none';
    }
  }

  window.toggleTheme = function() {
    playSound('chime');
    const nextTheme = activeTheme === 'night' ? 'day' : 'night';
    applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme === 'day' ? '☀️ Luxury Studio Day' : '🌙 Cyber Cinema Night'} Mode`, '✨');
  };

  window.toggleSfx = function() {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('cinenova_sfx', sfxEnabled ? 'true' : 'false');
    const onIcon = $('#sfxIconOn');
    const offIcon = $('#sfxIconOff');
    if (onIcon && offIcon) {
      onIcon.style.display = sfxEnabled ? 'block' : 'none';
      offIcon.style.display = sfxEnabled ? 'none' : 'block';
    }
    if (sfxEnabled) playSound('chime');
    showToast(sfxEnabled ? '🔊 Sound effects enabled' : '🔇 Sound effects muted', '🎵');
  };

  // ---------------------------------------------------------------------------
  // 3D CARD TILT & SPOTLIGHT PHYSICS
  // ---------------------------------------------------------------------------
  function initCardTilts() {
    $$('.movie-card').forEach(card => {
      if (card.dataset.tiltInitialized) return;
      card.dataset.tiltInitialized = 'true';

      card.addEventListener('mousemove', e => {
        if (window.innerWidth < 768) return;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const midX = rect.width / 2;
        const midY = rect.height / 2;

        const rotateX = ((y - midY) / midY) * -8;
        const rotateY = ((x - midX) / midX) * 8;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-8px)`;
        card.style.setProperty('--glare-x', `${(x / rect.width) * 100}%`);
        card.style.setProperty('--glare-y', `${(y / rect.height) * 100}%`);
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // CARD HTML TEMPLATE GENERATOR
  // ---------------------------------------------------------------------------
  function createCardHTML(m, options = {}) {
    const poster = m.poster_url || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800';
    const isSaved = watchlistIds.has(m.id);
    const badgeText = m.badge || (m.imdb_rating >= 9.0 ? 'Top Pick' : '');
    const badgeClass = m.badge?.includes('#1') ? 'badge-trending' : (m.badge?.includes('Choice') ? 'badge-choice' : 'badge-quality');

    let progressBarHTML = '';
    if (options.progress !== undefined) {
      const pct = Math.min(100, Math.max(5, options.progress));
      progressBarHTML = `
        <div class="card-progress-bar">
          <div class="card-progress-fill" style="width: ${pct}%;"></div>
        </div>
      `;
    }

    return `
      <article class="movie-card ${options.className || ''}" data-id="${m.id}" onclick="openMovie(${m.id})">
        <div class="card-glare"></div>
        <div class="card-poster-wrap">
          <img class="card-poster" loading="lazy" src="${esc(poster)}" alt="${esc(m.title)} poster" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800'">
          <div class="card-hover-overlay">
            <div class="play-disc">▶</div>
          </div>
          
          <div class="card-badges">
            ${badgeText ? `<span class="badge-pill ${badgeClass}">${esc(badgeText)}</span>` : ''}
            <span class="badge-pill badge-quality">${esc(m.quality || '4K UHD')}</span>
          </div>

          <div class="card-rating-tag">
            <span>★</span>
            <span>${(m.imdb_rating || 8.5).toFixed(1)}</span>
          </div>

          ${progressBarHTML}
        </div>

        <div class="card-info">
          <div class="card-meta-line">
            <span>${esc(m.year || 2025)}</span>
            <span>${esc(m.duration || '2h 10m')}</span>
            <span>${esc(m.age_rating || 'PG-13')}</span>
          </div>
          <h3 class="card-title" title="${esc(m.title)}">${esc(m.title)}</h3>
          <div class="card-genres">${esc(m.genre || 'Cinema')}</div>

          <div class="card-actions" onclick="event.stopPropagation()">
            <button class="card-action-btn" onclick="openMovie(${m.id}, true)">
              ▶ Play
            </button>
            <button class="card-action-btn ${isSaved ? 'active' : ''}" onclick="toggleWatchlist(${m.id})">
              ${isSaved ? '✓ Saved' : '＋ List'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // ---------------------------------------------------------------------------
  // HERO BILLBOARD CONTROLLER
  // ---------------------------------------------------------------------------
  function updateHeroSpotlight() {
    if (!spotlightMovies.length) return;
    const m = spotlightMovies[spotlightIndex];

    const heroBackdrop = $('#heroBackdrop');
    const heroTitle = $('#heroTitle');
    const heroDesc = $('#heroDesc');
    const heroBadge = $('#heroBadge');
    const heroQuality = $('#heroQuality');
    const heroAge = $('#heroAge');
    const heroRating = $('#heroRating');
    const heroYear = $('#heroYear');
    const heroDuration = $('#heroDuration');
    const heroWatchlistBtn = $('#heroWatchlistBtn');
    const heroWatchlistIcon = $('#heroWatchlistIcon');

    if (heroBackdrop) {
      heroBackdrop.style.opacity = '0.3';
      setTimeout(() => {
        heroBackdrop.src = m.backdrop_url || m.poster_url;
        heroBackdrop.style.opacity = '1';
      }, 250);
    }

    if (heroTitle) heroTitle.textContent = m.title;
    if (heroDesc) heroDesc.textContent = m.description || 'Experience this exclusive blockbuster in 4K HDR.';
    if (heroBadge) heroBadge.textContent = m.badge || 'SPOTLIGHT';
    if (heroQuality) heroQuality.textContent = m.quality || '4K Ultra HD';
    if (heroAge) heroAge.textContent = m.age_rating || 'PG-13';
    if (heroRating) heroRating.textContent = `★ ${(m.imdb_rating || 8.8).toFixed(1)}`;
    if (heroYear) heroYear.textContent = m.year || 2025;
    if (heroDuration) heroDuration.textContent = m.duration || '2h 15m';

    const isSaved = watchlistIds.has(m.id);
    if (heroWatchlistIcon) heroWatchlistIcon.textContent = isSaved ? '✓' : '＋';
    if (heroWatchlistBtn) {
      heroWatchlistBtn.classList.toggle('active', isSaved);
      heroWatchlistBtn.onclick = () => toggleWatchlist(m.id);
    }

    const heroPlayBtn = $('#heroPlayBtn');
    if (heroPlayBtn) heroPlayBtn.onclick = () => openMovie(m.id, true);

    const heroTrailerBtn = $('#heroTrailerBtn');
    if (heroTrailerBtn) heroTrailerBtn.onclick = () => openMovie(m.id, true);

    // Update thumbs active state
    $$('.hero-thumb').forEach((thumb, idx) => {
      thumb.classList.toggle('active', idx === spotlightIndex);
    });
  }

  function startHeroTimer() {
    clearInterval(spotlightTimer);
    spotlightTimer = setInterval(() => {
      if (spotlightMovies.length) {
        spotlightIndex = (spotlightIndex + 1) % spotlightMovies.length;
        updateHeroSpotlight();
      }
    }, 9000);
  }

  // ---------------------------------------------------------------------------
  // DATA LOADERS & SECTION RENDERING
  // ---------------------------------------------------------------------------
  async function loadAllMovies() {
    try {
      const q = '';
      const genre = selectedGenre === 'All' ? '' : selectedGenre;
      const movies = await api(`/api/movies?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(genre)}&sort=${currentSort}&quality=${selectedQuality}`);
      allMovies = movies;

      // Spotlight items: pick first 4 prominent titles
      spotlightMovies = movies.slice(0, 4);
      renderHeroThumbnails();
      updateHeroSpotlight();
      startHeroTimer();

      // Render rails
      renderTrendingRail(movies);
      renderTopRatedRail(movies);
      renderCatalogGrid(movies);

      initCardTilts();
    } catch (err) {
      console.error('Failed to load movies:', err);
      $('#moviesGrid').innerHTML = `<p class="empty-state">Unable to connect to streaming library. Check server status.</p>`;
    }
  }

  function renderHeroThumbnails() {
    const container = $('#heroThumbnails');
    if (!container) return;
    container.innerHTML = spotlightMovies.map((m, idx) => `
      <div class="hero-thumb ${idx === spotlightIndex ? 'active' : ''}" onclick="selectSpotlight(${idx})">
        <img src="${esc(m.backdrop_url || m.poster_url)}" alt="${esc(m.title)} thumbnail">
      </div>
    `).join('');
  }

  window.selectSpotlight = function(idx) {
    playSound('click');
    spotlightIndex = idx;
    updateHeroSpotlight();
    startHeroTimer();
  };

  function renderTrendingRail(movies) {
    const rail = $('#trendingRail');
    if (!rail) return;
    const trending = [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);
    rail.innerHTML = trending.map((m, idx) => `
      <div class="ranked-card-wrap">
        <span class="rank-number">${idx + 1}</span>
        ${createCardHTML(m)}
      </div>
    `).join('');
  }

  function renderTopRatedRail(movies) {
    const rail = $('#topRatedRail');
    if (!rail) return;
    const top = [...movies].sort((a, b) => (b.imdb_rating || 0) - (a.imdb_rating || 0)).slice(0, 10);
    rail.innerHTML = top.map(m => createCardHTML(m)).join('');
  }

  function renderCatalogGrid(movies) {
    const grid = $('#moviesGrid');
    if (!grid) return;
    if (!movies.length) {
      grid.innerHTML = `<p class="empty-state" style="grid-column: 1/-1; padding: 50px 0; text-align: center; color: var(--text-dim);">No matching movies found for this filter.</p>`;
      return;
    }
    grid.innerHTML = movies.map(m => createCardHTML(m)).join('');
  }

  async function loadWatchlist() {
    if (!token) {
      watchlistIds.clear();
      const grid = $('#watchlistGrid');
      if (grid) {
        grid.innerHTML = `<p class="empty-state" style="grid-column: 1/-1; padding: 40px 0; color: var(--text-muted); text-align: center;">Sign in with your account to curate your personal 4K watchlist.</p>`;
      }
      return;
    }
    try {
      const items = await api('/api/my-list');
      watchlistIds = new Set(items.map(m => m.id));
      const grid = $('#watchlistGrid');
      if (grid) {
        if (!items.length) {
          grid.innerHTML = `<p class="empty-state" style="grid-column: 1/-1; padding: 40px 0; color: var(--text-muted); text-align: center;">Your watchlist is currently empty. Explore the catalog and click '＋ List' to save titles here.</p>`;
        } else {
          grid.innerHTML = items.map(m => createCardHTML(m)).join('');
          initCardTilts();
        }
      }
      // Update profile count
      const countElem = $('#profileWatchlistCount');
      if (countElem) countElem.textContent = items.length;
    } catch (err) {
      console.warn('Watchlist fetch error:', err.message);
    }
  }

  async function loadContinueWatching() {
    const section = $('#continueWatchingSection');
    const rail = $('#continueRail');
    if (!token || !section || !rail) {
      if (section) section.style.display = 'none';
      return;
    }
    try {
      const items = await api('/api/progress');
      if (!items || !items.length) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'block';
      rail.innerHTML = items.map(p => {
        const durationSec = 7200; // default 2 hours
        const progressPct = Math.min(95, Math.round((p.seconds / durationSec) * 100));
        return createCardHTML({
          id: p.movie_id,
          title: p.title,
          poster_url: p.poster_url,
          genre: p.genre,
          imdb_rating: 8.9,
          quality: '4K UHD'
        }, { progress: Math.max(15, progressPct), className: 'progress-card-wrap' });
      }).join('');
      initCardTilts();
    } catch (err) {
      section.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // WATCHLIST TOGGLER
  // ---------------------------------------------------------------------------
  window.toggleWatchlist = async function(movieId) {
    playSound('click');
    if (!token) {
      openAuthModal();
      return;
    }
    const isSaved = watchlistIds.has(movieId);
    try {
      if (isSaved) {
        await api(`/api/my-list/${movieId}`, { method: 'DELETE' });
        watchlistIds.delete(movieId);
        showToast('Removed from My Watchlist', '🗑️');
      } else {
        await api(`/api/my-list/${movieId}`, { method: 'POST' });
        watchlistIds.add(movieId);
        playSound('chime');
        showToast('Saved to My Watchlist', '🔖');
      }
      // Refresh UI buttons
      loadWatchlist();
      loadAllMovies();
      if (currentMovie && currentMovie.id === movieId) {
        updateModalWatchlistState();
      }
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  function updateModalWatchlistState() {
    const btn = $('#modalWatchlistBtn');
    const icon = $('#modalWatchlistIcon');
    if (!btn || !currentMovie) return;
    const isSaved = watchlistIds.has(currentMovie.id);
    if (icon) icon.textContent = isSaved ? '✓' : '＋';
    btn.classList.toggle('active', isSaved);
  }

  // ---------------------------------------------------------------------------
  // CINEMA DETAILS & VIDEO PLAYER MODAL
  // ---------------------------------------------------------------------------
  window.openMovie = async function(movieId, autoPlay = false) {
    playSound('whoosh');
    try {
      const m = await api(`/api/movies/${movieId}`);
      currentMovie = m;

      // Track view
      api(`/api/movies/${movieId}/view`, { method: 'POST' }).catch(() => {});

      $('#modalTitle').textContent = m.title;
      $('#modalDescription').textContent = m.description || 'No overview available.';
      $('#modalQuality').textContent = m.quality || '4K Ultra HD';
      $('#modalRating').textContent = `★ ${(m.imdb_rating || 8.5).toFixed(1)}`;
      $('#modalAge').textContent = m.age_rating || 'PG-13';
      $('#modalYear').textContent = m.year || 2025;
      $('#modalDuration').textContent = m.duration || '2h 10m';
      $('#modalGenre').textContent = m.genre || 'Cinema';
      $('#modalDirector').textContent = m.director || 'Visionary Filmmakers';
      $('#modalCast').textContent = m.cast || 'Lead Cast & Ensemble';
      $('#modalViews').textContent = `${(m.views || 1).toLocaleString()} streams`;

      // Set video source
      const video = $('#cinemaVideo');
      const streamUrl = m.video_path ? `/stream/${m.id}` : (m.video_url || m.trailer_url || '');
      video.src = streamUrl;

      // Ambient video lighting glow
      const glow = $('#playerAmbientGlow');
      if (glow) {
        glow.style.background = `radial-gradient(circle, ${activeTheme === 'day' ? '#4f46e5' : '#ec4899'} 0%, #8b5cf6 40%, transparent 70%)`;
      }

      updateModalWatchlistState();

      // Play button action inside modal
      $('#modalPlayBtn').onclick = () => {
        playSound('click');
        video.play().catch(() => {});
      };
      $('#modalWatchlistBtn').onclick = () => toggleWatchlist(m.id);
      $('#modalShareBtn').onclick = () => shareMovie(m.id);

      // Track watch progress on video time update
      video.ontimeupdate = () => {
        if (token && video.currentTime > 5 && Math.floor(video.currentTime) % 15 === 0) {
          api(`/api/progress/${m.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seconds: Math.floor(video.currentTime), completed: video.ended })
          }).catch(() => {});
        }
      };

      // Load ratings & reviews
      loadMovieReviews(m.id);

      // Show modal
      const modal = $('#movieDetailsModal');
      modal.classList.add('open');

      if (autoPlay) {
        video.play().catch(() => {});
      }
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  function closeMovieModal() {
    const modal = $('#movieDetailsModal');
    if (modal) modal.classList.remove('open');
    const video = $('#cinemaVideo');
    if (video) {
      video.pause();
      video.src = '';
    }
    loadContinueWatching();
  }

  async function loadMovieReviews(movieId) {
    const list = $('#reviewsList');
    const summaryBadge = $('#reviewSummaryBadge');
    if (!list) return;
    try {
      const data = await api(`/api/movies/${movieId}/ratings`);
      const avg = data.summary?.average ? Number(data.summary.average).toFixed(1) : '5.0';
      const count = data.summary?.count || 0;
      if (summaryBadge) summaryBadge.textContent = `★ ${avg} (${count} reviews)`;

      if (!data.reviews || !data.reviews.length) {
        list.innerHTML = `<p style="font-size: 13px; color: var(--text-dim);">No reviews yet. Be the first to share your verdict!</p>`;
        return;
      }

      list.innerHTML = data.reviews.map(r => `
        <div class="review-card">
          <div class="review-author-line">
            <div class="review-author">
              <img src="${esc(r.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100')}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
              <span>${esc(r.name || 'Cinephile')}</span>
            </div>
            <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
          </div>
          <p class="review-text">${esc(r.review || 'Loved every minute of this cinematic experience.')}</p>
        </div>
      `).join('');
    } catch (err) {
      list.innerHTML = `<p style="font-size: 13px; color: var(--text-dim);">Reviews could not be loaded.</p>`;
    }
  }

  // Review Form Submission
  $('#reviewForm').onsubmit = async e => {
    e.preventDefault();
    if (!token) {
      openAuthModal();
      return;
    }
    const reviewText = $('#reviewTextInput').value.trim();
    if (!currentMovie) return;
    try {
      await api(`/api/movies/${currentMovie.id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selectedStarRating, review: reviewText })
      });
      playSound('chime');
      showToast('Thank you! Your review was published.', '⭐');
      $('#reviewTextInput').value = '';
      loadMovieReviews(currentMovie.id);
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  // Star Rating Picker
  $$('#starPicker span').forEach(star => {
    star.onclick = () => {
      playSound('click');
      selectedStarRating = Number(star.dataset.val);
      $$('#starPicker span').forEach(s => {
        s.classList.toggle('active', Number(s.dataset.val) <= selectedStarRating);
      });
    };
  });

  // Simulated Offline Download Manager
  window.simulateDownload = function(quality) {
    playSound('click');
    const bar = $('#downloadProgress');
    const fill = $('#downloadProgressFill');
    if (!bar || !fill) return;

    bar.style.display = 'block';
    fill.style.width = '0%';
    showToast(`Initiating high-speed 4K download: ${quality}...`, '📥');

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 25) + 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        fill.style.width = '100%';
        setTimeout(() => {
          playSound('chime');
          showToast(`✓ Completed download: ${quality} saved for offline streaming!`, '🎉');
          setTimeout(() => { bar.style.display = 'none'; }, 1500);
        }, 400);
      } else {
        fill.style.width = progress + '%';
      }
    }, 200);
  };

  // Share Movie
  function shareMovie(movieId) {
    playSound('click');
    const url = `${window.location.origin}${window.location.pathname}#movie=${movieId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Share link copied to clipboard!', '🔗');
    }).catch(() => {
      showToast('Movie link: ' + url, '🔗');
    });
  }

  // ---------------------------------------------------------------------------
  // LIVE SEARCH MODAL (Ctrl + K)
  // ---------------------------------------------------------------------------
  function openSearchModal() {
    playSound('whoosh');
    const modal = $('#searchModal');
    modal.classList.add('open');
    const input = $('#liveSearchInput');
    setTimeout(() => input.focus(), 150);
  }

  function closeSearchModal() {
    $('#searchModal').classList.remove('open');
  }

  let searchDebounceTimer = null;
  $('#liveSearchInput').oninput = e => {
    clearTimeout(searchDebounceTimer);
    const query = e.target.value.trim();
    if (!query) {
      $('#searchResultsList').innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-dim); font-size: 13px;">Type anything to discover movies across our entire 50-movie 4K library.</p>`;
      return;
    }
    searchDebounceTimer = setTimeout(async () => {
      try {
        const results = await api(`/api/movies?q=${encodeURIComponent(query)}`);
        const list = $('#searchResultsList');
        if (!results.length) {
          list.innerHTML = `<p style="padding: 20px; text-align: center; color: var(--text-dim); font-size: 13px;">No movies found matching "${esc(query)}".</p>`;
          return;
        }
        list.innerHTML = results.map(m => `
          <div class="search-result-item" onclick="selectSearchResult(${m.id})">
            <img class="search-result-poster" src="${esc(m.poster_url || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=200')}" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=200'">
            <div class="search-result-info">
              <h4>${esc(m.title)}</h4>
              <p>${esc(m.genre || '')} · ${esc(m.year || '')} · ★ ${(m.imdb_rating || 8.5).toFixed(1)}</p>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }, 200);
  };

  window.selectSearchResult = function(movieId) {
    closeSearchModal();
    openMovie(movieId, true);
  };

  // ---------------------------------------------------------------------------
  // AUTH & USER PROFILE DRAWER
  // ---------------------------------------------------------------------------
  function openAuthModal() {
    playSound('whoosh');
    const modal = $('#authModal');
    modal.classList.add('open');

    if (currentUser) {
      $('#authView').style.display = 'none';
      $('#profileView').style.display = 'block';
      $('#profileName').textContent = currentUser.name || 'Cinephile';
      $('#profileEmail').textContent = currentUser.email || '';
      if (currentUser.profile?.avatar_url) {
        $('#profileAvatar').src = currentUser.profile.avatar_url;
      }
      $('#profilePlanBadge').textContent = currentUser.subscription?.plan || 'VIP 4K ULTRA MEMBER';
      $('#profileWatchlistCount').textContent = watchlistIds.size;
    } else {
      $('#authView').style.display = 'block';
      $('#profileView').style.display = 'none';
    }
  }

  function closeAuthModal() {
    $('#authModal').classList.remove('open');
  }

  $('#switchAuthModeBtn').onclick = () => {
    playSound('click');
    authMode = authMode === 'login' ? 'register' : 'login';
    $('#authModalTitle').textContent = authMode === 'login' ? 'Welcome to Movie Site' : 'Create an Account';
    $('#authSubmitBtn').textContent = authMode === 'login' ? 'Continue to Movie Site' : 'Register Account';
    $('#switchAuthModeBtn').textContent = authMode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in';
    $('#authNameGroup').style.display = authMode === 'login' ? 'none' : 'block';
  };

  // 1-Click Instant Demo VIP Login
  $('#quickDemoLoginBtn').onclick = async () => {
    playSound('click');
    try {
      const data = await api('/api/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user' })
      });
      token = data.token;
      localStorage.setItem('cinenova_token', token);
      localStorage.setItem('cn_token', token);
      playSound('chime');
      showToast('Logged in as VIP Member Aria Vance!', '⚡');
      closeAuthModal();
      initUserSession();
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    playSound('click');
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const data = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      token = data.token;
      localStorage.setItem('cinenova_token', token);
      localStorage.setItem('cn_token', token);
      playSound('chime');
      showToast(authMode === 'login' ? 'Welcome back to Movie Site!' : 'Account registered successfully!', '🎉');
      closeAuthModal();
      initUserSession();
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  $('#logoutBtn').onclick = () => {
    playSound('click');
    token = null;
    currentUser = null;
    localStorage.removeItem('cinenova_token');
    localStorage.removeItem('cn_token');
    showToast('Signed out from Movie Site', '👋');
    closeAuthModal();
    initUserSession();
  };

  // VIP Pass Upgrade simulation
  $('#vipUpgradeBtn').onclick = async () => {
    playSound('click');
    if (!token) {
      openAuthModal();
      return;
    }
    try {
      const res = await api('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'VIP Premium (4K Ultra)' })
      });
      playSound('chime');
      showToast(res.message || 'Movie Site VIP Pass Active!', '👑');
      initUserSession();
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  // ---------------------------------------------------------------------------
  // ADMIN DASHBOARD CONTROLLER
  // ---------------------------------------------------------------------------
  let adminEditingId = null;

  async function loadAdminData() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      const stats = await api('/api/admin/stats');
      const statsGrid = $('#adminStatsGrid');
      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="admin-stat-card">
            <b>${stats.totalMovies}</b>
            <span>Active Movies</span>
          </div>
          <div class="admin-stat-card">
            <b>${stats.totalUsers}</b>
            <span>Registered Users</span>
          </div>
          <div class="admin-stat-card">
            <b>${stats.totalViews.toLocaleString()}</b>
            <span>Total Streams</span>
          </div>
          <div class="admin-stat-card">
            <b>${stats.totalReviews}</b>
            <span>User Reviews</span>
          </div>
        `;
      }

      const movies = await api('/api/movies?status=all');
      const list = $('#adminMoviesList');
      if (list) {
        list.innerHTML = movies.map(m => `
          <div class="admin-table-row">
            <div>
              <b>${esc(m.title)}</b>
              <div style="font-size: 11px; color: var(--text-dim);">${esc(m.genre)} · ${esc(m.quality || '4K')} · ${m.views || 0} views</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-glass" style="padding:4px 8px; font-size:11px;" onclick="editMovieAdmin(${m.id})">Edit</button>
              <button class="btn btn-glass" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="deleteMovieAdmin(${m.id})">✕</button>
            </div>
          </div>
        `).join('');
      }

      const users = await api('/api/admin/users');
      const usersList = $('#adminUsersList');
      if (usersList) {
        usersList.innerHTML = users.map(u => `
          <div class="admin-table-row">
            <div>
              <b>${esc(u.name)}</b>
              <div style="font-size: 11px; color: var(--text-dim);">${esc(u.email)}</div>
            </div>
            <span class="hero-badge" style="font-size: 10px;">${esc(u.role)}</span>
          </div>
        `).join('');
      }
    } catch (err) {
      console.warn('Admin load error:', err.message);
    }
  }

  window.editMovieAdmin = async function(id) {
    try {
      const m = await api(`/api/movies/${id}`);
      adminEditingId = id;
      const form = $('#adminMovieForm');
      for (const k of ['title', 'description', 'genre', 'year', 'duration', 'imdb_rating', 'director', 'badge', 'cast', 'poster_url', 'backdrop_url', 'video_url']) {
        if (form.elements[k]) form.elements[k].value = m[k] ?? '';
      }
      $('#adminFormTitle').textContent = `Edit Movie #${id}`;
      location.hash = 'admin';
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  window.deleteMovieAdmin = async function(id) {
    if (!confirm('Are you sure you want to permanently remove this title?')) return;
    try {
      await api(`/api/admin/movies/${id}`, { method: 'DELETE' });
      showToast('Movie removed successfully', '🗑️');
      loadAdminData();
      loadAllMovies();
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  $('#adminMovieForm').onsubmit = async e => {
    e.preventDefault();
    playSound('click');
    const fd = new FormData(e.target);
    const url = adminEditingId ? `/api/admin/movies/${adminEditingId}` : '/api/admin/movies';
    try {
      await api(url, { method: adminEditingId ? 'PUT' : 'POST', body: fd });
      playSound('chime');
      showToast('Movie saved successfully!', '🎬');
      e.target.reset();
      adminEditingId = null;
      $('#adminFormTitle').textContent = 'Add New Title';
      loadAdminData();
      loadAllMovies();
    } catch (err) {
      showToast(err.message, '⚠️');
    }
  };

  $('#cancelEditBtn').onclick = () => {
    $('#adminMovieForm').reset();
    adminEditingId = null;
    $('#adminFormTitle').textContent = 'Add New Title';
  };
  $('#adminRefreshBtn').onclick = loadAdminData;

  // ---------------------------------------------------------------------------
  // INITIALIZATION & EVENT LISTENERS
  // ---------------------------------------------------------------------------
  async function initUserSession() {
    if (!token) {
      currentUser = null;
      $('#authBtn').style.display = 'block';
      $('#userProfilePill').style.display = 'none';
      $('#adminNavLink').hidden = true;
      $('#admin').hidden = true;
      loadWatchlist();
      loadContinueWatching();
      return;
    }
    try {
      currentUser = await api('/api/me');
      $('#authBtn').style.display = 'none';
      $('#userProfilePill').style.display = 'flex';
      $('#userNameText').textContent = currentUser.name?.split(' ')[0] || 'Profile';
      if (currentUser.profile?.avatar_url) {
        $('#userAvatarImg').src = currentUser.profile.avatar_url;
      }

      if (currentUser.role === 'admin') {
        $('#adminNavLink').hidden = false;
        $('#admin').hidden = false;
        loadAdminData();
      } else {
        $('#adminNavLink').hidden = true;
        $('#admin').hidden = true;
      }

      loadWatchlist();
      loadContinueWatching();
    } catch (err) {
      token = null;
      localStorage.removeItem('cinenova_token');
      localStorage.removeItem('cn_token');
      initUserSession();
    }
  }

  // Genre Chip filtering
  $$('#genreChips .chip').forEach(chip => {
    chip.onclick = () => {
      playSound('click');
      $$('#genreChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedGenre = chip.dataset.genre;
      loadAllMovies();
    };
  });

  // Sort & Quality dropdowns
  $('#sortSelect').onchange = e => {
    playSound('click');
    currentSort = e.target.value;
    loadAllMovies();
  };
  $('#qualitySelect').onchange = e => {
    playSound('click');
    selectedQuality = e.target.value;
    loadAllMovies();
  };

  // Nav link active highlight on click
  $$('.nav-links a').forEach(link => {
    link.onclick = () => {
      playSound('click');
      $$('.nav-links a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
    };
  });

  // Modal Triggers & Closers
  $('#themeToggle').onclick = toggleTheme;
  $('#sfxToggle').onclick = toggleSfx;
  $('#searchModalBtn').onclick = openSearchModal;
  $('#closeSearchBtn').onclick = closeSearchModal;
  $('#authBtn').onclick = openAuthModal;
  $('#userProfilePill').onclick = openAuthModal;
  $('#closeAuthBtn').onclick = closeAuthModal;
  $('#closeMovieBtn').onclick = closeMovieModal;

  // Click outside modal backdrop to close
  $$('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        if (backdrop.id === 'movieDetailsModal') closeMovieModal();
        else if (backdrop.id === 'searchModal') closeSearchModal();
        else if (backdrop.id === 'authModal') closeAuthModal();
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMovieModal();
      closeSearchModal();
      closeAuthModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearchModal();
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openSearchModal();
    }
    if (e.key === ' ' && $('#movieDetailsModal').classList.contains('open') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      const vid = $('#cinemaVideo');
      if (vid) {
        if (vid.paused) vid.play();
        else vid.pause();
      }
    }
  });

  // Sticky topbar scroll listener
  window.addEventListener('scroll', () => {
    const topbar = $('#topbar');
    if (topbar) {
      topbar.classList.toggle('scrolled', window.scrollY > 30);
    }
  }, { passive: true });

  // Handle URL hashtag deep linking (e.g. #movie=2)
  function handleHashNavigation() {
    const hash = window.location.hash;
    if (hash.startsWith('#movie=')) {
      const movieId = hash.replace('#movie=', '');
      if (movieId) openMovie(Number(movieId));
    }
  }

  // Startup sequence
  window.addEventListener('DOMContentLoaded', () => {
    applyTheme(activeTheme);
    const yearSpan = $('#currentYear');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    const onIcon = $('#sfxIconOn');
    const offIcon = $('#sfxIconOff');
    if (onIcon && offIcon) {
      onIcon.style.display = sfxEnabled ? 'block' : 'none';
      offIcon.style.display = sfxEnabled ? 'none' : 'block';
    }

    initUserSession();
    loadAllMovies();
    handleHashNavigation();
  });

  window.addEventListener('hashchange', handleHashNavigation);

})();
