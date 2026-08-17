const audio = document.getElementById('audio');
const streamUrl = audio.dataset.streamUrl;
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const statusEl = document.getElementById('status');
const volume = document.getElementById('volume');
const sourceQualityEl = document.getElementById('sourceQuality');
const npCover = document.getElementById('npCover');
const npTitle = document.getElementById('npTitle');
const npArtist = document.getElementById('npArtist');
const npAlbum = document.getElementById('npAlbum');
const recentList = document.getElementById('recentList');
const thumbUpBtn = document.getElementById('thumbUpBtn');
const thumbDownBtn = document.getElementById('thumbDownBtn');
const upCount = document.getElementById('upCount');
const downCount = document.getElementById('downCount');
const COVER_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg';
let lastTrackKey = null;
let currentTrackMeta = { artist: '', title: '' };

let currentUserRating = null;

function updateRatingUI(data) {
  upCount.textContent = data.up ?? 0;
  downCount.textContent = data.down ?? 0;
  currentUserRating = data.user_rating || null;
  thumbUpBtn.classList.toggle('active', currentUserRating === 'up');
  thumbDownBtn.classList.toggle('active', currentUserRating === 'down');
  thumbUpBtn.disabled = false;
  thumbDownBtn.disabled = false;
}

async function loadRatings(trackKey) {
  try {
    const res = await fetch(`/api/ratings?track_key=${encodeURIComponent(trackKey)}`);
    if (!res.ok) throw new Error('bad status');
    updateRatingUI(await res.json());
  } catch (e) {
    // leave last known state, retry on next track/poll
  }
}

async function submitRating(rating) {
  if (!lastTrackKey || rating === currentUserRating) return;
  thumbUpBtn.disabled = true;
  thumbDownBtn.disabled = true;
  try {
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track_key: lastTrackKey,
        artist: currentTrackMeta.artist,
        title: currentTrackMeta.title,
        rating,
      }),
    });
    updateRatingUI(await res.json());
  } catch (e) {
    await loadRatings(lastTrackKey);
  }
}

thumbUpBtn.addEventListener('click', () => submitRating('up'));
thumbDownBtn.addEventListener('click', () => submitRating('down'));

document.getElementById('year').textContent = new Date().getFullYear();

npCover.addEventListener('load', () => { npCover.style.display = 'block'; });
npCover.addEventListener('error', () => { npCover.style.display = 'none'; });

audio.volume = volume.value / 100;

let elapsedSeconds = 0;
let elapsedTimer = null;
let isLive = false;
let pendingStatusText = 'Connecting…';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderStatus() {
  if (isLive) {
    statusEl.textContent = `${formatElapsed(elapsedSeconds)} / Live`;
  } else {
    statusEl.textContent = pendingStatusText;
  }
  statusEl.classList.toggle('live', isLive);
}

function startElapsedTimer() {
  if (elapsedTimer) return;
  elapsedTimer = setInterval(() => {
    elapsedSeconds++;
    renderStatus();
  }, 1000);
}

function stopElapsedTimer() {
  clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function resetElapsedTimer() {
  stopElapsedTimer();
  elapsedSeconds = 0;
  renderStatus();
}

function setStatus(text, live) {
  pendingStatusText = text;
  isLive = !!live;
  renderStatus();
}

function attachStream() {
  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => setStatus('Ready', false));
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) setStatus('Stream error — retrying…', false);
    });
  } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
    audio.src = streamUrl;
    setStatus('Ready', false);
  } else {
    setStatus('HLS not supported in this browser', false);
  }
}

attachStream();

playBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
});

audio.addEventListener('playing', () => {
  playIcon.style.display = 'none';
  pauseIcon.style.display = '';
  setStatus('Live', true);
  startElapsedTimer();
});

audio.addEventListener('pause', () => {
  playIcon.style.display = '';
  pauseIcon.style.display = 'none';
  setStatus('Paused', false);
  stopElapsedTimer();
});

audio.addEventListener('ended', () => {
  stopElapsedTimer();
  resetElapsedTimer();
});

audio.addEventListener('waiting', () => setStatus('Buffering…', false));

volume.addEventListener('input', () => {
  audio.volume = volume.value / 100;
});

function renderRecent(data) {
  recentList.textContent = '';
  const tracks = [1, 2, 3, 4, 5]
    .map((n) => ({ artist: data[`prev_artist_${n}`], title: data[`prev_title_${n}`] }))
    .filter((t) => t.artist || t.title);

  if (!tracks.length) {
    const li = document.createElement('li');
    li.textContent = 'No history yet.';
    recentList.appendChild(li);
    return;
  }

  tracks.forEach((t) => {
    const li = document.createElement('li');
    const artist = document.createElement('span');
    artist.className = 'recent-artist';
    artist.textContent = t.artist ? `${t.artist}: ` : '';
    const title = document.createElement('span');
    title.className = 'recent-title';
    title.textContent = t.title || '';
    li.appendChild(artist);
    li.appendChild(title);
    recentList.appendChild(li);
  });
}

async function refreshNowPlaying() {
  try {
    const res = await fetch('/api/nowplaying');
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();

    npArtist.textContent = data.artist || 'Unknown artist';
    npTitle.textContent = data.date ? `${data.title || 'Unknown title'} (${data.date})` : (data.title || 'Unknown title');
    npAlbum.textContent = data.album || '';

    const trackKey = `${data.artist || ''}::${data.title || ''}`;
    if (trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      currentTrackMeta = { artist: data.artist || '', title: data.title || '' };
      npCover.style.display = 'none';
      npCover.src = `${COVER_URL}?t=${encodeURIComponent(trackKey)}`;
      loadRatings(trackKey);
    }

    if (data.bit_depth && data.sample_rate) {
      sourceQualityEl.textContent = `Source quality: ${data.bit_depth}-bit / ${(data.sample_rate / 1000).toFixed(1)} kHz`;
    }

    renderRecent(data);
  } catch (e) {
    // keep last known values, retry on the next poll
  }
}

refreshNowPlaying();
setInterval(refreshNowPlaying, 15000);
