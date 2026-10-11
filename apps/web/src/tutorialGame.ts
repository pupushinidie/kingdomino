/**
 * 多米诺王国和教程有关的部分（共用的 tutorial/ 文件夹之外，每款游戏自己写的）：
 * 游戏 id、「提示」怎么说、「第一次遇到」小贴士什么时候出。
 */
import {
  baseScore,
  bestPlacement,
  botCommand,
  DIRS,
  domino,
  pendingSlot,
  pickRow,
  placeInto,
  TERRAIN_NAMES,
  type GameState,
} from "@kingdomino/game";

/** 本机记录（gm-tutorial-<id>、gm-tips-<id>）用的游戏 id。 */
export const GAME_ID = "kingdomino";

export interface Hint {
  readonly say: string;
  readonly note?: string;
  /** 高亮哪个元素（data-tutorial）；null 不指。 */
  readonly anchor: string | null;
}

const DIR_NAMES = ["右边", "下面", "左边", "上面"] as const;

/** 「提示」：让人机从你的位置算一步（界面拿到的本来就是你能看到的那份），配一句原因。 */
export function hintFor(game: GameState, playerId: string): Hint {
  if (game.phase === "finished") return { say: "这局已经结束了。", anchor: null };
  const me = game.players.findIndex((player) => player.id === playerId);
  const current = game.players[game.currentPlayer];
  if (me < 0 || !current) return { say: "现在没有能走的。", anchor: null };
  if (current.id !== playerId) return { say: `等 ${current.name} 走完再问我。`, anchor: null };
  const command = botCommand(game, playerId);
  if (!command) return { say: "现在没有能走的。", anchor: null };
  const player = game.players[me]!;

  if (command.type === "PLACE") {
    const slot = game.current[game.active]!;
    const d = domino(slot.n);
    const dir = DIRS.findIndex((delta) => delta.r === command.b.r - command.a.r && delta.c === command.b.c - command.a.c);
    const gain = baseScore(placeInto(player.kingdom, d, { a: command.a, b: command.b })) - player.score;
    const ends = d.a.t === d.b.t ? "" : `，${TERRAIN_NAMES[d.b.t]}朝${DIR_NAMES[dir] ?? "旁边"}`;
    return {
      say: `我会把${TERRAIN_NAMES[d.a.t]}放在亮着的格子${ends}。`,
      note: gain > 0 ? `这样马上多 ${gain} 分。点这一格，不对就按「旋转」。` : "现在不加分，但给以后同种地形留了位置。点这一格，不对就按「旋转」。",
      anchor: `cell:${playerId}:${command.a.r},${command.a.c}`,
    };
  }
  if (command.type === "PICK") {
    const row = pickRow(game);
    const target = row[command.slot]!;
    const rowName = game.phase === "picking" ? "current" : "next";
    // 2 人局另一个国王脚下还没放的骨牌，先按最好的放法放进去再算
    let kingdom = player.kingdom;
    const pending = pendingSlot(game, me);
    if (pending >= 0 && pending !== game.active) {
      const best = bestPlacement(kingdom, domino(game.current[pending]!.n), game.config);
      if (best) kingdom = placeInto(kingdom, domino(game.current[pending]!.n), best.placement);
    }
    const best = bestPlacement(kingdom, domino(target.n), game.config);
    const gain = best ? baseScore(placeInto(kingdom, domino(target.n), best.placement)) - baseScore(kingdom) : 0;
    const first = row.findIndex((slot) => !slot.king) === command.slot;
    return {
      say: `我会挑 ${target.n} 号。`,
      note: !best
        ? "别的骨牌也放不下，挑哪张都一样。"
        : gain > 0
          ? `下一轮放进王国大约能多 ${gain} 分。`
          : first
            ? "它编号最小，下一轮能先行动。"
            : "它的地形接得上你的王国，以后好凑成大片。",
      anchor: `slot:${rowName}:${command.slot}`,
    };
  }
  return { say: "这张哪里都放不下，只能弃掉。", anchor: null };
}

/** 「第一次遇到」小贴士的内容。 */
export const TIPS = {
  order: { title: "挑牌也是在排顺序", text: "你挑在新排的位置决定下一轮的先后：编号越小越早行动。" },
  scored: { title: "区域计分", text: "同种地形连成一片，得分 = 格数 × 皇冠数；没有皇冠的一片不得分。" },
  preplace: { title: "不用干等", text: "别人行动时，你可以先把自己的骨牌摆好（提前放好），轮到你时自动生效。" },
  discarded: { title: "骨牌被弃掉了", text: "哪儿都放不下的骨牌会自动弃掉，不算分，王国会留下空格。" },
  "last-round": { title: "最后一轮", text: "牌堆用完了：这一轮只放不挑，放完就结算。" },
} as const;

/** 这一步该出哪些小贴士（按优先顺序；只出第一条没看过的）。 */
export function detectTips(game: GameState, selfId: string): string[] {
  const ids: string[] = [];
  const me = game.players.findIndex((player) => player.id === selfId);
  for (const event of game.events) {
    if (event.type === "Discarded" && event.player === selfId) ids.push("discarded");
    if (event.type === "Placed" && event.player === selfId && event.scoreAfter > event.scoreBefore) ids.push("scored");
    if (event.type === "Picked" && event.player === selfId && !event.auto && game.phase === "playing") ids.push("order");
    if (event.type === "RoundStarted" && event.last) ids.push("last-round");
  }
  if (me >= 0 && game.phase === "playing" && game.currentPlayer !== me) {
    const pending = pendingSlot(game, me);
    if (pending >= 0 && !game.current[pending]!.pre) ids.push("preplace");
  }
  return ids;
}
