const MAX_TRACK_KEY_LENGTH = 500;

export function deriveTrackKey(nowPlaying) {
  return `${nowPlaying.artist || ''}::${nowPlaying.title || ''}`;
}

export function isValidTrackKey(trackKey) {
  return (
    typeof trackKey === 'string' &&
    trackKey.length > 0 &&
    trackKey.length <= MAX_TRACK_KEY_LENGTH &&
    !/[\r\n]/.test(trackKey)
  );
}

export function normalizeRatingResponse(data) {
  return {
    up: data.up ?? 0,
    down: data.down ?? 0,
    userRating: data.user_rating || null,
  };
}

export async function fetchRatings(fetchImpl, trackKey) {
  if (!isValidTrackKey(trackKey)) throw new Error('invalid track key');
  const res = await fetchImpl(`/api/ratings?track_key=${encodeURIComponent(trackKey)}`);
  if (!res.ok) throw new Error(`bad status: ${res.status}`);
  return normalizeRatingResponse(await res.json());
}

export async function postRating(fetchImpl, { trackKey, artist, title, rating }) {
  if (!isValidTrackKey(trackKey)) throw new Error('invalid track key');
  const res = await fetchImpl('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_key: trackKey, artist, title, rating }),
  });
  if (!res.ok) throw new Error(`bad status: ${res.status}`);
  return normalizeRatingResponse(await res.json());
}

export function shouldSubmitRating({ trackKey, rating, currentUserRating }) {
  return isValidTrackKey(trackKey) && rating !== currentUserRating;
}
