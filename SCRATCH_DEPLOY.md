# Reactive 刮刮乐部署说明

本文档对应当前项目中的三份核心合约：

- `src/ScratchSource.sol`
- `src/ScratchReactive.sol`
- `src/ScratchGame.sol`

完整链路如下：

1. 用户在源链购买彩票。
2. `ScratchSource` 发出 `TicketPurchased` 事件。
3. `ScratchReactive` 订阅该事件，并通过 Reactive Network 发起目标链回调。
4. `ScratchGame` 在目标链接收回调，创建票据并请求 Chainlink VRF 随机数。
5. Chainlink VRF 回调目标链合约，写入中奖结果。
6. 用户在前端刮开奖票并领取奖金。

## 一、合约职责

`ScratchSource`

- 部署在源链。
- 接收购票金额。
- 发出 `TicketPurchased(ticketId, player, roundId, amount)` 事件。

`ScratchReactive`

- 部署在 Reactive Network。
- 监听 `ScratchSource` 的购票事件。
- 将 `ticketId`、`player`、`roundId`、`amount`、`sourceTxHash` 转发到目标链。
- 部署后需要额外执行一次激活订阅。

`ScratchGame`

- 部署在目标链。
- 接收 Reactive 回调后创建票据。
- 请求 Chainlink VRF 随机数。
- 根据随机数结算奖级并发奖。

## 二、构造函数参数

`ScratchSource(uint256 ticketPrice, uint256 initialRoundId)`

`ScratchReactive(
    uint256 originChainId,
    uint256 destinationChainId,
    address sourceContract,
    uint256 ticketPurchasedTopic0,
    address scratchGame
)`

`ScratchGame(
    address callbackSender,
    address randomnessCoordinator,
    bytes32 vrfKeyHash,
    uint256 vrfSubscriptionId,
    uint16 vrfRequestConfirmations,
    uint32 vrfCallbackGasLimit,
    bool vrfNativePayment
)`

## 三、准备事件 Topic

`ScratchReactive` 需要订阅下面这个事件签名：

```text
TicketPurchased(uint256,address,uint256,uint256)
```

执行：

```bash
cast keccak "TicketPurchased(uint256,address,uint256,uint256)"
```

把结果填入 `.env` 的 `TICKET_PURCHASED_TOPIC0`。

## 四、部署 `ScratchSource`

脚本方式：

```bash
forge script script/DeployScratchSource.s.sol:DeployScratchSourceScript \
  --rpc-url "$ORIGIN_RPC_URL" \
  --broadcast
```

当前默认参数：

- `SCRATCH_TICKET_PRICE=10000000000000000`，也就是 `0.01 ETH`
- `SCRATCH_INITIAL_ROUND_ID=1`

部署完成后，把地址写入：

```text
SCRATCH_SOURCE_ADDR=0x...
```

## 五、配置 Chainlink VRF

先打开官方订阅管理页面：

- `https://vrf.chain.link/`

你需要准备：

1. 一个 `Ethereum Sepolia` 上的 VRF v2.5 subscription。
2. 给 subscription 充值测试资金。
3. 部署 `ScratchGame` 后，把 `ScratchGame` 地址添加为 consumer。

当前 Sepolia 使用的参数：

```text
VRF_COORDINATOR_ADDR=0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B
VRF_KEY_HASH=0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=200000
VRF_NATIVE_PAYMENT=true
```

把你的订阅 ID 填入：

```text
VRF_SUBSCRIPTION_ID=<你的订阅ID>
```

## 六、部署 `ScratchGame`

脚本方式：

```bash
forge script script/DeployScratchGame.s.sol:DeployScratchGameScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

当前脚本会读取：

- `DESTINATION_CALLBACK_PROXY_ADDR`
- `VRF_COORDINATOR_ADDR`
- `VRF_KEY_HASH`
- `VRF_SUBSCRIPTION_ID`
- `VRF_REQUEST_CONFIRMATIONS`
- `VRF_CALLBACK_GAS_LIMIT`
- `VRF_NATIVE_PAYMENT`
- `SCRATCH_GAME_INITIAL_FUNDING`

部署完成后：

1. 把地址写入 `.env`
2. 去 `vrf.chain.link`
3. 在你的 subscription 中点击 `Add consumer`
4. 添加 `SCRATCH_GAME_ADDR`

也就是说：

```text
SCRATCH_GAME_ADDR=0x...
```

## 七、部署 `ScratchReactive`

脚本方式：

```bash
forge script script/DeployScratchReactive.s.sol:DeployScratchReactiveScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

部署完成后，把地址写入：

```text
SCRATCH_REACTIVE_ADDR=0x...
```

## 八、激活 Reactive 订阅

部署完 `ScratchReactive` 后，需要手动激活监听：

```bash
forge script script/ActivateScratchReactiveSubscription.s.sol:ActivateScratchReactiveSubscriptionScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

或者直接用：

```bash
cast send "$SCRATCH_REACTIVE_ADDR" \
  "activateSubscription()" \
  --private-key "$REACTIVE_PRIVATE_KEY" \
  --rpc-url "$REACTIVE_RPC_URL"
```

## 九、绑定目标链回调身份

`ScratchGame` 需要绑定 Reactive 回调发送者身份。

注意：

- 这里不是填 `SCRATCH_REACTIVE_ADDR`
- 而是填 Reactive Network 识别到的实际发送身份
- 当前项目里就是 Reactive 部署钱包地址

执行：

```bash
forge script script/BindScratchGameReactive.s.sol:BindScratchGameReactiveScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

对应环境变量：

```text
EXPECTED_REACTIVE_SENDER_ADDR=0x...
```

## 十、购票测试

如果你不用前端，也可以直接在源链手动购票：

```bash
cast send "$SCRATCH_SOURCE_ADDR" \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$PLAYER_PRIVATE_KEY" \
  --value 0.01ether \
  "buyTicket()"
```

一张票正常情况下会依次经历：

1. `TicketPurchased`
2. `TicketOpened`
3. `RandomnessRequested`
4. `RandomnessFulfilled`
5. 前端可刮开并领取奖金

## 十一、演示必中奖开关

为了黑客松演示稳定，`ScratchGame` 支持演示模式。

开启后：

- 仍然会真实请求 Chainlink VRF
- 随机数仍然会真实写入链上
- 但前 `N` 张票的奖级会被强制设为你指定的档位
- 用完后自动关闭

可用奖级：

- `1`：回本
- `2`：银奖
- `3`：金奖
- `4`：头奖

### 1. 开启必中奖

先设置 `.env`：

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

这表示：

- 下一张票必定是 `3` 档，也就是金奖
- 只生效 `1` 次
- 用完后自动关闭

### 2. 关闭必中奖

如果比赛演示结束后要恢复真实概率，设置：

```text
DEMO_MODE_ENABLED=false
DEMO_FORCED_PRIZE_TIER=3
DEMO_REMAINING_TICKETS=1
```

然后执行同一条脚本：

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

关闭后，后续票据完全按真实随机数结算。

## 十二、领奖

当票据状态变成 `Ready` 后，用户可以在目标链领奖：

```bash
cast send "$SCRATCH_GAME_ADDR" \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$PLAYER_PRIVATE_KEY" \
  "claim(uint256)" \
  "$TICKET_ID"
```

如果使用前端，则在刮开奖票后点击“领取奖金”即可。

## 十三、本地测试

执行：

```bash
forge test --match-contract ScratchFlowTest -vv
```

当前测试覆盖：

- 精确票价校验
- 完整购票到领奖流程
- 演示必中奖模式

## 十四、当前演示建议顺序

比赛现场建议按下面顺序演示：

1. 打开前端并连接钱包
2. 展示底部三个合约地址
3. 说明用户先在源链买票
4. 等待票据在目标链 materialize
5. 展示真实 VRF 请求
6. 刮开奖票
7. 展示中奖记录和奖金领取

如果你要稳定演示中奖，保持演示模式开启即可。
