const { ethers } = require("hardhat");

async function main() {
  const [project, user] = await ethers.getSigners();
  console.log("Project (项目方):", project.address);
  console.log("User (用户):", user.address);

  // 1. Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  console.log("MockUSDT deployed at:", await usdt.getAddress());

  // 2. Deploy CallOptionToken
  const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  const expirationDate = currentTime + SEVEN_DAYS;

  const CallOptionToken = await ethers.getContractFactory("CallOptionToken");
  const optionToken = await CallOptionToken.deploy(
    "ETH Call Option",
    "ETH-CALL",
    ethers.parseEther("0.8"),   // strikePrice: 0.8 ETH per ETH (20% discount)
    expirationDate
  );
  await optionToken.waitForDeployment();
  console.log("CallOptionToken deployed at:", await optionToken.getAddress());
  console.log("Strike Price:", ethers.formatEther(await optionToken.strikePrice()), "ETH");
  console.log("Expiration:", new Date(expirationDate * 1000).toISOString());

  // 3. Deploy OptionPool
  const OptionPool = await ethers.getContractFactory("OptionPool");
  const pool = await OptionPool.deploy(
    await optionToken.getAddress(),
    await usdt.getAddress()
  );
  await pool.waitForDeployment();
  console.log("OptionPool deployed at:", await pool.getAddress());

  // Output addresses for later use
  console.log("\n=== Deployed Addresses ===");
  console.log("USDT:", await usdt.getAddress());
  console.log("CallOptionToken:", await optionToken.getAddress());
  console.log("OptionPool:", await pool.getAddress());
  console.log("ExpirationDate:", expirationDate);
}

main().catch(console.error);
