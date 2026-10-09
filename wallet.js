import { getWallets } from '@wallet-standard/app';

// Discovery stays open: new Solana Wallet Standard wallets require no app update.
export function createWalletConnection(onChange, onDiscovery = () => {}) {
  const registry = getWallets();
  let active = null, address = null, off = null, connecting = false;
  const solanaAccount = accounts => accounts?.find(a => a.chains?.some(c => c.startsWith('solana:')));
  function changed(value) { address = value || null; onChange({ address, name: active?.name || null }); }
  function cleanup() { off?.(); off = null; }
  function wallets() {
    const standard = registry.get().filter(w => w.chains.some(c => c.startsWith('solana:')) && w.features['standard:connect']);
    const items = standard.map(wallet => ({ name: wallet.name, wallet, type: 'standard' }));
    const legacy = [
      ['Phantom', window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null)],
      ['Solflare', window.solflare],
      ['Backpack', window.backpack?.solana || (window.backpack?.isBackpack ? window.backpack : null)],
    ];
    for (const [name, wallet] of legacy) if (wallet?.connect && !items.some(w => w.name.toLowerCase() === name.toLowerCase())) items.push({ name, wallet, type: 'injected' });
    return items.sort((a,b) => a.name.localeCompare(b.name));
  }
  registry.on('register', onDiscovery);
  registry.on('unregister', (...removed) => {
    if (removed.some(w => w === active?.wallet)) { cleanup(); active = null; changed(null); }
    onDiscovery();
  });
  async function disconnect() {
    if (connecting) throw Error('Wait for the wallet connection request to finish.');
    const previous = active;
    if (previous?.type === 'standard') await previous.wallet.features['standard:disconnect']?.disconnect();
    else await previous?.wallet.disconnect?.();
    cleanup(); active = null; changed(null);
  }
  async function connect(item) {
    if (connecting) throw Error('A wallet connection request is already open.');
    if (active) await disconnect();
    connecting = true;
    let acquired = false;
    try {
      let next;
      if (item.type === 'standard') {
        const response = await item.wallet.features['standard:connect'].connect();
        acquired = true;
        next = solanaAccount(response.accounts)?.address;
        if (!next) throw Error('Select a Solana account in your wallet.');
        active = item;
        off = item.wallet.features['standard:events']?.on('change', ({ accounts }) => {
          if (accounts) changed(solanaAccount(accounts)?.address);
        });
      } else {
        const response = await item.wallet.connect(); acquired = true;
        next = (response?.publicKey || item.wallet.publicKey)?.toString();
        if (!next) throw Error('The wallet did not return a Solana address.');
        active = item;
        const accountChange = key => changed(key?.toString()), disconnected = () => changed(null);
        item.wallet.on?.('accountChanged', accountChange); item.wallet.on?.('disconnect', disconnected);
        off = () => { item.wallet.removeListener?.('accountChanged', accountChange); item.wallet.removeListener?.('disconnect', disconnected); };
      }
      changed(next);
    } catch (error) {
      cleanup(); active = null; changed(null);
      if (acquired) {
        try { if (item.type === 'standard') await item.wallet.features['standard:disconnect']?.disconnect(); else await item.wallet.disconnect?.(); } catch {}
      }
      throw error;
    } finally { connecting = false; }
  }
  return { wallets, connect, disconnect, get connecting() { return connecting; } };
}
