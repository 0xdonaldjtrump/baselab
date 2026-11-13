// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * Base Lab Hub – one contract with many kinds of on-chain actions for testing Base:
 * profiles, guestbook with likes, polls, counter and personal storage, ETH vault,
 * time-locked deposits, multisend (ETH and any ERC-20), signature verification
 * (personal_sign and EIP-712), gasless signed notes (meta-transactions), multicall,
 * an intentional revert and an admin announcement.
 */
contract LabHub is Ownable, Multicall, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    struct Profile {
        string name;
        string bio;
        uint16 hue;
        uint64 createdAt;
        uint64 updatedAt;
        bool exists;
    }

    struct Post {
        address author;
        uint64 time;
        uint32 likes;
        bool deleted;
        string text;
    }

    struct Poll {
        address creator;
        uint64 endsAt;
        string question;
        string[] options;
        uint256[] votes;
    }

    struct Lock {
        address owner;
        uint64 unlockAt;
        bool withdrawn;
        uint256 amount;
    }

    bytes32 private constant NOTE_TYPEHASH = keccak256("SignedNote(address wallet,string note,uint256 nonce)");

    // ------------------------------------------------------------------ storage

    string public announcement;
    uint256 public counter;
    uint256 public pings;
    uint256 public profileCount;

    mapping(address => Profile) private _profiles;
    mapping(address => uint256) public numberOf;
    mapping(address => string) public noteOf;
    mapping(address => uint256) public vaultOf;
    mapping(address => uint256) public nonces;

    Post[] private _posts;
    mapping(uint256 => mapping(address => bool)) public liked;

    Poll[] private _polls;
    mapping(uint256 => mapping(address => bool)) public voted;

    Lock[] private _locks;

    // ------------------------------------------------------------------ events

    event Pinged(address indexed from, uint256 total, uint256 blockNumber);
    event CounterChanged(address indexed by, uint256 value);
    event NumberSaved(address indexed user, uint256 value);
    event NoteSaved(address indexed user, string note, bool gasless);
    event ProfileRegistered(address indexed user, string name);
    event ProfileUpdated(address indexed user, string name);
    event ProfileDeleted(address indexed user);
    event Posted(uint256 indexed id, address indexed author, string text);
    event Liked(uint256 indexed id, address indexed by, uint256 likes);
    event PostDeleted(uint256 indexed id);
    event PollCreated(uint256 indexed id, address indexed creator, string question);
    event Voted(uint256 indexed id, address indexed voter, uint256 option);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Locked(uint256 indexed id, address indexed owner, uint256 amount, uint256 unlockAt);
    event Unlocked(uint256 indexed id, address indexed owner, uint256 amount);
    event MultiSent(address indexed from, address indexed token, uint256 recipients, uint256 total);
    event AnnouncementChanged(string text);

    // ------------------------------------------------------------------ errors

    error LabError(uint256 code, string reason);
    error TooLong();
    error Empty();
    error NoProfile();
    error ProfileExists();
    error BadId();
    error NotAuthor();
    error AlreadyLiked();
    error AlreadyVoted();
    error PollClosed();
    error BadOptions();
    error InsufficientVault();
    error StillLocked(uint256 unlockAt);
    error NotLockOwner();
    error AlreadyWithdrawn();
    error LengthMismatch();
    error WrongValue();
    error BadSignature();
    error SendFailed();

    constructor(address owner_) Ownable(owner_) EIP712("Base Lab", "1") {}

    // ------------------------------------------------------------------ basics

    function ping() external {
        pings += 1;
        emit Pinged(msg.sender, pings, block.number);
    }

    function increment() external {
        counter += 1;
        emit CounterChanged(msg.sender, counter);
    }

    function decrement() external {
        if (counter == 0) revert LabError(1, "Counter is already zero");
        counter -= 1;
        emit CounterChanged(msg.sender, counter);
    }

    function saveNumber(uint256 value) external {
        numberOf[msg.sender] = value;
        emit NumberSaved(msg.sender, value);
    }

    function saveNote(string calldata note) external {
        if (bytes(note).length > 280) revert TooLong();
        noteOf[msg.sender] = note;
        emit NoteSaved(msg.sender, note, false);
    }

    /// Always reverts – used to test how wallets and apps show errors.
    function failOnPurpose() external pure {
        revert LabError(42, "This transaction fails on purpose");
    }

    // ------------------------------------------------------------------ profiles

    function register(string calldata name, string calldata bio, uint16 hue) external {
        if (_profiles[msg.sender].exists) revert ProfileExists();
        _checkProfile(name, bio);
        _profiles[msg.sender] = Profile(name, bio, hue % 360, uint64(block.timestamp), uint64(block.timestamp), true);
        profileCount += 1;
        emit ProfileRegistered(msg.sender, name);
    }

    function updateProfile(string calldata name, string calldata bio, uint16 hue) external {
        Profile storage p = _profiles[msg.sender];
        if (!p.exists) revert NoProfile();
        _checkProfile(name, bio);
        p.name = name;
        p.bio = bio;
        p.hue = hue % 360;
        p.updatedAt = uint64(block.timestamp);
        emit ProfileUpdated(msg.sender, name);
    }

    function deleteProfile() external {
        if (!_profiles[msg.sender].exists) revert NoProfile();
        delete _profiles[msg.sender];
        profileCount -= 1;
        emit ProfileDeleted(msg.sender);
    }

    function getProfile(address user) external view returns (Profile memory) {
        return _profiles[user];
    }

    // ------------------------------------------------------------------ guestbook

    function post(string calldata text) external returns (uint256 id) {
        uint256 len = bytes(text).length;
        if (len == 0) revert Empty();
        if (len > 280) revert TooLong();
        id = _posts.length;
        _posts.push(Post(msg.sender, uint64(block.timestamp), 0, false, text));
        emit Posted(id, msg.sender, text);
    }

    function like(uint256 id) external {
        if (id >= _posts.length || _posts[id].deleted) revert BadId();
        if (liked[id][msg.sender]) revert AlreadyLiked();
        liked[id][msg.sender] = true;
        _posts[id].likes += 1;
        emit Liked(id, msg.sender, _posts[id].likes);
    }

    function deletePost(uint256 id) external {
        if (id >= _posts.length || _posts[id].deleted) revert BadId();
        if (_posts[id].author != msg.sender) revert NotAuthor();
        _posts[id].deleted = true;
        _posts[id].text = "";
        emit PostDeleted(id);
    }

    function postsLength() external view returns (uint256) {
        return _posts.length;
    }

    function getPosts(uint256 offset, uint256 limit) external view returns (Post[] memory out) {
        uint256 len = _posts.length;
        if (offset >= len) return new Post[](0);
        uint256 end = offset + limit > len ? len : offset + limit;
        out = new Post[](end - offset);
        for (uint256 i = offset; i < end; i++) out[i - offset] = _posts[i];
    }

    // ------------------------------------------------------------------ polls

    function createPoll(string calldata question, string[] calldata options, uint256 durationSeconds)
        external
        returns (uint256 id)
    {
        if (bytes(question).length == 0 || bytes(question).length > 200) revert TooLong();
        if (options.length < 2 || options.length > 6) revert BadOptions();
        for (uint256 i = 0; i < options.length; i++) {
            if (bytes(options[i]).length == 0 || bytes(options[i]).length > 60) revert BadOptions();
        }
        if (durationSeconds < 60 || durationSeconds > 30 days) revert LabError(2, "Duration must be 1 min - 30 days");
        id = _polls.length;
        Poll storage p = _polls.push();
        p.creator = msg.sender;
        p.endsAt = uint64(block.timestamp + durationSeconds);
        p.question = question;
        for (uint256 i = 0; i < options.length; i++) {
            p.options.push(options[i]);
            p.votes.push(0);
        }
        emit PollCreated(id, msg.sender, question);
    }

    function vote(uint256 id, uint256 option) external {
        if (id >= _polls.length) revert BadId();
        Poll storage p = _polls[id];
        if (block.timestamp >= p.endsAt) revert PollClosed();
        if (option >= p.options.length) revert BadOptions();
        if (voted[id][msg.sender]) revert AlreadyVoted();
        voted[id][msg.sender] = true;
        p.votes[option] += 1;
        emit Voted(id, msg.sender, option);
    }

    function pollsLength() external view returns (uint256) {
        return _polls.length;
    }

    function getPoll(uint256 id) external view returns (Poll memory) {
        if (id >= _polls.length) revert BadId();
        return _polls[id];
    }

    // ------------------------------------------------------------------ ETH vault and time locks

    function deposit() external payable {
        if (msg.value == 0) revert WrongValue();
        vaultOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0 || vaultOf[msg.sender] < amount) revert InsufficientVault();
        vaultOf[msg.sender] -= amount;
        _send(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function lock(uint256 secondsToLock) external payable returns (uint256 id) {
        if (msg.value == 0) revert WrongValue();
        if (secondsToLock > 365 days) revert LabError(3, "Max lock is 365 days");
        id = _locks.length;
        uint64 unlockAt = uint64(block.timestamp + secondsToLock);
        _locks.push(Lock(msg.sender, unlockAt, false, msg.value));
        emit Locked(id, msg.sender, msg.value, unlockAt);
    }

    function unlock(uint256 id) external nonReentrant {
        if (id >= _locks.length) revert BadId();
        Lock storage l = _locks[id];
        if (l.owner != msg.sender) revert NotLockOwner();
        if (l.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp < l.unlockAt) revert StillLocked(l.unlockAt);
        l.withdrawn = true;
        _send(msg.sender, l.amount);
        emit Unlocked(id, msg.sender, l.amount);
    }

    function locksLength() external view returns (uint256) {
        return _locks.length;
    }

    function getLock(uint256 id) external view returns (Lock memory) {
        if (id >= _locks.length) revert BadId();
        return _locks[id];
    }

    function locksOf(address user) external view returns (uint256[] memory ids, Lock[] memory items) {
        uint256 n;
        for (uint256 i = 0; i < _locks.length; i++) if (_locks[i].owner == user) n++;
        ids = new uint256[](n);
        items = new Lock[](n);
        uint256 j;
        for (uint256 i = 0; i < _locks.length; i++) {
            if (_locks[i].owner == user) {
                ids[j] = i;
                items[j] = _locks[i];
                j++;
            }
        }
    }

    // ------------------------------------------------------------------ multisend

    function multisendEth(address[] calldata to, uint256[] calldata amounts) external payable nonReentrant {
        if (to.length != amounts.length || to.length == 0 || to.length > 50) revert LengthMismatch();
        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) total += amounts[i];
        if (total != msg.value) revert WrongValue();
        for (uint256 i = 0; i < to.length; i++) _send(to[i], amounts[i]);
        emit MultiSent(msg.sender, address(0), to.length, total);
    }

    function multisendToken(IERC20 token, address[] calldata to, uint256[] calldata amounts) external nonReentrant {
        if (to.length != amounts.length || to.length == 0 || to.length > 50) revert LengthMismatch();
        uint256 total;
        for (uint256 i = 0; i < to.length; i++) {
            token.safeTransferFrom(msg.sender, to[i], amounts[i]);
            total += amounts[i];
        }
        emit MultiSent(msg.sender, address(token), to.length, total);
    }

    // ------------------------------------------------------------------ signatures

    /// Returns the wallet that signed `message` with personal_sign.
    function recoverPersonal(string calldata message, bytes calldata signature) external pure returns (address) {
        return ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(bytes(message)), signature);
    }

    /// Returns the wallet that signed the EIP-712 SignedNote.
    function recoverNote(address wallet, string calldata note, uint256 nonce, bytes calldata signature)
        public
        view
        returns (address)
    {
        bytes32 structHash = keccak256(abi.encode(NOTE_TYPEHASH, wallet, keccak256(bytes(note)), nonce));
        return ECDSA.recover(_hashTypedDataV4(structHash), signature);
    }

    /// Gasless note: `wallet` signs off-chain, anyone may submit the signature.
    function saveNoteWithSignature(address wallet, string calldata note, bytes calldata signature) external {
        if (bytes(note).length > 280) revert TooLong();
        uint256 nonce = nonces[wallet];
        if (recoverNote(wallet, note, nonce, signature) != wallet) revert BadSignature();
        nonces[wallet] = nonce + 1;
        noteOf[wallet] = note;
        emit NoteSaved(wallet, note, true);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ admin

    function setAnnouncement(string calldata text) external onlyOwner {
        if (bytes(text).length > 280) revert TooLong();
        announcement = text;
        emit AnnouncementChanged(text);
    }

    // ------------------------------------------------------------------ dashboard

    function stats()
        external
        view
        returns (
            uint256 counter_,
            uint256 pings_,
            uint256 profiles_,
            uint256 posts_,
            uint256 polls_,
            uint256 locks_,
            uint256 ethHeld
        )
    {
        return (counter, pings, profileCount, _posts.length, _polls.length, _locks.length, address(this).balance);
    }

    // ------------------------------------------------------------------ internal

    function _checkProfile(string calldata name, string calldata bio) internal pure {
        if (bytes(name).length == 0) revert Empty();
        if (bytes(name).length > 48 || bytes(bio).length > 200) revert TooLong();
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert SendFailed();
    }
}
