import { createInterface } from 'readline';
import { apiRequest } from '../api.js';

export async function deleteCommand(gameId) {
  // Confirm
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question(`Delete game "${gameId}" and all its data? This cannot be undone. (yes/no): `, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }

  console.log(`Deleting ${gameId}...`);
  const result = await apiRequest(`/developer/games/${encodeURIComponent(gameId)}`, {
    method: 'DELETE',
  });

  console.log(`Deleted: ${result.game_id}`);
}
