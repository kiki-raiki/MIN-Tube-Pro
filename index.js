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



let currentPage = 0;
let currentQuery = "";
let apiListCache = [];

async function updateApiListCache() {
  let tempApiList = [];
  let mainApiList = [];
  
  // 1. GitHubのAPIリストを最初に取得
  try {
    const tempResponse = await fetch(TEMP_API_LIST);
    if (tempResponse.ok) {
      tempApiList = await tempResponse.json();
      console.log("GitHubのAPIリストを取得しました:", tempApiList);
    } else {
      console.error("GitHub APIリスト取得エラー:", tempResponse.status);
    }
  } catch (err) {
    console.error("GitHub APIリストの取得に失敗:", err);
  }

  // 2. GitHubのリストを`apiListCache`にセット
  if (tempApiList.length > 0) {
    apiListCache = tempApiList;
  }

  // 3. APIリストを取得
  try {
    const response = await fetch(API_HEALTH_CHECKER);
    if (response.ok) {
      mainApiList = await response.json();
      console.log("GlitchのAPIリストを取得しました:", mainApiList);
      // 4. リストが最新なら更新
      if (Array.isArray(mainApiList) && mainApiList.length > 0) {
        apiListCache = mainApiList;
        console.log("APIリストを最新のGlitchのリストに更新しました");
      }
    } else {
      console.error("APIヘルスチェッカーのエラー:", response.status);
    }
  } catch (err) {
    console.error("Glitch APIリストの取得に失敗:", err);
  }
}

updateApiListCache();

function fetchWithTimeout(url, options = {}, timeout = 4000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
    )
  ]);
}

app.use(async (req, res, next) => {
  await updateApiListCache();

  if (!req.cookies || req.cookies.humanVerified !== "true") {
    
    const pages = [
      'https://html-box.glitch.me/',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/3d.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/check.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/fx.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/nasa.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/nasa.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/study.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/math.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/modul.txt',
      'https://raw.githubusercontent.com/mino-hobby-pro/gisou-min2/refs/heads/main/check.txt'
    ];
    const randomPage = pages[Math.floor(Math.random() * pages.length)];

    try {
      const response = await fetch(randomPage);
      const htmlContent = await response.text();


      return res.render("robots", { content: htmlContent });
    } catch (err) {
      console.error("Error fetching external page:", err);
      return res.render("robots", { content: "<p>コンテンツの読み込みに失敗しました。</p>" });
    }
  }

  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.get("/api/search", async (req, res, next) => {
  const query = req.query.q;
  const page = req.query.page || 0;
  if (!query) {
    return res.status(400).json({ error: "検索クエリが必要です" });
  }
  try {
    const results = await yts.GetListByKeyword(query, false, 20, page);
    currentPage = parseInt(page) + 1;
    currentQuery = query;
    res.json(results);
  } catch (err) {
    next(err);
  }
});

app.get("/api/autocomplete", async (req, res, next) => {
  const keyword = req.query.q;
  if (!keyword) {
    return res.status(400).json({ error: "検索クエリが必要です" });
  }
  try {
    const url =
      "http://www.google.com/complete/search?client=youtube&hl=ja&ds=yt&q=" +
      encodeURIComponent(keyword);
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await response.text();
    const jsonStr = text.substring(19, text.length - 1);
    const suggestions = JSON.parse(jsonStr)[1];
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

app.get("/api/playlist", async (req, res, next) => {
  const channelName = req.query.channelName;
  if (!channelName) {
    return res.status(400).json({ error: "channelName パラメータが必要です" });
  }
  try {
    const playlistResults = await yts.GetListByKeyword(channelName, false, 10, 0);
    const playlistItems = playlistResults.items || [];
    const playlist = playlistItems.map(item => ({
      id: item.id,
      title: item.title || "No title"
    }));
    res.json({ playlist });
  } catch (err) {
    next(err);
  }
});

app.get("/api/playlist-ejs", async (req, res, next) => {
  const channelID = req.query.channelID;
  const authorName = req.query.authorName;
  if (!channelID || !authorName) {
    return res.status(400).json({ error: "channelID および authorName パラメータが必要です" });
  }
  try {
    const searchQuery = channelID + " " + authorName;
    const playlistResults = await yts.GetListByKeyword(searchQuery, false, 10, 0);
    const playlistItems = playlistResults.items || [];
    const playlist = playlistItems.map(item => ({
      id: item.id,
      title: item.title || "No title"
    }));
    res.json({ playlist });
  } catch (err) {
    next(err);
  }
});

app.get("/video/:id", async (req, res, next) => {
  const videoId = req.params.id;
  if (!videoId) {
    return res.status(400).send("動画IDが必要です");
  }
  
  try {
    if (!Array.isArray(apiListCache) || apiListCache.length === 0) {
      return res.status(500).send("有効なAPIリストが取得できませんでした。");
    }
    const apiList = apiListCache;

    let videoData = null;
    let commentsData = null;
    let successfulApi = null;

    const overallTimeout = 20000;
    const startTime = Date.now();

    while (Date.now() - startTime < overallTimeout) {
      for (const apiBase of apiList) {
        if (Date.now() - startTime >= overallTimeout) break;
        try {
          const videoResponse = await fetchWithTimeout(
            `${apiBase}/api/video/${videoId}`,
            {},
            9000
          );
          if (videoResponse.ok) {
            const tempData = await videoResponse.json();
            if (tempData.stream_url) {
              videoData = tempData;
              successfulApi = apiBase;
              break;
            }
          }
        } catch (err) {
          console.warn(`${apiBase} での動画取得エラー: ${err.message}`);
          continue;
        }
      }
      if (videoData && videoData.stream_url) break;
    }

    if (!videoData || !videoData.stream_url) {
      videoData = videoData || {};
      videoData.stream_url = "youtube-nocookie";
    }

    if (successfulApi) {
      try {
        const commentsResponse = await fetchWithTimeout(
          `${successfulApi}/api/comments/${videoId}`,
          {},
          4000
        );
        if (commentsResponse.ok) {
          commentsData = await commentsResponse.json();
        }
      } catch (err) {
        console.warn(`${successfulApi} でのコメント取得エラー: ${err.message}`);
      }
    }
    if (!commentsData) {
      commentsData = { commentCount: 0, comments: [] };
    }

    const streamEmbedHTML =
      videoData.stream_url !== "youtube-nocookie"
        ? `<video controls autoplay style="border-radius: 8px;">
             <source src="${videoData.stream_url}" type="video/mp4">
             お使いのブラウザは video タグに対応していません。
           </video>`
        : `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="border-radius: 8px;"></iframe>`;

    const youtubeEmbedHTML = `<iframe style="width: 932px; height:524px; border: none; border-radius: 8px;" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;

    let commentsHTML = "";
    if (commentsData.comments && Array.isArray(commentsData.comments) && commentsData.comments.length > 0) {
      commentsHTML = commentsData.comments
        .map((comment) => {
          const thumb =
            comment.authorThumbnails && comment.authorThumbnails.length > 0
              ? comment.authorThumbnails[0].url
              : "";
          return `
            <div class="comment">
              <div class="comment-header">
                ${thumb ? `<img class="avatar" src="${thumb}" alt="${comment.author}">` : ""}
                <span class="comment-author">${comment.author}</span>
                <span class="comment-time">${comment.publishedText || ""}</span>
              </div>
              <div class="comment-body">${comment.contentHtml || comment.content}</div>
              <div class="comment-stats">Likes: ${comment.likeCount || 0}</div>
            </div>
        `;
        })
        .join("");
    } else {
      commentsHTML = "<p>コメントがありません。</p>";
    }

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${videoData.videoTitle || "Youtube-Pro"}</title>

<style>

/* ===== 基本 ===== */
body{
  margin:0;
  font-family: "Roboto","Noto Sans JP",Arial,sans-serif;
  background:#0f0f0f;
  color:#fff;
}

/* ===== ヘッダー ===== */
.header{
  position:fixed;
  top:0;
  width:100%;
  height:56px;
  background:#0f0f0f;
  display:flex;
  align-items:center;
  padding:0 16px;
  border-bottom:1px solid #222;
  z-index:999;
}

.menu{
  font-size:20px;
  margin-right:16px;
  cursor:pointer;
}

.logo{
  color:#ff0000;
  font-weight:700;
  font-size:18px;
  margin-right:20px;
}

.search{
  flex:1;
  display:flex;
  max-width:600px;
}

.search input{
  flex:1;
  padding:10px;
  background:#121212;
  border:1px solid #303030;
  color:white;
}

.search button{
  background:#222;
  border:1px solid #303030;
  color:white;
  padding:10px 16px;
  cursor:pointer;
}

/* ===== レイアウト ===== */
.layout{
  display:flex;
  margin-top:56px;
}

/* ===== サイドバー ===== */
.sidebar{
  width:220px;
  background:#0f0f0f;
  padding:10px;
  border-right:1px solid #222;
}

.side-link{
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px;
  cursor:pointer;
  border-radius:8px;
}

.side-link:hover{
  background:#272727;
}

/* ===== メイン ===== */
.main{
  flex:1;
  padding:20px;
  display:flex;
  gap:20px;
}

/* ===== 動画 ===== */
.video-wrap{
  flex:3;
}

.video-player iframe,
.video-player video{
  width:100%;
  height:520px;
  background:black;
}

/* ===== タイトル ===== */
.title{
  font-size:18px;
  margin:12px 0;
}

/* ===== チャンネル ===== */
.channel{
  display:flex;
  justify-content:space-between;
  align-items:center;
}

.channel-left{
  display:flex;
  align-items:center;
  gap:10px;
}

.channel-left img{
  width:40px;
  border-radius:50%;
}

.subscribe{
  background:#cc0000;
  color:white;
  border:none;
  padding:10px 16px;
  cursor:pointer;
  border-radius:20px;
}

/* ===== アクション ===== */
.actions{
  display:flex;
  gap:10px;
  margin:10px 0;
}

.action{
  background:#272727;
  padding:8px 14px;
  border-radius:20px;
  cursor:pointer;
}

/* ===== 説明 ===== */
.desc{
  background:#1f1f1f;
  padding:12px;
  border-radius:10px;
  font-size:14px;
}

/* ===== コメント ===== */
.comments{
  margin-top:20px;
}

.comment{
  display:flex;
  gap:10px;
  margin-bottom:16px;
}

.comment img{
  width:36px;
  border-radius:50%;
}

/* ===== サイド動画 ===== */
.recommend{
  flex:1.5;
}

.rec-item{
  display:flex;
  gap:10px;
  margin-bottom:12px;
  cursor:pointer;
}

.rec-item img{
  width:168px;
}

.rec-title{
  font-size:14px;
}

.rec-channel{
  font-size:12px;
  color:#aaa;
}

/* ===== レスポンシブ ===== */
@media(max-width:1000px){
  .sidebar{display:none;}
  .main{flex-direction:column;}
}

</style>
</head>

<body>

<div class="header">
  <div class="menu">☰</div>
  <div class="logo">Youtube-Pro</div>

  <form class="search" id="searchForm">
    <input id="q" placeholder="検索">
    <button>🔍</button>
  </form>
</div>

<div class="layout">

<!-- サイドバー -->
<div class="sidebar">
  <div class="side-link">🏠 ホーム</div>
  <div class="side-link">🔥 急上昇</div>
  <div class="side-link">📺 登録チャンネル</div>
</div>

<!-- メイン -->
<div class="main">

<div class="video-wrap">

  <div class="video-player" id="player"></div>

  <div class="title">${videoData.videoTitle || ""}</div>

  <div class="channel">
    <div class="channel-left">
      <img src="${videoData.channelImage || ""}">
      <div>
        <div>${videoData.channelName || ""}</div>
        <div style="font-size:12px;color:#aaa;">登録者数非表示</div>
      </div>
    </div>

    <button class="subscribe">登録</button>
  </div>

  <div class="actions">
    <div class="action">👍 ${videoData.likeCount || 0}</div>
    <div class="action">共有</div>
    <div class="action">保存</div>
  </div>

  <div class="desc">
    ${videoData.videoViews || 0} 回視聴<br>
    ${videoData.videoDes || ""}
  </div>

  <div class="comments">
    <h3>コメント ${commentsData.commentCount}</h3>
    ${commentsHTML}
  </div>

</div>

<!-- 右 -->
<div class="recommend" id="rec"></div>

</div>
</div>

<script>

const stream = \`${streamEmbedHTML.replace(/`/g,"\\`")}\`;
const yt = \`${youtubeEmbedHTML.replace(/`/g,"\\`")}\`;

document.getElementById("player").innerHTML = stream;

/* 検索 */
document.getElementById("searchForm").onsubmit=e=>{
  e.preventDefault();
  location.href="/nothing/search?q="+encodeURIComponent(q.value);
};

/* サイド動画 */
fetch('/api/playlist?channelName=${videoData.channelName}')
.then(r=>r.json())
.then(d=>{
  let html="";
  d.playlist.forEach(v=>{
    html+=\`
      <div class="rec-item" onclick="location.href='/video/\${v.id}'">
        <img src="https://i3.ytimg.com/vi/\${v.id}/mqdefault.jpg">
        <div>
          <div class="rec-title">\${v.title}</div>
          <div class="rec-channel">${videoData.channelName}</div>
        </div>
      </div>
    \`;
  });
  rec.innerHTML=html;
});

/* ダブルクリックで切替 */
player.ondblclick=()=>{
  player.innerHTML=yt;
};

</script>

</body>
</html>
    `;
    res.send(html);
  } catch (err) {
    next(err);
  }
});

app.get("/channel/:channelId", async (req, res, next) => {
  const channelId = req.params.channelId;
  if (!channelId) {
    return res.status(400).send("チャンネルIDが必要です");
  }

  try {
    const apiBase = apiListCache[0];
    if (!apiBase) {
      return res.status(500).send("有効なAPIリストが取得できませんでした。");
    }
    const apiUrl = `${apiBase}/api/channels/${channelId}`;
    const response = await fetchWithTimeout(apiUrl, {}, 4000);
    if (!response.ok) {
      return res.status(500).send("チャンネル情報の取得に失敗しました");
    }
    const channelData = await response.json();
    
    res.render("channel", { channel: channelData });
  } catch (err) {
    next(err);
  }
});

app.get("/nothing/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.get("/api", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/api.html"));
});
app.get("/min-sp", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "staticproxy/min2-p.html"));
});
app.get("/helios", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "staticproxy/helios.html"));
});
app.get("/highimg", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "oasobi/night.html"));
});
app.get("/dl-thumbnail", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/samunedl.html"));
});
app.get("/set", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/set.html"));
});
app.get("/apps", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/apps.html"));
});

app.get("/i-img", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "txt/img.html"));
});

app.get("/bbs", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat/chat.html"));
});

app.get("/compiler", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/compiler.html"));
});

app.get("/labo5", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/labo5.html"));
});

app.get("/html-tube", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/html-tube.html"));
});


app.get("/3d-img", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/3d-img.html"));
});

app.get("/hd", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "oasobi/HD/mp4quality.html"));
});

app.get("/paste", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/paste.html"));
});

app.get("/link", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/link.html"));
});

app.get("/downloader", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app/yt.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/about.html"));
});
app.get("/minecraft", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "game/mine.html"));
});
app.get("/trend", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "trending.html"));
});
app.get("/proxy/client/unblocker-client.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "js/node-un-server.js"));
});

app.get('/all-api', async (req, res) => {
    const url = 'https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube2-all-api.json';
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});
app.get('/home-ch', async (req, res) => {
    const url = 'https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/home-ch.txt';
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});
app.get('/proxy/*', async (req, res) => {
    const targetUrl = req.params[0];
    if (!targetUrl) {
        res.status(400).send('URLパラメータが必要です');
        return;
    }

    const proxyUrl = `https://min-tube2-node-unblocker-server.vercel.app/proxy/${targetUrl}`;

    console.log(`Proxying request for: ${targetUrl}`);

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            res.status(response.status).send(`リクエストエラー: ${response.statusText}`);
            return;
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.startsWith('text/') || contentType.includes('application/json')) {
            const text = await response.text();
            res.set('Content-Type', contentType);
            res.send(text);
        } else {
            const buffer = await response.buffer();
            res.set('Content-Type', contentType);
            res.send(buffer);
        }
    } catch (error) {
        console.error('Error fetching URL:', error);
        res.status(500).send('サーバ内部エラー');
    }
});

app.get('/img/:videoId', async (req, res) => {
  const videoId = req.params.videoId;

  if (!videoId) {
    res.status(400).send('ちょっとしたエラー。。。');
    return;
  }

  const imageUrl = `https://i3.ytimg.com/vi/${videoId}/sddefault.jpg`;

  console.log(`Proxying YouTube thumbnail for video ID: ${videoId}`);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      res.status(response.status).send(`画像取得エラー: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';


    const buffer = await response.buffer();
    res.set('Content-Type', contentType);
    res.send(buffer);
  } catch (error) {
    console.error('Error fetching thumbnail:', error);
    res.status(500).send('サーバ内部エラー');
  }
});

app.get('/htmlproxy/*', async (req, res) => {
  const targetUrl = req.params[0];

  if (!targetUrl) {
    res.status(400).send('URLパラメータが必要です');
    return;
  }

  console.log(`Proxying request for: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      res.status(response.status).send(`リクエストエラー: ${response.statusText}`);
      return;
    }


    const contentType = response.headers.get('content-type') || '';

 
    if (contentType.startsWith('text/') || contentType.includes('application/json')) {
      const text = await response.text();
      res.set('Content-Type', contentType);
      res.send(text);
    } else {
     
      const buffer = await response.buffer();
      res.set('Content-Type', contentType);
      res.send(buffer);
    }
  } catch (error) {
    console.error('Error fetching URL:', error);
    res.status(500).send('サーバ内部エラー');
  }
});

app.get("/highstream/:id", async (req, res, next) => {
  const videoId = req.params.id;
  if (!videoId) {
    return res.status(400).send("動画IDが必要です");
  }

  try {
    if (!Array.isArray(apiListCache) || apiListCache.length === 0) {
      return res.status(500).send("リロードしてください");
    }
    const apiList = apiListCache;

    let streamData = null;
    let successfulApi = null;

    const overallTimeout = 20000;
    const startTime = Date.now();

    while (Date.now() - startTime < overallTimeout) {
      for (const apiBase of apiList) {
        if (Date.now() - startTime >= overallTimeout) break;
        try {

          const response = await fetchWithTimeout(
            `${apiBase}/api/video/${videoId}`,
            {},
            9000
          );
          if (response.ok) {
            const tempData = await response.json();
            // highstreamUrl と audioUrl の両方を確認する
            if (tempData.highstreamUrl && tempData.audioUrl) {
              streamData = tempData;
              successfulApi = apiBase;
              break;
            }
          }
        } catch (err) {
          console.warn(`${apiBase} でのハイストリーム取得エラー: ${err.message}`);
          continue;
        }
      }
      if (streamData && streamData.highstreamUrl && streamData.audioUrl) break;
    }

    if (!streamData || !streamData.highstreamUrl || !streamData.audioUrl) {
      // 有効なデータが取得できなかった場合のフォールバック処理
      streamData = streamData || {};
      streamData.highstreamUrl = "youtube-nocookie";
      // audioUrl が取得できなければ、空文字または適切なデフォルト値に設定
      streamData.audioUrl = "";
    }

    // highstream.ejs テンプレートへ、取得した highstreamUrl と audioUrl を渡してレンダリング
    return res.render("highstream", streamData);
  } catch (err) {
    next(err);
  }
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/sign-in.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signin.html"));
});
app.get("/rireki.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rireki.html"));
});
app.get('/status', (req, res) => {
  const startHR = process.hrtime();
  const currentTime = new Date();
  const uptime = process.uptime();

  const initialDiff = process.hrtime(startHR);
  const responseTimeMs = initialDiff[0] * 1e3 + initialDiff[1] / 1e6;

  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / (1024 * 1024);

  const cpuUsage = process.cpuUsage();
  const totalCpuMicro = cpuUsage.user + cpuUsage.system;

  let responseScore;
  if (responseTimeMs < 5) {
    responseScore = 100;
  } else if (responseTimeMs < 20) {
    responseScore = 80;
  } else if (responseTimeMs < 50) {
    responseScore = 60;
  } else {
    responseScore = 40;
  }

  let memoryScore;
  if (heapUsedMB < 100) {
    memoryScore = 100;
  } else if (heapUsedMB < 200) {
    memoryScore = 80;
  } else if (heapUsedMB < 300) {
    memoryScore = 60;
  } else {
    memoryScore = 40;
  }

  let cpuScore;
  if (totalCpuMicro < 100000) {
    cpuScore = 100;
  } else if (totalCpuMicro < 300000) {
    cpuScore = 80;
  } else if (totalCpuMicro < 500000) {
    cpuScore = 60;
  } else {
    cpuScore = 40;
  }

  const overallScore = Math.round((responseScore + memoryScore + cpuScore) / 3);
  let healthStatus;
  if (overallScore >= 90) {
    healthStatus = `Excellent (${overallScore}%)`;
  } else if (overallScore >= 70) {
    healthStatus = `Good (${overallScore}%)`;
  } else if (overallScore >= 50) {
    healthStatus = `Fair (${overallScore}%)`;
  } else {
    healthStatus = `Poor (${overallScore}%)`;
  }


  const finalDiff = process.hrtime(startHR);
  const finalResponseTimeMs = finalDiff[0] * 1e3 + finalDiff[1] / 1e6;

  res.json({
    status: "OK",
    serverTime: currentTime,
    uptime: uptime,
    responseTime: finalResponseTimeMs,
    memoryUsage: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
    },
    cpuUsage: cpuUsage,
    health: healthStatus
  });
});



app.post("/api/save-history", express.json(), async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: "videoId必要" });
  }

  res.json({ success: true });
});

app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, "public", "error.html"));
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, "public", "error.html"));
});

app.listen(port, () => {
  console.log(`サーバーがポート ${port} で起動。`);
});
