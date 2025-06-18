// Utility for backend API calls related to languages and voices
export const BACKEND_BASE_URL = 'http://localhost:8000';

export async function fetchAvailableLanguages() {
  const res = await fetch(`${BACKEND_BASE_URL}/available-languages/`);
  if (!res.ok) throw new Error('Failed to fetch available languages');
  return res.json();
}

export async function fetchAvailableVoices() {
  const res = await fetch(`${BACKEND_BASE_URL}/available-voices/`);
  if (!res.ok) throw new Error('Failed to fetch available voices');
  return res.json();
}
