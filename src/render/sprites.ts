// 코드로 정의한 픽셀 아트 스프라이트 (외부 이미지 없음).
import { hexAbgr } from './renderer';

export interface Sprite {
  w: number;
  h: number;
  data: Uint32Array;
}

export function parseSprite(rows: string[], pal: Record<string, number>): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const data = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? '.';
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) continue;
      data[y * w + x] = hexAbgr(c);
    }
  }
  return { w, h, data };
}

export function rotateCW(s: Sprite): Sprite {
  const out = new Uint32Array(s.w * s.h);
  const w = s.h;
  const h = s.w;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) out[x * w + (s.h - 1 - y)] = s.data[y * s.w + x];
  return { w, h, data: out };
}

// ---------- 플레이어 ----------
const PP: Record<string, number> = {
  h: 0x4a2f8a, H: 0x7656c8, b: 0xe8c050, s: 0xf2c9a0, e: 0x101018, w: 0xe6e6ee,
  r: 0x3448b0, R: 0x5874dc, d: 0x22307a, k: 0x3a2818, g: 0x9a7444,
};
const PTOP = [
  '....hh....',
  '...hhH....',
  '...hHHh...',
  '..hhHHhh..',
  '.bbbbbbbbb',
  '...sssss..',
  '...sssse..',
  '...wwwww..',
  '..rRwwwRr.',
  '..rRRRRRr.',
  '..rgggggr.',
  '..rRRRRrr.',
];
function pf(a: string, b: string): Sprite {
  return parseSprite([...PTOP, a, b], PP);
}
export const PLAYER = {
  idle: [pf('..drrrrrd.', '...k...k..'), parseSprite(['.....h....', ...PTOP.slice(1), '..drrrrrd.', '...k...k..'], PP)],
  walk: [
    pf('..drrrrrd.', '..k....k..'),
    pf('...drrrrd.', '....kk....'),
    pf('..drrrrrd.', '...k....k.'),
    pf('..drrrrd..', '....kk....'),
  ],
  jump: pf('..drrrrrd.', '...kk.kk..'),
  fall: pf('.ddrrrrrdd', '.k......k.'),
  dead: null as unknown as Sprite,
};
PLAYER.dead = rotateCW(PLAYER.idle[0]);

// ---------- 적 ----------
export const SLIME = [
  parseSprite([
    '...GGGG...',
    '..GGggGG..',
    '.GgWegWeg.',
    '.gggggggg.',
    'gggggggggg',
    'gDgggggDgg',
    'DDDDDDDDDD',
  ], { G: 0x9cff7a, g: 0x5ad84a, D: 0x2a9028, W: 0xffffff, e: 0x102010 }),
  parseSprite([
    '..........',
    '...GGGG...',
    '.GGgggGGG.',
    'GgWeggWegg',
    'gggggggggg',
    'gDggggggDg',
    'DDDDDDDDDD',
  ], { G: 0x9cff7a, g: 0x5ad84a, D: 0x2a9028, W: 0xffffff, e: 0x102010 }),
];

const BATP = { o: 0xff8a20, O: 0xffd040, r: 0xc03a10, e: 0xffff90 };
export const BAT = [
  parseSprite([
    'o.........o',
    'oo.......oo',
    'rooo.O.ooor',
    '.rooOeOoor.',
    '...rOOOr...',
    '....r.r....',
  ], BATP),
  parseSprite([
    '...........',
    '....O.O....',
    '...oOeOo...',
    '.rooOOOoor.',
    'ooor.r.rooo',
    'o.........o',
  ], BATP),
];

const SPP = { c: 0xa8e8ff, C: 0xf0fcff, b: 0x5ab0e0, e: 0x103050 };
export const SPIRIT = [
  parseSprite([
    '....C....',
    '...CcC...',
    '..CcccC..',
    '.CcecceC.',
    '.ccccccc.',
    '.bcccccb.',
    '..bcccb..',
    '..b.c.b..',
    '...b.b...',
    '....b....',
  ], SPP),
  parseSprite([
    '....C....',
    '...CcC...',
    '..CcccC..',
    '.CcecceC.',
    '.ccccccc.',
    '.bcccccb.',
    '..bcccb..',
    '.b..c..b.',
    '..b...b..',
    '...b.b...',
  ], SPP),
];

const BOMBP = { k: 0x2a1a0a, n: 0x6a4a2a, N: 0x9a7040, m: 0x808890, e: 0xff3030, f: 0xd0b080, s: 0xffe060 };
export const BOMBER = [
  parseSprite([
    '....s....',
    '....f....',
    '..nnnnn..',
    '.nNNNNNn.',
    '.mmmmmmm.',
    '.nNeNeNn.',
    '.nNNNNNn.',
    '.mmmmmmm.',
    '.nNNNNNn.',
    '..nnnnn..',
    '..k...k..',
  ], BOMBP),
  parseSprite([
    '...s.....',
    '....f....',
    '..nnnnn..',
    '.nNNNNNn.',
    '.mmmmmmm.',
    '.nNeNeNn.',
    '.nNNNNNn.',
    '.mmmmmmm.',
    '.nNNNNNn.',
    '..nnnnn..',
    '...k.k...',
  ], BOMBP),
];

const MAGEP = { p: 0x6a1a2a, P: 0x9a2a3a, q: 0x1a0610, e: 0xffe040, g: 0xd0a040 };
export const MAGE = [
  parseSprite([
    '....pp...',
    '...pPPp..',
    '..pPqqPp.',
    '..pqeqep.',
    '..pqqqqp.',
    '..pPPPPp.',
    '.ppPgPPpp',
    '.pPPgPPPp',
    '.pPPgPPPp',
    '..pPPPPp.',
    '..pPPPPp.',
    '..ppPPpp.',
    '..qq.qq..',
  ], MAGEP),
  parseSprite([
    '....pp...',
    '...pPPp..',
    '..pPqqPp.',
    '..pqeqep.',
    '..pqqqqp.',
    '..pPPPPp.',
    '.ppPgPPpp',
    '.pPPgPPPp',
    '.pPPgPPPp',
    '..pPPPPp.',
    '.pPPPPPp.',
    '.ppPPPppp',
    '..qq..qq.',
  ], MAGEP),
];

const GOLP = { a: 0x6a6670, A: 0x8e8a96, z: 0x45414a, e: 0xff9030, m: 0x4a8a3a };
const GTOP = [
  '....aaaaaa....',
  '...aAAAAAAa...',
  '...aAeAAeAa...',
  '...aAAAAAAa...',
  '....azzzza....',
  '.aaaaAAAAaaaa.',
  'aAAAaAAAAaAAAa',
  'aAAzaAAmAaAzAa',
  'aAAzaAAAAazAAa',
  'aAAaaAmAAaaAAa',
  '.aa.aAAAAa.aa.',
  '.zz.aAAAAa.zz.',
  '....aAAAAa....',
  '....aazzaa....',
];
export const GOLEM = [
  parseSprite([...GTOP, '...aAa..aAa...', '...aAa..aAa...', '...zzz..zzz...'], GOLP),
  parseSprite([...GTOP, '..aAa....aAa..', '..aAa...aAa...', '..zzz...zzz...'], GOLP),
];

// ---------- 오브젝트 ----------
const CHP = { y: 0xd8a830, Y: 0xfff080, N: 0x7a4a22, n: 0x5a3416, k: 0x201008 };
export const CHEST = parseSprite([
  '..yyyyyyyy..',
  '.yNNNNNNNNy.',
  'yNNNNNNNNNNy',
  'yyyyyYYyyyyy',
  'yNNNNYYNNNNy',
  'yNNNNNNNNNNy',
  'ynnnnnnnnnny',
  'yyyyyyyyyyyy',
], CHP);
export const CHEST_OPEN = parseSprite([
  '.yyyyyyyyyy.',
  'yNNNNNNNNNNy',
  'yyyyyyyyyyyy',
  'ykkkkkkkkkky',
  'yNNNNYYNNNNy',
  'yNNNNNNNNNNy',
  'ynnnnnnnnnny',
  'yyyyyyyyyyyy',
], CHP);

export const PEDESTAL = parseSprite([
  '.aaaaaaaaaa.',
  '..AAAAAAAA..',
  '...aaaaaa...',
  '...aAAAAa...',
  '...aAAAAa...',
  '..aaaaaaaa..',
  '.AAAAAAAAAA.',
], { a: 0x5a5060, A: 0x7a7088 });

export const ALTAR = parseSprite([
  '......cc......',
  '.....cCCc.....',
  '....cCwwCc....',
  '.....cCCc.....',
  '......cc......',
  '..............',
  '.aaaaaaaaaaaa.',
  '..AAAAAAAAAA..',
  '...aaaaaaaa...',
  '...aAAAAAAa...',
  '...aAAAAAAa...',
  '..aaaaaaaaaa..',
  '.AAAAAAAAAAAA.',
], { a: 0x5a5060, A: 0x7a7088, c: 0xd04060, C: 0xff7090, w: 0xffe0e8 });
