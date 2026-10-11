import { describe, expect, it } from "vitest";
import { botCommand } from "./bot.js";
import { apply, legalActions, redactGameForViewer } from "./engine.js";
import { key, legalPlacements } from "./kingdom.js";
import { domino } from "./dominoes.js";
import {
  anchorVisible,
  createPracticeGame,
  createTutorialGame,
  sameCommand,
  TUTORIAL_DECK_SIZE,
  TUTORIAL_FINAL_STEP,
  TUTORIAL_RIVAL,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
  tutorialApply,
} from "./tutorial.js";
import type { GameState } from "./types.js";

const actor = (game: GameState) => game.players[game.currentPlayer]!.id;
const seat = (game: GameState, id: string) => game.players.find((player) => player.id === id)!;
const stepIndex = (id: string) => TUTORIAL_STEPS.findIndex((step) => step.id === id);

/** 按剧本走到第 upTo 步之前（不含），返回那时的局面。 */
function playScript(upTo = TUTORIAL_STEPS.length): GameState {
  let game = createTutorialGame("小蒲");
  for (const step of TUTORIAL_STEPS.slice(0, upTo)) {
    if (step.kind === "do") game = tutorialApply(game, TUTORIAL_SELF, step.expect);
    if (step.kind === "watch") for (const move of step.moves) game = tutorialApply(game, actor(game), move);
  }
  return game;
}

/** 王国里用到的骨牌编号（不含城堡）。 */
const dominoesIn = (game: GameState, id: string) =>
  [...new Set(Object.values(seat(game, id).kingdom).flatMap((cell) => (cell.d > 0 ? [cell.d] : [])))].sort((a, b) => a - b);

describe("新手教程剧本", () => {
  it("开局摆法：两人局，你先挑，第一排是 3、13、24、36 号；本局 24 张、另外 24 张移出", () => {
    const game = createTutorialGame("小蒲");
    expect(game.phase).toBe("picking");
    expect(actor(game)).toBe(TUTORIAL_SELF);
    expect(game.current.map((slot) => slot.n)).toEqual([3, 13, 24, 36]);
    expect(game.deck.length + game.current.length).toBe(TUTORIAL_DECK_SIZE);
    expect(new Set([...game.deck, ...game.current.map((slot) => slot.n), ...game.setAside]).size).toBe(48);
    expect(game.setAside).toHaveLength(24);
    expect(game.pickOrder.map((king) => king.player)).toEqual([0, 1, 1, 0]);
  });

  it("从头走到尾：每一步要你做的都合法、轮到的是对的人，高亮的东西在界面上看得见", () => {
    let game = createTutorialGame("小蒲");
    for (const step of TUTORIAL_STEPS) {
      if (step.anchor) expect(anchorVisible(game, step.anchor, TUTORIAL_SELF), `「${step.id}」高亮的 ${step.anchor} 看不见`).toBe(true);
      if (step.kind === "do") {
        expect(actor(game), `「${step.id}」不是轮到你`).toBe(TUTORIAL_SELF);
        expect(legalActions(game, TUTORIAL_SELF).some((action) => sameCommand(action, step.expect)), `「${step.id}」不合法`).toBe(true);
        // 「先点再确认」的后续高亮
        const follow = step.expect.type === "PLACE" ? ["confirm", "rotate", "reselect"] : ["pick-confirm"];
        for (const anchor of follow) expect(anchorVisible(game, anchor, TUTORIAL_SELF), `「${step.id}」后续高亮 ${anchor} 看不见`).toBe(true);
        game = tutorialApply(game, TUTORIAL_SELF, step.expect);
      }
      if (step.kind === "watch") {
        for (const move of step.moves) {
          if (move.type !== "FAST_FORWARD") expect(actor(game), `「${step.id}」里轮到了你`).not.toBe(TUTORIAL_SELF);
          game = tutorialApply(game, actor(game), move);
        }
      }
    }
    expect(game.phase).toBe("finished");
  });

  it("开局：你挑 24 → 咕噜一号挑 36、13 → 剩下的 3 号自动归你；第 1 轮按 3、13、24、36 的顺序行动", () => {
    const game = playScript(stepIndex("rival-open") + 1);
    expect(game.phase).toBe("playing");
    expect(game.round).toBe(1);
    expect(game.current.map((slot) => [slot.n, slot.king?.player])).toEqual([[3, 0], [13, 1], [24, 0], [36, 1]]);
    expect(game.events).toContainEqual({ type: "Picked", player: TUTORIAL_SELF, n: 3, auto: true });
    expect(game.next.map((slot) => slot.n)).toEqual([10, 21, 29, 33]);
    expect(actor(game)).toBe(TUTORIAL_SELF);
    expect(game.step).toBe("place");
  });

  it("第 1 轮：3 号挨着城堡、24 号的森林接上森林得 3 分；第 2 轮你拿 21、29 号", () => {
    const afterConnect = playScript(stepIndex("place-connect") + 1);
    expect(seat(afterConnect, TUTORIAL_SELF).score).toBe(3);
    expect(afterConnect.events).toContainEqual(expect.objectContaining({ type: "Placed", player: TUTORIAL_SELF, n: 24, scoreBefore: 0, scoreAfter: 3 }));

    const round2 = playScript(stepIndex("rival-r1b") + 1);
    expect(round2.round).toBe(2);
    expect(round2.current.map((slot) => [slot.n, slot.king?.player])).toEqual([[10, 1], [21, 0], [29, 0], [33, 1]]);
    expect(seat(round2, TUTORIAL_RIVAL).kingdom[key(1, 1)]).toEqual({ t: "G", c: 1, d: 36 });
  });

  it("快进以后：最后一轮、牌堆空了；前面放过的骨牌都在原位；整局 24 张不重复", () => {
    const before = playScript(stepIndex("skip"));
    const late = playScript(stepIndex("skip") + 1);
    expect(late.round).toBe(late.totalRounds);
    expect(late.next).toEqual([]);
    expect(late.deck).toEqual([]);
    expect(actor(late)).toBe(TUTORIAL_SELF);
    expect(late.version).toBeGreaterThan(before.version);
    for (const id of [TUTORIAL_SELF, TUTORIAL_RIVAL]) {
      for (const [k, cell] of Object.entries(seat(before, id).kingdom)) expect(seat(late, id).kingdom[k], `${id} ${k}`).toEqual(cell);
      expect(Object.keys(seat(late, id).kingdom)).toHaveLength(21);
    }
    expect(seat(late, TUTORIAL_SELF).score).toBe(20);
    expect(seat(late, TUTORIAL_RIVAL).score).toBe(24);
    const all = [...dominoesIn(late, TUTORIAL_SELF), ...dominoesIn(late, TUTORIAL_RIVAL), ...late.current.map((slot) => slot.n)];
    expect(new Set(all).size).toBe(TUTORIAL_DECK_SIZE);
  });

  it("关键的几幕一定发生：旋转那步两个方向都能放、16 号被弃、麦田连成 6×2、32:32 平分按最大区域你赢", () => {
    const late = playScript(stepIndex("rotate"));
    // 点 (2,-1) 时先找到的是朝右（湖泊放到右边），要旋转一次才到朝上
    const options = legalPlacements(seat(late, TUTORIAL_SELF).kingdom, domino(14), 5).filter((p) => p.a.r === 2 && p.a.c === -1);
    expect(options).toEqual([{ a: { r: 2, c: -1 }, b: { r: 2, c: 0 } }, { a: { r: 2, c: -1 }, b: { r: 1, c: -1 } }]);

    const afterRotate = playScript(stepIndex("rotate") + 1);
    expect(seat(afterRotate, TUTORIAL_SELF).score).toBe(22);
    expect(seat(afterRotate, TUTORIAL_RIVAL).discarded).toEqual([16]);
    expect(afterRotate.events).toContainEqual({ type: "Discarded", player: TUTORIAL_RIVAL, n: 16 });
    expect(actor(afterRotate)).toBe(TUTORIAL_SELF);

    const afterMerge = playScript(stepIndex("merge") + 1);
    expect(seat(afterMerge, TUTORIAL_SELF).score).toBe(32);

    const end = playScript();
    expect(end.phase).toBe("finished");
    const scores = end.finalResult!.scores;
    const mine = scores.find((score) => score.player === TUTORIAL_SELF)!;
    const rival = scores.find((score) => score.player === TUTORIAL_RIVAL)!;
    expect([mine.total, rival.total]).toEqual([32, 32]);
    expect([mine.largest, rival.largest]).toEqual([6, 5]);
    expect(mine.regions).toContainEqual(expect.objectContaining({ t: "W", crowns: 2, points: 12 }));
    expect(end.finalResult!.winners).toEqual([TUTORIAL_SELF]);
  });

  it("剧本本身：步骤 id 不重复，最后一步是唯一的收尾，说明不空、不太长，结算框那一步在游戏结束之后", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finales = TUTORIAL_STEPS.filter((step) => step.kind === "info" && step.finale);
    expect(finales).toHaveLength(1);
    expect(TUTORIAL_STEPS.at(-1)).toBe(finales[0]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.say.trim().length).toBeGreaterThan(0);
      expect(step.say.length, step.id).toBeLessThanOrEqual(32);
      for (const note of [step.note, step.noteTouch]) {
        expect((note ?? "").split("。").filter((part) => part.trim()).length, step.id).toBeLessThanOrEqual(2);
      }
    }
    expect(stepIndex(TUTORIAL_FINAL_STEP)).toBeGreaterThan(stepIndex("rival-last"));
    // 侧栏的课程数：多了 1440×790 会撑出滚动
    expect(TUTORIAL_STEPS.filter((step) => step.lesson).length).toBeLessThanOrEqual(16);
  });

  it("剧本走完开练习局：两家都交给人机，150 局都能正常打完", () => {
    const stuck: string[] = [];
    for (let seed = 1; seed <= 150; seed += 1) {
      let game = createPracticeGame("小蒲", seed);
      let moves = 0;
      while (game.phase !== "finished" && moves < 200) {
        const id = actor(game);
        const command = botCommand(redactGameForViewer(game, id), id);
        if (!command) break;
        game = apply(game, id, command).state;
        moves += 1;
      }
      if (game.phase !== "finished" || !game.finalResult) stuck.push(`第 ${seed} 局（${moves} 步）`);
    }
    expect(stuck).toEqual([]);
  }, 60_000);
});
