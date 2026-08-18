---
description: catchup——加载项目事实与 Git 状态,输出续接报告
---

<!-- 一致性机制 version: 2026-08-18 -->

新对话开局,把项目当前状态完整装载进来再继续工作。Agent harness 已经注入 `AGENTS.md`(Codex)或其适配链接 `CLAUDE.md`(Claude Code),**不要再次读取这两份指令文件**。

> 配套:出向命令是 `/同步`。机制见 `一致性机制/机制设计说明.md`。

## 第一层:项目事实

1. 完整读取 `PROJECT.md`——背景、流程、地图、阶段与近期决策的唯一正本。
2. 只检查适配入口的**文件类型与目标**,不读取内容:
   ```bash
   test -f AGENTS.md
   test -L CLAUDE.md && readlink CLAUDE.md
   ```
   健康状态:`AGENTS.md` 是实体文件,`CLAUDE.md` 是相对链接 `AGENTS.md`。
3. `PROJECT.md` 不存在时进入**旧版兼容模式**:读取 `README.md` 判断项目概况,并在报告中明确提示“缺少 PROJECT.md,建议迁移”;不要把 README 永久认定为项目事实正本。

## 第二层:项目状态(git 是事件源)

1. 已沉淀事件:
   ```bash
   git log --oneline -20
   ```
2. 尚未收尾的工作:
   ```bash
   git status --short
   ```
3. 自上次 `/同步` 以来的完整范围(含已 commit 未同步):
   ```bash
   if git rev-parse -q --verify refs/tags/synced >/dev/null; then
     d=$(git diff --stat synced); [ -n "$d" ] && printf '%s\n' "$d" || echo "(已同步:synced 已在 HEAD,无新改动)"
   else
     echo "(无 synced tag,尚未跑过 /同步)"
   fi
   ```
4. 完整读取 `PROJECT.md` 之外的中枢文档(见 `一致性机制/文件联动目录.md` Part A)。`AGENTS.md` / `CLAUDE.md` 已由 harness 注入,跳过内容读取;README 只有列入 Part A 或处于旧版兼容模式时才读。

> 不是 git repo → 报“项目未纳入 git,一致性机制未生效”,退回只读现有文件判断状态。

## 第三层:当前焦点

`git status` 中未提交 / 未跟踪的文件是最高优先级焦点。逐个完整读取,弄清上次写到哪里。

| 线索 | 跟进动作 |
|------|----------|
| 某文本文件被改 | 直接读该文件 |
| 最近 commit 提到某主题 | 找对应文件 / 目录 |
| 二进制目录有变化 | 读取对应 `_manifest.md` |

- 工作区有未提交文件 → 直接读它们。
- 工作区干净但要续上一个方向 → 看最近提交及对应文件。
- 完全无线索 → 报告中写“未识别到当前焦点文件”。

## 第四层:全景扫描

从仓库实际状态派生,不维护固定目录清单:

```bash
git rev-parse -q --verify HEAD >/dev/null 2>&1 \
  && git -c core.quotepath=false ls-tree -d --name-only HEAD
ls -A
```

对每个非隐藏顶层目录查看实际内容,区分有实质产物与占位目录,并与 `PROJECT.md` 项目地图核对。

## 输出 catchup 报告

每节简短,3–5 行内:

### 项目快照
一句话概括主题与当前阶段(取自 PROJECT)。

### 已完成
按 PROJECT 的流程 / 里程碑列关键产物。

### 进行中
基于未提交文件和焦点文件说明上次最后在做什么;无线索写“暂无记录”。

### 卡点 / 待决策
列 TODO、开放问题、链接异常或未覆盖联动;没有写“无”。

### 下一步建议
给 2–3 个按优先级排序的自然下一步。

报告结尾问:

> catchup 完成。继续上次的工作,还是有新方向?

## 守则

- 不凭印象作答,结论必须来自 PROJECT、Git 与读过的焦点文件。
- 若 PROJECT 与目录或 Git 状态不一致,用“⚑ 一致性提醒”标出。
- 若 `AGENTS.md` 不是实体、`CLAUDE.md` 不是指向 `AGENTS.md` 的相对链接,标为适配入口异常;不要自行读取两份内容来掩盖问题。
- catchup 只读取和汇报,不修改文件。
