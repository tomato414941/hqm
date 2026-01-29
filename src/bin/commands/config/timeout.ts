import { getConfigPath, readConfig, setSessionTimeout } from '../../../store/config.js';

export function timeoutAction(minutes?: string): void {
  if (minutes === undefined) {
    const config = readConfig();
    const value = config.sessionTimeoutMinutes;
    if (value === 0) {
      console.log('Session timeout: disabled (sessions persist until TTY closes)');
    } else {
      console.log(`Session timeout: ${value} minutes`);
    }
    console.log(`Config file: ${getConfigPath()}`);
  } else {
    const value = Number.parseInt(minutes, 10);
    if (Number.isNaN(value) || value < 0) {
      console.error('Error: timeout must be a non-negative integer');
      process.exit(1);
    }
    setSessionTimeout(value);
    if (value === 0) {
      console.log('Session timeout disabled (sessions will persist until TTY closes)');
    } else {
      console.log(`Session timeout set to ${value} minutes`);
    }
  }
}
