/**
 * 新手教程的剧本（多米诺王国）。
 *
 * 教程在浏览器里直接跑规则引擎，不连服务器。两人局，你对咕噜一号，分两段：
 * 1. 开局：摆好的第一排（3、13、24、36 号），你挑 1 张 → 咕噜一号挑 2 张 → 剩下的归你；
 *    第 1 轮放第一张（挨着城堡）、挑下一张、让带皇冠的森林接上森林（3 格 × 1 皇冠 = 3 分）。
 * 2. 「快进」到最后一轮（FAST_FORWARD 换成一个摆好的残局，前面放过的骨牌都还在原位）：
 *    牌堆用完只放不挑；你点格子后要旋转一次才让湖泊接上湖泊；咕噜一号的 16 号哪里都放不下被弃掉；
 *    你用 22 号把两片麦田连成 6 格 × 2 皇冠；咕噜一号最后放矿山追平 32:32，比最大一片区域你 6 格赢 5 格。
 *
 * 引擎本身不用随机数（牌序在开局时就定了），所以这里直接把牌堆摆成剧本要的顺序，剧情一定这样发生。
 * 剧本走完开一局新的练习局（随机），对手交给人机。
 *
 * 每一步写三件事：咕噜嘎说什么（say / note）、高亮哪个元素（anchor，对应网页里的 data-tutorial="…"）、
 * 等玩家做什么（do 步骤的 expect）。放骨牌和挑骨牌都是「先点再确认」，网页里按 GameBoard 报上来的
 * 当前选择把高亮挪到「旋转」「确认放下」「就挑 N 号」（见 apps/web/src/TutorialMode.tsx）。
 */
import { domino } from "./dominoes.js";
import { apply, createGame, LINE_SIZE } from "./engine.js";
import { baseScore, bounds, castleKingdom, key, legalPlacements, placeInto } from "./kingdom.js";
import type { GameCommand, GameState, Kingdom, King, Slot } from "./types.js";

/** 咕噜嘎的表情。 */
export type TutorialFace = "base" | "happy" | "surprised" | "think";

/** 剧本里的一步棋：规则引擎的命令，或者「快进到最后一轮」。 */
export type TutorialMove = GameCommand | { readonly type: "FAST_FORWARD" };

interface StepBase {
  readonly id: string;
  /** 侧栏「新手教程」进度里这一课叫什么；没有就不单独列。 */
  readonly lesson?: string;
  /** 主句（24px），一句话说清这一步。 */
  readonly say: string;
  /** 补充说明（12px），最多两句。 */
  readonly note?: string;
  /** 触屏设备上换成这句说明。 */
  readonly noteTouch?: string;
  /**
   * 高亮哪个元素：网页里 data-tutorial 的值。
   * 固定的有 row:current、row:next、confirm、rotate、reselect、pick-confirm、hint；
   * 带参数的：kingdom:<玩家>、head:<玩家>、cell:<玩家>:<行>,<列>、slot:current:<位置>、slot:next:<位置>、final:<玩家>。
   */
  readonly anchor?: string;
  readonly face?: TutorialFace;
}

export type TutorialStep =
  /** 讲解：玩家点「下一步」继续。finale 是最后一步（接练习局或结束）。 */
  | (StepBase & { readonly kind: "info"; readonly finale?: boolean })
  /** 等玩家做这一步；做别的会被拦下。 */
  | (StepBase & { readonly kind: "do"; readonly expect: GameCommand })
  /** 对手按剧本自动走这几步，牌桌不压暗。 */
  | (StepBase & { readonly kind: "watch"; readonly moves: readonly TutorialMove[] });

export const TUTORIAL_SELF = "p1";
export const TUTORIAL_RIVAL = "p2";
export const TUTORIAL_RIVAL_NAME = "咕噜一号";
export const TUTORIAL_RIVALS = [{ id: TUTORIAL_RIVAL, name: TUTORIAL_RIVAL_NAME }] as const;

/** 这一步之前不弹结算框（先看咕噜一号放完最后一张，再看结算框里的平局比较）。 */
export const TUTORIAL_FINAL_STEP = "tie";

const pick = (slot: number): GameCommand => ({ type: "PICK", slot });
const place = (ar: number, ac: number, br: number, bc: number): GameCommand => ({ type: "PLACE", a: { r: ar, c: ac }, b: { r: br, c: bc } });
const cell = (player: string, r: number, c: number) => `cell:${player}:${r},${c}`;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    kind: "info", id: "goal", lesson: "目标", anchor: `kingdom:${TUTORIAL_SELF}`, face: "happy",
    say: "这是你的王国：从城堡出发，拼出 5×5 的方阵。",
    note: "每轮挑一张骨牌、放进王国。游戏结束时按区域算分，分数最高的人赢。",
  },
  {
    kind: "info", id: "domino", lesson: "骨牌和皇冠", anchor: "row:current",
    say: "每张骨牌两格，每格一种地形，有的带皇冠。",
    note: "地形有麦田、森林、湖泊、草地、沼泽、矿山。编号越大的骨牌，皇冠一般越多。",
  },
  {
    kind: "info", id: "opening", lesson: "开局挑牌", anchor: "row:current", face: "think",
    say: "两人局每人两个国王，开局先挑骨牌。",
    note: "顺序是：你挑 1 张，咕噜一号挑 2 张，剩下那张归你。",
  },
  {
    kind: "do", id: "pick-first", anchor: "slot:current:2", expect: pick(2),
    say: "点 24 号骨牌，再点「就挑 24 号」。",
    note: "这张的森林带一个皇冠，是这一排最值钱的。",
  },
  {
    kind: "watch", id: "rival-open", anchor: "row:current",
    say: "咕噜一号挑 2 张，剩下的 3 号自动归你。",
    moves: [pick(3), pick(1)],
  },
  {
    kind: "info", id: "order", lesson: "行动顺序", anchor: "row:current",
    say: "按编号从小到大行动：3 号最小，你先走。",
    note: "每个国王轮到时，先把脚下的骨牌放进王国，再从「下一轮」那排挑一张。",
  },
  {
    kind: "do", id: "place-first", lesson: "放骨牌", anchor: cell(TUTORIAL_SELF, 0, 1), expect: place(0, 1, 0, 2),
    say: "点亮着的这格放下 3 号，再点「确认放下」。",
    note: "第一张要挨着城堡。城堡是万能格，什么地形都能接。",
  },
  {
    kind: "do", id: "pick-next", lesson: "挑下一张", anchor: "slot:next:2", expect: pick(2),
    say: "挑下一轮的骨牌：点 29 号，再点确认。",
    note: "挑的位置决定下一轮的顺序：编号越小越早行动，大编号的好骨牌要多等一会。",
  },
  {
    kind: "watch", id: "rival-r1", anchor: `kingdom:${TUTORIAL_RIVAL}`,
    say: "轮到咕噜一号：放下 13 号，挑走 33 号。",
    note: "别人行动时，你也可以先把自己的骨牌摆好，轮到你时自动生效。",
    moves: [place(0, -1, 0, -2), pick(3)],
  },
  {
    kind: "do", id: "place-connect", lesson: "接上同地形", anchor: cell(TUTORIAL_SELF, 1, 1), expect: place(1, 1, 1, 2),
    say: "放 24 号：让带皇冠的森林挨着你的森林。",
    note: "至少一格要挨着城堡或同一种地形，另一格挨着什么都行。点亮着的格子，再确认。",
  },
  {
    kind: "info", id: "score-first", lesson: "区域计分", anchor: `kingdom:${TUTORIAL_SELF}`, face: "happy",
    say: "森林连成一片：3 格 × 1 个皇冠 = 3 分。",
    note: "同一种地形连在一起算一片，得分是格数乘皇冠数。没有皇冠的一片不得分。",
  },
  {
    kind: "do", id: "pick-second", anchor: "slot:next:1", expect: pick(1),
    say: "再挑一张：点 21 号，再点确认。",
    note: "麦田带一个皇冠，以后用得上。",
  },
  {
    kind: "watch", id: "rival-r1b", anchor: `kingdom:${TUTORIAL_RIVAL}`,
    say: "咕噜一号放下 36 号，剩下的 10 号自动归它。",
    moves: [place(1, 0, 1, 1)],
  },
  {
    kind: "watch", id: "skip",
    say: "后面每轮都是这样。我们快进到最后一轮……",
    moves: [{ type: "FAST_FORWARD" }],
  },
  {
    kind: "info", id: "last-round", lesson: "最后一轮", anchor: "row:current", face: "think",
    say: "牌堆用完了，这是最后一轮：只放不挑。",
    note: "现在你 20 分，咕噜一号 24 分。这一轮放完，游戏就结束。",
  },
  {
    kind: "info", id: "size", lesson: "5×5 范围", anchor: `kingdom:${TUTORIAL_SELF}`,
    say: "王国最多 5×5，你只剩 4 个空格了。",
    note: "整块王国不能超出 5 行 5 列。城堡不必在正中间，看咕噜一号的就偏在一边。",
  },
  {
    kind: "do", id: "rotate", lesson: "旋转", anchor: cell(TUTORIAL_SELF, 2, -1), expect: place(2, -1, 1, -1),
    say: "点亮着的格子，按「旋转」把湖泊转到上面，再确认。",
    note: "这样麦田挨着麦田，湖泊也挨上带皇冠的湖泊。键盘 R 也能旋转。",
    noteTouch: "这样麦田挨着麦田，湖泊也挨上带皇冠的湖泊。",
  },
  {
    kind: "info", id: "discard", lesson: "放不下就弃", anchor: `kingdom:${TUTORIAL_RIVAL}`, face: "surprised",
    say: "咕噜一号的 16 号哪里都放不下，只能弃掉！",
    note: "有地方放就必须放，哪儿都放不下才弃。弃掉的不算分，王国会留下空格。",
  },
  {
    kind: "do", id: "merge", lesson: "连成一大片", anchor: cell(TUTORIAL_SELF, 2, 0), expect: place(2, 0, 1, 0),
    say: "把 22 号放进最后的空位，再点「确认放下」。",
    note: "看看你的两片麦田会怎样。",
  },
  {
    kind: "info", id: "merge-score", anchor: `kingdom:${TUTORIAL_SELF}`, face: "happy",
    say: "两片麦田连起来：6 格 × 2 个皇冠 = 12 分！",
    note: "连在一起的同种地形算一片，越大越值钱。你现在 32 分。",
  },
  {
    kind: "watch", id: "rival-last", anchor: `kingdom:${TUTORIAL_RIVAL}`,
    say: "咕噜一号放最后一张：矿山带 2 个皇冠。",
    moves: [place(3, -3, 3, -2)],
  },
  {
    kind: "info", id: "tie", lesson: "终局和平局", anchor: `final:${TUTORIAL_SELF}`, face: "surprised",
    say: "32 比 32 平分！先比最大的一片区域。",
    note: "你最大一片 6 格，咕噜一号 5 格，你赢。还一样就比皇冠总数，再一样就并列。",
  },
  {
    kind: "info", id: "players", lesson: "人数和托管",
    say: "3、4 人局每人只有一个国王。",
    note: "3 人局每排没人挑的那张直接弃掉。联机时挑牌 45 秒、放置 90 秒，超时或「托管」都由人机替你走。",
  },
  {
    kind: "info", id: "finale", finale: true, face: "happy",
    say: "学会了！和咕噜一号来一局练习吧。",
    note: "练习局里拿不准就点「提示」（键盘 H），我告诉你我会怎么走。",
  },
];

// ---------- 摆局面 ----------

const P = (n: number, ar: number, ac: number, br: number, bc: number) => ({ n, a: { r: ar, c: ac }, b: { r: br, c: bc } });

/** 每一排翻出来的骨牌（一共 6 排 24 张；每人每排拿 2 张）。 */
const ROWS = [
  [3, 13, 24, 36],
  [10, 21, 29, 33],
  [1, 8, 25, 45],
  [4, 11, 20, 23],
  [28, 35, 42, 44],
  [14, 16, 22, 47],
] as const;

/** 最后一轮开始时你的王国（城堡在正中间）：开局放的 3、24 号还在原位，左下角留 4 个空格。 */
const LATE_SELF = [
  P(3, 0, 1, 0, 2), P(24, 1, 1, 1, 2), P(29, -1, 1, -1, 0), P(21, 2, -2, 1, -2), P(1, 2, 1, 2, 2),
  P(8, 0, -1, -1, -1), P(35, -2, -1, -2, -2), P(4, -1, 2, -2, 2), P(11, 0, -2, -1, -2), P(42, -2, 1, -2, 0),
];
/** 最后一轮开始时咕噜一号的王国（城堡偏右上）：开局放的 13、36 号还在原位，左下角留 4 个空格。 */
const LATE_RIVAL = [
  P(13, 0, -1, 0, -2), P(36, 1, 0, 1, 1), P(10, 2, 1, 3, 1), P(33, 1, -3, 0, -3), P(45, 2, -1, 2, 0),
  P(23, 3, 0, 3, -1), P(25, 1, -2, 1, -1), P(28, -1, -2, -1, -3), P(44, -1, 0, -1, -1), P(20, -1, 1, 0, 1),
];

function buildKingdom(list: readonly ReturnType<typeof P>[]): Kingdom {
  let kingdom = castleKingdom();
  for (const item of list) kingdom = placeInto(kingdom, domino(item.n), { a: item.a, b: item.b });
  return kingdom;
}

const slotsOf = (ns: readonly number[], kings: readonly (King | null)[] = []): Slot[] =>
  ns.map((n, index) => ({ n, king: kings[index] ?? null, resolved: false, pre: null }));

function players(selfName: string) {
  return [{ id: TUTORIAL_SELF, name: selfName }, { id: TUTORIAL_RIVAL, name: TUTORIAL_RIVAL_NAME }];
}

/** 教程开局：两人局，你先挑；牌堆按 ROWS 摆好（不洗牌）。 */
export function createTutorialGame(selfName: string, seed = 20261011): GameState {
  const game = createGame(players(selfName), seed);
  const used = new Set<number>(ROWS.flat());
  game.pickOrder = [
    { player: 0, idx: 0 },
    { player: 1, idx: 0 },
    { player: 1, idx: 1 },
    { player: 0, idx: 1 },
  ];
  game.currentPlayer = 0;
  game.current = slotsOf(ROWS[0]);
  game.deck = ROWS.slice(1).flat();
  game.setAside = Array.from({ length: 48 }, (_, index) => index + 1).filter((n) => !used.has(n));
  game.totalRounds = ROWS.length;
  return game;
}

/** 快进：换成最后一轮刚开始的局面（第 6 轮，牌堆空了，轮到你放 14 号）。 */
export function createLateGame(previous: GameState): GameState {
  const game = structuredClone(previous);
  const [self, rival] = game.players as [GameState["players"][number], GameState["players"][number]];
  self.kingdom = buildKingdom(LATE_SELF);
  rival.kingdom = buildKingdom(LATE_RIVAL);
  self.discarded = [];
  rival.discarded = [];
  self.score = baseScore(self.kingdom);
  rival.score = baseScore(rival.kingdom);
  game.phase = "playing";
  game.round = ROWS.length;
  game.totalRounds = ROWS.length;
  game.current = slotsOf(ROWS[5], [
    { player: 0, idx: 0 },
    { player: 1, idx: 0 },
    { player: 0, idx: 1 },
    { player: 1, idx: 1 },
  ]);
  game.next = [];
  game.deck = [];
  game.removed = [];
  game.active = 0;
  game.step = "place";
  game.currentPlayer = 0;
  game.turn = previous.turn + 1;
  game.version = previous.version + 1;
  game.events = [{ type: "RoundStarted", round: ROWS.length, last: true, revealed: [] }];
  return game;
}

/** 剧本里走一步：快进换成残局，其余交给规则引擎（不合法就抛错）。 */
export function tutorialApply(state: GameState, playerId: string, move: TutorialMove): GameState {
  if (move.type === "FAST_FORWARD") return createLateGame(state);
  return apply(state, playerId, move).state;
}

/** 练习局：新开一局两人局（随机牌堆、随机先手）。 */
export function createPracticeGame(selfName: string, seed: number): GameState {
  return createGame(players(selfName), seed);
}

/** 两条命令是不是同一步。 */
export function sameCommand(a: TutorialMove, b: TutorialMove): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "PICK" && b.type === "PICK") return a.slot === b.slot;
  if (a.type === "PLACE" && b.type === "PLACE") return a.a.r === b.a.r && a.a.c === b.a.c && a.b.r === b.b.r && a.b.c === b.b.c;
  return true;
}

/** viewer 这一轮还没放的骨牌有没有地方放（界面上「旋转」「确认放下」只在这时出现）。 */
function canPlaceNow(state: GameState, viewer: number): boolean {
  if (state.phase !== "playing" || viewer < 0) return false;
  const slot = state.current.find((candidate) => candidate.king?.player === viewer && !candidate.resolved);
  return slot !== undefined && legalPlacements(state.players[viewer]!.kingdom, domino(slot.n), state.config.size).length > 0;
}

/**
 * 这个锚点在这个局面里，界面上应该看得见吗（给剧本单测用，对应 GameBoard 的显示条件）。
 * viewer 是看界面的人（教程里就是你）。
 */
export function anchorVisible(state: GameState, anchor: string, viewer: string): boolean {
  const me = state.players.findIndex((player) => player.id === viewer);
  const myTurn = state.phase !== "finished" && state.currentPlayer === me;
  const [kind, arg, pos] = anchor.split(":") as [string, string | undefined, string | undefined];
  const player = state.players.find((candidate) => candidate.id === arg);
  switch (kind) {
    case "row":
      return arg === "current" ? state.current.length > 0 : arg === "next";
    case "slot": {
      const row = arg === "current" ? state.current : arg === "next" ? state.next : [];
      return row[Number(pos)] !== undefined;
    }
    case "kingdom":
    case "head":
      return player !== undefined;
    case "cell": {
      if (!player || pos === undefined) return false;
      const [r, c] = pos.split(",").map(Number) as [number, number];
      if (player.kingdom[key(r, c)]) return true;
      if (player.id !== viewer) return false;
      // 自己的王国里，空格只画在「已拼好的范围往外两圈、不超出 size × size」之内
      const b = bounds(player.kingdom);
      const size = state.config.size;
      return r >= Math.max(b.minR - 2, b.maxR - size + 1) && r <= Math.min(b.maxR + 2, b.minR + size - 1)
        && c >= Math.max(b.minC - 2, b.maxC - size + 1) && c <= Math.min(b.maxC + 2, b.minC + size - 1);
    }
    case "confirm":
    case "rotate":
    case "reselect":
      return canPlaceNow(state, me);
    case "pick-confirm":
      return myTurn && state.step === "pick";
    case "hint":
      return myTurn;
    case "final":
      return state.phase === "finished" && player !== undefined;
    default:
      return false;
  }
}

/** 剧本用到的牌一共几张（给单测核对：6 排 × 每排 4 张）。 */
export const TUTORIAL_DECK_SIZE = ROWS.length * LINE_SIZE;
