// Pre-release checklist shown before a public release (direct publish / promote).
// Non-interactive by design: the command refuses without --confirmed and prints
// this list, so both humans and AI agents see it and must consciously re-run.
export const RELEASE_CHECKLIST = [
  'セーブ形式を変えた場合、旧セーブのマイグレーション（後方互換）に対応した',
  '「検証版をプレイ」で自分の既存セーブが正常に読めることを確認した',
  '起動・対戦・課金導線など主要な動作を確認した',
  '起動時に読む量を確認した（推奨30MB以下。総量の上限は2GiBだが、初回ロードが第一印象）',
];

export function printReleaseChecklist(rerunCmd) {
  console.error('\n⚠ リリース前チェック（未確認のため中止しました）');
  for (const item of RELEASE_CHECKLIST) console.error(`  [ ] ${item}`);
  console.error('\n※ 自動で互換性は判定できません。検証版を自分の既存セーブで起動して確認してください。');
  console.error(`確認できたら再実行: ${rerunCmd}\n`);
}
