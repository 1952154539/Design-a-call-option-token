// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDT - 模拟 USDT 用于期权交易演示
contract MockUSDT is ERC20, Ownable {
    constructor() ERC20("Mock USDT", "USDT") Ownable(msg.sender) {}

    function decimals() public view virtual override returns (uint8) {
        return 6; // USDT 标准为 6 位小数
    }

    /// @notice 铸造测试 USDT
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
