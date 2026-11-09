const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, initialState, makeLibrary, safeName, discover } = require('../library.cjs');
const video = { bvid: 'BV17GsezzEyi', title: 'Biblioteca', owner: { name: 'Autor' }, pages: [{ page: 1, part: 'Introdução', duration: 87 }, { page: 2, part: 'Exercício', duration: 61 }] };
test('normaliza link sem rastreadores e sem limitar a parte colada', () => {
  assert.equal(normalizeUrl('https://www.bilibili.com/video/BV17GsezzEyi/?p=12&vd_source=abc'), 'https://www.bilibili.com/video/BV17GsezzEyi/');
  for (const url of ['http://www.bilibili.com/video/BV17GsezzEyi/', 'https://bilibili.com.evil.test/video/BV17GsezzEyi/', 'file:///etc/passwd', 'https://user:secret@bilibili.com/video/BV17GsezzEyi/', 'https://www.bilibili.com:9000/video/BV17GsezzEyi/']) assert.throws(() => normalizeUrl(url));
});

test('reconhece os nove links em português e mantém a playlist inteira', () => {
  const ids=['BV1MKxv6jEJs','BV1esp96NExq','BV1XGUGBkEwv','BV1zNsuzMErW','BV1KxxC6vEjS','BV1uExC6gE2Q','BV1Kyxk6eEfo','BV1YWWDzGEsK','BV17GsezzEyi'];
  for (const id of ids) assert.equal(normalizeUrl(`https://www.bilibili.com/pt/video/${id}/?spm_id_from=333.788.videopod.episodes&vd_source=abc&p=3`),`https://www.bilibili.com/video/${id}/`);
  assert.equal(normalizeUrl('https://www.bilibili.com/pt-BR/video/BV17GsezzEyi/'),'https://www.bilibili.com/video/BV17GsezzEyi/');
  for (const url of ['https://www.bilibili.com/pt/not-video/BV17GsezzEyi/','https://evil.test/pt/video/BV17GsezzEyi/','https://www.bilibili.com/pt/video/BV17GsezzEyi/extra','https://www.bilibili.com/foo/bar/video/BV17GsezzEyi/']) assert.throws(()=>normalizeUrl(url));
});
test('lê estado sem executar JavaScript, com delimitadores dentro de strings', () => {
  const value = { videoData: { ...video, title: '}; \\" { exemplo' } };
  assert.deepEqual(initialState(`<script>window.__INITIAL_STATE__ = ${JSON.stringify(value)};alert(1);</script>`), value);
  assert.throws(() => initialState('<html>captcha</html>'));
});
test('preserva todas as partes e cria endereços distintos', () => {
  const library = makeLibrary(video, normalizeUrl('https://bilibili.com/video/BV17GsezzEyi/'));
  assert.equal(library.entries.length, 2); assert.equal(library.duration, 148);
  assert.equal(library.entries[1].url, 'https://www.bilibili.com/video/BV17GsezzEyi/?p=2');
  assert.equal(library.entries[1].index, 2);
});
test('coleção com seções não duplica episódios', () => {
  const episode = { bvid: 'BV17GsezzEyi', title: 'Aula', page: { page: 1, duration: 87 } };
  const library = makeLibrary({ ...video, ugc_season: { id: 42, title: 'Curso', sections: [{ title: 'Módulo 1', episodes: [episode, episode] }] } }, 'https://www.bilibili.com/video/BV17GsezzEyi/');
  assert.equal(library.entries.length, 1); assert.equal(library.entries[0].section, 'Módulo 1'); assert.equal(library.id, 'season-42');
});
test('nomes de arquivo compatíveis com Windows e caracteres chineses', () => {
  assert.equal(safeName('CON'), '_CON'); assert.equal(safeName('绘画: parte/1.'), '绘画_ parte_1');
  assert.equal(safeName('...'), 'Bilibili'); assert.ok(safeName('a'.repeat(200)).length <= 85);
});
test('bloqueio da plataforma é erro explícito, nunca biblioteca vazia', async () => {
  await assert.rejects(discover('https://www.bilibili.com/video/BV17GsezzEyi/', '', async () => ({ ok: false, status: 412 })), /HTTP 412/);
});
