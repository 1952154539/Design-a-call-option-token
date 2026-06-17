const { ethers } = require("hardhat");

function divider(title) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

// Helper: format USDT amount (6 decimals) to readable string
function fmtUSDT(n) {
  return (Number(n) / 1e6).toFixed(2);
}

async function main() {
  const [project, user] = await ethers.getSigners();

  // =========================================================================
  // 0. 初始参数
  // =========================================================================
  divider("0. 初始化参数");

  const STRIKE_PRICE = ethers.parseEther("0.8"); // 行权价 0.8 ETH（20% 折扣）
  const DEPOSIT_ETH  = ethers.parseEther("10");  // 项目方存入 10 ETH 作为标的
  const POOL_OPTION  = ethers.parseEther("7");   // 项目方放 7 ETH 等值期权到池子
  const POOL_USDT    = 700_000000n;               // 项目方放 700 USDT 到池子（6位小数）
  const BUY_USDT     = 100_000000n;               // 用户花 100 USDT 购买期权（6位小数）

  const currentTime = Number((await ethers.provider.getBlock("latest")).timestamp);
  const SEVEN_DAYS  = 7 * 24 * 60 * 60;
  const expirationDate = currentTime + SEVEN_DAYS;

  console.log(`行权价格:       ${ethers.formatEther(STRIKE_PRICE)} ETH (即 8 折买入标的 ETH)`);
  console.log(`标的存入量:     ${ethers.formatEther(DEPOSIT_ETH)} ETH`);
  console.log(`池子期权量:     ${ethers.formatEther(POOL_OPTION)} 期权 Token`);
  console.log(`池子 USDT 量:   ${fmtUSDT(POOL_USDT)} USDT`);
  console.log(`初始期权价格:   ${(Number(POOL_USDT) / 1e6) / Number(ethers.formatEther(POOL_OPTION))} USDT / 期权 Token`);
  console.log(`行权日期:       ${new Date(expirationDate * 1000).toISOString()}`);
  console.log(`当前时间:       ${new Date(currentTime * 1000).toISOString()}`);

  // =========================================================================
  // 1. 部署合约
  // =========================================================================
  divider("1. 部署合约");

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  console.log(`MockUSDT 已部署: ${await usdt.getAddress()}`);

  const CallOptionToken = await ethers.getContractFactory("CallOptionToken");
  const optionToken = await CallOptionToken.deploy(
    "ETH Call Option",
    "ETH-CALL",
    STRIKE_PRICE,
    expirationDate
  );
  await optionToken.waitForDeployment();
  console.log(`CallOptionToken 已部署: ${await optionToken.getAddress()}`);
  console.log(`  - 名称:   ${await optionToken.name()}`);
  console.log(`  - 代号:   ${await optionToken.symbol()}`);
  console.log(`  - 行权价: ${ethers.formatEther(await optionToken.strikePrice())} ETH`);
  console.log(`  - 到期日: ${new Date(Number(await optionToken.expirationDate()) * 1000).toISOString()}`);

  const OptionPool = await ethers.getContractFactory("OptionPool");
  const pool = await OptionPool.deploy(
    await optionToken.getAddress(),
    await usdt.getAddress()
  );
  await pool.waitForDeployment();
  console.log(`OptionPool 已部署: ${await pool.getAddress()}`);

  // =========================================================================
  // 2. 铸造 USDT 给项目方和用户
  // =========================================================================
  divider("2. 铸造 USDT");

  await usdt.mint(project.address, 10_000_000000n);
  await usdt.mint(user.address,   5_000_000000n);
  console.log(`项目方 USDT 余额: ${fmtUSDT(await usdt.balanceOf(project.address))} USDT`);
  console.log(`用户 USDT 余额:   ${fmtUSDT(await usdt.balanceOf(user.address))} USDT`);

  // =========================================================================
  // 3. 项目方发行期权 Token（存入 ETH 作为标的资产）
  // =========================================================================
  divider("3. 发行期权 Token（项目方存入标的 ETH）");

  const projEthBefore = await ethers.provider.getBalance(project.address);
  console.log(`项目方 ETH 余额（发行前）: ${ethers.formatEther(projEthBefore)} ETH`);

  const txIssue = await optionToken.connect(project).issue({ value: DEPOSIT_ETH });
  const receiptIssue = await txIssue.wait();
  const gasIssue = receiptIssue.gasUsed * receiptIssue.gasPrice;

  const projEthAfter = await ethers.provider.getBalance(project.address);
  console.log(`项目方 ETH 余额（发行后）: ${ethers.formatEther(projEthAfter)} ETH`);
  console.log(`Gas 消耗:                    ${ethers.formatEther(gasIssue)} ETH`);
  console.log(`项目方期权 Token 余额:       ${ethers.formatEther(await optionToken.balanceOf(project.address))} 枚`);
  console.log(`合约中标的 ETH:               ${ethers.formatEther(await optionToken.totalUnderlying())} ETH`);
  console.log(`合约总 ETH 余额:              ${ethers.formatEther(await ethers.provider.getBalance(await optionToken.getAddress()))} ETH`);

  // =========================================================================
  // 4. 项目方创建期权/USDT 交易池（模拟用户购买期权市场）
  // =========================================================================
  divider("4. 创建期权/USDT 交易池");

  await optionToken.connect(project).approve(await pool.getAddress(), POOL_OPTION);
  await usdt.connect(project).approve(await pool.getAddress(), POOL_USDT);

  const txPool = await pool.connect(project).addLiquidity(POOL_OPTION, POOL_USDT);
  await txPool.wait();

  console.log(`池子期权储备:   ${ethers.formatEther(await pool.reserveOption())} 期权 Token`);
  console.log(`池子 USDT 储备: ${fmtUSDT(await pool.reserveUSDT())} USDT`);

  const initialPrice = await pool.getOptionPrice();
  const initialPriceEth = Number(ethers.formatEther(initialPrice));
  console.log(`当前价格:       1 USDT = ${initialPriceEth} 期权 Token`);
  const pricePerFullToken = 1 / initialPriceEth;
  console.log(`             即: ${pricePerFullToken.toFixed(2)} USDT 可买 1 个整期权 Token`);

  // =========================================================================
  // 5. 用户用 USDT 购买期权 Token
  // =========================================================================
  divider("5. 用户购买期权 Token");

  const userUSDTBefore = await usdt.balanceOf(user.address);
  const userOptionBefore = await optionToken.balanceOf(user.address);
  console.log(`用户 USDT 余额（购买前）:   ${fmtUSDT(userUSDTBefore)} USDT`);
  console.log(`用户期权余额（购买前）:     ${ethers.formatEther(userOptionBefore)} 枚`);

  await usdt.connect(user).approve(await pool.getAddress(), BUY_USDT);
  const txBuy = await pool.connect(user).buyOptions(BUY_USDT, 0n);
  await txBuy.wait();

  const userUSDTAfter = await usdt.balanceOf(user.address);
  const userOptionAfter = await optionToken.balanceOf(user.address);
  const bought = userOptionAfter - userOptionBefore;

  console.log(`用户支付:                   ${fmtUSDT(BUY_USDT)} USDT`);
  console.log(`用户获得期权 Token:         ${ethers.formatEther(bought)} 枚`);
  console.log(`用户 USDT 余额（购买后）:   ${fmtUSDT(userUSDTAfter)} USDT`);
  console.log(`用户期权余额（购买后）:     ${ethers.formatEther(userOptionAfter)} 枚`);

  const priceAfter = await pool.getOptionPrice();
  const priceAfterEth = Number(ethers.formatEther(priceAfter));
  console.log(`池子新价格:                 1 USDT = ${priceAfterEth.toFixed(6)} 期权 Token`);
  console.log(`                         即: ${(1 / priceAfterEth).toFixed(2)} USDT / 期权 Token`);

  // =========================================================================
  // 6. 时间穿越 → 到期日
  // =========================================================================
  divider("6. 时间穿越到行权日");

  // 设置下一个区块的时间戳为到期日
  await ethers.provider.send("evm_setNextBlockTimestamp", [expirationDate]);
  console.log(`到期日时间戳: ${expirationDate}`);
  console.log(`已将下一区块时间设为: ${new Date(expirationDate * 1000).toISOString()}`);

  // =========================================================================
  // 7. 用户行权：用期权 Token + ETH 换标的 ETH
  // =========================================================================
  divider("7. 用户行权（行使看涨期权）");

  const userOptionBalance = await optionToken.balanceOf(user.address);
  const exerciseAmount = userOptionBalance; // 全部行权
  const requiredPayment = (exerciseAmount * STRIKE_PRICE) / ethers.parseEther("1");

  console.log(`用户期权余额:          ${ethers.formatEther(userOptionBalance)} 枚`);
  console.log(`行权数量:              ${ethers.formatEther(exerciseAmount)} 枚`);
  console.log(`每枚需支付:            ${ethers.formatEther(STRIKE_PRICE)} ETH`);
  console.log(`共需支付:              ${ethers.formatEther(requiredPayment)} ETH`);

  const userETHBefore = await ethers.provider.getBalance(user.address);
  const contractETHBefore = await ethers.provider.getBalance(await optionToken.getAddress());

  const txExercise = await optionToken.connect(user).exercise(exerciseAmount, {
    value: requiredPayment,
  });
  const receiptExercise = await txExercise.wait();
  const gasExercise = receiptExercise.gasUsed * receiptExercise.gasPrice;

  const userETHAfter = await ethers.provider.getBalance(user.address);
  const contractETHAfter = await ethers.provider.getBalance(await optionToken.getAddress());

  console.log(`\n用户 ETH 余额（行权前）:  ${ethers.formatEther(userETHBefore)} ETH`);
  console.log(`用户 ETH 余额（行权后）:  ${ethers.formatEther(userETHAfter)} ETH`);
  const netGain = userETHAfter - userETHBefore + requiredPayment + gasExercise;
  console.log(`用户净收益:               ${ethers.formatEther(netGain)} ETH`);
  console.log(`  = 获得标的 ETH - 支付行权价 - Gas`);
  console.log(`合约 ETH 余额（行权前）:   ${ethers.formatEther(contractETHBefore)} ETH`);
  console.log(`合约 ETH 余额（行权后）:   ${ethers.formatEther(contractETHAfter)} ETH`);
  console.log(`用户期权余额（行权后）:    ${ethers.formatEther(await optionToken.balanceOf(user.address))} 枚（已全部销毁）`);

  // =========================================================================
  // 8. 项目方清算（到期后赎回剩余标的）
  // =========================================================================
  divider("8. 项目方到期清算");

  const projETHBeforeSettle = await ethers.provider.getBalance(project.address);
  const remainingUnderlying = await optionToken.totalUnderlying();
  console.log(`合约剩余标的:               ${ethers.formatEther(remainingUnderlying)} ETH`);
  console.log(`项目方 ETH 余额（清算前）:  ${ethers.formatEther(projETHBeforeSettle)} ETH`);

  // 设置下一个区块为到期日后一天，然后清算
  await ethers.provider.send("evm_setNextBlockTimestamp", [expirationDate + 86400]);

  const txSettle = await optionToken.connect(project).settle();
  const receiptSettle = await txSettle.wait();
  const gasSettle = receiptSettle.gasUsed * receiptSettle.gasPrice;

  const projETHAfterSettle = await ethers.provider.getBalance(project.address);
  const contractETHAfterSettle = await ethers.provider.getBalance(await optionToken.getAddress());

  console.log(`项目方 ETH 余额（清算后）: ${ethers.formatEther(projETHAfterSettle)} ETH`);
  const projNet = projETHAfterSettle - projETHBeforeSettle + gasSettle;
  console.log(`项目方净回款:               ${ethers.formatEther(projNet)} ETH`);
  console.log(`合约 ETH 余额:              ${ethers.formatEther(contractETHAfterSettle)} ETH（已清空）`);
  console.log(`已清算标记:                 ${await optionToken.isSettled()}`);

  // =========================================================================
  // 9. 总结
  // =========================================================================
  divider("9. 损益总结");

  console.log("【项目方】");
  console.log(`  存入标的:          +${ethers.formatEther(DEPOSIT_ETH)} ETH → ${ethers.formatEther(DEPOSIT_ETH)} 枚期权 Token`);
  console.log(`  池子售出期权:      ${ethers.formatEther(POOL_OPTION)} 枚 → ${fmtUSDT(POOL_USDT)} USDT（期权费收入）`);
  console.log(`  用户行权拿走标的:  ${ethers.formatEther(exerciseAmount)} ETH`);
  console.log(`  到期清算收回:      ${ethers.formatEther(projNet)} ETH（剩余标的 + 行权金）`);

  console.log("\n【用户】");
  console.log(`  购买期权费:        ${fmtUSDT(BUY_USDT)} USDT`);
  console.log(`  行权支付:          ${ethers.formatEther(requiredPayment)} ETH`);
  console.log(`  行权获得标的:      ${ethers.formatEther(exerciseAmount)} ETH`);
  console.log(`  净收益:            ${ethers.formatEther(netGain)} ETH`);
  console.log(`  （用户以 ${ethers.formatEther(STRIKE_PRICE)} ETH 单价买入 ${ethers.formatEther(exerciseAmount)} ETH 标的）`);

  divider("演示结束");
}

main().catch(console.error);
