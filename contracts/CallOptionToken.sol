// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CallOptionToken - ERC20 看涨期权 Token
/// @notice 每个 option token（按 wei 计）代表以 strikePrice 买入 1 wei 标的资产 ETH 的权利
/// @dev 发行 → 行权 → 过期销毁 三阶段生命周期
contract CallOptionToken is ERC20, Ownable {
    /// @notice 行权价格：每 wei 标的需支付的 ETH（wei），如 0.8 ether 表示以 8 折买入
    uint256 public immutable strikePrice;

    /// @notice 行权到期日（Unix timestamp），仅到期日当天可行权
    uint256 public immutable expirationDate;

    /// @notice 当前合约持有的标的资产（ETH）总量
    uint256 public totalUnderlying;

    /// @notice 是否已过期清算
    bool public isSettled;

    // ==================== Events ====================
    event Issued(address indexed project, uint256 optionAmount, uint256 ethAmount);
    event Exercised(address indexed holder, uint256 optionAmount, uint256 ethReceived, uint256 ethPaid);
    event Settled(address indexed project, uint256 remainingEth);

    /// @param _name Token 名称，如 "ETH Call Option 3000 Jun"
    /// @param _symbol Token 代号，如 "ETH-C-3000"
    /// @param _strikePrice 行权价（wei），如 0.8 ether
    /// @param _expirationDate 行权日（Unix timestamp）
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _strikePrice,
        uint256 _expirationDate
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(_expirationDate > block.timestamp, "Expiration must be in future");
        require(_strikePrice > 0, "Strike price must be > 0");
        strikePrice = _strikePrice;
        expirationDate = _expirationDate;
    }

    /// @notice 【项目方】存入 ETH 作为标的资产，1:1 铸造期权 Token
    /// @dev msg.value 的 wei 数量 = 铸造的 option token wei 数量
    function issue() external payable onlyOwner {
        require(block.timestamp < expirationDate, "Already expired");
        require(msg.value > 0, "Must deposit ETH");

        totalUnderlying += msg.value;
        _mint(msg.sender, msg.value);

        emit Issued(msg.sender, msg.value, msg.value);
    }

    /// @notice 【用户】在到期日行权：用 option token + ETH 换回标的 ETH
    /// @param optionAmount 要行权的 option token 数量（wei）
    /// @dev 用户需发送 optionAmount * strikePrice / 1 ether 的 ETH
    function exercise(uint256 optionAmount) external payable {
        require(block.timestamp == expirationDate, "Only on expiration date");
        require(optionAmount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= optionAmount, "Insufficient option tokens");
        require(optionAmount <= totalUnderlying, "Insufficient underlying");

        uint256 requiredPayment = (optionAmount * strikePrice) / 1 ether;
        require(msg.value >= requiredPayment, "Insufficient ETH payment");

        // 先扣状态再转账（防重入）
        _burn(msg.sender, optionAmount);
        totalUnderlying -= optionAmount;

        // 转出标的 ETH
        (bool ok, ) = msg.sender.call{value: optionAmount}("");
        require(ok, "ETH transfer failed");

        // 退还多余的 ETH
        uint256 refund = msg.value - requiredPayment;
        if (refund > 0) {
            (bool refundOk, ) = msg.sender.call{value: refund}("");
            require(refundOk, "Refund failed");
        }

        emit Exercised(msg.sender, optionAmount, optionAmount, requiredPayment);
    }

    /// @notice 【项目方】到期后清算：销毁所有未行权 Token，赎回剩余标的 ETH
    function settle() external onlyOwner {
        require(block.timestamp > expirationDate, "Not yet expired");
        require(!isSettled, "Already settled");

        isSettled = true;
        // 返回合约中全部 ETH（剩余标的 + 用户行权时支付的 ETH 都归项目方）
        uint256 remaining = address(this).balance;
        totalUnderlying = 0;

        (bool ok, ) = owner().call{value: remaining}("");
        require(ok, "ETH transfer failed");

        emit Settled(msg.sender, remaining);
    }

    /// @notice 接收 ETH（onlyOwner 已能处理，此函数为显式声明）
    receive() external payable {}
}
