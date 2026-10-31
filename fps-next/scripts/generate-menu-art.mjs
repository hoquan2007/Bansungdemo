// Original, deterministic illustrated thumbnails for the game-mode rail.
// No artwork or files are extracted from the reference website.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../client/public/menu');
const svg = (name, sky, scene) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140" role="img" aria-label="Original ${name} arena artwork">
<defs>
  <linearGradient id="sky" x2=".35" y2="1"><stop stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
  <linearGradient id="shade" x2="0" y2="1"><stop stop-color="#07111b" stop-opacity="0"/><stop offset="1" stop-color="#07111b" stop-opacity=".72"/></linearGradient>
  <filter id="haze"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="320" height="140" fill="url(#sky)"/>
<circle cx="251" cy="25" r="32" fill="#f5e7c8" opacity=".34" filter="url(#haze)"/>
${scene}
<rect width="320" height="140" fill="url(#shade)"/>
<path d="M0 2H320M1 0V140" fill="none" stroke="#fff" stroke-opacity=".13"/>
</svg>`;

const windows = (x, y, rows, columns, dx, dy, color) => Array.from({ length: rows * columns }, (_, i) => {
  const row = Math.floor(i / columns);
  const col = i % columns;
  return `<rect x="${x + col * dx}" y="${y + row * dy}" width="8" height="12" fill="${color}" opacity="${(i * 3) % 7 === 0 ? .33 : .78}"/>`;
}).join('');

const fighter = (x, y, scale = 1, color = '#25363c') => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}">
<path d="M-8-36L-6-46 7-46 10-36 4-30 -6-30Z"/><path d="M-12-30L12-30 16-4 8 4 -9 4 -16-4Z"/>
<path d="M-12-21L-23-8-19-3-7-14 8-18 30-13 32-18 7-25Z"/>
<path d="M-11 0H-2L-5 25-10 45-17 45-14 20ZM3 0H12L16 44H9L5 21Z"/>
<path d="M-19-18L37-22 39-17-10-12Z" fill="#202729"/></g>`;

const contents = {
  duel: svg('sniper duel', ['#98b0bb', '#e3c4a1'], `
  <path d="M0 42L71 32 88 82 0 94Z" fill="#a19b87"/><path d="M0 66L60 48 78 85 0 99Z" fill="#4a5856"/>
  <path d="M105 13L236 22 243 108 104 102Z" fill="#c5b59b"/><path d="M114 24H224V105H114Z" fill="#948e80"/>
  ${windows(122, 31, 3, 6, 17, 23, '#394f59')}
  <path d="M229 15L320 27V97L232 98Z" fill="#918c7f"/>${windows(250, 33, 3, 4, 17, 19, '#38494d')}
  <path d="M0 105L108 83 320 101V140H0Z" fill="#777a71"/><path d="M116 87L300 140H182Z" fill="#c5bd9f" opacity=".48"/>
  <path d="M64 108V69H83V103M249 110V61H264V109" fill="#555e58"/>
  ${fighter(196, 112, .95, '#424b48')}${fighter(60, 113, .72, '#626964')}`),
  squads: svg('rifle squads', ['#9fb9ba', '#e3c0a1'], `
  <path d="M0 30L106 13V110H0Z" fill="#b5a084"/><path d="M114 15L236 21V112H114Z" fill="#d0b79a"/>
  <path d="M241 18L320 11V112H241Z" fill="#a3a18d"/>
  ${windows(15, 39, 3, 4, 22, 26, '#33424a')}${windows(126, 38, 3, 5, 19, 25, '#526365')}${windows(253, 31, 3, 3, 19, 26, '#435257')}
  <path d="M0 118L148 88 320 125V140H0Z" fill="#8e8374"/>
  <path d="M0 90L149 87 163 140H59Z" fill="#595c54" opacity=".7"/>
  ${fighter(102, 112, 1.05, '#435352')}${fighter(197, 111, .92, '#626662')}${fighter(253, 107, .68, '#64716c')}`),
  boreas: svg('surf boreas', ['#699fb7', '#dde9ed'], `
  <path d="M0 70L27 54 51 69 86 18 116 59 147 32 178 69 225 18 267 67 299 44 320 65V140H0Z" fill="#a1bbcb"/>
  <path d="M66 43L86 18 106 43 94 38 88 47 82 38ZM197 50L225 18 252 48 238 42 224 53 215 41Z" fill="#f4f8f7"/>
  <path d="M0 78L44 67 80 79 125 59 159 81 208 58 266 77 320 65V140H0Z" fill="#e9f0ee"/>
  <path d="M0 91Q68 76 132 94T320 86V140H0" fill="#b9d0d6"/>
  <path d="M0 102L320 77V108L0 134Z" fill="#647e8a"/>
  <path d="M0 104L320 79V86L0 113Z" fill="#e9f5f4"/>
  <path d="M0 119L320 94V104L0 131Z" fill="#a2bac4"/>
  <path d="M0 116L320 91" stroke="#d7edee" stroke-width="2"/>
  <path d="M0 135L320 111V140H0Z" fill="#e9f0f0"/>
  <path d="M0 135L320 111" stroke="#718c97" stroke-width="2"/>
  <path d="M0 139L320 117M0 126L320 102" stroke="#f8ffff" stroke-opacity=".58" stroke-width="1"/>
  <path d="M8 88L8 110M41 85L41 107M81 82L81 104M121 79L121 101M163 76L163 98M208 72L208 95M258 68L258 91M307 64L307 87" stroke="#a3bcc7" stroke-width="1"/>
  <path d="M0 60L30 54 48 61 67 53 96 63 130 52 167 60 215 52 262 60 320 50" fill="none" stroke="#ecf5f6" stroke-opacity=".48" stroke-width="3"/>`),
  utopia: svg('surf utopia', ['#b7a5d4', '#f5d2e0'], `
  <path d="M0 75L58 41 93 70 153 37 206 76 264 38 320 74V140H0Z" fill="#a69ec9"/>
  <path d="M0 88L56 72 115 82 168 62 231 86 320 69V140H0Z" fill="#d8bfdf"/>
  <path d="M0 140L107 68 215 68 320 140Z" fill="#f2c9e4"/>
  <path d="M0 140L112 70 130 70 52 140Z" fill="#bd99d4"/>
  <path d="M256 140L194 70 212 70 320 140Z" fill="#a388c6"/>
  <path d="M52 140L130 70 194 70 256 140Z" fill="#e9b8d9"/>
  <path d="M52 140L129 70 135 70 69 140Z" fill="#d7a1c9"/>
  <path d="M238 140L189 70 195 70 255 140Z" fill="#d49ac8"/>
  <path d="M113 140L149 70 154 70 132 140Z" fill="#e95367"/>
  <path d="M145 140L157 70 160 70 161 140Z" fill="#f27687"/>
  <path d="M181 140L167 70 171 70 199 140Z" fill="#e95367"/>
  <path d="M209 140L177 70 181 70 229 140Z" fill="#f27687"/>
  <path d="M52 140L130 70 194 70 256 140" fill="none" stroke="#fff0ff" stroke-width="2"/>
  <path d="M98 140L145 70M217 140L182 70" stroke="#fff3f7" stroke-opacity=".55" stroke-width="1"/>
  <path d="M4 139L108 69 214 69 316 139" fill="none" stroke="#8d81b4" stroke-opacity=".35" stroke-width="6"/>
  <path d="M116 64H208V69H116Z" fill="#eee4f4"/>
  <path d="M111 61H118V75H111ZM205 61H212V75H205Z" fill="#e6e5ef"/>
  <path d="M151 63L161 55 170 63" fill="none" stroke="#fff6ff" stroke-width="2"/>`),
  practice: svg('aim training', ['#7c8d92', '#c4b5a2'], `
  <path d="M0 12H320V105H0Z" fill="#68787a"/><path d="M6 20H314V99H6Z" fill="#9a9a8e"/>
  <path d="M6 45H314V49H6ZM6 79H314V84H6Z" fill="#5e6664"/>
  <path d="M60 19V97M130 19V97M205 19V97M278 19V97" stroke="#576466" stroke-width="7"/>
  <path d="M0 99H320V140H0Z" fill="#666c69"/>
  <path d="M160 100L112 140H207Z" fill="#c4b49b" opacity=".55"/>
  <g stroke="#f0e3cc" stroke-width="4" fill="#202d35">
  <circle cx="82" cy="65" r="18"/><circle cx="168" cy="51" r="15"/><circle cx="265" cy="72" r="20"/></g>
  <g fill="none" stroke="#e89377" stroke-width="4"><circle cx="82" cy="65" r="9"/><circle cx="168" cy="51" r="8"/><circle cx="265" cy="72" r="11"/></g>
  <path d="M156 85V115M141 100H171" stroke="#dff5e3" stroke-width="2"/>`),
  battle: svg('battle royale', ['#6d9ba7', '#c8c3a6'], `
  <path d="M0 75L45 28 92 80 137 40 180 76 229 22 320 79V140H0Z" fill="#688d82"/>
  <path d="M0 91L65 56 135 95 217 50 320 79V140H0Z" fill="#557c76"/>
  <path d="M0 116L71 86 151 105 228 80 320 110V140H0Z" fill="#3e625a"/>
  <path d="M0 140L84 107 226 111 320 140Z" fill="#8c9778"/>
  <path d="M44 114L61 69 80 114ZM222 121L240 64 261 121ZM274 124L286 85 301 124Z" fill="#2b5148"/>
  ${fighter(153, 122, .9, '#303e3d')}${fighter(200, 123, .65, '#354b48')}
  <path d="M116 27L159 17 199 28 160 35Z" fill="#34494b"/><path d="M157 33L159 52 165 34" fill="#dae6e0"/>`),
};

await mkdir(output, { recursive: true });
await Promise.all(Object.entries(contents).map(([name, content]) => writeFile(resolve(output, `${name}.svg`), content, 'utf8')));
console.log(`Created ${Object.keys(contents).length} original menu illustrations in ${output}`);
