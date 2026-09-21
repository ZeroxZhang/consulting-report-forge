#!/bin/sh
# 建可复用的字体子集环境：npm ci 之后跑一次，pack_fonts.cjs 会自动使用它。
# 成稿及其交付不依赖本步骤；只有构建（字体子集嵌入）需要。
#
# 解释器不写死：显式 FONT_PYTHON > 由高到低探测具名解释器 > 裸 python3。
# FONT_PYTHON 与 pack_fonts.cjs、probe_capabilities.cjs 是同一个覆盖口，
# 在这里指过一次，后续构建会沿用同一个解释器。
#
# 注意：本文件含中文，变量展开一律写 ${VAR}——POSIX shell 会把全角标点的
# 多字节字节当成变量名的一部分，紧邻中文的裸 $VAR 会被读成一个不存在的变量名。
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
venv="${root}/.font-venv"

# 版本下限的唯一来源：scripts/requirements-fonts.txt 里 zopfli 0.4.x 要求 Python ≥3.10。
# 依赖升级后若下限变化，只改这两行——探测、复用判断与报错都读它们。
MIN_MAJOR=3
MIN_MINOR=10

has_min_version() {
  "$1" -c "import sys; sys.exit(0 if sys.version_info[:2] >= (${MIN_MAJOR}, ${MIN_MINOR}) else 1)" >/dev/null 2>&1
}

candidates() {
  printf '%s\n' python3.13 python3.12 python3.11 python3.10 python3 python
}

# 已有 venv 的解释器够用就直接复用，只刷新依赖，不重建。
if [ -x "${venv}/bin/python" ] && has_min_version "${venv}/bin/python"; then
  :
else
  interpreter=''
  if [ -n "${FONT_PYTHON:-}" ]; then
    # 显式覆盖是权威的：指错了就报错，不悄悄换成别的解释器。
    if command -v "${FONT_PYTHON}" >/dev/null 2>&1 && has_min_version "${FONT_PYTHON}"; then
      interpreter="${FONT_PYTHON}"
    else
      echo "[setup-fonts] FONT_PYTHON=${FONT_PYTHON} 不可用，或低于 Python ${MIN_MAJOR}.${MIN_MINOR}。" >&2
    fi
  else
    for c in $(candidates); do
      if command -v "${c}" >/dev/null 2>&1 && has_min_version "${c}"; then
        interpreter="${c}"
        break
      fi
    done
  fi

  if [ -z "${interpreter}" ]; then
    echo "[setup-fonts] 找不到满足要求的 Python 解释器（本技能需要 ≥ ${MIN_MAJOR}.${MIN_MINOR}）。" >&2
    echo "" >&2
    echo "  已找到的解释器：" >&2
    for c in $(candidates); do
      if command -v "${c}" >/dev/null 2>&1; then
        if has_min_version "${c}"; then mark='可用'; else mark='版本不足'; fi
        printf '    %-34s %-16s %s\n' "$(command -v "${c}")" "$("${c}" --version 2>&1)" "${mark}" >&2
      fi
    done
    echo "" >&2
    echo "  处理方式（任选其一）：" >&2
    echo "    1) 把可用的解释器显式指给本技能，再重跑本命令：" >&2
    echo "         FONT_PYTHON=/path/to/python3.11 npm run setup-fonts" >&2
    echo "    2) 先装一个 ≥ ${MIN_MAJOR}.${MIN_MINOR} 的解释器（uv / pyenv / 系统包管理器），再重跑。" >&2
    echo "" >&2
    echo "  这一步只为构建期字体子集嵌入，不影响已生成的成稿与交付。" >&2
    echo "  FONT_PYTHON 同时被 pack_fonts.cjs 与 probe_capabilities.cjs 读取，指一次即可。" >&2
    exit 1
  fi

  # 旧 venv 留着会让 pip 反复失败（解释器版本不足时装不上钉死的依赖），先清掉再建。
  if [ -e "${venv}" ]; then
    echo "[setup-fonts] 已有 ${venv} 的解释器低于 Python ${MIN_MAJOR}.${MIN_MINOR}，重建"
    rm -rf "${venv}"
  fi

  echo "[setup-fonts] 创建 ${venv}（使用 ${interpreter}）"
  if ! "${interpreter}" -m venv "${venv}"; then
    echo "[setup-fonts] 用 ${interpreter} 创建 venv 失败：该解释器可能未带 venv 模块（Debian/Ubuntu 需另装 python3-venv）。" >&2
    exit 1
  fi
fi

# uv 等工具建的 venv 不带 pip；缺了就引导一个，否则下面无法装依赖。
if ! "${venv}/bin/python" -m pip --version >/dev/null 2>&1; then
  echo "[setup-fonts] ${venv} 无 pip，用 ensurepip 引导"
  "${venv}/bin/python" -m ensurepip --upgrade
fi

# 装进 venv 只影响本技能，不需要 --break-system-packages，也不动系统 Python（PEP 668）。
# 一律走 python -m pip：ensurepip 在部分 venv 里只生成 pip3，不生成 pip。
"${venv}/bin/python" -m pip install --quiet --upgrade pip
"${venv}/bin/python" -m pip install --quiet -r "${root}/scripts/requirements-fonts.txt"

echo "[setup-fonts] 完成：${venv}/bin/python"
echo "[setup-fonts] 验证：node scripts/probe_capabilities.cjs /tmp/deck-probe"
