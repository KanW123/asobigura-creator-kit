import { sendRequest } from './messaging.js';

export async function saveProgress({ slot = 0, data, saveVersion = 1 }) {
  return sendRequest('saves.put', { slot, data, saveVersion });
}

export async function loadProgress({ slot = 0 } = {}) {
  return sendRequest('saves.get', { slot });
}

export async function listSaveSlots() {
  return sendRequest('saves.list');
}
