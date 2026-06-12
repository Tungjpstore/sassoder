export function getImapConnectionPolicy() {
  return {
    rawBodyStorage: 'disabled-in-mvp',
    credentialLocation: 'server-side-encrypted',
  };
}
