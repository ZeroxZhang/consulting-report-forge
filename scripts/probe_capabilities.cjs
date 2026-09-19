#!/usr/bin/env node
'use strict';

// 探测实际本地渲染路线；图像能力必须由调用方实际看随机图片后交回答案验证。
// 不读取凭据、模型配置或环境变量列表，不按模型名称推断视觉通过。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function normalizedShape(value) {
  if (value && typeof value === 'object') value = `${value.color || ''} ${value.shape || ''}`;
  return String(value || '').toLowerCase().replace(/红色|红/g, 'red').replace(/蓝色|蓝/g, 'blue')
    .replace(/绿色|绿/g, 'green').replace(/正方形|方块|方形/g, 'square')
    .replace(/圆形|圆/g, 'circle').replace(/三角形|三角/g, 'triangle').replace(/[^a-z]/g, '');
}

function verifyImageResponse(expected, response) {
  const code = typeof response?.code === 'string' ? response.code.trim() : '';
  const shapes = Array.isArray(response?.shape_left_to_right) ? response.shape_left_to_right.map(normalizedShape) : [];
  const expectedShapes = expected.shape_left_to_right.map(normalizedShape);
  const codeMatches = code === expected.code;
  const shapesMatch = shapes.length === expectedShapes.length && shapes.every((v, i) => v === expectedShapes[i]);
  return {status: codeMatches && shapesMatch ? 'pass' : 'fail', codeMatches, shapesMatch,
    scope: '仅验证调用方返回的随机字符与形状答案；不证明其具备专业排印或全篇视觉审查能力'};
}

function parseArgs(argv) {
  const options = {out: null, verify: null};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--verify') options.verify = argv[++i];
    else if (argv[i] === '--help') options.help = true;
    else if (!options.out) options.out = argv[i];
    else throw Error(`未知参数：${argv[i]}`);
  }
  if (!options.help && !options.out) throw Error('用法：node scripts/probe_capabilities.cjs OUTPUT_DIR [--verify response.json]');
  return options;
}

async function probe(out) {
  fs.mkdirSync(out, {recursive: true});
  const report = {version: 1, createdAt: new Date().toISOString(), checks: [], imageProbe: {status: 'pending'}, status: 'pending'};
  const record = async (name, action) => {
    try { const detail = await action(); report.checks.push({name, status: 'pass', detail}); return detail; }
    catch (error) { report.checks.push({name, status: 'fail', error: String(error.message || error)}); return null; }
  };
  await record('node', () => ({version: process.version, executable: process.execPath}));
  const bundledPython = path.resolve(__dirname, '../.font-venv/bin/python');
  const python = process.env.FONT_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : 'python3');
  await record('fontTools', () => JSON.parse(execFileSync(python, ['-c', 'import sys,fontTools,json;print(json.dumps({"python":sys.version.split()[0],"fontTools":fontTools.__version__}))'], {encoding: 'utf8', timeout: 15000})));
  let pw;
  await record('playwright', () => {
    pw = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
    if (!pw.chromium?.launch) throw Error('模块没有 chromium.launch');
    return {module: process.env.PLAYWRIGHT_MODULE || 'playwright'};
  });
  let html;
  await record('fontEmbedding', () => {
    // font_assets.py 是技能已有入口；显式指定已探测的 Python，不需要全局安装。
    const originalPython = process.env.FONT_PYTHON;
    process.env.FONT_PYTHON = python;
    try {
      html = require('./pack_fonts.cjs').pack(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:640px 360px;margin:0}*{box-sizing:border-box}body{margin:0;padding:28px;width:640px;height:360px}h1{font-size:32px}p{font-size:24px}.latin{font-family:var(--font-num)}.chinese{font-family:var(--font-body)}</style></head><body><h1 class="slide__title">渲染条件检查 Render</h1><p class="chinese">中文字体与数字同行</p><p class="latin">1,234.5 +6.7% −8.0</p><svg width="520" height="60"><rect x="0" y="10" width="140" height="30" fill="#000080"/><text x="155" y="34" style="font-family:var(--font-num)" font-size="20">140</text></svg></body></html>`, {profile: 'serif-report-bold'});
      fs.writeFileSync(path.join(out, 'render-probe.html'), html);
      const manifest = JSON.parse(html.match(/<script id="deck-font-manifest" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      if (!manifest.faces.length) throw Error('没有嵌入字体');
      return {profile: manifest.profile, faces: manifest.faces.map(f => ({family: f.family, weight: f.weight}))};
    } finally { if (originalPython === undefined) delete process.env.FONT_PYTHON; else process.env.FONT_PYTHON = originalPython; }
  });
  let browser;
  try {
    if (pw && html) {
      await record('chrome', async () => { browser = await pw.chromium.launch({channel: process.env.CHROME_CHANNEL || 'chrome', headless: true}); return {version: browser.version()}; });
      if (browser) {
        const page = await browser.newPage({viewport: {width: 640, height: 360}});
        const network = [], errors = [];
        await page.route(/^https?:/, r => {network.push(r.request().url());return r.abort();});
        page.on('pageerror', e => errors.push(e.message));
        await record('fontsAndScreenshot', async () => {
          await page.goto(pathToFileURL(path.join(out, 'render-probe.html')).href);
          await page.evaluate(() => document.fonts.ready);
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('DOM.enable');await cdp.send('CSS.enable');
          const {root} = await cdp.send('DOM.getDocument');
          const actualFonts = [];
          for (const selector of ['h1', '.chinese', '.latin']) {
            const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector});
            const {fonts} = await cdp.send('CSS.getPlatformFontsForNode', {nodeId});
            if (!fonts.length || fonts.some(f => !f.isCustomFont)) throw Error(`${selector} 未使用完整自定义字体`);
            actualFonts.push({selector, fonts});
          }
          await page.screenshot({path: path.join(out, 'render-probe.png')});
          if (network.length || errors.length) throw Error(`离线请求 ${network.length}，页面错误 ${errors.join(';')}`);
          return {fontStatus: await page.evaluate(() => document.fonts.status), actualFonts, externalRequests: network.length};
        });
        await record('pdfExport', async () => {
          const pdf = path.join(out, 'render-probe.pdf');
          await page.pdf({path: pdf, preferCSSPageSize: true, printBackground: true});
          const info = execFileSync('pdfinfo', [pdf], {encoding: 'utf8', timeout: 15000});
          const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
          const text = execFileSync('pdftotext', [pdf, '-'], {encoding: 'utf8', timeout: 15000});
          const fontLines = execFileSync('pdffonts', [pdf], {encoding: 'utf8', timeout: 15000}).split('\n').slice(2).filter(Boolean);
          if (pages !== 1 || !text.includes('1,234.5') || !text.includes('中文字体')) throw Error('PDF 页数或正文提取不符');
          if (!fontLines.length || fontLines.some(line => line.trim().split(/\s+/).slice(-5,-2).some(v => v !== 'yes'))) throw Error('PDF 字体嵌入/子集/映射不完整');
          return {pages, textExtracted: true, fontsEmbedded: true, sha256: sha(fs.readFileSync(pdf))};
        });
        await record('pdfRasterAndTextGeometry', async () => {
          const rows=await require('./render_pdf_pages.cjs').render(path.join(out,'render-probe.pdf'),out);
          if(rows.length!==1||!rows[0].words.length||!fs.existsSync(rows[0].path))throw Error('实际PDF栅格或文字坐标缺失');
          return {pages:rows.length,words:rows[0].words.length,image:rows[0].path};
        });
        await record('imageChallenge', async () => {
          const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
          const code = Array.from({length: 6}, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
          const expected = {code, shape_left_to_right: ['red square', 'blue circle', 'green triangle']};
          const challenge = `<html><body style="margin:0;background:white"><div style="position:absolute;left:32px;top:16px;font:64px monospace;color:black">${code}</div><svg width="640" height="220" style="position:absolute;top:0;left:0"><rect x="60" y="130" width="40" height="40" fill="#e62323"/><circle cx="190" cy="150" r="20" fill="#2341e6"/><path d="M280 130L320 170H240Z" fill="#239641"/></svg></body></html>`;
          await page.setViewportSize({width: 640, height: 220});
          await page.setContent(challenge);
          const file = path.join(out, 'vision-challenge.png');
          await page.screenshot({path: file});
          // 答案文件供验证器读取；交给模型的提示只包含 PNG 路径与返回字段，不附答案。
          writeJSON(path.join(out, 'vision-challenge-key.json'), expected);
          report.imageProbe = {status: 'pending', imageFile: file, imageSha256: sha(fs.readFileSync(file)),
            prompt: '实际查看这张 PNG；不要读取其他文件或用 OCR。返回 JSON：code 为六个字符；shape_left_to_right 为从左到右三个颜色与形状。',
            verifyCommand: `node scripts/probe_capabilities.cjs ${out} --verify response.json`};
          return {imageFile: file, sha256: report.imageProbe.imageSha256};
        });
      }
    }
  } finally { if (browser) await browser.close(); }
  report.status = report.checks.some(c => c.status === 'fail') ? 'environment-failed' : 'environment-ready-image-pending';
  writeJSON(path.join(out, 'capabilities.json'), report);
  return report;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {console.log('Usage: node scripts/probe_capabilities.cjs OUTPUT_DIR [--verify response.json]');return;}
  const out = path.resolve(options.out);
  if (options.verify) {
    const report = JSON.parse(fs.readFileSync(path.join(out, 'capabilities.json'), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(out, 'vision-challenge-key.json'), 'utf8'));
    const response = JSON.parse(fs.readFileSync(path.resolve(options.verify), 'utf8'));
    const imageBytes = fs.readFileSync(report.imageProbe.imageFile);
    if (sha(imageBytes) !== report.imageProbe.imageSha256) throw Error('挑战图片版本改变，请重新探测');
    const check = verifyImageResponse(expected, response);
    report.imageProbe = {...report.imageProbe, ...check, responseSha256: sha(fs.readFileSync(path.resolve(options.verify))), checkedAt: new Date().toISOString()};
    report.status = report.checks.some(c => c.status === 'fail') ? 'environment-failed' : check.status === 'pass' ? 'ready' : 'image-probe-failed';
    writeJSON(path.join(out, 'capabilities.json'), report);
    console.log(JSON.stringify({status: report.status, imageProbe: check}, null, 2));
    if (check.status !== 'pass') process.exitCode = 3;
  } else {
    const report = await probe(out);
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'environment-failed') process.exitCode = 2;
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(error.message);process.exitCode = 1;});
module.exports = {probe, verifyImageResponse, normalizedShape, parseArgs};
