/* 三个游戏共用的小工具：把成绩报给商店。 */
(() => {
  "use strict";

  window.MG = {
    embedded() {
      return window.parent !== window;
    },

    /** 报成绩。商店收到 {type:"mg-finish"} 后写金币存档。 */
    report(game, score, extra) {
      const message = {
        type: "mg-finish",
        game: String(game),
        score: Math.max(0, Math.round(Number(score) || 0)),
        ...(extra || {}),
      };
      if (window.parent !== window) window.parent.postMessage(message, "*");
      if (window.opener && !window.opener.closed) window.opener.postMessage(message, "*");
      return message;
    },

    /** 让商店把游戏舞台关掉。 */
    close() {
      const message = { type: "mg-close" };
      if (window.parent !== window) {
        window.parent.postMessage(message, "*");
        return;
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, "*");
        window.close();
        return;
      }
      if (history.length > 1) history.back();
    },
  };
})();
