#!/usr/bin/env node
'use strict';

// 可选专家只读解析：无快照、缓存、网络、安装或同步。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const NAME = 'echarts-viz-planner';
const LIMIT = 24 * 1024 * 1024;
const REQUIRED = ['SKILL.md', 'capabilities.json', 'catalog/index.md', 'references/api-contract.md', 'schemas/plan.schema.json', 'scripts/validate_plan.py'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const allowed = p => ['SKILL.md', 'capabilities.json', 'LICENSE'].includes(p)
  || /^(catalog|references|schemas|templates)\//.test(p)
  || /^scripts\/(validate_plan|profile_data|check_version)\.py$/.test(p);

function safePath(p) {
  if (typeof p !== 'string' || !p || p.includes('\\') || p.includes('\0') || p.startsWith('/')
      || p.split('/').some(v => !v || v === '.' || v === '..') || !allowed(p)) {
    throw new Error(`非法资源路径：${p}`);
  }
  return p;
}

function collect(source) {
  const root = fs.realpathSync(source);
  const files = {};
  let bytes = 0;
  function walk(relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`运行资源不允许符号链接：${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) walk(relative ? `${relative}/${name}` : name);
    } else if (stat.isFile() && allowed(relative)) {
      safePath(relative);
      if (stat.size > LIMIT || (bytes += stat.size) > LIMIT) throw new Error('源码超过 24 MiB 限制');
      const raw = fs.readFileSync(absolute);
      const value = raw.toString('utf8');
      if (!Buffer.from(value, 'utf8').equals(raw)) throw new Error(`不是 UTF-8 源码：${relative}`);
      files[relative] = value;
    }
  }
  // 只遍历运行依赖，忽略仓库、测试数据、缓存和用户输入。
  for (const name of ['SKILL.md', 'capabilities.json', 'LICENSE', 'catalog', 'references', 'schemas', 'templates', 'scripts']) {
    const absolute = path.join(root, name);
    if (!fs.existsSync(absolute)) continue;
    if (name === 'scripts') {
      if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('scripts 不允许符号链接');
      for (const script of ['validate_plan.py', 'profile_data.py', 'check_version.py']) {
        if (fs.existsSync(path.join(absolute, script))) walk(`scripts/${script}`);
      }
    } else walk(name);
  }
  return Object.fromEntries(Object.keys(files).sort().map(p => [p, files[p]]));
}

function describe(files) {
  const entries = Object.keys(files).sort().map(p => ({ path: safePath(p), sha256: sha(files[p]), bytes: Buffer.byteLength(files[p]) }));
  return { entries, source_sha256: sha(JSON.stringify(entries)) };
}

function compatible(files) {
  for (const p of REQUIRED) if (!Object.hasOwn(files, p)) throw new Error(`缺少 ${p}`);
  const c = JSON.parse(files['capabilities.json']);
  if (c.name !== NAME || !Array.isArray(c.contract_versions) || !c.contract_versions.includes('1.1')
      || !Array.isArray(c.output_levels) || !c.output_levels.includes('decision') || c.echarts_version !== '6.1.0') {
    throw new Error('需要 echarts-viz-planner 契约 1.1、decision 输出及 ECharts 6.1.0');
  }
  // 运行资源由上游声明，拒绝残缺安装，也不在主技能复制目录知识。
  if (!Array.isArray(c.required_files) || !c.required_files.length) throw new Error('缺少运行资源清单 required_files');
  for (const p of c.required_files) {
    safePath(p);
    if (!Object.hasOwn(files, p)) throw new Error(`运行资源不完整：缺少 ${p}`);
  }
}

function loadPlanner(options = {}) {
  const env = options.env || process.env, home = options.home || os.homedir();
  const explicit = options.planner || env.ECHARTS_VIZ_PLANNER_PATH;
  const candidates = explicit ? [[explicit, options.planner ? 'explicit' : 'environment']] :
    (options.searchPaths || [
      ...['.agents', '.codex', '.claude'].map(dir => path.join(home, dir, 'skills', NAME)),
      ...(env.CODEX_HOME ? [path.join(env.CODEX_HOME, 'skills', NAME)] : [])
    ]).map(p => [p, 'installed']);
  const attempts = [], seen = new Set();
  for (const [candidate, origin] of candidates) {
    if (seen.has(path.resolve(candidate))) continue;
    seen.add(path.resolve(candidate));
    if (!fs.existsSync(candidate)) { attempts.push({ origin, path: candidate, status: 'missing' }); continue; }
    try {
      const root = fs.realpathSync(candidate), files = collect(root);
      compatible(files);
      return { status: 'ok', skill_root: root, skill_file: path.join(root, 'SKILL.md'), origin,
        contract_version: '1.1', output_level: 'decision', source_sha256: describe(files).source_sha256, attempts };
    } catch (error) { attempts.push({ origin, path: candidate, status: 'incompatible', reason: error.message }); }
  }
  return { status: attempts.some(a => a.status === 'incompatible') ? 'incompatible' : 'unavailable', attempts,
    action: '继续使用 references/expression-guide.md 的内置选型；若已采用外部 plan，须恢复记录所绑定的实际资源，不能改填 direct。' };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (['--offline', '--help'].includes(argv[i])) result[argv[i].slice(2)] = true;
    else if (argv[i] === '--planner' && argv[i + 1] && !argv[i + 1].startsWith('--')) result.planner = argv[++i];
    else throw Error('未知参数或缺少值：' + argv[i]);
  }
  return result;
}
if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) console.log('Usage: node scripts/load_viz_planner.cjs [--planner PATH] [--offline]');
    else { const result = loadPlanner(args); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'ok' ? 0 : result.status === 'incompatible' ? 3 : 2; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { loadPlanner, collect, describe, compatible, safePath, sha };
