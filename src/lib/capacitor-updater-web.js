// Web fallback for the optional native Capacitor updater plugin.
// Native builds continue to use the real package through the runtime plugin.
export const CapacitorUpdater = {
  async download() {
    throw new Error('Capacitor updater is unavailable in web mode')
  },
  async set() {
    throw new Error('Capacitor updater is unavailable in web mode')
  },
}
