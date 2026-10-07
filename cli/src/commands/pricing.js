import { apiRequest } from '../api.js';

// Build the pricing request body from CLI options and POST it.
// Shared by `gameplatform pricing` and the `deploy --pricing ...` post-step.
export async function applyPricing(gameId, options) {
  const model = options.pricing || options.model;
  if (!['free', 'paid', 'stamina'].includes(model)) {
    throw new Error('--pricing/--model must be: free | paid | stamina');
  }

  const body = buildPricingBody(model, options);
  return apiRequest(`/developer/games/${gameId}/pricing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Validate the CLI options and build the request body. Throws on bad input, so
// `deploy` can call it BEFORE uploading (a typo shouldn't cost an upload).
export function buildPricingBody(model, options) {
  const body = { model };
  if (model === 'paid') {
    // 買い切りは ¥直接決済（--price）かコイン決済（--coins）のどちらか一方。
    const hasPrice = options.price !== undefined;
    const hasCoins = options.coins !== undefined;
    if (hasPrice && hasCoins) throw new Error('paid: --price <jpy> と --coins <n> は同時に指定できません（どちらか一方）');
    if (!hasPrice && !hasCoins) throw new Error('paid requires --price <jpy> (>= 50) or --coins <n> (>= 1)');
    if (hasPrice) {
      const price = Number(options.price);
      if (!Number.isInteger(price) || price < 50) throw new Error('--price must be an integer JPY >= 50');
      body.price_jpy = price;
    } else {
      const coins = Number(options.coins);
      if (!Number.isInteger(coins) || coins < 1) throw new Error('--coins must be an integer >= 1');
      body.price_coins = coins;
    }
  } else if (options.coins !== undefined) {
    throw new Error('--coins は --pricing/--model paid のときだけ使えます');
  }
  if (model === 'stamina') {
    const max = parseInt(options.max, 10);
    const regen = parseInt(options.regen, 10);
    if (!max || max < 1) throw new Error('stamina requires --max <n> (>= 1)');
    if (!regen || regen < 1) throw new Error('stamina requires --regen <minutes> (>= 1)');
    body.stamina_max = max;
    body.stamina_regen_minutes = regen;
    body.stamina_refill_price_jpy = options.refill ? parseInt(options.refill, 10) : 0;
    if (options.buyout) body.price_jpy = parseInt(options.buyout, 10);
  }
  return body;
}

export async function pricingCommand(gameId, options) {
  try {
    const res = await applyPricing(gameId, options);
    console.log(`Pricing set: ${gameId} -> ${res.pricing}`);
    if (options.model === 'paid') {
      console.log(options.coins !== undefined ? `  Buyout: ${options.coins} coins` : `  Buyout: ¥${options.price}`);
    }
    if (options.model === 'stamina') {
      console.log(`  Stamina: max ${options.max}, +1 every ${options.regen} min`);
      if (options.refill) console.log(`  Refill: ¥${options.refill} per stamina`);
      if (options.buyout) console.log(`  Buyout (remove limit): ¥${options.buyout}`);
    }
  } catch (err) {
    console.error('Pricing failed:', err.message);
    process.exit(1);
  }
}
