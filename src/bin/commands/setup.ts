import { setupHooks } from '../../setup/index.js';

export async function setupAction(): Promise<void> {
  await setupHooks();
}
