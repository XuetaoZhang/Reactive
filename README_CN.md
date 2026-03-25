# Lucky Scratch

Lucky Scratch 是一个单页链上刮刮乐游戏，用来展示 **Reactive Contracts（睿应式合约）** 在真实玩法中的作用。

用户先在**源链**买票，**Reactive 合约**监听购票事件并自动触发**目标链**开票，之后由 **Chainlink VRF** 生成随机结果，前端只负责读取链上状态、展示刮奖交互，并让用户直接用钱包领取奖金。

英文版说明见：[README.md](./README.md)

演示地址：`https://luckyscratch-drab.vercel.app/`

## 一、为什么这个项目必须使用睿应层

本项目不是“把普通 Solidity 合约部署到 Reactive 网络”那么简单，Reactive 层本身就是核心业务流程的一部分：

1. 用户在源链调用 `buyTicket()` 购票。
2. `ScratchSource` 发出 `TicketPurchased` 事件。
3. `ScratchReactive` 在 Reactive Network 上监听这个 EVM 事件。
4. `ScratchReactive` 自动触发目标链回调。
5. `ScratchGame` 在目标链创建彩票、请求 VRF、结算奖级。

如果没有睿应层，这个项目必须额外依赖中心化后端或机器人来完成：

- 监听源链购票事件
- 把事件中继到目标链
- 在用户关闭页面后继续保证流程运行

也就是说，Reactive Contracts 解决的是“跨链购票事件如何在没有中心化后端的情况下自动变成目标链可玩的 Ticket”这个问题。

## 二、仓库结构

### 合约

- `src/ScratchSource.sol`：源链购票合约
- `src/ScratchReactive.sol`：Reactive Network 上的睿应式合约，监听源链事件并发起目标链回调
- `src/ScratchGame.sol`：目标链游戏合约，负责开票、请求 VRF、结算奖金和领奖

### 部署与运维脚本

- `script/DeployScratchSource.s.sol`
- `script/DeployScratchGame.s.sol`
- `script/DeployScratchReactive.s.sol`
- `script/ActivateScratchReactiveSubscription.s.sol`
- `script/BindScratchGameReactive.s.sol`
- `script/ConfigureScratchGameVrf.s.sol`
- `script/ConfigureScratchGameDemo.s.sol`
- `script/FulfillMockScratchRequest.s.sol`

### 前端

- `frontend/index.html`
- `frontend/styles.css`
- `frontend/app.js`
- `frontend/config.js`

## 三、项目解决的问题与方案

### 问题

这个游戏需要把“源链上的一次购票支付”自动变成“目标链上的一张可刮开的票”，同时不能依赖中心化后端去做中继。

### 解决方案

- `ScratchSource` 负责卖票并发出 `TicketPurchased`
- `ScratchReactive` 负责订阅该事件，并在 Reactive Network 上自动发起目标链调用
- `ScratchGame` 负责开票、请求 Chainlink VRF、结算奖金、处理领奖
- 前端只读取链上数据，负责钱包交互、状态展示和刮奖动画

## 四、已部署合约地址

### 当前演示部署

| 组件 | 网络 | Chain ID | 地址 | 部署交易哈希 |
| --- | --- | --- | --- | --- |
| ScratchSource | Ethereum Sepolia | `11155111` | `0xc6D1C9500E25ebDd55650Ca04f8C97e6616770C5` | `0x2a442f3880f2c0fa57657f2293c7e79e8ed09ce54b0392e87b0d32a07aa4e462` |
| ScratchGame | Ethereum Sepolia | `11155111` | `0x092B84CAeDe9e1c52C7bACA840372f4c18baA3F1` | `0x4bb046cd95ee09040e3f7fd706892ac3e666f08477b8ddff05c85f36840c9124` |
| ScratchReactive | Reactive Network | `5318007` | `0x4387e5F6C79ae885C9E2AcCB47cD4E31085BaeaF` | `0x16e4bfeb938285a62e60f4594dd8bc0b291d37b0af333cb6d31325e0abb44268` |

### 浏览器

- 源链 / 目标链浏览器：`https://sepolia.etherscan.io`
- Reactive 浏览器：`https://reactscan.net/`

## 五、部署后的完整工作流

一张票在部署完成后会按下面顺序运行：

1. 用户在源链调用 `buyTicket()`。
2. `ScratchSource` 发出 `TicketPurchased(ticketId, player, roundId, amount)`。
3. `ScratchReactive` 在 Reactive Network 上监听到该事件。
4. `ScratchReactive` 在目标链触发 `openTicket()`。
5. `ScratchGame` 创建票据并发出 `TicketOpened`。
6. `ScratchGame` 请求 Chainlink VRF 并发出 `RandomnessRequested`。
7. Chainlink VRF 回调后，`ScratchGame` 发出 `RandomnessFulfilled`。
8. 用户打开前端，用鼠标刮开奖票；如果中奖，则在目标链调用 `claim(ticketId)` 领取奖金。

## 六、部署方式

更详细的中文部署过程见 [DEPLOY.md](./DEPLOY.md) 和 [SCRATCH_DEPLOY.md](./SCRATCH_DEPLOY.md)。下面是比赛提交够用的部署流程。

### 1. 安装 Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
cast --version
```

### 2. 准备 `.env`

把 `.env.example` 复制成 `.env`，然后填入：

- 源链 RPC 和私钥
- 目标链 RPC 和私钥
- Reactive RPC 和私钥
- 目标链 callback proxy
- VRF 相关参数
- 每一步部署完成后的合约地址

### 3. 编译

```bash
forge build
```

### 4. 部署合约

部署源链 `ScratchSource`：

```bash
forge script script/DeployScratchSource.s.sol:DeployScratchSourceScript \
  --rpc-url "$ORIGIN_RPC_URL" \
  --broadcast
```

部署目标链 `ScratchGame`：

```bash
forge script script/DeployScratchGame.s.sol:DeployScratchGameScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

配置目标链 VRF：

```bash
forge script script/ConfigureScratchGameVrf.s.sol:ConfigureScratchGameVrfScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

部署 Reactive 合约：

```bash
forge script script/DeployScratchReactive.s.sol:DeployScratchReactiveScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

激活 Reactive 订阅：

```bash
forge script script/ActivateScratchReactiveSubscription.s.sol:ActivateScratchReactiveSubscriptionScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

绑定目标链 `ScratchGame` 的 Reactive sender：

```bash
forge script script/BindScratchGameReactive.s.sol:BindScratchGameReactiveScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

### 5. 添加 VRF Consumer

在 `ScratchGame` 部署完成后：

1. 打开 `https://vrf.chain.link/`
2. 选择 Sepolia 订阅
3. 把 `SCRATCH_GAME_ADDR` 添加为 consumer

### 6. 前端运行与部署

本地运行：

```bash
python -m http.server 4173 -d frontend
```

然后打开 `http://localhost:4173`。

部署到 Vercel：

1. 导入当前仓库
2. Root Directory 设为 `frontend`
3. 作为静态站点部署

当前前端配置来自 `frontend/config.js`。这个文件里的 RPC URL 和合约地址默认是公开可见的，因此不要把私钥或管理员密钥写进去。

## 七、演示模式 / 必中奖开关

为了比赛现场稳定展示，目标链合约支持演示模式。

### 开启演示模式

在 `.env` 中设置：

```text
DEMO_MODE_ENABLED=true
DEMO_FORCED_PRIZE_TIER=3
DEMO_REMAINING_TICKETS=1
```

然后执行：

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

### 关闭演示模式

在 `.env` 中设置：

```text
DEMO_MODE_ENABLED=false
```

然后再次执行同一个脚本：

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

## 八、部署与配置交易记录

当前仓库已经保留了部署和配置阶段的广播记录。

| 步骤 | 网络 | 交易哈希 |
| --- | --- | --- |
| 部署 `ScratchSource` | Sepolia | `0x2a442f3880f2c0fa57657f2293c7e79e8ed09ce54b0392e87b0d32a07aa4e462` |
| 部署 `ScratchGame` | Sepolia | `0x4bb046cd95ee09040e3f7fd706892ac3e666f08477b8ddff05c85f36840c9124` |
| 部署 `ScratchReactive` | Reactive Network | `0x16e4bfeb938285a62e60f4594dd8bc0b291d37b0af333cb6d31325e0abb44268` |
| 绑定 Reactive sender | Sepolia | `0xfcec25b5060788a83458c37d0aaf76694ed7b49a6c48cdae338940b28ddf4e23` |
| 设置 VRF Coordinator | Sepolia | `0xcd6575c47ec739f868e1d1a2518fa3f1504b866b11552cfe14294211cd056319` |
| 设置 VRF 参数 | Sepolia | `0xa7396366d75d4935c48eeda96af9a40e9328cfdd01b49375bddf64e5b9bbb3bd` |
| 开启演示模式（`tier=3`，`remaining=1`） | Sepolia | `0xb9bde61b16f33364ffcb8c1b98ab0e46bd05fea3647d40f101d1102fa36bec4c` |

## 九、完整流程交易哈希记录

比赛最终提交时，需要把实际演示那一轮的运行哈希补全到下表中。这里先保留位置，避免遗漏。

| 运行步骤 | 网络 | 交易哈希 |
| --- | --- | --- |
| 源链购票 `buyTicket` | 源链 | `待补：提交最终演示那一轮的哈希` |
| Reactive 中继 / 回调执行 | Reactive Network | `待补：提交 reactscan 上对应哈希` |
| 目标链开票 `openTicket` | 目标链 | `待补：提交最终演示那一轮的哈希` |
| 目标链 VRF fulfill | 目标链 | `待补：提交最终演示那一轮的哈希` |
| 目标链领奖 `claim` | 目标链 | `待补：提交最终演示那一轮的哈希` |

## 十、比赛最低要求对应关系

| 要求 | 当前仓库如何满足 |
| --- | --- |
| 有效使用睿应式合约 | `src/ScratchReactive.sol` 监听源链 EVM 事件并自动触发目标链回调 |
| 提交完整合约代码 | `src/` 中包含 Origin、Reactive、Destination 三类合约 |
| 包含 Origin 合约 | `src/ScratchSource.sol` 已包含并已部署 |
| 公示已部署合约地址 | 本文档“已部署合约地址”章节已列出 |
| 阐述问题与解决方案 | 本文档“为什么必须使用睿应层”与“项目解决的问题与方案”章节已说明 |
| 提供部署后工作流说明 | 本文档“部署后的完整工作流”章节已说明 |
| 提供完整交易哈希记录 | 部署与配置哈希已列出，运行时哈希预留了最终提交位置 |
