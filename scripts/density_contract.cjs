/* 共享的页面证据密度合同：蓝图、pages.json 与 QA 使用同一组角色和下限，避免规则漂移。 */
'use strict';

const PROFILES = ['dense', 'balanced', 'sparse'];
const ROLES = ['primary', 'support', 'context', 'implication'];
const minimumUnits = profile => profile === 'dense' ? 3 : profile === 'balanced' ? 2 : 1;
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

function validate(density, label = 'density') {
  const errors = [];
  if (!density || typeof density !== 'object' || Array.isArray(density)) return [label + ' 缺失：须声明 dense/balanced/sparse、证据单元与留白意图'];
  if (!PROFILES.includes(density.profile)) errors.push(label + '.profile 须为 ' + PROFILES.join('/'));
  if (!norm(density.spaceIntent) || norm(density.spaceIntent).length < 12) errors.push(label + '.spaceIntent 须说明至少12字的留白/版面用途，不能只写“美观”或“呼吸感”');
  if (!Array.isArray(density.evidenceUnits) || !density.evidenceUnits.length) errors.push(label + '.evidenceUnits 须为非空数组：写明主展品与支持证据的实际作用');
  else {
    const roles = new Set();
    density.evidenceUnits.forEach((unit, index) => {
      const where = label + '.evidenceUnits[' + index + ']';
      if (!unit || typeof unit !== 'object') { errors.push(where + ' 须为对象'); return; }
      if (!ROLES.includes(unit.role)) errors.push(where + ' role 须为 ' + ROLES.join('/'));
      else if (roles.has(unit.role)) errors.push(where + ' role 重复：' + unit.role + '；同一角色合并为一个真实内容簇');
      else roles.add(unit.role);
      if (!norm(unit.purpose) || norm(unit.purpose).length < 8) errors.push(where + ' purpose 须说明至少8字的可见证据作用');
    });
    const minimum = minimumUnits(density.profile);
    if (!roles.has('primary')) errors.push(label + '.evidenceUnits 必须恰有一个 role="primary" 的主展品');
    if (density.evidenceUnits.length < minimum) errors.push(label + '.profile="' + density.profile + '" 至少需要 ' + minimum + ' 个不重复的证据单元；不要用拉伸容器或重复文字凑数');
    if (density.profile === 'dense' && !roles.has('implication')) errors.push(label + '.profile="dense" 必须有 role="implication"，把主图转换为可行动的判断、边界或取舍');
  }
  if (density.profile === 'sparse' && (!norm(density.sparseReason) || norm(density.sparseReason).length < 12)) errors.push(label + '.sparseReason 须说明至少12字：为什么减少信息比增加证据更有助判断');
  return errors;
}

module.exports = {PROFILES, ROLES, minimumUnits, norm, validate};
