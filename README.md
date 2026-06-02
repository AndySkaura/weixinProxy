# weixin-proxy-ilink

一个基于 **iLink 协议** 的 Node.js 微信 Bot。支持微信扫码登录、长轮询接收消息，以及文本、图片、视频和文件的收发。

项目链接：

- GitHub：[AndySkaura/weixinProxy](https://github.com/AndySkaura/weixinProxy)
- npm：[weixin-proxy-ilink](https://www.npmjs.com/package/weixin-proxy-ilink)
- 作者：[kuraa.cc](https://kuraa.cc)

本项目支持两种使用方式：

- [作为 CLI 使用](#作为-cli-使用)：适合直接在终端扫码登录、监听和收发消息。
- [作为 Node.js 库使用](#作为-nodejs-库使用)：适合集成到服务端应用、自动回复程序或其他 Bot 项目。

详细文档：

- [安装](#安装)
- [CLI：扫码登录](#扫码登录)
- [CLI：接收消息](#接收消息)
- [CLI：发送消息](#发送消息)
- [CLI：交互模式](#交互模式)
- [环境变量](#环境变量)
- [媒体处理](#媒体处理)
- [库：初始化参数](#初始化参数)
- [库：自定义状态存储](#自定义状态存储)

## 安装

```bash
npm install
```

需要 Node.js 18 或更高版本。

作为 npm 包全局安装后也可以直接运行：

```bash
npm install -g weixin-proxy-ilink
wxilink login
```

全局安装后推荐使用短命令 `wxilink`。完整命令 `weixin-proxy-ilink` 和兼容命令 `weixin-proxy` 也仍然可用。

不全局安装时，可以用：

```bash
npx weixin-proxy-ilink login
```

## 作为 CLI 使用

CLI 适合在终端中直接操作。全局安装后推荐使用短命令 `wxilink`。

## 扫码登录

```bash
npm run login
```

全局安装后等价命令：

```bash
wxilink login
```

终端会显示二维码，用手机微信扫码并确认。登录成功后，凭证会保存到 `.weixin-proxy/state.json`。

## 接收消息

```bash
npm run listen
```

全局安装后：

```bash
wxilink listen
```

收到消息后会打印：

```text
[时间] <from_user_id>: <文本>
```

同时会保存该联系人最新的 `context_token`。这是后续发送消息所必需的。

收到图片、视频或文件时，程序会从微信 CDN 下载密文并自动解密，默认保存到 `.weixin-proxy/media`。

## 发送消息

```bash
npm run send -- <user_id> <text>
```

示例：

```bash
npm run send -- wxid_xxx 你好
```

全局安装后：

```bash
wxilink send wxid_xxx 你好
```

注意：通常必须先让对方给你发一条消息，并通过 `listen` 或 `repl` 接收到它，这样本地状态里才会有该 `user_id` 的 `context_token`。没有 `context_token` 时，接口不能完成主动发送。

发送图片、文件或视频：

```bash
npm run send-image -- <user_id> ./photo.jpg
npm run send-file -- <user_id> ./report.pdf
npm run send-video -- <user_id> ./demo.mp4
```

全局安装后对应命令为 `wxilink send-image`、`send-file` 和 `send-video`。

## 交互模式

```bash
npm run repl
```

全局安装后：

```bash
wxilink repl
```

支持命令：

```text
/send <user_id> <text>
/send-image <user_id> <file_path>
/send-file <user_id> <file_path>
/send-video <user_id> <file_path>
/sessions
/quit
```

## 环境变量

| 变量 | 默认值 |
| --- | --- |
| `WEIXIN_OC_BASE_URL` | `https://ilinkai.weixin.qq.com` |
| `WEIXIN_OC_BOT_TYPE` | `3` |
| `WEIXIN_PROXY_STATE` | `.weixin-proxy/state.json` |
| `WEIXIN_PROXY_MEDIA_DIR` | `.weixin-proxy/media` |
| `WEIXIN_OC_CDN_BASE_URL` | `https://novac2c.cdn.weixin.qq.com/c2c` |
| `WEIXIN_OC_API_TIMEOUT_MS` | `15000` |
| `WEIXIN_OC_LONG_POLL_TIMEOUT_MS` | `35000` |
| `WEIXIN_OC_QR_POLL_INTERVAL_MS` | `1000` |

## 媒体处理

图片、视频和文件通过微信 CDN 传输。程序会自动执行 AES-128-ECB 加解密、MD5 计算、`getuploadurl` 请求以及 CDN 上传下载。

图片和视频发送支持可选缩略图。基础包不会自动调用 `sharp` 或 `ffmpeg`，需要由调用方传入已经生成的缩略图路径。CLI 默认发送不带缩略图的媒体。

`.weixin-proxy/state.json` 包含登录凭证，已经在 `.gitignore` 中忽略，请不要提交或分享。

## 作为 Node.js 库使用

项目也可以作为 npm 库集成到 Node.js 应用中。推荐使用高层封装，只需要一个 bot 对象：

```js
import { createWeixinProxyBot } from "weixin-proxy-ilink";

const bot = createWeixinProxyBot();

await bot.login({
  onQr({ content }) {
    // content 是二维码内容；Web 服务里可以把它转成图片给前端展示。
    console.log("请扫码:", content);
  },
  onStatus(status) {
    console.log("登录状态:", status.qrStatus);
  },
});

bot.onMessage(async (message) => {
  console.log(`${message.fromUserId}: ${message.text}`);

  if (message.text === "ping") {
    await bot.send(message.fromUserId, "pong");
  }
});

await bot.start();
```

如果你已经通过 CLI 登录过，也可以直接复用本地状态：

```js
import { createWeixinProxyBot } from "weixin-proxy-ilink";

const bot = createWeixinProxyBot({
  statePath: ".weixin-proxy/state.json",
  mediaDir: ".weixin-proxy/media",
});

bot.onMessage((message) => {
  console.log(message);
});

await bot.start();
```

### 初始化参数

`createWeixinProxyBot(options)` 支持以下参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `https://ilinkai.weixin.qq.com` | iLink API 地址 |
| `cdnBaseUrl` | `https://novac2c.cdn.weixin.qq.com/c2c` | 微信媒体 CDN 地址 |
| `botType` | `"3"` | 扫码登录时传给 iLink 的 Bot 类型 |
| `statePath` | `<当前工作目录>/.weixin-proxy/state.json` | 默认状态文件路径，保存登录 token、同步游标和联系人 `context_token` |
| `mediaDir` | `<当前工作目录>/.weixin-proxy/media` | 收到图片、视频和文件后的解密保存目录 |
| `apiTimeoutMs` | `15000` | 普通 API 和 CDN 请求超时时间，单位为毫秒 |
| `longPollTimeoutMs` | `35000` | `getupdates` 长轮询超时时间，单位为毫秒 |
| `qrPollIntervalMs` | `1000` | 扫码登录状态轮询间隔，单位为毫秒 |
| `store` | `new StateStore(statePath)` | 自定义状态存储。传入后 `statePath` 不再生效 |
| `fetchImpl` | `globalThis.fetch` | 自定义 HTTP 请求实现，适合代理、测试或链路追踪 |
| `client` | 自动创建 `WeixinClient` | 自定义 iLink API 客户端，主要用于二次开发或测试 |
| `cdnClient` | 自动创建 `CdnClient` | 自定义 CDN 客户端，主要用于二次开发或测试 |
| `media` | 自动创建 `MediaService` | 自定义媒体处理服务，主要用于二次开发或测试 |

完整示例：

```js
import { createWeixinProxyBot } from "weixin-proxy-ilink";

const bot = createWeixinProxyBot({
  baseUrl: "https://ilinkai.weixin.qq.com",
  cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
  botType: "3",
  statePath: "./data/weixin/state.json",
  mediaDir: "./data/weixin/media",
  apiTimeoutMs: 15000,
  longPollTimeoutMs: 35000,
  qrPollIntervalMs: 1000,
});
```

生产环境建议显式设置 `statePath` 和 `mediaDir`，避免进程工作目录变化后找不到原有登录状态或媒体缓存。

### 自定义状态存储

如果不希望将登录状态写入本地 `state.json`，可以传入自定义 `store`。它至少需要实现异步的 `load()` 和 `save(state)`：

```js
import { createWeixinProxyBot } from "weixin-proxy-ilink";

const customStore = {
  async load() {
    return {
      baseUrl: "",
      token: "",
      accountId: "",
      userId: "",
      syncBuf: "",
      contextTokens: {},
      sessions: {},
    };
  },

  async save(state) {
    // 写入数据库、Redis、对象存储或你自己的持久化层。
    console.log("保存状态", state);
  },
};

const bot = createWeixinProxyBot({
  store: customStore,
  mediaDir: "./data/weixin/media",
});
```

状态对象字段：

| 字段 | 说明 |
| --- | --- |
| `baseUrl` | 登录后服务端可能返回的新 iLink API 地址 |
| `token` | Bot 登录凭证 |
| `accountId` | iLink Bot 账号 ID |
| `userId` | 当前绑定的微信用户 ID |
| `syncBuf` | `getupdates` 长轮询同步游标 |
| `contextTokens` | 联系人 ID 到最新 `context_token` 的映射，发送消息时必需 |
| `sessions` | 已接收会话的最近消息摘要 |

常用方法：

| 方法 | 说明 |
| --- | --- |
| `bot.login({ onQr, onStatus })` | 请求二维码并轮询登录确认，成功后保存 token |
| `bot.onMessage(handler)` | 监听收到的消息，返回取消监听函数 |
| `bot.onError(handler)` | 监听接收循环里的错误 |
| `bot.start()` | 启动长轮询接收循环 |
| `bot.stop()` | 停止长轮询接收循环 |
| `bot.receiveOnce()` | 只拉取并处理一轮消息，适合定时任务 |
| `bot.send(userId, text)` | 给指定用户发送文本 |
| `bot.sendImage(userId, filePath, options?)` | 发送图片 |
| `bot.sendFile(userId, filePath)` | 发送文件 |
| `bot.sendVideo(userId, filePath, options?)` | 发送视频 |
| `bot.sessions()` | 读取已见过的会话摘要 |
| `bot.isLoggedIn()` | 判断本地是否已有 token |

注意：`bot.send(userId, text)` 仍然需要该用户已有 `context_token`。通常做法是先让对方给你发一条消息，`bot.start()` 或 `bot.receiveOnce()` 收到后再发送。

媒体发送示例：

```js
await bot.sendImage(userId, "./photo.jpg");
await bot.sendFile(userId, "./report.pdf");
await bot.sendVideo(userId, "./demo.mp4", {
  playLengthMs: 12000,
  thumbnailPath: "./demo-thumb.jpg",
  thumbnailWidth: 320,
  thumbnailHeight: 180,
});
```

收到媒体后，`message.attachments` 会包含下载结果：

```js
bot.onMessage((message) => {
  for (const attachment of message.attachments) {
    console.log(attachment.type, attachment.filePath || attachment.error);
  }
});
```

进阶场景仍可使用低层 API：

```js
import { WeixinClient, StateStore, applyUpdatesToState } from "weixin-proxy-ilink";
```

公开入口会导出高层 Bot、配置、消息格式化、状态存储、状态更新和 HTTP 客户端模块。

## 打包与发布

本项目已经配置为 npm 包：

```bash
npm pack --dry-run
npm publish
```

`prepack` 会在打包前运行测试。

## 作者

[kuraa.cc](https://kuraa.cc)
