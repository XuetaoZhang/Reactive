# 本地 Reactive Demo 部署说明

这个仓库已经不是 Foundry 默认模板了。你真正要部署的合约是：

- `src/Contract.sol:Contract`
- `src/Callback.sol:Callback`
- `src/Reactive.sol:BasicDemoReactiveContract`

不要使用模板残留的 `script/Counter.s.sol`。

## 1. 安装 Foundry

在 Windows 上，建议用 Git Bash 或 WSL，不要直接用 PowerShell 安装：

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
cast --version
```

## 2. 准备环境变量

把 `.env.example` 复制成 `.env`，然后填入你自己的值。

必填项：

- `ORIGIN_RPC_URL`：源链 RPC 地址
- `DESTINATION_RPC_URL`：目标链 RPC 地址
- `REACTIVE_RPC_URL`：Reactive Lasna 测试网 RPC 地址
- `ORIGIN_PRIVATE_KEY`
- `DESTINATION_PRIVATE_KEY`
- `REACTIVE_PRIVATE_KEY`
- `ORIGIN_CHAIN_ID`
- `DESTINATION_CHAIN_ID`
- `DESTINATION_CALLBACK_PROXY_ADDR`

如果你用 `Sepolia -> Sepolia`：

- `ORIGIN_CHAIN_ID=11155111`
- `DESTINATION_CHAIN_ID=11155111`
- `DESTINATION_CALLBACK_PROXY_ADDR=0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA`

如果你用 `Sepolia -> Base Sepolia`：

- `DESTINATION_CHAIN_ID=84532`
- `DESTINATION_CALLBACK_PROXY_ADDR=0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6`

## 3. 加载环境变量

Git Bash:

```bash
set -a
source .env
set +a
```

PowerShell:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
```

## 4. 计算 `topic_0`

你当前本地源合约发出的事件是：

```solidity
event Received(address indexed origin, address indexed sender, uint256 indexed value);
```

Reactive 合约订阅源链日志时，靠的是“事件签名哈希”。也就是把下面这个签名：

```text
Received(address,address,uint256)
```

做一次 `keccak256`，得到的结果就是 `topic_0`。

用 `cast` 计算：

```bash
cast keccak "Received(address,address,uint256)"
```

然后把输出的 `0x...` 填进 `.env` 的 `TOPIC0=`。

这个命令不会生成文件，也不会修改项目内容，它只是在终端里打印一个哈希值。

你也可以直接把结果写进当前 shell 会话里。

Git Bash:

```bash
export TOPIC0=$(cast keccak "Received(address,address,uint256)")
```

PowerShell:

```powershell
$env:TOPIC0 = cast keccak "Received(address,address,uint256)"
```

## 5. 编译

```bash
forge build
```

## 6. 部署源链合约

```bash
forge create src/Contract.sol:Contract \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$ORIGIN_PRIVATE_KEY"
```

把部署出来的地址填到 `.env` 的 `ORIGIN_CONTRACT_ADDR=`。

## 7. 部署目标链回调合约

```bash
forge create src/Callback.sol:Callback \
  --rpc-url "$DESTINATION_RPC_URL" \
  --private-key "$DESTINATION_PRIVATE_KEY" \
  --value 0.01ether \
  --constructor-args "$DESTINATION_CALLBACK_PROXY_ADDR"
```

把部署出来的地址填到 `.env` 的 `CALLBACK_ADDR=`。

## 8. 部署 Reactive 合约

这份本地仓库的 `Reactive.sol` 构造函数和线上最新 README 不完全一样。你本地这里是：

```solidity
constructor(
    uint256 _originChainId,
    uint256 _destinationChainId,
    address _contract,
    uint256 _topic_0,
    address _callback
) payable
```

部署命令：

```bash
forge create src/Reactive.sol:BasicDemoReactiveContract \
  --rpc-url "$REACTIVE_RPC_URL" \
  --private-key "$REACTIVE_PRIVATE_KEY" \
  --value 0.1ether \
  --constructor-args \
    "$ORIGIN_CHAIN_ID" \
    "$DESTINATION_CHAIN_ID" \
    "$ORIGIN_CONTRACT_ADDR" \
    "$TOPIC0" \
    "$CALLBACK_ADDR"
```

## 9. 触发 Demo

这份本地 `Reactive.sol` 的逻辑要求：只有当源链日志里的金额大于等于 `0.001 ether` 时，才会发起 callback。

向源链合约转账：

```bash
cast send "$ORIGIN_CONTRACT_ADDR" \
  --rpc-url "$ORIGIN_RPC_URL" \
  --private-key "$ORIGIN_PRIVATE_KEY" \
  --value 0.01ether
```

然后去目标链查看 `CallbackReceived` 事件。

## 补充说明

- `script/Counter.s.sol` 和 `test/Counter.t.sol` 还是旧模板残留，和当前部署流程无关。
- `topic_0` 只要事件签名变了，就一定会变。哪怕只是把事件名从 `ContractReceive` 改成 `Received`，哈希也会变。
- 你现在既然已经改回 `Received(address,address,uint256)`，如果它和线上 README 里的事件签名完全一致，那你可以直接用官方 README 里的 `topic_0`，不一定非要自己跑 `cast keccak`。
- 但 `_topic_0` 这个参数本身仍然要传给 `BasicDemoReactiveContract`，只是“这个值可以直接抄官方文档”，而不是“这个参数不需要了”。
- 最稳妥的做法仍然是自己跑一次 `cast keccak "Received(address,address,uint256)"`，因为它只是在本地算哈希，不依赖链上状态，也不会产生额外副作用。
