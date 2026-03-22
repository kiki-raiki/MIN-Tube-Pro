const express = require("express");
const path = require("path");
const yts = require("youtube-search-api");
const fetch = require("node-fetch");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 3000;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

const API_HEALTH_CHECKER = "https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json";
const TEMP_API_LIST = "https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json";

app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

let apiListCache = [];

async function updateApiListCache() {
  try {
    const response = await fetch(API_HEALTH_CHECKER);
    if (response.ok) {
      const mainApiList = await response.json();
      if (Array.isArray(mainApiList) && mainApiList.length > 0) {
        apiListCache = mainApiList;
        console.log("API List updated.");
      }
    }
  } catch (err) {
    console.error("API update failed.");
  }
}

updateApiListCache();
setInterval(updateApiListCache, 1000 * 60 * 10);

function fetchWithTimeout(url, options = {}, timeout = 5000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
    )
  ]);
}

// ミドルウェア: 人間確認
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/video") || req.path === "/") {
    if (!req.cookies || req.cookies.humanVerified !== "true") {
      const pages = [
        'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/3d.txt',
        'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/math.txt',
        'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/study.txt'
      ];
      const randomPage = pages[Math.floor(Math.random() * pages.length)];
      try {
        const response = await fetch(randomPage);
        const htmlContent = await response.text();
        return res.render("robots", { content: htmlContent });
      } catch (err) {
        return res.render("robots", { content: "<p>Verification Required</p>" });
      }
    }
  }
  next();
});

// --- API ENDPOINTS ---

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.get("/api/trending", async (req, res) => {
  const page = parseInt(req.query.page) || 0;
  try {
    // 1. 本物のトレンドを抽出するためのシードキーワード群
    // 単なる「急上昇」という言葉ではなく、YouTubeで常にトラフィックが高い「動詞」や「属性」を組み合わせる
    const trendingSeeds = [
      "人気急上昇", "最新 ニュース", "Music Video Official", 
      "ゲーム実況 人気", "話題の動画", "トレンド", 
      "Breaking News Japan", "Top Hits", "いま話題"
    ];

    // ページ数に応じてシードを切り替え、常に新鮮なデータを確保
    const seed1 = trendingSeeds[(page * 2) % trendingSeeds.length];
    const seed2 = trendingSeeds[(page * 2 + 1) % trendingSeeds.length];

    // 2. 複数の角度から検索を並列実行
    const [res1, res2] = await Promise.all([
      yts.GetListByKeyword(seed1, false, 25),
      yts.GetListByKeyword(seed2, false, 25)
    ]);

    let combined = [...(res1.items || []), ...(res2.items || [])];
    const finalItems = [];
    const seenIdsServer = new Set();

    for (const item of combined) {
      // 厳格なフィルタリング
      // (1) 動画のみ (2) Shorts除外 → 削除 (3) 重複除外 (4) チャンネルやプレイリストを除外
      if (item.type === 'video' && 
          !seenIdsServer.has(item.id)) {
        
        // 人気動画らしい「指標（視聴回数テキスト）」があるかチェック（任意）
        // 視聴回数が入っていないものは「急上昇」とは言えないため
        if (item.viewCountText) {
          seenIdsServer.add(item.id);
          finalItems.push(item);
        }
      }
    }

    // 3. 多様性を出すための加重シャッフル
    const result = finalItems.sort(() => 0.5 - Math.random());
    res.json({ items: result });
    
  } catch (err) {
    console.error("Trending API Error:", err);
    res.json({ items: [] });
  }
});


app.get("/api/search", async (req, res, next) => {
  const query = req.query.q;
  const page = req.query.page || 0;
  if (!query) return res.status(400).json({ error: "Query required" });
  try {
    const results = await yts.GetListByKeyword(query, false, 20, page);
    res.json(results);
  } catch (err) { next(err); }
});

// ★★★ 究極のパーフェクト・アルゴリズム (No Shorts, No Channels) ★★★
app.get("/api/recommendations", async (req, res) => {
  const { title, channel, id } = req.query;
  try {
    // 1. タイトルのクレンジング（検索精度向上）
    const cleanKwd = title
      .replace(/[【】「」()!！?？\[\]]/g, ' ')
      .replace(/#shorts|shorts|ショート/gi, '') // 検索ワードからShortsを排除
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleanKwd.split(' ').filter(w => w.length >= 2);
    const mainTopic = words.length > 0 ? words.slice(0, 2).join(' ') : cleanKwd;

    // 2. 複数のソースから候補を収集
    const [topicRes, channelRes, relatedRes] = await Promise.all([
      yts.GetListByKeyword(`${mainTopic}`, false, 12),
      yts.GetListByKeyword(`${channel}`, false, 8),
      yts.GetListByKeyword(`${mainTopic} 関連`, false, 8)
    ]);

    let rawList = [
      ...(topicRes.items || []),
      ...(channelRes.items || []),
      ...(relatedRes.items || [])
    ];

    // 3. 厳格なフィルタリング・フェーズ
    const seenIds = new Set([id]); 
    const seenNormalizedTitles = new Set();
    const finalItems = [];

    for (const item of rawList) {
      // (1) アカウント（Channel）やプレイリストを除外、動画のみを許可
      if (!item.id || item.type !== 'video') continue;
      
      // (2) すでにリストにある、または現在の動画ならスキップ
      if (seenIds.has(item.id)) continue;

      // (3) Shortsの徹底排除ロジック
      const isShortsTitle = /#shorts|shorts|ショート/gi.test(item.title);
      // 一部のAPIではthumbnailのURLにshortsが含まれる、または特定のフラグがある
      const isShortsThumb = item.thumbnail?.thumbnails?.[0]?.url?.includes('shorts');
      if (isShortsTitle || isShortsThumb) continue;

      // (4) タイトルの正規化による「重複内容」の排除
      const normalized = item.title.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/official|lyrics|mv|musicvideo|video|公式|実況|解説|ショート|#shorts/g, '');

      // 内容が似すぎている動画（例：同じ曲の別アップロードなど）を排除
      const titleSig = normalized.substring(0, 12);
      if (seenNormalizedTitles.has(titleSig)) continue;

      // 合格した動画をリストに追加
      seenIds.add(item.id);
      seenNormalizedTitles.add(titleSig);
      finalItems.push(item);

      if (finalItems.length >= 18) break; 
    }

    // 4. シャッフルして自然なおすすめ感を演出
    const result = finalItems.sort(() => 0.5 - Math.random());
    
    res.json({ items: result });
  } catch (err) {
    console.error("Rec Engine Error:", err);
    res.json({ items: [] });
  }
});

// --- VIDEO PAGE ---

app.get("/video/:id", async (req, res, next) => {
  const videoId = req.params.id;
  
  try {
    let videoData = null;
    let commentsData = { commentCount: 0, comments: [] };
    let successfulApi = null;

    for (const apiBase of apiListCache) {
      try {
        const response = await fetchWithTimeout(`${apiBase}/api/video/${videoId}`, {}, 6000);
        if (response.ok) {
          const data = await response.json();
          if (data.stream_url) {
            videoData = data;
            successfulApi = apiBase;
            break;
          }
        }
      } catch (e) { continue; }
    }

    if (!videoData) {
      videoData = { videoTitle: "再生できない動画", stream_url: "youtube-nocookie" };
    }

    if (successfulApi) {
      try {
        const cRes = await fetchWithTimeout(`${successfulApi}/api/comments/${videoId}`, {}, 3000);
        if (cRes.ok) commentsData = await cRes.json();
      } catch (e) {}
    }

    const isShortForm = videoData.videoTitle.includes('#');

    if (isShortForm) {
      // --- SHORTS MODE HTML (ULTIMATE DESIGN) ---
      const shortsHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${videoData.videoTitle}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; color: #fff; font-family: "Roboto", sans-serif; overflow: hidden; }
        
        .shorts-wrapper {
            position: relative; width: 100%; height: 100%;
            display: flex; justify-content: center; align-items: center;
        }

        .video-container {
            position: relative;
            height: 96vh;
            aspect-ratio: 9/16;
            background: #000;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @media (max-width: 650px) {
            .video-container { height: 100%; width: 100%; border-radius: 0; aspect-ratio: auto; }
        }

        video, iframe { width: 100%; height: 100%; object-fit: cover; border: none; }

        /* ナビゲーションボタン (↑ ↓) */
        .nav-controls {
            position: absolute; right: 12px; top: 50%; transform: translateY(-130%);
            display: flex; flex-direction: column; gap: 12px; z-index: 15;
        }
        .nav-btn {
            width: 44px; height: 44px; background: rgba(255,255,255,0.15);
            border: none; border-radius: 50%; color: #fff; font-size: 18px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.2s; backdrop-filter: blur(5px);
        }
        .nav-btn:hover { background: rgba(255,255,255,0.25); }
        .nav-btn:active { transform: scale(0.9); }

        /* サイドバーアクション */
        .side-bar {
            position: absolute; right: 8px; bottom: 80px;
            display: flex; flex-direction: column; gap: 16px; align-items: center;
            z-index: 10;
        }
        .action-btn { display: flex; flex-direction: column; align-items: center; cursor: pointer; }
        .btn-icon {
            width: 48px; height: 48px; background: rgba(255,255,255,0.12);
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 22px; transition: 0.2s; margin-bottom: 4px;
        }
        .btn-icon:active { transform: scale(0.9); background: rgba(255,255,255,0.25); }
        .action-btn span { font-size: 11px; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }

        /* ボトムオーバーレイ */
        .bottom-overlay {
            position: absolute; bottom: 0; left: 0; width: 100%;
            padding: 80px 16px 20px;
            background: linear-gradient(transparent, rgba(0,0,0,0.85));
            z-index: 5; pointer-events: none;
        }
        .bottom-overlay * { pointer-events: auto; }
        .channel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .channel-row img { width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); }
        .channel-handle { font-weight: bold; font-size: 15px; }
        .sub-btn {
            background: #fff; color: #000; border: none; padding: 6px 14px;
            border-radius: 20px; font-size: 12px; font-weight: bold; cursor: pointer;
        }
        .v-title { font-size: 14px; line-height: 1.4; max-width: 85%; }

        /* 進行状況バー */
        .progress-wrap { position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: rgba(255,255,255,0.1); z-index: 12; }
        .progress-fill { height: 100%; background: #ff0000; width: 0%; }

        /* コメント */
        .comments-slide {
            position: absolute; bottom: 0; left: 0; width: 100%; height: 70%;
            background: #181818; border-radius: 16px 16px 0 0;
            z-index: 20; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex; flex-direction: column;
        }
        .comments-slide.open { transform: translateY(0); }
        .c-header { padding: 16px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .c-body { flex: 1; overflow-y: auto; padding: 16px; }

        .back-top { position: absolute; top: 16px; left: 16px; z-index: 15; color: #fff; font-size: 20px; text-shadow: 0 0 5px #000; }
        .loading { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 100; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: 0.3s; }
        .loading.active { opacity: 1; }
    </style>
</head>
<body>

    <div id="loader" class="loading"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>

    <div class="shorts-wrapper">
        <div class="video-container">
            <a href="/" class="back-top"><i class="fas fa-arrow-left"></i></a>

            <div class="nav-controls">
                <button class="nav-btn" onclick="history.back()"><i class="fas fa-chevron-up"></i></button>
                <button class="nav-btn" onclick="loadNextShort()"><i class="fas fa-chevron-down"></i></button>
            </div>

            ${videoData.stream_url !== "youtube-nocookie" 
                ? `<video id="vPlayer" src="${videoData.stream_url}" autoplay loop playsinline></video>` 
                : `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1" allow="autoplay"></iframe>`
            }

            <div class="progress-wrap"><div id="pFill" class="progress-fill"></div></div>

            <div class="side-bar">
                <div class="action-btn"><div class="btn-icon"><i class="fas fa-thumbs-up"></i></div><span>${videoData.likeCount || '評価'}</span></div>
                <div class="action-btn"><div class="btn-icon"><i class="fas fa-thumbs-down"></i></div><span>低評価</span></div>
                <div class="action-btn" onclick="toggleC()"><div class="btn-icon"><i class="fas fa-comment-dots"></i></div><span>${commentsData.commentCount || 0}</span></div>
                <div class="action-btn"><div class="btn-icon"><i class="fas fa-share"></i></div><span>共有</span></div>
                <div class="action-btn" style="margin-top:10px;"><div class="btn-icon" style="background:none;"><img src="${videoData.channelImage}" style="width:34px; height:34px; border-radius:6px; border:2px solid #fff;"></div></div>
            </div>

            <div class="bottom-overlay">
                <div class="channel-row">
                    <img src="${videoData.channelImage || 'https://via.placeholder.com/40'}">
                    <span class="channel-handle">@${videoData.channelName}</span>
                    <button class="sub-btn">登録</button>
                </div>
                <div class="v-title">${videoData.videoTitle}</div>
            </div>

            <div id="cSlide" class="comments-slide">
                <div class="c-header">
                    <h3 style="margin:0; font-size:16px;">コメント</h3>
                    <i class="fas fa-times" style="cursor:pointer;" onclick="toggleC()"></i>
                </div>
                <div class="c-body">
                    ${commentsData.comments.length > 0 ? commentsData.comments.map(c => `
                        <div style="display:flex; gap:12px; margin-bottom:18px;">
                            <img src="${c.authorThumbnails?.[0]?.url}" style="width:32px; height:32px; border-radius:50%;">
                            <div>
                                <div style="font-size:12px; color:#aaa; font-weight:bold;">${c.author}</div>
                                <div style="font-size:14px; margin-top:2px;">${c.content}</div>
                            </div>
                        </div>
                    `).join('') : '<p style="text-align:center; color:#888;">コメントなし</p>'}
                </div>
            </div>
        </div>
    </div>

    <script>
        let sY = 0;
        const loader = document.getElementById('loader');
        const cSlide = document.getElementById('cSlide');
        const v = document.getElementById('vPlayer');
        const pf = document.getElementById('pFill');

        if (v) {
            v.ontimeupdate = () => { pf.style.width = (v.currentTime / v.duration * 100) + '%'; };
        }

        function toggleC() { cSlide.classList.toggle('open'); }

        async function loadNextShort() {
            if (cSlide.classList.contains('open')) return;
            loader.classList.add('active');
            try {
                const p = new URLSearchParams({ title: "${videoData.videoTitle}", channel: "${videoData.channelName}", id: "${videoId}" });
                const r = await fetch(\`/api/recommendations?\${p.toString()}\`);
                const d = await r.json();
                const next = d.items.find(i => i.title.includes('#')) || d.items[0];
                window.location.href = next ? '/video/' + next.id : '/';
            } catch (e) { window.location.href = '/'; }
        }

        window.addEventListener('touchstart', e => sY = e.touches[0].pageY);
        window.addEventListener('touchend', e => { if (sY - e.changedTouches[0].pageY > 100) loadNextShort(); });
        window.addEventListener('wheel', e => { if (e.deltaY > 50) loadNextShort(); }, { passive: true });

        document.addEventListener('click', (e) => {
            if (cSlide.classList.contains('open') && !cSlide.contains(e.target) && !e.target.closest('.action-btn')) toggleC();
        });
    </script>
</body>
</html>`;
      return res.send(shortsHtml);
    }

    // --- STANDARD VIDEO MODE HTML ---
    const streamEmbed = videoData.stream_url !== "youtube-nocookie"
      ? `<video controls autoplay poster="https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg">
           <source src="${videoData.stream_url}" type="video/mp4">
         </video>`
      : `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${videoData.videoTitle} - YouTube Pro</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        :root { --bg-main: #0f0f0f; --bg-secondary: #272727; --text-main: #f1f1f1; --text-sub: #aaaaaa; --yt-red: #ff0000; }
        body { margin: 0; background: var(--bg-main); color: var(--text-main); font-family: "Roboto", sans-serif; overflow-x: hidden; }
        .navbar { position: fixed; top: 0; width: 100%; height: 56px; background: var(--bg-main); display: flex; align-items: center; justify-content: space-between; padding: 0 16px; box-sizing: border-box; z-index: 1000; border-bottom: 1px solid #222; }
        .logo { display: flex; align-items: center; color: white; text-decoration: none; font-weight: bold; font-size: 18px; }
        .logo i { color: var(--yt-red); font-size: 24px; margin-right: 4px; }
        .search-bar { display: flex; flex: 0 1 600px; background: #121212; border: 1px solid #303030; border-radius: 40px; padding: 0 16px; }
        .search-bar input { width: 100%; background: transparent; border: none; color: white; height: 38px; outline: none; }
        .container { margin-top: 56px; display: flex; justify-content: center; padding: 24px; gap: 24px; max-width: 1700px; margin: 56px auto 0; }
        .main-content { flex: 1; }
        .sidebar { width: 400px; }
        .player-container { width: 100%; aspect-ratio: 16 / 9; background: black; border-radius: 12px; overflow: hidden; }
        .player-container video, .player-container iframe { width: 100%; height: 100%; border: none; }
        .video-title { font-size: 20px; font-weight: bold; margin: 12px 0; }
        .description-box { background: var(--bg-secondary); border-radius: 12px; padding: 12px; font-size: 14px; margin-bottom: 24px; }
        .comment-item { display: flex; gap: 16px; margin-bottom: 20px; }
        .comment-avatar { width: 40px; height: 40px; border-radius: 50%; }
        .rec-item { display: flex; gap: 8px; margin-bottom: 12px; cursor: pointer; text-decoration: none; color: inherit; }
        .rec-thumb { width: 160px; height: 90px; border-radius: 8px; overflow: hidden; }
        .rec-thumb img { width: 100%; height: 100%; object-fit: cover; }
        @media (max-width: 1000px) { .container { flex-direction: column; } .sidebar { width: 100%; } }
    </style>
</head>
<body>
<nav class="navbar">
    <a href="/" class="logo"><i class="fab fa-youtube"></i>YouTube Pro</a>
    <form class="search-bar" action="/nothing/search">
        <input type="text" name="q" placeholder="検索">
    </form>
    <div style="width:40px;"></div>
</nav>
<div class="container">
    <div class="main-content">
        <div class="player-container">${streamEmbed}</div>
        <h1 class="video-title">${videoData.videoTitle}</h1>
        <div class="description-box"><b>${videoData.videoViews || '0'} 回視聴</b><br>${videoData.videoDes || ''}</div>
        <div class="comments-section">
            <h3>コメント ${commentsData.commentCount} 件</h3>
            ${commentsData.comments.map(c => `
                <div class="comment-item">
                    <img class="comment-avatar" src="${c.authorThumbnails?.[0]?.url || ''}">
                    <div><span style="font-weight:bold; font-size:13px;">${c.author}</span><div style="font-size:14px;">${c.content}</div></div>
                </div>
            `).join('')}
        </div>
    </div>
    <div class="sidebar" id="recommendations"></div>
</div>
<script>
    async function loadRecommendations() {
        const p = new URLSearchParams({ title: "${videoData.videoTitle}", channel: "${videoData.channelName}", id: "${videoId}" });
        const r = await fetch(\`/api/recommendations?\${p.toString()}\`);
        const d = await r.json();
        document.getElementById('recommendations').innerHTML = d.items.map(i => \`
            <a href="/video/\${i.id}" class="rec-item">
                <div class="rec-thumb"><img src="https://i.ytimg.com/vi/\${i.id}/mqdefault.jpg"></div>
                <div><div style="font-size:14px; font-weight:bold;">\${i.title}</div><div style="font-size:12px; color:#aaa;">\${i.channelTitle}</div></div>
            </a>\`).join('');
    }
    window.onload = loadRecommendations;
</script>
</body>
</html>`;
    res.send(html);
  } catch (err) { next(err); }
});

app.get("/nothing/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.post("/api/save-history", express.json(), (req, res) => {
  res.json({ success: true });
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "error.html")));
app.use((err, req, res, next) => {
  res.status(500).sendFile(path.join(__dirname, "public", "error.html"));
});

app.listen(port, () => console.log(`Server is running on port \${port}`));
