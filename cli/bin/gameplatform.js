#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
const pkg = createRequire(import.meta.url)('../package.json');
import { loginCommand } from '../src/commands/login.js';
import { deployCommand } from '../src/commands/deploy.js';
import { updateCommand } from '../src/commands/update.js';
import { promoteCommand } from '../src/commands/promote.js';
import { scheduleCommand } from '../src/commands/schedule.js';
import { gamesCommand } from '../src/commands/games.js';
import { statusCommand } from '../src/commands/status.js';
import { logoutCommand } from '../src/commands/logout.js';
import { deleteCommand } from '../src/commands/delete.js';
import { thumbnailCommand } from '../src/commands/thumbnail.js';
import { screenshotCommand } from '../src/commands/screenshot.js';
import { videoCommand } from '../src/commands/video.js';
import { connectCommand, earningsCommand } from '../src/commands/connect.js';
import { salesCommand } from '../src/commands/sales.js';
import { pricingCommand } from '../src/commands/pricing.js';
import { itemsCommand } from '../src/commands/items.js';
import { shareCommand } from '../src/commands/share.js';
import { launchModeCommand } from '../src/commands/launch-mode.js';

const program = new Command();

program
  .name('gameplatform')
  .description('Game Platform CLI — Deploy and manage your games')
  .version(pkg.version);   // package.json と常に一致（1.0.0ハードコード据え置き事故の再発防止）

program
  .command('login')
  .description('Authenticate with Game Platform')
  .option('--browser', 'Login via browser (Google OAuth)')
  .action(loginCommand);

program
  .command('deploy <zip>')
  .description('Submit a new game (optionally set pricing in the same step)')
  .requiredOption('--title <title>', 'Game title')
  .option('--genre <genre>', 'Game genre (new game default: casual; re-deploy: kept unless given)')
  .option('--description <desc>', 'Game description (re-deploy: kept unless given)')
  .option('--ver <ver>', 'Game version (semver, e.g. 1.0.0)', '1.0.0')
  .option('--draft', 'Upload as draft (creator-only). On a re-deploy of a PUBLISHED game this un-publishes it')
  .option('--agree-terms', 'Affirm the creator agreement (required to submit)')
  .option('--pricing <model>', 'Monetization: free | paid | stamina (re-deploy: kept unless given)')
  .option('--price <jpy>', 'Buyout price in JPY (with --pricing paid; Stripe direct payment)')
  .option('--coins <n>', 'Buyout price in coins (with --pricing paid; exclusive with --price)')
  .option('--max <n>', 'Stamina max (with --pricing stamina)')
  .option('--regen <minutes>', 'Minutes to regenerate 1 stamina (with --pricing stamina)')
  .option('--refill <jpy>', 'Price to buy 1 stamina refill, JPY (stamina, optional)')
  .option('--buyout <jpy>', 'Buyout price to remove the limit, JPY (stamina, optional)')
  .option('--items <path>', 'Sync the in-game item catalog from a JSON file (direct ¥ permanent unlocks)')
  .option('--storefront <slugs>', 'Storefront brand(s), comma-separated (default: main = アソビグラ)')
  .option('--launch-mode <mode>', 'Launch mode: iframe (new game default) | top_level (camera/XR); re-deploy: kept unless given')
  .action(deployCommand);

program
  .command('update <game-id> <zip>')
  .description('Submit a game update (version must be different from current)')
  .requiredOption('--ver <ver>', 'New version number (must differ from current)')
  .option('--stage', 'Upload as a creator-only preview version (public keeps the current version)')
  .option('--share', 'Upload as a shared version for press / co-developers (URL + passphrase, login required)')
  .option('--title <title>', 'Also rename the game (updates the store title in the same step)')
  .option('--confirmed', 'Confirm the pre-release checklist (required for direct publish without --stage)')
  .option('--launch-mode <mode>', 'Also set launch mode: iframe | top_level')
  .option('--agree-terms', 'Affirm the current creator agreement (required when switching to top_level)')
  .action(updateCommand);

program
  .command('share <game-id>')
  .description('Show / rotate / stop the shared version link (press, co-developers)')
  .option('--rotate', 'Issue a new passphrase (the old one stops working)')
  .option('--stop', 'Stop sharing (distributed URLs stop working)')
  .action(shareCommand);

program
  .command('launch-mode <game-id> <mode>')
  .description('Set launch mode: iframe (default sandbox) or top_level (camera/XR)')
  .option('--agree-terms', 'Affirm the current creator agreement (required for top_level)')
  .action(launchModeCommand);

program
  .command('promote <game-id>')
  .description('Publish the staged version to the public (staging -> current)')
  // NOTE: --version は commander の組み込みフラグ（program.version）と衝突するので使えない。
  //       実際に踏んで CLI のバージョン番号が表示されただけになった（2026-08-15）。
  .option('--expect <version>', 'The staged version you actually verified (publishes only if it still matches)')
  .option('--confirmed', 'Confirm the pre-release checklist (required to publish)')
  .action(promoteCommand);

program
  .command('schedule <game-id> [time]')
  .description('Schedule a draft to go public at a time (e.g. "2026-10-08 18:00" = JST), or --cancel')
  .option('--confirmed', 'Confirm the pre-release checklist (required to schedule)')
  .option('--cancel', 'Cancel the schedule (the game stays a draft)')
  .action(scheduleCommand);

program
  .command('connect')
  .description('Set up / check Stripe Connect (payouts). Prints an onboarding URL for the one human KYC step.')
  .action(connectCommand);

program
  .command('earnings')
  .description('Show your sales and payout status')
  .action(earningsCommand);

program
  .command('sales [game-id]')
  .description('List every real payment across your games (buyout / item / stamina) — the authoritative payment record')
  .action(salesCommand);

program
  .command('pricing <game-id>')
  .description('Set monetization (free / buyout in JPY or coins / stamina)')
  .requiredOption('--model <model>', 'free | paid | stamina')
  .option('--price <jpy>', 'Buyout price in JPY (paid; Stripe direct payment)')
  .option('--coins <n>', 'Buyout price in coins (paid; exclusive with --price)')
  .option('--max <n>', 'Stamina max (stamina)')
  .option('--regen <minutes>', 'Minutes to regenerate 1 stamina (stamina)')
  .option('--refill <jpy>', 'Price to buy 1 stamina refill, JPY (stamina, optional)')
  .option('--buyout <jpy>', 'Buyout price to remove the limit, JPY (stamina, optional)')
  .action(pricingCommand);

program
  .command('items <game-id>')
  .description('Sync the in-game item catalog from a JSON file (declarative), or --list to view')
  .option('--file <path>', 'Items JSON file (default: items.json)')
  .option('--list', 'Show the current catalog instead of syncing')
  .action(itemsCommand);

program
  .command('games')
  .description('List your games')
  .action(gamesCommand);

program
  .command('status')
  .description('Check submission status')
  .action(statusCommand);

program
  .command('delete <game-id>')
  .description('Delete your game and all its data')
  .action(deleteCommand);

program
  .command('thumbnail <game-id> <image>')
  .description('Upload game thumbnail (png/jpg/webp, max 2MB)')
  .action(thumbnailCommand);

program
  .command('screenshot <game-id> <image>')
  .description('Add a screenshot to the game gallery (png/jpg/webp, max 4MB, up to 8). Run multiple times for multiple shots.')
  .action(screenshotCommand);

program
  .command('video <game-id> <video>')
  .description('Upload a short preview video (mp4/webm, max 20MB) for the detail page')
  .action(videoCommand);

program
  .command('logout')
  .description('Clear saved credentials')
  .action(logoutCommand);

program.parse();
