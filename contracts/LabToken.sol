// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LabFeeClient} from "./LabFees.sol";

/**
 * Base Lab Token (LAB) – a test ERC-20 for exercising Base.
 * Features: faucet (100 LAB per hour), transfer / approve / transferFrom,
 * burn, EIP-2612 permit (gasless approvals) and owner minting.
 */
contract LabToken is ERC20, ERC20Permit, Ownable, LabFeeClient {
    uint256 public constant FAUCET_AMOUNT = 100 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;
    mapping(address => uint256) public lastClaim;

    event FaucetClaimed(address indexed user, uint256 amount);

    error FaucetCooldown(uint256 availableAt);

    constructor(address owner_, address hub_)
        ERC20("Base Lab Token", "LAB")
        ERC20Permit("Base Lab Token")
        Ownable(owner_)
        LabFeeClient(hub_)
    {
        _mint(owner_, 1_000_000 ether);
    }

    function claim() external payable withFee {
        uint256 last = lastClaim[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) revert FaucetCooldown(last + FAUCET_COOLDOWN);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    function nextClaimAt(address user) external view returns (uint256) {
        uint256 last = lastClaim[user];
        return last == 0 ? 0 : last + FAUCET_COOLDOWN;
    }

    /// Destroys your own LAB (app fee applies).
    function burn(uint256 value) external payable withFee {
        _burn(msg.sender, value);
    }

    /// Destroys LAB from `account` using your allowance (app fee applies).
    function burnFrom(address account, uint256 value) external payable withFee {
        _spendAllowance(account, msg.sender, value);
        _burn(account, value);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
