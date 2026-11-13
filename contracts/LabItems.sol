// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LabFeeClient} from "./LabFees.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * Base Lab Items – a test ERC-1155 collection (5 game items) with on-chain metadata.
 * Features: mint, safeTransferFrom, safeBatchTransferFrom, burn / burnBatch, total supply.
 */
contract LabItems is ERC1155, ERC1155Supply, Ownable, LabFeeClient {
    using Strings for uint256;

    uint256 public constant ITEM_TYPES = 5;
    uint256 public constant MAX_PER_MINT = 10;
    string public constant name = "Base Lab Items";
    string public constant symbol = "LABITEM";

    error BadItem();
    error BadAmount();

    constructor(address owner_, address hub_) ERC1155("") Ownable(owner_) LabFeeClient(hub_) {}

    function mint(uint256 id, uint256 amount) external payable withFee {
        if (id == 0 || id > ITEM_TYPES) revert BadItem();
        if (amount == 0 || amount > MAX_PER_MINT) revert BadAmount();
        _mint(msg.sender, id, amount, "");
    }

    /// Burns items from `account` (yourself or an account that approved you). App fee applies.
    function burn(address account, uint256 id, uint256 value) external payable withFee {
        if (account != msg.sender && !isApprovedForAll(account, msg.sender)) {
            revert ERC1155MissingApprovalForAll(msg.sender, account);
        }
        _burn(account, id, value);
    }

    function burnBatch(address account, uint256[] calldata ids, uint256[] calldata values) external payable withFee {
        if (account != msg.sender && !isApprovedForAll(account, msg.sender)) {
            revert ERC1155MissingApprovalForAll(msg.sender, account);
        }
        _burnBatch(account, ids, values);
    }

    function itemName(uint256 id) public pure returns (string memory) {
        if (id == 1) return "Sword";
        if (id == 2) return "Shield";
        if (id == 3) return "Potion";
        if (id == 4) return "Gem";
        if (id == 5) return "Key";
        revert BadItem();
    }

    function balancesOf(address account) external view returns (uint256[] memory out) {
        out = new uint256[](ITEM_TYPES);
        for (uint256 i = 0; i < ITEM_TYPES; i++) {
            out[i] = balanceOf(account, i + 1);
        }
    }

    function itemSvg(uint256 id) public pure returns (string memory) {
        string memory n = itemName(id);
        string memory hue = ((id * 67) % 360).toString();
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="24" fill="hsl(',
            hue,
            ',70%,35%)"/><polygon points="100,30 160,100 100,170 40,100" fill="hsl(',
            hue,
            ',90%,65%)" stroke="#fff" stroke-width="5"/><text x="100" y="190" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="20" font-weight="700" fill="#fff">',
            n,
            "</text></svg>"
        );
    }

    function uri(uint256 id) public pure override returns (string memory) {
        string memory json = string.concat(
            '{"name":"',
            itemName(id),
            '","description":"Base Lab test item #',
            id.toString(),
            '","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(itemSvg(id))),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }
}
