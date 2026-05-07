// SPDX-License-Identifier: MIT
// ABOUTME: Foundry tests for the propose-time guard on timelock.updateDelay(uint256).
// ABOUTME: Prevents a governance action from bricking queue() by setting _minDelay > MAX_EXECUTION_DELAY.
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import "../contracts/governance/ArmadaGovernor.sol";
import "../contracts/governance/ArmadaToken.sol";
import "../contracts/governance/ArmadaTreasuryGov.sol";
import "../contracts/governance/IArmadaGovernance.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "./helpers/GovernorDeployHelper.sol";

/// @title GovernorUpdateDelayCapTest — Propose-time cap on timelock.updateDelay(uint256).
/// @notice OZ TimelockController._schedule requires `delay >= getMinDelay()`. If governance
///         ever sets _minDelay above MAX_EXECUTION_DELAY (14 days), every subsequent queue()
///         reverts permanently. The governor enforces a cap at propose() so this cannot happen
///         via the governor's PROPOSER_ROLE path (the only path today).
contract GovernorUpdateDelayCapTest is Test, GovernorDeployHelper {
    ArmadaGovernor public governor;
    ArmadaToken public armToken;
    TimelockController public timelock;
    ArmadaTreasuryGov public treasury;

    address public deployer = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    uint256 constant TOTAL_SUPPLY = 12_000_000 * 1e18;
    uint256 constant TWO_DAYS = 2 days;

    function setUp() public {
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        timelock = new TimelockController(TWO_DAYS, proposers, executors, deployer);

        armToken = new ArmadaToken(deployer, address(timelock));
        treasury = new ArmadaTreasuryGov(address(timelock));

        governor = _deployGovernorProxy(
            address(armToken),
            payable(address(timelock)),
            address(treasury)
        );

        // Give alice well above the 0.1% proposal threshold so she can propose.
        address[] memory whitelist = new address[](3);
        whitelist[0] = deployer;
        whitelist[1] = alice;
        whitelist[2] = bob;
        armToken.initWhitelist(whitelist);

        armToken.transfer(alice, TOTAL_SUPPLY * 20 / 100);
        armToken.transfer(bob, TOTAL_SUPPLY * 10 / 100);

        vm.prank(alice);
        armToken.delegate(alice);
        vm.prank(bob);
        armToken.delegate(bob);

        vm.roll(block.number + 1);

        // Grant the governor PROPOSER_ROLE so the queue-time tests can call scheduleBatch.
        // Existing propose-only tests don't need this but are unaffected by the grant.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
    }

    // ======== Helpers ========

    function _singleAction(address target, bytes memory data) internal pure returns (
        address[] memory targets, uint256[] memory values, bytes[] memory calldatas
    ) {
        targets = new address[](1);
        values = new uint256[](1);
        calldatas = new bytes[](1);
        targets[0] = target;
        values[0] = 0;
        calldatas[0] = data;
    }

    function _updateDelayCalldata(uint256 newDelay) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(TimelockController.updateDelay.selector, newDelay);
    }

    // ======== Tests ========

    // WHY: Within-cap updateDelay must still be proposable — the guard is a ceiling,
    // not a blanket ban. Verifies normal governance operation is unaffected.
    function test_propose_updateDelay_withinCap_succeeds() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _updateDelayCalldata(7 days));

        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "updateDelay 7d");
        assertGt(id, 0, "proposal id should be assigned");
    }

    // WHY: The cap equals MAX_EXECUTION_DELAY. A value exactly at the cap is still safe
    // because a proposal type with executionDelay == 14d can satisfy delay >= getMinDelay.
    // Boundary test ensures the guard uses strict inequality (>), not >=.
    function test_propose_updateDelay_atCap_succeeds() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _updateDelayCalldata(14 days));

        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "updateDelay 14d");
        assertGt(id, 0, "at-cap updateDelay should be proposable");
    }

    // WHY: Core protection. One day over the cap is a permanent queue() brick if executed,
    // so the governor must refuse to create the proposal. Custom error carries the
    // requested value and the cap to aid off-chain monitoring / UI messaging.
    function test_propose_updateDelay_aboveCap_reverts() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _updateDelayCalldata(15 days));

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ArmadaGovernor.Gov_UpdateDelayExceedsCap.selector, 15 days, 14 days)
        );
        governor.propose(ProposalType.Extended, targets, values, calldatas, "updateDelay 15d");
    }

    // WHY: Unbounded uint256 is the exact scenario in issue #231. A far-out value (e.g.
    // type(uint256).max or hundreds of years) must be rejected the same as a small-but-over
    // value, with no decoding edge cases.
    function test_propose_updateDelay_maxUint_reverts() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _updateDelayCalldata(type(uint256).max));

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ArmadaGovernor.Gov_UpdateDelayExceedsCap.selector, type(uint256).max, 14 days)
        );
        governor.propose(ProposalType.Extended, targets, values, calldatas, "updateDelay max");
    }

    // WHY: The guard must catch a bad entry regardless of its position in a multi-action
    // batch. A proposer could otherwise hide a cap-violating call behind innocuous actions.
    function test_propose_updateDelay_batchWithBadEntry_reverts() public {
        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory calldatas = new bytes[](2);

        // Action 0: innocuous call on the governor (proposalCount() view — unused but legal calldata).
        targets[0] = address(governor);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("proposalCount()");

        // Action 1: the offending updateDelay above the cap.
        targets[1] = address(timelock);
        values[1] = 0;
        calldatas[1] = _updateDelayCalldata(30 days);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ArmadaGovernor.Gov_UpdateDelayExceedsCap.selector, 30 days, 14 days)
        );
        governor.propose(ProposalType.Extended, targets, values, calldatas, "batch brick");
    }

    // WHY: The guard is scoped to `target == address(timelock)`. A proposal calling some
    // other contract that happens to share the updateDelay(uint256) selector must NOT be
    // rejected by our cap — it has no bearing on the timelock's _minDelay. Out-of-scope
    // contracts are not our concern; classification handles their risk tier.
    function test_propose_updateDelay_nonTimelockTarget_notBlocked() public {
        // Treasury contract has no updateDelay — but we're proving the guard ignores the
        // selector when the target isn't the timelock. The proposal will be Extended via
        // fail-closed classification (selector not registered), which is fine.
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(treasury), _updateDelayCalldata(100 days));

        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "not timelock");
        assertGt(id, 0, "non-timelock target should not trip the updateDelay guard");
    }

    // WHY: Malformed calldata (selector only, no uint256 argument) cannot actually raise
    // _minDelay — it would revert at the timelock during execution. The guard must skip
    // rather than revert, so that accidental/invalid calldata doesn't block propose() with
    // a misleading error. Defensive parity with _classifyProposal's length checks.
    function test_propose_updateDelay_malformedCalldata_skipped() public {
        bytes memory malformed = abi.encodePacked(TimelockController.updateDelay.selector);
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), malformed);

        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "malformed");
        assertGt(id, 0, "selector-only updateDelay calldata should be skipped, not reverted");
    }

    // WHY: Signaling proposals carry no calldatas — the guard must not spuriously revert
    // on the empty path. Verifies the `proposalType != Signaling` short-circuit is correct.
    function test_propose_signaling_skipsUpdateDelayGuard() public {
        address[] memory targets = new address[](0);
        uint256[] memory values = new uint256[](0);
        bytes[] memory calldatas = new bytes[](0);

        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Signaling, targets, values, calldatas, "signaling only");
        assertGt(id, 0, "signaling proposals must bypass the updateDelay guard");
    }

    // ======== role-management calldata guards (audit-105) ========

    // WHY: Pre-fix, the propose-time guard was a per-selector allowlist with one
    // entry (UPDATE_DELAY_SELECTOR). Any other timelock-targeting calldata bypassed
    // the guard. Four shapes brick governance:
    //   1. revokeRole(PROPOSER_ROLE, governor) — every queue() reverts
    //   2. revokeRole(EXECUTOR_ROLE, governor) — every execute() reverts
    //   3. revokeRole(CANCELLER_ROLE, governor) — SC veto path reverts
    //   4. renounceRole(TIMELOCK_ADMIN_ROLE, timelock) — closes future role grants
    // Recovery is closed under production role layout (only governor holds the
    // three roles, only timelock self holds admin). Post-fix, propose() rejects
    // each shape with a typed error.

    function _revokeRoleCalldata(bytes32 role, address account) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(0xd547741f, role, account); // revokeRole(bytes32,address)
    }

    function _renounceRoleCalldata(bytes32 role, address account) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(0x36568abe, role, account); // renounceRole(bytes32,address)
    }

    function test_propose_revokeProposerFromGovernor_reverts() public {
        bytes32 role = timelock.PROPOSER_ROLE();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _revokeRoleCalldata(role, address(governor)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArmadaGovernor.Gov_CannotRevokeGovernorRole.selector, role));
        governor.propose(ProposalType.Extended, targets, values, calldatas, "revoke PROPOSER");
    }

    function test_propose_revokeExecutorFromGovernor_reverts() public {
        bytes32 role = timelock.EXECUTOR_ROLE();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _revokeRoleCalldata(role, address(governor)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArmadaGovernor.Gov_CannotRevokeGovernorRole.selector, role));
        governor.propose(ProposalType.Extended, targets, values, calldatas, "revoke EXECUTOR");
    }

    function test_propose_revokeCancellerFromGovernor_reverts() public {
        bytes32 role = timelock.CANCELLER_ROLE();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _revokeRoleCalldata(role, address(governor)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArmadaGovernor.Gov_CannotRevokeGovernorRole.selector, role));
        governor.propose(ProposalType.Extended, targets, values, calldatas, "revoke CANCELLER");
    }

    function test_propose_renounceTimelockAdmin_reverts() public {
        bytes32 role = timelock.TIMELOCK_ADMIN_ROLE();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _renounceRoleCalldata(role, address(timelock)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArmadaGovernor.Gov_CannotRenounceTimelockAdmin.selector));
        governor.propose(ProposalType.Extended, targets, values, calldatas, "renounce ADMIN");
    }

    // WHY: OZ AccessControl exposes two paths to remove a role from an account —
    // revokeRole(role, account) (caller has admin) and renounceRole(role, account)
    // (caller == account). For TIMELOCK_ADMIN_ROLE, a timelock self-call satisfies
    // BOTH gates: msg.sender == account == timelock AND timelock holds ADMIN. The
    // renounce path is blocked above; this test pins that the revoke path with the
    // same end state is also blocked. Without this branch, revokeRole(ADMIN, timelock)
    // slipped through `account == address(this)`-scoped check (account is timelock,
    // address(this) is the governor) and reached the same brick state — recovery
    // closed because no one holds ADMIN to grantRole.
    function test_propose_revokeTimelockAdminFromTimelock_reverts() public {
        bytes32 role = timelock.TIMELOCK_ADMIN_ROLE();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _revokeRoleCalldata(role, address(timelock)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArmadaGovernor.Gov_CannotRenounceTimelockAdmin.selector));
        governor.propose(ProposalType.Extended, targets, values, calldatas, "revoke ADMIN from timelock");
    }

    // WHY: revokeRole on a non-governor account (e.g. revoking a future backup
    // proposer) must NOT be blocked. The guard targets the governor-cardinality
    // invariant specifically.
    function test_propose_revokeRoleFromNonGovernor_notBlocked() public {
        bytes32 role = timelock.PROPOSER_ROLE();
        address backup = address(0xBAC4);
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _revokeRoleCalldata(role, backup));
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "revoke from backup");
        assertGt(id, 0, "revoking from non-governor must be allowed");
    }

    // WHY: revokeRole on a non-load-bearing role (e.g. some hypothetical future
    // role on the timelock) must NOT be blocked. Only PROPOSER/EXECUTOR/CANCELLER
    // are the load-bearing set.
    function test_propose_revokeOtherRoleFromGovernor_notBlocked() public {
        bytes32 unknownRole = keccak256("SOME_FUTURE_ROLE");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _revokeRoleCalldata(unknownRole, address(governor)));
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "revoke unknown role");
        assertGt(id, 0, "revoking a non-load-bearing role must be allowed");
    }

    // WHY: renounceRole(non-admin role) and renounceRole(admin from non-timelock)
    // must NOT be blocked — only the specific admin-renounce-by-timelock shape
    // closes future grant capability.
    function test_propose_renounceNonAdminRole_notBlocked() public {
        bytes32 role = timelock.PROPOSER_ROLE();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), _renounceRoleCalldata(role, address(governor)));
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "renounce PROPOSER from gov");
        assertGt(id, 0, "non-admin renounce must be allowed");
    }

    // WHY: grantRole calldata must NOT be blocked — adding a backup proposer or
    // executor is a legitimate governance action (and the auditor's complementary
    // recommendation).
    function test_propose_grantRole_notBlocked() public {
        bytes32 role = timelock.PROPOSER_ROLE();
        address backup = address(0xBAC4);
        bytes memory data = abi.encodeWithSelector(
            timelock.grantRole.selector, role, backup
        );
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(timelock), data);
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "grant backup");
        assertGt(id, 0, "grantRole must be allowed");
    }

    // WHY: The precomputed role-hash constants must match the live timelock's
    // role hashes. If OZ ever changes a role-name string, the precomputed hashes
    // would silently miss. Pinning equality at runtime guards against that drift.
    function test_invariant_precomputedRoleHashesMatchTimelock() public view {
        assertEq(keccak256("PROPOSER_ROLE"), timelock.PROPOSER_ROLE(), "PROPOSER hash drift");
        assertEq(keccak256("EXECUTOR_ROLE"), timelock.EXECUTOR_ROLE(), "EXECUTOR hash drift");
        assertEq(keccak256("CANCELLER_ROLE"), timelock.CANCELLER_ROLE(), "CANCELLER hash drift");
        assertEq(keccak256("TIMELOCK_ADMIN_ROLE"), timelock.TIMELOCK_ADMIN_ROLE(), "ADMIN hash drift");
    }

    // ======== queue-time _minDelay reconciliation (audit-103) ========

    // WHY: Pre-fix, queue() forwarded p.executionDelay verbatim to scheduleBatch. If a
    // governance action raised _minDelay above the snapshotted delay (e.g. to 8 days,
    // within the 14d propose-time cap), every queued proposal reverted on the OZ
    // delay >= getMinDelay() check — a permanent governance brick with no on-chain
    // recovery in production role layout. Post-fix, queue() widens the snapshot to
    // max(p.executionDelay, timelock.getMinDelay()), making the brick structurally
    // impossible.
    //
    // This test pins the reconciliation: a Standard proposal snapshotted at 2d still
    // queues successfully after _minDelay is raised to 8d, and the timelock receives
    // the widened 8d delay (not the stale 2d).
    function test_queue_widensSnapshotToLiveMinDelay_standard() public {
        // Snapshot a Standard proposal at the default 2d execution delay.
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(0xDEAD), abi.encodeWithSignature("setRevenueThreshold(uint256)", uint256(1)));
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Standard, targets, values, calldatas, "std snapshot 2d");

        // Vote and reach Succeeded.
        (, , uint256 voteStart, uint256 voteEnd, , , , , ) = governor.getProposal(id);
        if (block.timestamp <= voteStart) vm.warp(voteStart + 1);
        vm.prank(alice);
        governor.castVote(id, 1);
        vm.warp(voteEnd + 1);

        // Raise the timelock's _minDelay to 8d via a direct timelock self-call.
        // (Real protocol path: governance proposal calling timelock.updateDelay(8 days).)
        vm.prank(address(timelock));
        timelock.updateDelay(8 days);
        assertEq(timelock.getMinDelay(), 8 days, "minDelay raised to 8d");

        // Pre-fix: this would revert with "TimelockController: insufficient delay".
        // Post-fix: queue() widens the forwarded delay to 8d and scheduleBatch succeeds.
        uint256 queuedAt = block.timestamp;
        governor.queue(id);

        // Verify the timelock recorded the widened delay, not the stale 2d snapshot.
        bytes32 timelockId = timelock.hashOperationBatch(targets, values, calldatas, 0, _proposalSalt(id));
        uint256 eta = timelock.getTimestamp(timelockId);
        assertEq(eta, queuedAt + 8 days, "timelock ETA reflects widened 8d delay");
    }

    // WHY: Same behavior for Extended (snapshot 7d). With minDelay raised to 10d, the
    // queue widens to 10d. Confirms the widening applies regardless of proposal type.
    function test_queue_widensSnapshotToLiveMinDelay_extended() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(governor), abi.encodeWithSignature("proposalCount()"));
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "ext snapshot 7d");

        (, , uint256 voteStart, uint256 voteEnd, , , , , ) = governor.getProposal(id);
        if (block.timestamp <= voteStart) vm.warp(voteStart + 1);
        vm.prank(alice);
        governor.castVote(id, 1);
        vm.prank(bob);
        governor.castVote(id, 1);
        vm.warp(voteEnd + 1);

        vm.prank(address(timelock));
        timelock.updateDelay(10 days);

        uint256 queuedAt = block.timestamp;
        governor.queue(id);

        bytes32 timelockId = timelock.hashOperationBatch(targets, values, calldatas, 0, _proposalSalt(id));
        assertEq(timelock.getTimestamp(timelockId), queuedAt + 10 days, "Extended also widens to 10d");
    }

    // WHY: The widening is one-directional — it never SHORTENS the snapshot delay. If
    // _minDelay is below the snapshot, the snapshot wins. Pins the conservative direction
    // and prevents a future refactor from accidentally clamping in the wrong direction.
    function test_queue_doesNotShortenSnapshotWhenMinDelayLower() public {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _singleAction(address(governor), abi.encodeWithSignature("proposalCount()"));
        vm.prank(alice);
        uint256 id = governor.propose(ProposalType.Extended, targets, values, calldatas, "ext snapshot 7d, minDelay stays 2d");

        (, , uint256 voteStart, uint256 voteEnd, , , , , ) = governor.getProposal(id);
        if (block.timestamp <= voteStart) vm.warp(voteStart + 1);
        vm.prank(alice);
        governor.castVote(id, 1);
        vm.prank(bob);
        governor.castVote(id, 1);
        vm.warp(voteEnd + 1);

        // _minDelay stays at 2d (constructor default), snapshot = 7d. Snapshot wins.
        assertEq(timelock.getMinDelay(), 2 days, "minDelay unchanged");
        uint256 queuedAt = block.timestamp;
        governor.queue(id);

        bytes32 timelockId = timelock.hashOperationBatch(targets, values, calldatas, 0, _proposalSalt(id));
        assertEq(timelock.getTimestamp(timelockId), queuedAt + 7 days, "snapshot 7d preserved when minDelay lower");
    }

    // ======== Helper (audit-103) ========

    // WHY: queue() salts the timelock operation by bytes32(proposalId). Mirror that
    // exactly so we can re-derive the timelock id to call getTimestamp().
    function _proposalSalt(uint256 proposalId) internal pure returns (bytes32) {
        return bytes32(proposalId);
    }
}
