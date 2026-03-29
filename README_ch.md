# Reactive 智能合约 Demo 仓库说明

[English README](README.md)

这个仓库包含两套基于 **Reactive Network** 和 **Foundry** 的 Solidity Demo：

- **Lucky Scratch**：完整的多链刮刮乐流程，包含源链购票、Reactive Network 转发、目标链开奖和静态前端。
- **Basic Reactive Demo**：一个最小可运行示例，用来演示监听源链事件并在目标链触发回调的基本模式。

## 仓库结构

- [src/](src)：两套 demo 的核心合约，以及接口、库和测试用 mock
- [script/](script)：Foundry 部署和配置脚本
- [test/](test)：自动化测试
- [frontend/](frontend)：Lucky Scratch 的静态前端
- [.env.example](.env.example)：环境变量模板
- [DEPLOY.md](DEPLOY.md)：基础 demo 的部署说明
- [SCRATCH_DEPLOY.md](SCRATCH_DEPLOY.md)：Lucky Scratch 的部署说明
- [frontend/README.md](frontend/README.md)：前端使用说明

另外，仓库中还包含 `out/`、`cache/`、`broadcast/` 等目录。这些主要是编译产物和脚本运行输出，不是核心源码入口。

## Demo 1：Lucky Scratch

Lucky Scratch 是这个仓库里的主流程 demo。

### 核心合约

- `src/ScratchSource.sol:ScratchSource`
  - 部署在源链
  - 负责售卖门票
  - 保存购票回执
  - 发出 `TicketPurchased(ticketId, player, roundId, amount)` 事件

- `src/ScratchReactive.sol:ScratchReactive`
  - 部署在 Reactive Network
  - 订阅 `TicketPurchased` 事件
  - 校验收到的日志
  - 将 `ticketId`、`player`、`roundId`、`amount`、`sourceTxHash` 转发到目标链

- `src/ScratchGame.sol:ScratchGame`
  - 部署在目标链
  - 接收 Reactive 回调并创建门票
  - 发起 Chainlink VRF 随机数请求
  - 写入开奖结果和奖金金额
  - 允许用户领奖

### 前端

Lucky Scratch 的前端是 [frontend/](frontend/) 下的静态单页应用：

- [frontend/index.html](frontend/index.html)：页面结构
- [frontend/styles.css](frontend/styles.css)：样式和刮卡视觉效果
- [frontend/app.js](frontend/app.js)：钱包连接、合约读写、轮询和刮卡交互
- [frontend/config.js](frontend/config.js)：链信息、RPC、浏览器链接、合约地址和界面配置

这个前端没有构建步骤，改完配置后可以直接静态托管。

### Scratch 流程

1. 用户在源链购买门票。
2. `ScratchSource` 发出 `TicketPurchased` 事件。
3. `ScratchReactive` 通过 Reactive Network 收到这条日志并发出回调负载。
4. `ScratchGame` 在目标链接收回调并生成门票。
5. `ScratchGame` 发起 Chainlink VRF 请求。
6. VRF 协调器回调合约，把开奖结果写入链上。
7. 前端展示门票状态，用户刮开后领取奖金。

### 相关文档入口

- 完整部署说明：[SCRATCH_DEPLOY.md](SCRATCH_DEPLOY.md)
- 前端配置说明：[frontend/README.md](frontend/README.md)

## Demo 2：Basic Reactive Demo

这个 demo 更小，用于说明最基础的 Reactive 使用方式。

### 核心合约

- `src/Contract.sol:Contract`
  - 接收 ETH 时发出 `Received(address origin, address sender, uint256 value)` 事件
  - 然后把收到的 ETH 原样退回给 `tx.origin`

- `src/Reactive.sol:BasicDemoReactiveContract`
  - 订阅 `Received` 事件
  - 当日志中的金额大于等于 `0.001 ether` 时，发出目标链回调

- `src/Callback.sol:Callback`
  - 接收 Reactive 回调
  - 发出 `CallbackReceived` 事件

### 相关文档入口

- 基础部署说明：[DEPLOY.md](DEPLOY.md)

## 依赖和前置条件

- 本地安装 Foundry，并能使用 `forge`、`cast`
- 已初始化 git submodule
- 已准备目标测试网的 RPC 和测试账户
- 如果要跑 Lucky Scratch，还需要目标链上的 Chainlink VRF v2.5 subscription

如果是第一次拉取这个仓库，先执行：

```bash
git submodule update --init --recursive
```

## 快速开始

在仓库根目录执行：

```bash
forge fmt --check
forge build
forge test -vv
```

如果只想跑单独的测试套件：

```bash
forge test --match-contract BasicDemoTest -vv
forge test --match-contract ScratchFlowTest -vv
```

## 当前测试覆盖

测试目前覆盖以下内容：

- Scratch 门票必须按精确价格购买
- 从购票到开奖再到领奖的完整流程
- demo-only 强制中奖模式
- 基础 demo 中源链合约的事件发出和退款行为
- 基础 demo 中达到阈值后才触发回调的逻辑

## 脚本索引

### Scratch 相关部署与运维脚本

- `script/DeployScratchSource.s.sol`：部署 `ScratchSource`
- `script/DeployScratchGame.s.sol`：部署 `ScratchGame`
- `script/DeployScratchReactive.s.sol`：部署 `ScratchReactive`
- `script/ActivateScratchReactiveSubscription.s.sol`：激活 Reactive 订阅
- `script/DeactivateScratchReactiveSubscription.s.sol`：停用 Reactive 订阅
- `script/BindScratchGameReactive.s.sol`：给 `ScratchGame` 绑定预期的 Reactive sender
- `script/ConfigureScratchGameVrf.s.sol`：更新 `ScratchGame` 的 VRF 配置
- `script/ConfigureScratchGameDemo.s.sol`：配置 demo-only 强制中奖模式

### 本地和 Mock 辅助脚本

- `script/DeployMockVRFCoordinator.s.sol`：部署本地 mock VRF 协调器
- `script/FulfillMockScratchRequest.s.sol`：通过 mock 协调器手动完成一次开奖请求

## 环境变量说明

建议从 [.env.example](.env.example) 复制出 `.env`，然后按你的环境填写。

关键变量包括：

- 源链、目标链、Reactive Network 的 RPC 和私钥
- `ORIGIN_CHAIN_ID`、`DESTINATION_CHAIN_ID`
- `DESTINATION_CALLBACK_PROXY_ADDR`
- 基础 demo 使用的 `TOPIC0`
- Scratch demo 使用的 `TICKET_PURCHASED_TOPIC0`
- 每一步部署完成后回填到 `.env` 的合约地址

事件 topic 需要根据 Solidity 事件签名计算：

```bash
cast keccak "Received(address,address,uint256)"
cast keccak "TicketPurchased(uint256,address,uint256,uint256)"
```

## 前端本地验证

在启动 Lucky Scratch 前端前，建议先做这几步：

1. 修改 [frontend/config.js](frontend/config.js) 中的链 ID 和合约地址。
2. 确认 RPC URL 和区块浏览器地址匹配你的部署环境。
3. 用任意静态文件服务器托管 `frontend/` 目录。

例如：

```bash
py -m http.server 4173 -d frontend
```

然后打开 `http://localhost:4173`。

## Demo-Only 警告

Scratch demo 支持一个仅用于演示的强制中奖模式，相关环境变量是：

- `DEMO_MODE_ENABLED`
- `DEMO_FORCED_PRIZE_TIER`
- `DEMO_REMAINING_TICKETS`

这个模式只适合现场演示或彩排。

如果你要展示真实概率、无偏随机性，或者更接近生产环境的行为，请保持该模式关闭。
