// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * Base Lab NFT (LABNFT) – free test ERC-721 with fully on-chain SVG artwork.
 * Features: mint with your own label and colour, transfer, approve,
 * setApprovalForAll, burn, enumeration of owned tokens, owner pause.
 */
contract LabNFT is ERC721, ERC721Enumerable, ERC721Burnable, Ownable {
    using Strings for uint256;

    struct Art {
        string label;
        uint16 hue;
        uint64 mintedAt;
        address minter;
    }

    uint256 public totalMinted;
    bool public mintPaused;
    mapping(uint256 => Art) private _art;

    event Minted(uint256 indexed tokenId, address indexed to, string label, uint16 hue);

    error BadLabel();
    error MintPaused();

    constructor(address owner_) ERC721("Base Lab NFT", "LABNFT") Ownable(owner_) {}

    /// label: 1–24 characters A–Z, a–z, 0–9, space, - or _ ; hue: 0–359
    function mint(string calldata label, uint16 hue) external returns (uint256 tokenId) {
        if (mintPaused) revert MintPaused();
        _checkLabel(label);
        tokenId = ++totalMinted;
        _art[tokenId] = Art({label: label, hue: hue % 360, mintedAt: uint64(block.timestamp), minter: msg.sender});
        _safeMint(msg.sender, tokenId);
        emit Minted(tokenId, msg.sender, label, hue % 360);
    }

    function setMintPaused(bool paused_) external onlyOwner {
        mintPaused = paused_;
    }

    function artOf(uint256 tokenId) external view returns (Art memory) {
        _requireOwned(tokenId);
        return _art[tokenId];
    }

    /// All token ids owned by `owner` (for small wallets / testing).
    function tokensOf(address owner) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
    }

    function svg(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        Art memory a = _art[tokenId];
        string memory h1 = uint256(a.hue).toString();
        string memory h2 = uint256((a.hue + 120) % 360).toString();
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<defs><radialGradient id="g" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="hsl(',
            h1,
            ',90%,60%)"/><stop offset="1" stop-color="hsl(',
            h2,
            ',80%,22%)"/></radialGradient></defs><rect width="400" height="400" fill="url(#g)"/>',
            '<g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2">',
            '<circle cx="200" cy="170" r="60"/><circle cx="200" cy="170" r="90"/><circle cx="200" cy="170" r="120"/></g>',
            '<circle cx="200" cy="170" r="34" fill="#0052ff" stroke="#fff" stroke-width="6"/>',
            '<text x="200" y="320" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" fill="#fff">',
            a.label,
            '</text><text x="200" y="356" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="16" fill="#fff" opacity=".75">Base Lab #',
            tokenId.toString(),
            "</text></svg>"
        );
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        Art memory a = _art[tokenId];
        string memory json = string.concat(
            '{"name":"Base Lab #',
            tokenId.toString(),
            " - ",
            a.label,
            '","description":"Test NFT minted in Base Lab. Artwork is generated fully on-chain.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg(tokenId))),
            '","attributes":[{"trait_type":"Hue","value":',
            uint256(a.hue).toString(),
            '},{"trait_type":"Label","value":"',
            a.label,
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _checkLabel(string calldata label) internal pure {
        bytes memory b = bytes(label);
        if (b.length == 0 || b.length > 24) revert BadLabel();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c == 0x20
                || c == 0x2d || c == 0x5f;
            if (!ok) revert BadLabel();
        }
    }

    // required overrides
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
