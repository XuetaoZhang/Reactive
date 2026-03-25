# Lucky Scratch 部署速查

这个文件是当前项目的中文部署速查版。完整提交说明请看：

- [README_CN.md](./README_CN.md)
- [SCRATCH_DEPLOY.md](./SCRATCH_DEPLOY.md)

## 当前项目对应的合约

- `src/ScratchSource.sol`
- `src/ScratchReactive.sol`
- `src/ScratchGame.sol`

## 快速部署顺序

### 1. 安装 Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
cast --version
```

### 2. 准备 `.env`

把 `.env.example` 复制成 `.env` 后，至少填这些值：

- `ORIGIN_RPC_URL`
- `DESTINATION_RPC_URL`
- `REACTIVE_RPC_URL`
- `ORIGIN_PRIVATE_KEY`
- `DESTINATION_PRIVATE_KEY`
- `REACTIVE_PRIVATE_KEY`
- `ORIGIN_CHAIN_ID`
- `DESTINATION_CHAIN_ID`
- `DESTINATION_CALLBACK_PROXY_ADDR`
- `VRF_COORDINATOR_ADDR`
- `VRF_KEY_HASH`
- `VRF_SUBSCRIPTION_ID`

### 3. 加载环境变量

Git Bash：

```bash
set -a
source .env
set +a
```

PowerShell：

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
```

### 4. 计算事件 Topic

当前 `ScratchReactive` 订阅的是：

```text
TicketPurchased(uint256,address,uint256,uint256)
```

执行：

```bash
cast keccak "TicketPurchased(uint256,address,uint256,uint256)"
```

把结果填入：

```text
TICKET_PURCHASED_TOPIC0=0x...
```

### 5. 编译

```bash
forge build
```

### 6. 部署源链合约

```bash
forge script script/DeployScratchSource.s.sol:DeployScratchSourceScript \
  --rpc-url "$ORIGIN_RPC_URL" \
  --broadcast
```

部署完成后把地址写入：

```text
SCRATCH_SOURCE_ADDR=0x...
```

### 7. 部署目标链游戏合约

```bash
forge script script/DeployScratchGame.s.sol:DeployScratchGameScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

部署完成后把地址写入：

```text
SCRATCH_GAME_ADDR=0x...
```

### 8. 配置 VRF

```bash
forge script script/ConfigureScratchGameVrf.s.sol:ConfigureScratchGameVrfScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

然后去 `https://vrf.chain.link/` 把 `SCRATCH_GAME_ADDR` 添加为 consumer。

### 9. 部署 Reactive 合约

```bash
forge script script/DeployScratchReactive.s.sol:DeployScratchReactiveScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

部署完成后把地址写入：

```text
SCRATCH_REACTIVE_ADDR=0x...
```

### 10. 激活 Reactive 订阅

```bash
forge script script/ActivateScratchReactiveSubscription.s.sol:ActivateScratchReactiveSubscriptionScript \
  --rpc-url "$REACTIVE_RPC_URL" \
  --broadcast
```

### 11. 绑定 Reactive sender

```bash
forge script script/BindScratchGameReactive.s.sol:BindScratchGameReactiveScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

## 前端运行与部署

### 本地运行

```bash
python -m http.server 4173 -d frontend
```

然后打开：

```text
http://localhost:4173
```

### 部署到 Vercel

1. 导入当前仓库
2. Root Directory 设为 `frontend`
3. 作为静态站点部署
4. `frontend/config.js` 中的地址和 RPC 会暴露给前端用户，因此只放公开信息，不要放私钥

## 演示模式 / 必中奖

### 开启

`.env`：

```text
DEMO_MODE_ENABLED=true
DEMO_FORCED_PRIZE_TIER=3
DEMO_REMAINING_TICKETS=1
```

执行：

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

### 关闭

`.env`：

```text
DEMO_MODE_ENABLED=false
```

执行同一个脚本：

```bash
forge script script/ConfigureScratchGameDemo.s.sol:ConfigureScratchGameDemoScript \
  --rpc-url "$DESTINATION_RPC_URL" \
  --broadcast
```

## 当前演示地址

- `SCRATCH_SOURCE_ADDR=0xc6D1C9500E25ebDd55650Ca04f8C97e6616770C5`
- `SCRATCH_GAME_ADDR=0x092B84CAeDe9e1c52C7bACA840372f4c18baA3F1`
- `SCRATCH_REACTIVE_ADDR=0x4387e5F6C79ae885C9E2AcCB47cD4E31085BaeaF`

## 当前浏览器地址

- Sepolia Etherscan：`https://sepolia.etherscan.io`
- Reactive Explorer：`https://reactscan.net/`
