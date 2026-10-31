// A high-detail tactical rig currently has one hand-mounted rifle. Keep a
// firearm silhouette for other equipped guns until matching third-person
// models are fitted, while never showing a rifle for a melee weapon.
export function selectHeldWeapon(held, preferred, tactical, weaponType) {
  if (preferred && held.has(preferred)) return preferred;
  if (tactical && weaponType && weaponType !== 'melee' && held.has('AK')) return 'AK';
  return null;
}
