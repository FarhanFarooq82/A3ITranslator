const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export interface BackendSessionResponse {
  success: boolean;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  mainLanguage: string;
  otherLanguage: string;
  isPremium: boolean;
  message?: string;
}

export class SessionService {
  private readonly storageKey = 'a3i_session';
  private readonly sessionDuration = 2 * 60 * 60 * 1000; // 2 hours

  getSessionDuration(): number {
    return this.sessionDuration;
  }

  async createSessionOnBackend(mainLanguage: string, otherLanguage: string, isPremium: boolean): Promise<BackendSessionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mainLanguage, otherLanguage, isPremium }),
    });
    if (!response.ok) {
      throw new Error('Failed to create session: ' + response.statusText);
    }
    return await response.json();
  }

  saveSession(id: string, expiry: number, additionalData: Record<string, unknown> = {}): void {
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ 
        id, 
        expiry, 
        timestamp: new Date().toISOString(),
        ...additionalData
      })
    );
  }

  loadSession(): { id: string; expiry: number; timestamp?: string; [key: string]: unknown } | null {
    const sessionData = localStorage.getItem(this.storageKey);
    if (!sessionData) return null;

    try {
      const session = JSON.parse(sessionData);
      if (Date.now() < session.expiry) {
        return session;
      }
      this.clearSession();
      return null;
    } catch (e) {
      console.error('Error parsing session data:', e);
      this.clearSession();
      return null;
    }
  }

  clearSession(): void {
    localStorage.removeItem(this.storageKey);
  }

  isValidSession(session: { id: string; expiry: number }): boolean {
    return Date.now() < session.expiry;
  }
}
