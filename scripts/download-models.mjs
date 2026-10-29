#!/usr/bin/env node
// Tải GLB models từ poly.pizza CDN — tất cả CC0/Public Domain
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'public', 'assets', 'models');
await mkdir(OUT, { recursive: true });

// Source đã xác minh giấy phép:
//  - Quaternius: CC0 / Public Domain
//  - Poly by Google: CC-BY (ghi nguồn trong UI)
const models = [
  // Characters — Quaternius CC0
  { id: 'char_soldier.glb',  pizza: 'PpLF4rt4ah' }, // Character Soldier
  { id: 'char_swat.glb',     pizza: 'Btfn3G5Xv4' }, // SWAT
  // Weapons — Ultimate Guns Pack (25 món)
  { id: 'gun_ak47.glb',      pizza: 'em1Hi9GuCv' }, // AK47
  { id: 'gun_rifle.glb',     pizza: 'Ugy8tjR3Ju' }, // Rifle (Ultimate pack)
  { id: 'gun_smg.glb',       pizza: 'D81P2smzCy' }, // Submachine Gun
  { id: 'gun_pistol.glb',    pizza: 'Y9DSevnvGq' }, // Pistol
  { id: 'gun_sniper.glb',    pizza: 'DcNE0HVdW8' }, // Sniper Rifle
  { id: 'gun_shotgun.glb',   pizza: 'sVTKUSz3m2' }, // Shotgun
  { id: 'gun_scifi_rifle.glb', pizza: 'K2lXTYFSLC' }, // Scifi Assault Rifle
  // Map props (đã xác minh CC0 từ Quaternius/CircuitZ/Kay Lousberg)
  { id: 'prop_crate.glb',    pizza: 'yCBoU0iyOk' }, // Crate - Kay Lousberg
  { id: 'prop_barrel.glb',   pizza: 'zjCQP1TAci' }, // Barrel - Quaternius
  { id: 'prop_container.glb', pizza: 'AILdezfcv1' }, // Cargo Train Container - Quaternius
  { id: 'prop_pine.glb',     pizza: 'gX8WmgkeEm' }, // Pine Tree - Quaternius
  { id: 'prop_rock.glb',     pizza: 'JQxF95498B' }, // Rock Medium - Quaternius
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,*/*'
    }
  });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function findGlbUrl(pizzaId) {
  const html = await fetchText(`https://poly.pizza/m/${pizzaId}`);
  // Poly Pizza model viewer iframe URL
  const m = html.match(/src="(https:\/\/static\.poly\.pizza\/[^"]+\.glb(?:\.br)?)"/);
  if (!m) {
    const m2 = html.match(/https:\/\/static\.poly\.pizza\/[^"]+\.glb/);
    if (m2) return m2[0];
    throw new Error(`No GLB for ${pizzaId}`);
  }
  return m[1].replace(/&amp;/g, '&');
}

async function download(pizzaId, filename) {
  const url = await findGlbUrl(pizzaId);
  console.log(`↓ ${filename}  ←  ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' }
  });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(resolve(OUT, filename), buf);
  console.log(`  saved ${(buf.length / 1024).toFixed(1)} KB`);
}

let ok = 0, fail = 0;
for (const m of models) {
  try {
    await download(m.pizza, m.id);
    ok++;
  } catch (err) {
    console.warn(`✗ ${m.id}: ${err.message}`);
    fail++;
  }
}
console.log(`\nDone: ${ok} OK, ${fail} failed`);
