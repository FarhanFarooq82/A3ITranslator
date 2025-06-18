export class SessionService {
  private readonly storageKey = 'a3i_session';
  private readonly sessionDuration = 2 * 60 * 60 * 1000; // 2 hours

  getSessionDuration(): number {
    return this.sessionDuration;
  }

  generateSessionId(): string {
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).substring(2, 10)
    );
  }

  saveSession(id: string): void {
    const expiry = Date.now() + this.sessionDuration;
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ id, expiry })
    );
  }

  loadSession(): { id: string; expiry: number } | null {
    const sessionData = localStorage.getItem(this.storageKey);
    if (!sessionData) return null;

    const session = JSON.parse(sessionData);
    if (Date.now() < session.expiry) {
      return session;
    }

    this.clearSession();
    return null;
  }

  clearSession(): void {
    localStorage.removeItem(this.storageKey);
  }

  isValidSession(session: { id: string; expiry: number }): boolean {
    return Date.now() < session.expiry;
  }
}
