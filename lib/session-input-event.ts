export const SESSION_INPUT_EVENT = "pi-web:session-input";

interface SessionInputEventDetail {
  sessionId: string;
}

declare global {
  interface WindowEventMap {
    [SESSION_INPUT_EVENT]: CustomEvent<SessionInputEventDetail>;
  }
}

export function announceSessionInput(sessionId: string): void {
  window.dispatchEvent(new CustomEvent<SessionInputEventDetail>(SESSION_INPUT_EVENT, {
    detail: { sessionId },
  }));
}
