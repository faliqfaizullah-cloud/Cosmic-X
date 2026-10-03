import { readFile } from 'node:fs/promises';
import { readTags, guessFromFilename } from '../www/js/tags.js';
import assert from 'node:assert/strict';

const dir = new URL('./fixtures/', import.meta.url);
const load = async (n) => new Blob([await readFile(new URL(n, dir))]);
const isJpeg = (d) => d[0] === 0xff && d[1] === 0xd8;
const isPng = (d) => d[0] === 0x89 && d[1] === 0x50;

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('ok  -', name); };

await t('ID3v2.3 mp3: text + cover', async () => {
  const r = await readTags(await load('t_v23.mp3'));
  assert.equal(r.title, 'Midnight Drive'); assert.equal(r.artist, 'Neon Atlas');
  assert.equal(r.album, 'Cosmic Roads'); assert.equal(r.year, '2024'); assert.equal(r.track, 3);
  assert.ok(r.picture && isJpeg(r.picture.data), 'jpeg cover');
});
await t('ID3v2.4 mp3: unicode + cover', async () => {
  const r = await readTags(await load('t_v24.mp3'));
  assert.equal(r.title, 'Ünïcode Títle ✨'); assert.equal(r.artist, 'Björk Test');
  assert.ok(r.picture && isJpeg(r.picture.data));
});
await t('M4A: text + covr', async () => {
  const r = await readTags(await load('t.m4a'));
  assert.equal(r.title, 'M4A Song'); assert.equal(r.artist, 'Mp4 Artist');
  assert.equal(r.album, 'Mp4 Album'); assert.equal(r.year, '2023');
  assert.ok(r.picture && isJpeg(r.picture.data));
});
await t('FLAC: vorbis comment + PNG picture', async () => {
  const r = await readTags(await load('t.flac'));
  assert.equal(r.title, 'Flac Song'); assert.equal(r.artist, 'Flac Artist'); assert.equal(r.album, 'Flac Album');
  assert.ok(r.picture && isPng(r.picture.data));
});
await t('Ogg Vorbis: text tags', async () => {
  const r = await readTags(await load('t.ogg'));
  assert.equal(r.title, 'Ogg Song'); assert.equal(r.artist, 'Ogg Artist');
});
await t('Opus: text tags', async () => {
  const r = await readTags(await load('t.opus'));
  assert.equal(r.title, 'Opus Song'); assert.equal(r.artist, 'Opus Artist');
});
await t('untagged mp3 does not throw', async () => {
  const r = await readTags(await load('notags.mp3'));
  assert.ok(!r.title && !r.picture);
});
await t('garbage bytes do not throw', async () => {
  const r = await readTags(new Blob([new Uint8Array(500).fill(7)]));
  assert.deepEqual(Object.keys(r).length, 0);
});
await t('filename guess', async () => {
  assert.deepEqual(guessFromFilename('03 - Daft Punk - One More Time'), { artist: 'Daft Punk', title: 'One More Time' });
  assert.deepEqual(guessFromFilename('my_song_name'), { title: 'my song name' });
});
console.log(`\n${pass} tests passed`);
