/** Keep report refreshes from competing with an active CSV commit. */
let activeSaves = 0;
const listeners = new Set<() => void>();

export const isTripImportSaving = () => activeSaves > 0;
export const subscribeTripImportActivity = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function beginTripImportSave() {
  activeSaves++;
  listeners.forEach(listener => listener());
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeSaves--;
    listeners.forEach(listener => listener());
  };
}
