/* VitualMiniGames —— 商店逻辑
 *
 * 只做三件事：
 *   1. 用 vtx-sdk.js 在浏览器里登录 / 读写 data["minigames"] 金币存档
 *   2. 打开游戏 iframe，收游戏发来的 postMessage 成绩
 *   3. 兑换红包（1000 金币 = 1.00 VTX）
 *
 * 游戏本身是独立 HTML，不依赖这个文件；它们只负责 postMessage 报分。
 */
(() => {
  "use strict";

  const API_BASE = "https://xsmmc.caldson.us.ci";
  const GAME_KEY = "minigames";
  const COINS_PER_PACKET = 1000;
  const VTX_PER_PACKET = 1.0;

  /* 游戏报上来的 score 就是金币数（各自按自己的规则换算好），
     这里不再乘系数，直接记进存档。1000 金币 = 1 红包 = 1.00 VTX。 */
  const GAMES = [
    {
      id: "coincatcher",
      name: "接金币",
      icon: "🪙",
      desc: "左右移动篮子，45 秒内接住尽可能多的金币。每接住 1 枚 = 10 金币。",
      file: "games/coincatcher.html",
    },
    {
      id: "klotski",
      name: "数字华容道",
      icon: "🔢",
      desc: "把 1–15 按顺序排好，同一行/列的块可以整排推。最多 1000 金币（1.00 VTX）。",
      file: "games/klotski.html",
    },
    {
      id: "pacman",
      name: "吃豆人",
      icon: "👻",
      desc: "吃掉迷宫里的豆子，别被幽灵抓到。每颗豆 = 10 金币。",
      file: "games/pacman.html",
    },
  ];

  const $ = (id) => document.getElementById(id);

  const state = {
    wallet: { coins: 0, earned: 0, plays: 0, best: {} },
    account: null,
    vtx: null,
  };

  /* ------------------------------------------------------------------ 工具 */

  let toastTimer = null;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function loadSDK() {
    if (state.vtx) return Promise.resolve(state.vtx);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${API_BASE}/vtx-sdk.js`;
      script.onload = () => {
        if (!window.VTX) return reject(new Error("SDK 未挂载"));
        window.VTX.configure({ baseUrl: API_BASE });
        state.vtx = window.VTX;
        resolve(window.VTX);
      };
      script.onerror = () => reject(new Error("无法加载 vtx-sdk.js"));
      document.head.appendChild(script);
    });
  }

  function errorText(exc) {
    return (exc && (exc.message || exc.code)) || String(exc);
  }

  function normalizeWallet(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const best = source.best && typeof source.best === "object" ? source.best : {};
    const safe = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const out = { coins: safe(source.coins), earned: safe(source.earned), plays: safe(source.plays), best: {} };
    for (const game of GAMES) out.best[game.id] = safe(best[game.id]);
    return out;
  }

  /* ------------------------------------------------------------------ 渲染 */

  function renderHeader() {
    $("coins").textContent = state.account ? String(state.wallet.coins) : "—";
    const balance = state.account && state.account.money != null ? String(state.account.money) : "—";
    $("balance").textContent = balance;

    const packets = Math.floor(state.wallet.coins / COINS_PER_PACKET);
    const btn = $("redeemBtn");
    btn.disabled = !state.account || packets < 1;
    btn.textContent = packets >= 1 ? `兑换 ${packets} 个红包` : "兑换红包";

    $("loginBtn").textContent = state.account ? "退出登录" : "登录";
  }

  function renderGrid() {
    const grid = $("grid");
    grid.innerHTML = "";

    for (const game of GAMES) {
      const card = document.createElement("article");
      card.className = "card";

      const best = state.wallet.best[game.id] || 0;
      card.innerHTML = `
        <div class="cover">${game.icon}</div>
        <div class="card-body">
          <h3>${game.name}</h3>
          <p>${game.desc}</p>
          <div class="card-foot">
            <span class="best">最高 <b>${best}</b> 金币</span>
            <button class="primary" data-game="${game.id}">开始</button>
          </div>
        </div>`;

      card.querySelector("button").addEventListener("click", () => openGame(game));
      grid.appendChild(card);
    }

    $("empty").classList.add("hidden");
  }

  /* ------------------------------------------------------------------ 存档 */

  async function refresh() {
    const me = await state.vtx.me();
    state.account = me.account || me;

    const data = await state.vtx.getData(GAME_KEY);
    state.wallet = normalizeWallet(data.gameData);

    renderHeader();
    renderGrid();
  }

  async function award(gameId, score) {
    const value = Math.max(0, Math.min(9999, Math.round(Number(score) || 0)));
    if (value <= 0) return;

    if (!state.account) {
      toast(`本局 ${value} 金币 —— 登录后才会保存`);
      return;
    }

    const before = JSON.parse(JSON.stringify(state.wallet));

    state.wallet.coins += value;
    state.wallet.earned += value;
    state.wallet.plays += 1;
    state.wallet.best[gameId] = Math.max(state.wallet.best[gameId] || 0, value);

    renderHeader();
    renderGrid();

    try {
      await state.vtx.setData(GAME_KEY, state.wallet);
      toast(`+${value} 金币，累计 ${state.wallet.coins}`);
    } catch (exc) {
      state.wallet = before;
      renderHeader();
      renderGrid();
      toast(`存档失败：${errorText(exc)}`);
    }
  }

  async function redeem() {
    const packets = Math.floor(state.wallet.coins / COINS_PER_PACKET);
    if (packets < 1 || !state.account) return;

    const amount = (packets * VTX_PER_PACKET).toFixed(2);
    if (!window.confirm(`用 ${packets * COINS_PER_PACKET} 金币兑换 ${packets} 个红包（+${amount} VTX）？`)) {
      return;
    }

    const btn = $("redeemBtn");
    btn.disabled = true;

    try {
      const result = await state.vtx.receive({
        amount,
        party: "红包兑换",
        description: `金币兑换 ${packets} 个红包`,
      });
      state.wallet.coins -= packets * COINS_PER_PACKET;
      await state.vtx.setData(GAME_KEY, state.wallet);

      if (result && result.account) state.account = result.account;
      renderHeader();
      renderGrid();
      toast(`兑换成功，+${amount} VTX`);
    } catch (exc) {
      toast(`兑换失败：${errorText(exc)}`);
      renderHeader();
    }
  }

  /* ------------------------------------------------------------------ 登录 */

  function openLogin() {
    $("loginFrame").src = `${API_BASE}/API_LOGIN.html?embed=1`;
    $("loginModal").classList.remove("hidden");
  }

  function closeLogin() {
    $("loginModal").classList.add("hidden");
    $("loginFrame").src = "about:blank";
  }

  function logout() {
    state.vtx.logout();
    state.account = null;
    state.wallet = normalizeWallet({});
    renderHeader();
    renderGrid();
    toast("已退出登录");
  }

  /* ------------------------------------------------------------------ 游戏 */

  function openGame(game) {
    $("stageTitle").textContent = game.name;
    const frame = $("stageFrame");
    frame.src = `${game.file}?embed=1`;
    $("stage").classList.remove("hidden");
  }

  function closeStage() {
    $("stage").classList.add("hidden");
    $("stageFrame").src = "about:blank";
  }

  /* ------------------------------------------------------------------ 事件 */

  function wire() {
    $("loginBtn").addEventListener("click", () => (state.account ? logout() : openLogin()));
    $("loginClose").addEventListener("click", closeLogin);
    $("stageClose").addEventListener("click", closeStage);
    $("redeemBtn").addEventListener("click", redeem);

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "vtx-login") {
        if (event.origin !== API_BASE) return;
        if (!data.ok || !data.result) return;
        state.vtx.setToken(data.result.token);
        closeLogin();
        refresh().catch((exc) => toast(`读取账户失败：${errorText(exc)}`));
        return;
      }

      if (data.type === "mg-finish") {
        if (window.location.protocol !== "file:" && event.origin !== window.location.origin) return;
        award(String(data.game || ""), data.score);
        return;
      }

      if (data.type === "mg-close") closeStage();
    });
  }

  /* ------------------------------------------------------------------ 启动 */

  async function boot() {
    renderGrid();
    wire();

    try {
      await loadSDK();
    } catch (exc) {
      $("empty").classList.remove("hidden");
      $("empty").textContent = `加载 VTX SDK 失败：${errorText(exc)}`;
      return;
    }

    if (!state.vtx.isLoggedIn()) {
      renderHeader();
      return;
    }

    try {
      await refresh();
    } catch (exc) {
      toast(`读取账户失败：${errorText(exc)}`);
      renderHeader();
    }
  }

  boot();
})();
