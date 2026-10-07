import { apiRequest } from '../api.js';

export async function statusCommand() {
  const { submissions } = await apiRequest('/submissions/mine');

  if (!submissions || submissions.length === 0) {
    console.log('No submissions found.');
    return;
  }

  console.log(`\n  ${'TITLE'.padEnd(25)} ${'VERSION'.padEnd(10)} ${'STATUS'.padEnd(12)} ${'DATE'.padEnd(12)} NOTES`);
  console.log('  ' + '-'.repeat(80));

  for (const s of submissions) {
    const date = new Date(s.created_at).toLocaleDateString();
    const notes = s.rejection_reason || (s.game_id ? `game:${s.game_id}` : '');
    console.log(
      `  ${(s.title || '').padEnd(25)} ${('v' + (s.version || '?')).padEnd(10)} ${(s.status || '').toUpperCase().padEnd(12)} ${date.padEnd(12)} ${notes}`
    );
  }
  console.log();
}
