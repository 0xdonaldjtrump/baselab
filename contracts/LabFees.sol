// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Fee settings live in the LabHub contract; every Base Lab contract reads them from there.
interface ILabFeeConfig {
    function fee() external view returns (uint256);
    function feeRecipient() external view returns (address);
}

/**
 * Base Lab app fee: every app action costs at least `fee` wei in ETH.
 * Paying more is allowed – everything above the amount the action itself needs
 * goes to the fee recipient. Paying less reverts with FeeTooLow.
 */
abstract contract LabFees {
    event FeePaid(address indexed payer, address indexed recipient, uint256 amount);

    error FeeTooLow(uint256 required, uint256 sent);
    error FeeTransferFailed();

    function _feeConfig() internal view virtual returns (uint256 fee, address recipient);

    /// Fee is skipped while a LabHub multicall batch runs (the batch pays once).
    function _feeSkipped() internal view virtual returns (bool) {
        return false;
    }

    /// `reserved` = part of msg.value the action itself uses (e.g. a deposit).
    function _chargeFee(uint256 reserved) internal {
        if (_feeSkipped()) return;
        (uint256 fee, address recipient) = _feeConfig();
        if (msg.value < reserved + fee) revert FeeTooLow(reserved + fee, msg.value);
        uint256 paid = msg.value - reserved;
        if (paid != 0) {
            (bool ok,) = payable(recipient).call{value: paid}("");
            if (!ok) revert FeeTransferFailed();
            emit FeePaid(msg.sender, recipient, paid);
        }
    }
}

/// For LabToken, LabNFT and LabItems: fee settings come from the Hub.
abstract contract LabFeeClient is LabFees {
    ILabFeeConfig public immutable hub;

    constructor(address hub_) {
        hub = ILabFeeConfig(hub_);
    }

    function _feeConfig() internal view override returns (uint256, address) {
        return (hub.fee(), hub.feeRecipient());
    }

    function fee() external view returns (uint256) {
        return hub.fee();
    }

    modifier withFee() {
        _chargeFee(0);
        _;
    }
}
