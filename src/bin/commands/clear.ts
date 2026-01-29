import { clearSessions } from '../../store/file-store.js';

export function clearAction(): void {
  clearSessions();
  console.log('Sessions cleared');
}
