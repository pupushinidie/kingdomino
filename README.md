# 多米诺王国（Kingdomino）

2–4 人挑骨牌、拼王国的桌游，网页联机版。规则按 `~/Desktop/游戏规则/多米诺王国.md`（2024 V2 规则书 + BGA 的做法）实现；美术和规则说明文字都是自己的。

线上地址：<https://gulugagame.com/kingdomino/>（付费网关后面，要登录）

## 本地运行

```bash
npm install
npm run dev          # 服务端 :3014，网页 :5187
npm test             # 规则引擎（规则书 16 个用例 + 400 局随机对局 + 人机）和服务器（人机、观战、挤登录）
npm run typecheck
BASE_PATH=/kingdomino/ npm run build
```

一个人测试：`node scripts/test-bot.mjs host 2 1` 让机器人建一个 2 人房并打印房间码，你在网页里用房间码加入凑满后自动开局。机器人随机走合法的一步；`BOT_SMART=1` 用人机的走法，`BOT_DELAY_MS` 调思考时间，`BOT_IDLE=1` 只挂着不动，`KD_MIGHTY=1` / `KD_MIDDLE=1` / `KD_HARMONY=1` 建房时开变体。也可以在等候房间里直接点空座位的「加人机」。

## 目录

| 路径 | 内容 |
|---|---|
| `packages/game/src/dominoes.ts` | 48 张骨牌（按规则书 2.2，单测逐项核对 2.1 的格数和皇冠数） |
| `packages/game/src/kingdom.ts` | 王国几何：放置校验（相邻、空格、连接、5×5 / 7×7 跨度）、`legalPlacements`、区域、计分、平局 `rank` |
| `packages/game/src/engine.ts` | 规则引擎：`apply(state, playerId, command) → { state, events }`，纯函数；开局选牌顺序、放置 / 弃牌 / 选牌、3 人局弃剩牌、换排、最后一轮、终局；提前放置；超时自动行动；`redactGameForViewer` |
| `packages/game/src/bot.ts` | 人机（普通）：放置看放下后的区域分 + 形状（死格扣分、有皇冠的区域留空位加分、中央王国偏心扣分）；选牌看能放出的最好值 + 顺位 |
| `apps/server` | Socket.IO 房间（建房、重连、踢人、解散、再来一局、聊天、语音、观战、人机、托管、挤登录、管理员解散），开房变体，选牌 45 秒 / 放置 90 秒分开计时 |
| `apps/web/src/GameBoard.tsx` | 牌桌：自己的王国（点格子放骨牌、R 旋转、确认）、两排骨牌（挑牌）、对手的王国、状态 / 分数 / 记录 / 聊天、结算 |
| `apps/web/src/Kingdom.tsx` | 地形格、皇冠、骨牌、王国网格（放置预览） |
| `apps/web/src/layout.ts` | 按牌桌实际尺寸挑格子大小（只按原图整数倍放大），决定侧栏还是抽屉 |
| `art/` | PixelLab 美术流水线（见下） |

## 默认规则和规则书没写死的地方

规则书第 11 节的待确认项他 2026-10-09 拍板「全按推荐」：

| # | 问题 | 处理 |
|---|---|---|
| 1 | 2 人局 | 默认随机移出 24 张、各拼 5×5、每人 2 个国王、6 轮；「强力对决」（48 张、7×7、12 轮）是开房选项，只在 2 人房间能开 |
| 2 | 3 人局 | 按 V2：48 张全用，每排 4 张，3 个国王挑完后剩下那张弃掉（第一排也一样） |
| 3 | 开局选牌顺序 | 2 人：随机先手 A，A 挑 1 → B 挑 2 → A 拿剩下；3–4 人：随机排序 |
| 4 | 平局 | 先比最大的单个区域格数（有没有皇冠都算），再比皇冠总数，还平就并列获胜 |
| 5 | 中央王国（开房选项） | 所有已放的格子都在城堡上下左右 2 格以内（强力对决 3 格）就 +10，没拼满也算 |
| 6 | 和谐（开房选项） | 拼满（25 / 49 格）而且整局没弃过骨牌 +5 |
| 7 | 提前放置 | 做了：没轮到时可以先把自己最早一张还没放的骨牌放好（可以改、可以取消），轮到时自动生效、直接进入挑牌；别人只看到「已放好」，看不到位置（观战的人也看不到） |
| 8 | 王朝（三局连赛） | 不做（再来一局就行） |
| 9 | 放不下时 | 轮到时自动弃掉，不用玩家点确认（没有别的选择）；`DISCARD` 命令保留给测试 |
| 10 | 只剩一张可挑 | 自动挑（4 人局、2 人局最后一个国王；3 人局最后一个国王还有 2 张可挑） |
| 11 | 超时 | 挑牌 45 秒、放置 90 秒。超时自动：挑编号最小的空位；放在放下后区域分最高的位置（同分按 A 端行、列从小到大，方向 右→下→左→上） |
| 12 | 人机 / 托管 | 全站约定：房主点空座位「加人机」（咕噜一号 / 二号 / 三号，普通难度），一个人加满人机也能开；连续超时 2 次转托管，自己动一下或点「取消托管」交还；离线的人轮到时先等 3 秒再由人机代下（不算超时） |
| 13 | 局中分数 | 显示区域分（不含中央王国 / 和谐奖励），终局时加上奖励 |
| 14 | 随机数 | 只在开局洗牌、定顺序时用；种子由服务器生成，种子、牌堆顺序、移出的骨牌、动作序列都不发给客户端（只给张数） |

人机强度（`~/projects/qa-reports/tools/bots/sim-kingdomino.ts`，2026-10-09）：2 人局平均约 42 分；对超时自动打法胜率 98%（2 人）/ 94%（4 人，公平 25%），对随机 99%。

## 新手教程

站内统一做法（`~/projects/pipeline/handbook/tutorial-notes.md`，欲罢不能是参考实现）：不连服务器，浏览器里直接跑规则引擎。

- 剧本 `packages/game/src/tutorial.ts`（24 步、14 课）：两人局对咕噜一号。开局摆好第一排（3、13、24、36 号），你挑 24 → 咕噜一号挑 2 张 → 3 号归你；第 1 轮放第一张（挨城堡）、挑 29 号、让带皇冠的森林接上森林（3×1=3 分）、再挑 21 号；然后 `FAST_FORWARD` 换成最后一轮的残局（前面放的骨牌原位不动）：点格子后旋转一次让湖泊接上湖泊、咕噜一号的 16 号放不下被自动弃掉、22 号把两片麦田连成 6 格 × 2 皇冠、咕噜一号最后放矿山追平 32:32，比最大一片区域 6:5 你赢。剧本单测 `tutorial.test.ts`。
- 网页：共用教练层 `apps/web/src/tutorial/`（从 cantstop/lucky 复制，不改逻辑）、`TutorialMode.tsx`（剧本接 GameBoard；放骨牌、挑骨牌「先点再确认」，按 GameBoard 的 `onSelection` 把高亮挪到「旋转 / 确认放下 / 重选 / 就挑 N 号」）、`tutorialGame.ts`（「提示」的说法和「第一次」小贴士）。
- 入口：首页邀请卡、等候房间邀请卡（看教程不离开房间，房主开局自动回牌桌）、地址带 `?tutorial` 直接打开。学完一键开一局人机练习，练习局和「只有自己 + 人机」的房间里有「提示」（键盘 H）。
- 锚点（`data-tutorial`）：`kingdom:<玩家>`、`cell:<玩家>:<行>,<列>`、`head:<玩家>`、`row:current|next`、`slot:current|next:<位置>`、`rotate`、`confirm`、`reselect`、`pick-confirm`、`hint`、`final:<玩家>`。
- 走查：`node ~/projects/qa-reports/tools/tut-kingdomino.mjs <输出目录> flow|skip|waiting|room [1440|1920|1024|390] [night|day]`（先 `npm run dev`；`SHORT=1` 只走到练习局开头）。

## 美术流水线（`art/`）

PixelLab API，密钥只在 `~/.config/pixellab/api_key`，不进仓库。每次调用记进 `art/ledger.jsonl`，`BUDGET_USD` 设上限。生成的原图和中间文件在被 gitignore 的 `art/out/`。

- `r1.py`：地形格（`/generate-image-v2` 32×32，一次 64 个候选）、城堡、国王、场景（`/create-image-pixen` 512×288）。
- `contact.py`：把一个候选文件夹拼成带编号的总览图。
- `selection.json`：选中的候选编号；`export.py` 按它导出到 `apps/web/public/art/`：地形 32px 和 16px 两套（16px 是 2×2 取众数缩小的）、城堡和国王按色相蒙版换成粉黄绿蓝、代码画的皇冠、场景、网页图标。`public` 里只放正式文件。
- 格子只按原图整数倍显示：32px 那套显示 32 / 64 / 96 / 128，16px 那套显示 48 / 80 / 112；同一屏只用一套（`layout.ts`）。皇冠不让模型画，代码画的 9×8 小图按格子每 32px 放大一倍。

## 画面：白天版和夜间版

只有像素风一种画面，配色分夜间（深色，默认）和白天（白底），顶栏随时切换，记在浏览器的 `gm-pixel-theme` 里（全站共用）。

- 夜间配色就是 `app-pixel.css`（首页和等候房间）和 `kd.css`（牌桌）。白天版由 `apps/web/day-theme.ts`（Vite 插件）在构建时按 `apps/web/day-palette.ts` 的调色表换色生成；机械换色不合适的地方在 `src/theme-day.css` 里手写。
- 牌桌背景是王国场景，白天、夜间各一张。

## 声音

还没有背景音乐（`App.tsx` 里用 `NO_BGM`：房间和教程里照样有 ♪ 面板，能调音效和语音）。共用声音库是 `apps/web/src/gm-sound.tsx`（各仓库同一份，不要改）。

动作音效在 `apps/web/src/game-sfx.ts`（`useGameSfx`，对比前后两次对局快照的 version、这一步的 events 和当前排骨牌的预放状态）：挑骨牌 = 招牌「国王落座」（木头棋子落下 + 一声小铃），放骨牌 = 招牌「骨牌落地」（两半先后「嗒嗒」+ 闷响）、区域分涨了再响得分，提前放好 = 轻一点的「嗒」、取消预放 = 擦过的一声，丢弃 = 招牌「扔掉」（往下滑），3 人局剩牌弃掉 = 很轻的一声；新一轮 = 提示音 + 新一排骨牌翻开的「嗒嗒」；轮到你、交出回合、最后 5 秒倒计时、超时、终局赢/输都有提示音。别人的动作音量减半，进房间 / 重连时不补响。点骨牌、点格子选位置是「选中」声，点被挑走的骨牌、放不下的格子是「不行」声。开发模式下每响一个都记进 `window.__sfxLog`，自测脚本 `~/projects/qa-reports/tools/kingdomino-sfx.mjs`（打一整局）和 `sfx-tiles-tut.mjs`（走一遍教程）读它。

## 部署

服务器上 `~/kingdomino`，pm2 进程 `kingdomino`（端口 3014），网页在 `/var/www/kingdomino`，Caddy `handle_path /kingdomino/*`（在付费网关 `@games` 里）。本机运行 `~/projects/deploy.sh kingdomino`（服务器拉 GitHub 上的 main）。

pm2 按仓库根目录的 `ecosystem.config.cjs` 直接启动一个 `node --import tsx` 进程。端口和密钥（PORT、ADMIN_TOKEN、TURN_*、WEB_ORIGINS）存在 pm2 里，不进仓库；改了 `ecosystem.config.cjs` 之后要带着原来的环境变量 `pm2 delete` 再 `pm2 start`。
