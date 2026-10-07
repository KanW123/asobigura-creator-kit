import { apiRequest } from '../api.js';

// `gameplatform connect` — one smart command for the whole Stripe Connect setup.
// AI-friendly: the agent runs it, hands the printed URL to the human for the one
// unavoidable human step (identity/bank KYC), then runs it again to confirm.
//   - no account yet  -> creates the Express account, prints the onboarding URL
//   - onboarding open  -> prints the resume URL
//   - complete         -> prints status + balances
export async function connectCommand() {
  const status = await apiRequest('/developer/connect/status');

  if (!status.connected) {
    console.log('Stripe Connect: not set up yet. Creating your connected account...');
    const { onboarding_url } = await apiRequest('/developer/connect/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    printOnboarding(onboarding_url);
    return;
  }

  if (status.onboarding_status !== 'complete') {
    console.log('Stripe Connect: onboarding not finished yet.');
    const { onboarding_url } = await apiRequest('/developer/connect/onboarding-link');
    printOnboarding(onboarding_url);
    return;
  }

  // Complete.
  console.log(
    `\n  Stripe Connect: COMPLETE` +
    (status.payouts_enabled
      ? '  (payouts enabled)'
      : '  (payouts NOT enabled yet — open the Stripe dashboard and finish the remaining items)')
  );
  console.log(`  Earned   : ¥${(status.total_earned || 0).toLocaleString()}`);
  console.log(`  Unsettled: ¥${(status.unsettled_balance || 0).toLocaleString()}  (paid out automatically on the 1st of each month)`);
  console.log(`  Paid out : ¥${(status.total_settled || 0).toLocaleString()}`);
  console.log(`\n  You're ready to publish. Next:  gameplatform deploy <your-game.zip> --title "..." --pricing ...\n`);
}

function printOnboarding(url) {
  console.log('');
  console.log('  ===================================================================');
  console.log('  HUMAN STEP REQUIRED (an AI cannot do this — it is legal identity KYC)');
  console.log('  Open this URL in a browser and complete identity + bank verification:');
  console.log('');
  console.log('     ' + url);
  console.log('');
  console.log('  - Already have a Stripe account? It becomes a quick "authorize".');
  console.log('  - New to Stripe? ~5 minutes (ID + bank account).');
  console.log('  When finished, run:  gameplatform connect   (to confirm it says COMPLETE)');
  console.log('  ===================================================================');
  console.log('');
}

// `gameplatform earnings` — show sales + payout status.
export async function earningsCommand() {
  const [status, earnings] = await Promise.all([
    apiRequest('/developer/connect/status').catch(() => null),
    apiRequest('/developer/earnings'),
  ]);
  const { total_earned = 0, total_settled = 0, unsettled_balance = 0, by_game = [] } = earnings || {};

  console.log('\n  Earnings');
  console.log('  ' + '-'.repeat(50));
  console.log(`  Total earned : ¥${total_earned.toLocaleString()}`);
  console.log(`  Unsettled    : ¥${unsettled_balance.toLocaleString()}  (next monthly payout; last 7 days held for refunds)`);
  console.log(`  Paid out     : ¥${total_settled.toLocaleString()}`);
  if (status && status.connected && !status.payouts_enabled) {
    console.log('  ! payouts not enabled yet — run "gameplatform connect" to finish onboarding.');
  }
  if (by_game.length) {
    console.log('\n  Per game:');
    for (const g of by_game) {
      console.log(`    ${String(g.game_id).padEnd(24)} x${g.count}   gross ¥${g.gross.toLocaleString()}   you ¥${g.net.toLocaleString()}`);
    }
  }
  console.log();
}
