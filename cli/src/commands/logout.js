import { clearCredentials } from '../auth.js';

export function logoutCommand() {
  clearCredentials();
  console.log('Logged out.');
}
