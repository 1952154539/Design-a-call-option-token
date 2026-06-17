# Design a Call Option Token

基于 Solidity 实现的链上看涨期权 Token（ERC20），模拟传统金融中 **看涨期权（Call Option）** 的发行、交易、行权与到期清算全流程。

## 金融概念

**看涨期权（Call Option）** 是一种金融衍生品，赋予持有者在特定日期（到期日）以约定价格（行权价）买入标的资产的权利，但没有义务。

| 概念 | 说明 |
|------|------|
| 标的资产（Underlying） | ETH |
| 行权价（Strike Price） | 0.8 ETH（即以 8 折价格买入 ETH） |
| 到期日（Expiration） | 合约部署时设定，仅到期日当天可行权 |
| 期权费（Premium） | 用户通过 USDT/期权交易池支付的购买成本 |

## 架构设计

```
┌──────────────────────────────────────────────────┐
│                  项目方 (Project)                  │
│                                                    │
│  ① issue(): 存入 ETH 标的 → 铸造期权 Token         │
│  ④ addLiquidity(): 注入期权+USDT → 创建交易池      │
│  ⑧ settle(): 到期后赎回剩余 ETH                    │
└──────────────────┬───────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              ▼              │
    │  ┌───────────────────┐     │
    │  │  CallOptionToken  │     │
    │  │   (ERC20 期权)     │     │
    │  │  - strikePrice    │     │
    │  │  - expirationDate │     │
    │  │  - totalUnderlying│     │
    │  └────────┬──────────┘     │
    │           │                │
    │  ┌────────▼──────────┐     │
    │  │    OptionPool      │     │
    │  │  (恒定乘积 AMM)     │     │
    │  │  - reserveOption  │◄────┤ ⑤ buyOptions()
    │  │  - reserveUSDT    │     │   用户用 USDT 购买
    │  └───────────────────┘     │   期权 Token
    │                            │
    └────────────────────────────┘
                   ▲
                   │
┌──────────────────┴───────────────────────────────┐
│                   用户 (User)                      │
│                                                    │
│  ⑤ buyOptions(): USDT → 期权 Token                │
│  ⑦ exercise(): 期权 Token + 0.8 ETH → 1 ETH 标的  │
└──────────────────────────────────────────────────┘
```

## 生命周期

```
发行期              交易期              行权日              清算期
─────┼─────────────────┼──────────────────┼───────────────────┼──────► 时间
     │                  │                   │                    │
  issue()          buyOptions()        exercise()           settle()
  项目方存入ETH      用户用USDT购买      期权持有者行权        项目方赎回
  获得期权Token      期权Token           获得标的ETH          剩余ETH
```

## 合约说明

### CallOptionToken.sol（核心期权合约）

继承 `ERC20` + `Ownable`，每个期权 Token（wei 精度）代表以 `strikePrice` 兑换 1 wei 标的 ETH 的权利。

| 方法 | 角色 | 说明 |
|------|------|------|
| `constructor(name, symbol, strikePrice, expirationDate)` | 项目方 | 部署期权合约，设定行权价与到期日 |
| `issue()` | 项目方 | 存入 ETH 作为标的资产，1:1 铸造期权 Token |
| `exercise(amount)` | 用户 | 到期日行权：销毁期权 Token + 支付行权金 → 获得标的 ETH |
| `settle()` | 项目方 | 到期后赎回合约中全部剩余 ETH（未行权标的 + 已收取的行权金） |

### OptionPool.sol（交易池）

恒定乘积做市商（x\*y=k），用于模拟期权 Token 的二级市场交易。

| 方法 | 角色 | 说明 |
|------|------|------|
| `addLiquidity(optionAmt, usdtAmt)` | 项目方 | 注入期权 Token 和 USDT 初始流动性 |
| `buyOptions(usdtIn, minOut)` | 用户 | 用 USDT 购买期权 Token（含 0.3% 手续费） |
| `removeLiquidity()` | 项目方 | 移除流动性（到期后关闭池子） |
| `getOptionPrice()` | 任何人 | 查询当前价格：1 USDT 可换多少期权 Token |

### MockUSDT.sol（测试代币）

6 位小数的模拟 USDT，仅用于演示。项目方可 `mint()` 铸造。

## 文件结构

```
Design-a-call-option-token/
├── contracts/
│   ├── CallOptionToken.sol    # 看涨期权 ERC20 Token
│   ├── OptionPool.sol         # 期权/USDT 恒定乘积交易池
│   └── MockUSDT.sol           # 模拟 USDT（6 decimals）
├── scripts/
│   ├── deploy.js              # 部署脚本
│   └── demo.js                # 完整流程演示脚本
├── hardhat.config.js
├── package.json
├── blockchain/                # 部署地址记录
└── README.md
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 编译合约
npx hardhat compile

# 3. 运行完整 Demo（含发行、购买、行权、清算全流程）
npx hardhat run scripts/demo.js
```

## Demo 执行日志

以下是 `scripts/demo.js` 的完整运行输出，模拟了从发行到期权清算的全部流程。

### Step 0 — 初始化参数

```
行权价格:       0.8 ETH (即 8 折买入标的 ETH)
标的存入量:     10.0 ETH
池子期权量:     7.0 期权 Token
池子 USDT 量:   700.00 USDT
初始期权价格:   100 USDT / 期权 Token
行权日期:       2026-06-24T03:48:42.000Z
```

### Step 1 — 部署合约

```
MockUSDT 已部署: 0x5FbDB2315678afecb367f032d93F642f64180aa3
CallOptionToken 已部署: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  - 名称:   ETH Call Option
  - 代号:   ETH-CALL
  - 行权价: 0.8 ETH
  - 到期日: 2026-06-24T03:48:42.000Z
OptionPool 已部署: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

### Step 2 — 铸造测试 USDT

```
项目方 USDT 余额: 10000.00 USDT
用户 USDT 余额:   5000.00 USDT
```

### Step 3 — 发行期权 Token（项目方存入标的 ETH）

项目方调用 `issue()` 将 10 ETH 存入合约，1:1 铸造 10 枚期权 Token。

```
项目方 ETH 余额（发行前）: 9999.9954 ETH
项目方 ETH 余额（发行后）: 9989.9953 ETH
Gas 消耗:                    0.000136 ETH
项目方期权 Token 余额:       10.0 枚
合约中标的 ETH:               10.0 ETH
合约总 ETH 余额:              10.0 ETH
```

### Step 4 — 创建期权/USDT 交易池

项目方注入 7 枚期权 Token + 700 USDT 创建流动性池，初始价格 ~100 USDT/期权。

```
池子期权储备:   7.0 期权 Token
池子 USDT 储备: 700.00 USDT
当前价格:       1 USDT = 0.01 期权 Token
             即: 100.00 USDT 可买 1 个整期权 Token
```

### Step 5 — 用户用 USDT 购买期权

用户花 100 USDT 从池子购买期权 Token（恒定乘积模型，含 0.3% 手续费）。

```
用户 USDT 余额（购买前）:   5000.00 USDT
用户期权余额（购买前）:     0.0 枚
用户支付:                   100.00 USDT
用户获得期权 Token:         0.8727 枚
用户 USDT 余额（购买后）:   4900.00 USDT
用户期权余额（购买后）:     0.8727 枚
池子新价格:                 1 USDT = 0.007659 期权 Token
                         即: 130.56 USDT / 期权 Token
```

### Step 6 — 时间穿越到行权日

Hardhat 的 `evm_setNextBlockTimestamp` 将区块链时间快进 7 天到到期日。

```
到期日时间戳: 1782272922
已将下一区块时间设为: 2026-06-24T03:48:42.000Z
```

### Step 7 — 用户行权（行使看涨期权）

用户在到期日调用 `exercise()`，销毁全部 0.8727 枚期权 Token + 支付 0.698 ETH（=0.8727 × 0.8），获得 0.8727 ETH 标的资产。净收益 = 0.8727 - 0.698 = **0.1745 ETH**。

```
用户期权余额:          0.872702263348755783 枚
行权数量:              0.872702263348755783 枚
每枚需支付:            0.8 ETH
共需支付:              0.698161810679004626 ETH

用户 ETH 余额（行权前）:  9999.9998 ETH
用户 ETH 余额（行权后）:  10000.1743 ETH
用户净收益:               0.8727 ETH
  = 获得标的 ETH - 支付行权价 - Gas
合约 ETH 余额（行权前）:   10.0 ETH
合约 ETH 余额（行权后）:   9.8255 ETH
用户期权余额（行权后）:    0.0 枚（已全部销毁）
```

### Step 8 — 项目方到期清算

项目方在到期日后一天调用 `settle()`，收回合约中剩余的 9.8255 ETH（含未行权的标的 + 用户行权支付的金）。

```
合约剩余标的:               9.1273 ETH
项目方 ETH 余额（清算前）:  9989.9950 ETH
项目方 ETH 余额（清算后）: 9999.8203 ETH
项目方净回款:               9.8255 ETH
合约 ETH 余额:              0.0 ETH（已清空）
已清算标记:                 true
```

### Step 9 — 损益总结

```
【项目方】
  存入标的:          +10.0 ETH → 10.0 枚期权 Token
  池子售出期权:      7.0 枚 → 700.00 USDT（期权费收入）
  用户行权拿走标的:  0.8727 ETH
  到期清算收回:      9.8255 ETH（剩余标的 + 行权金）

【用户】
  购买期权费:        100.00 USDT
  行权支付:          0.6982 ETH
  行权获得标的:      0.8727 ETH
  净收益:            0.8727 ETH
  （用户以 0.8 ETH 单价买入 0.8727 ETH 标的）
```

## 经济模型分析

```
项目方视角:
  投入:    10 ETH（标的保证金）
  收入:    +700 USDT（期权费，来自池子售出）
           +9.8255 ETH（清算回款，= 未行权标的 + 行权金）
  ≈ 保本 + 700 USDT 期权费利润

用户视角:
  成本:    100 USDT（期权费）+ 0.6982 ETH（行权金）
  获得:    0.8727 ETH（标的）
  净利:    0.8727 - 0.6982 = 0.1745 ETH（标的增值）
           -100 USDT（期权费成本）
```

> 在实际市场中，ETH 的 USDT 价格波动决定期权是否"实值"。本例假设标的 ETH 市价高于行权价，因此行权有利可图。

## 安全说明

- 合约使用 OpenZeppelin 标准库（ERC20、Ownable）
- 行权函数采用 Checks-Effects-Interactions 模式防止重入攻击
- 仅项目方可发行、清算，仅到期日可行权

## License

MIT
