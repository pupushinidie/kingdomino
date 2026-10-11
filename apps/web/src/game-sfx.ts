import { useEffect, useRef } from "react";
import type { GameEvent, GameState } from "@kingdomino/game";
import { sfx, synth, type SfxName } from "./gm-sound.js";

/**
 * 多米诺王国的动作音效：对比前后两次对局快照（version、这一步的 events、当前排骨牌的预放状态），把刚发生的动作配上声音。
 * 自己的动作响亮，别人的减半（观战时都算别人的）。第一次拿到快照（进房间、重连、观战刚进来）不出声；
 * version 一下跳了好几步、或者换了一局，动作不补响，只提示轮到你。
 *
 * - 选骨牌 Picked：招牌「国王落座」（木头棋子落下 + 一声小铃）
 * - 放骨牌 Placed：招牌「骨牌落地」（两半砖先后「嗒嗒」+ 一声闷响）；区域分涨了再响得分（涨 5 分以上是大的）
 * - 提前放好（预放，没有事件，只看到当前排的 pre 变了）：轻一点的「嗒」；取消预放：pass
 * - 丢弃 Discarded：招牌「扔掉」（往下滑的擦声 + 一声低的砖）
 * - 3 人局没人挑的剩牌弃掉 LeftoverRemoved：很轻的 pass
 * - 新一轮 RoundStarted：roundStart + 新一排骨牌翻开（几张就几声清脆的「嗒」）
 * - 超时 TurnTimedOut：自己的响 timeout
 * - 轮到你 yourTurn、自己走完交出回合 turnPassed、终局 gameOver(赢/输)
 */

function log(name: string) {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __sfxLog?: string[] };
    (w.__sfxLog ??= []).push(name);
  }
}

function play<K extends SfxName>(name: K, ...args: Parameters<(typeof sfx)[K]>) {
  log(name);
  (sfx[name] as (...a: Parameters<(typeof sfx)[K]>) => void)(...args);
}

const later = (ms: number, fn: () => void) => (ms <= 0 ? fn() : window.setTimeout(fn, ms));

/** 招牌：国王落在骨牌上——木头「咚」+ 一声小铃。 */
function kingDown(mine: boolean) {
  log("kingDown");
  sfx.place(mine);
  const v = synth.level(mine);
  synth.tone(1175, { at: 0.06, duration: 0.18, volume: 0.07 * v, type: "triangle" });
  synth.tone(1760, { at: 0.06, duration: 0.12, volume: 0.03 * v, type: "sine" });
}

/** 招牌：一张骨牌放进王国——两半先后「嗒嗒」，再一声落在桌上的闷响。 */
function dominoDown(mine: boolean, soft = false) {
  log(soft ? "dominoPre" : "dominoDown");
  const v = synth.level(mine) * (soft ? 0.6 : 1);
  sfx.tile(mine, 1, soft ? 1.15 : 0.95);
  window.setTimeout(() => sfx.tile(mine, 1, soft ? 1.05 : 0.85), 55);
  if (!soft) synth.noise({ at: 0.06, duration: 0.07, volume: 0.22 * v, filter: "lowpass", freq: 600 });
}

/** 招牌：骨牌放不下、扔掉。 */
function discard(mine: boolean) {
  log("discard");
  const v = synth.level(mine);
  synth.noise({ duration: 0.22, volume: 0.16 * v, freq: 2200, freqTo: 500, q: 0.8 });
  synth.tone(330, { at: 0.04, duration: 0.25, volume: 0.1 * v, type: "triangle", glideTo: 196 });
  window.setTimeout(() => sfx.tile(mine, 1, 0.7), 220);
}

/** 新一排骨牌翻开。 */
function reveal(count: number) {
  log("rowReveal");
  sfx.tile(false, Math.max(1, Math.min(count, 4)), 1.3);
}

export function useGameSfx(game: GameState, selfId: string) {
  const previous = useRef<GameState | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = game;
    if (!prev || prev === game || prev.version === game.version) return;
    const mineOf = (id: string | undefined) => id !== undefined && id !== "" && id === selfId;
    const currentId = (state: GameState) => (state.phase === "finished" ? undefined : state.players[state.currentPlayer]?.id);
    const nextIsMe = mineOf(currentId(game));
    const wasMe = mineOf(currentId(prev));
    if (game.version < prev.version || game.version - prev.version > 2) {
      if (nextIsMe) later(400, () => play("yourTurn"));
      return;
    }

    let t = 0;
    let acted = false;
    let myAction = false;
    let ended: (GameEvent & { type: "GameEnded" }) | null = null;
    const step = (gap: number, fn: () => void) => {
      later(t, fn);
      t += gap;
    };
    const events: readonly GameEvent[] = game.events;
    for (const event of events) {
      switch (event.type) {
        case "TurnTimedOut":
          if (mineOf(event.player)) step(350, () => play("timeout"));
          break;
        case "Picked": {
          const mine = mineOf(event.player);
          acted = true;
          if (mine && !event.auto) myAction = true;
          step(260, () => kingDown(mine));
          break;
        }
        case "Placed": {
          const mine = mineOf(event.player);
          acted = true;
          if (mine && !event.pre) myAction = true;
          const gain = event.scoreAfter - event.scoreBefore;
          step(gain > 0 ? 200 : 300, () => dominoDown(mine));
          if (gain > 0) step(320, () => play("score", mine, gain >= 5));
          break;
        }
        case "Discarded": {
          const mine = mineOf(event.player);
          acted = true;
          if (mine) myAction = true;
          step(450, () => discard(mine));
          break;
        }
        case "LeftoverRemoved":
          step(150, () => play("pass", false));
          break;
        case "RoundStarted": {
          const count = event.revealed.length;
          step(250, () => play("roundStart"));
          if (count > 0) step(400, () => reveal(count));
          break;
        }
        case "GameEnded":
          ended = event;
          break;
      }
    }

    // 预放 / 取消预放：没有事件，只看当前排同一张骨牌的 pre 变了
    if (events.length === 0 && prev.round === game.round) {
      for (const slot of game.current) {
        const before = prev.current.find((candidate) => candidate.n === slot.n);
        if (!before || before.resolved || slot.resolved) continue;
        const owner = slot.king ? game.players[slot.king.player]?.id : undefined;
        const mine = mineOf(owner);
        if (!before.pre && slot.pre) step(0, () => dominoDown(mine, true));
        else if (before.pre && !slot.pre) step(0, () => play("pass", mine));
      }
    }

    if (ended) {
      const won = selfId !== "" && ended.result.winners.includes(selfId);
      later(t + 500, () => play("gameOver", won));
      return;
    }
    if (nextIsMe && !wasMe) later(Math.max(t, 450), () => play("yourTurn"));
    else if (wasMe && !nextIsMe && acted && (myAction || events.some((e) => e.type === "TurnTimedOut"))) later(Math.max(t, 450), () => play("turnPassed"));
  }, [game, selfId]);
}
