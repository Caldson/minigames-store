# minigames-store

`https://minigamestore.caldson.us.ci` 的静态站点。

## 结构

```
index.html            商店首页：游戏列表、金币、登录、兑换红包
assets/
  store.css           样式
  store.js            登录 / 金币存档 / 开游戏 / 兑换
games/
  game-kit.js         三个游戏共用：把成绩 postMessage 给商店
  coincatcher.html    接金币
  klotski.html        数字华容道
  pacman.html         吃豆人
```

## 游戏怎么接入

游戏是**独立的 HTML**，不需要懂商店的代码，只要：

```html
<script src="game-kit.js"></script>
<script>
  // 一局结束时
  MG.report("your-game-id", score);
</script>
```

商店收到 `{ type: "mg-finish", game, score }` 后，把金币写进
`VTX.getData("minigames")` 的存档里（1000 金币 = 1 红包 = 1.00 VTX）。

游戏被商店用 iframe 打开时用 `parent.postMessage`，被 `window.open` 打开时用
`opener.postMessage`；两种都能收到。

新增一款游戏 = 在 `games/` 放一个 HTML，再在 `assets/store.js` 的 `GAMES`
数组里加一条。

## 本地预览

```bash
python ../minigames/main.py
```

（`minigames` 仓库里的 Flask 启动器，会把这个目录用 http:// 提供出来并打开浏览器。）

## 部署

GitHub Pages，自定义域 `minigamestore.caldson.us.ci`（`CNAME` 已就位）。
推上去就行，不需要构建。
