import open from 'open';
import { config } from '../config.js';
import { saveCredentials, loadCredentials, getValidToken } from '../auth.js';
import { startBrowserAuth } from '../browser-auth.js';
export async function loginCommand() {
  if (loadCredentials()?.user && await getValidToken()) {
    console.log('Already logged in. Use logout to switch accounts.'); return;
  }
  const flow = await startBrowserAuth({ config, save: saveCredentials });
  const cancel = () => flow.cancel();
  process.once('SIGINT', cancel);
  try {
    console.log('Open this URL in your browser (expires in 3 minutes):');
    console.log(flow.url);
    open(flow.url).catch(() => console.log('Please open the URL manually.'));
    await flow.result;
    console.log('Login successful.');
  } finally { process.removeListener('SIGINT', cancel); }
}
