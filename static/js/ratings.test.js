import { describe, expect, it, vi } from 'vitest';
import { deriveTrackKey, fetchRatings, isValidTrackKey, postRating, shouldSubmitRating } from './ratings.js';

describe('deriveTrackKey', () => {
  it('joins artist and title with a separator', () => {
    expect(deriveTrackKey({ artist: 'Boards of Canada', title: 'Roygbiv' })).toBe(
      'Boards of Canada::Roygbiv'
    );
  });

  it('falls back to empty strings for missing fields', () => {
    expect(deriveTrackKey({})).toBe('::');
    expect(deriveTrackKey({ artist: 'Solo Artist' })).toBe('Solo Artist::');
  });
});

describe('isValidTrackKey', () => {
  it('accepts a non-empty string within the length limit', () => {
    expect(isValidTrackKey('artist::title')).toBe(true);
  });

  it('rejects non-strings, empty strings, and newlines', () => {
    expect(isValidTrackKey(null)).toBe(false);
    expect(isValidTrackKey(undefined)).toBe(false);
    expect(isValidTrackKey('')).toBe(false);
    expect(isValidTrackKey(42)).toBe(false);
    expect(isValidTrackKey('artist::ti\ntle')).toBe(false);
  });

  it('rejects strings over the length limit', () => {
    expect(isValidTrackKey('a'.repeat(501))).toBe(false);
    expect(isValidTrackKey('a'.repeat(500))).toBe(true);
  });
});

describe('shouldSubmitRating', () => {
  it('is false without a track key', () => {
    expect(shouldSubmitRating({ trackKey: null, rating: 'up', currentUserRating: null })).toBe(false);
  });

  it('is false when re-selecting the current rating', () => {
    expect(shouldSubmitRating({ trackKey: 'a::b', rating: 'up', currentUserRating: 'up' })).toBe(false);
  });

  it('is true for a new vote or a changed vote', () => {
    expect(shouldSubmitRating({ trackKey: 'a::b', rating: 'up', currentUserRating: null })).toBe(true);
    expect(shouldSubmitRating({ trackKey: 'a::b', rating: 'down', currentUserRating: 'up' })).toBe(true);
  });
});

function fakeFetch(body, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('fetchRatings', () => {
  it('requests the track key and normalizes the response', async () => {
    const fetchImpl = fakeFetch({ up: 3, down: 1, user_rating: 'up' });

    const result = await fetchRatings(fetchImpl, 'artist::title');

    expect(fetchImpl).toHaveBeenCalledWith('/api/ratings?track_key=artist%3A%3Atitle');
    expect(result).toEqual({ up: 3, down: 1, userRating: 'up' });
  });

  it('defaults missing counts and a null user rating', async () => {
    const fetchImpl = fakeFetch({});

    expect(await fetchRatings(fetchImpl, 'artist::title')).toEqual({
      up: 0,
      down: 0,
      userRating: null,
    });
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = fakeFetch({}, false, 500);

    await expect(fetchRatings(fetchImpl, 'artist::title')).rejects.toThrow('bad status: 500');
  });

  it('throws on an invalid track key without calling fetch', async () => {
    const fetchImpl = fakeFetch({});

    await expect(fetchRatings(fetchImpl, '')).rejects.toThrow('invalid track key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('postRating', () => {
  it('sends the track key, metadata, and rating as JSON', async () => {
    const fetchImpl = fakeFetch({ up: 1, down: 0, user_rating: 'up' });

    const result = await postRating(fetchImpl, {
      trackKey: 'artist::title',
      artist: 'artist',
      title: 'title',
      rating: 'up',
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_key: 'artist::title', artist: 'artist', title: 'title', rating: 'up' }),
    });
    expect(result).toEqual({ up: 1, down: 0, userRating: 'up' });
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = fakeFetch({}, false, 400);

    await expect(
      postRating(fetchImpl, { trackKey: 'artist::title', rating: 'up' })
    ).rejects.toThrow('bad status: 400');
  });

  it('throws on an invalid track key without calling fetch', async () => {
    const fetchImpl = fakeFetch({});

    await expect(postRating(fetchImpl, { trackKey: null, rating: 'up' })).rejects.toThrow(
      'invalid track key'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
