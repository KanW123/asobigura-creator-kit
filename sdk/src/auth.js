import { sendRequest, onPush } from './messaging.js';

export async function getUser() {
  return sendRequest('auth.getUser');
}

export async function requestLogin() {
  return sendRequest('auth.requestLogin');
}

export function onAuthChange(callback) {
  return onPush('auth_change', callback);
}
