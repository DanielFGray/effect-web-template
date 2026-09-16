import { HttpApiBuilder } from "@effect/platform";
import { Organizations } from "../services/organizations.js";
import { withAuthContext } from "../db.js";
import { Contract } from "../../shared/httpApi.js";

export const OrganizationsApiGroupLive = HttpApiBuilder.group(
  Contract,
  "organizations",
  (handlers) =>
    handlers
      .handle("create", ({ payload }) =>
        Organizations.create(payload).pipe(withAuthContext),
      )
      .handle("list", () => Organizations.listMine().pipe(withAuthContext))
      .handle("getById", ({ path: { orgId } }) =>
        Organizations.byId(orgId).pipe(withAuthContext),
      )
      .handle("update", ({ path: { orgId }, payload }) =>
        Organizations.update(orgId, payload).pipe(withAuthContext),
      )
      .handle("delete", ({ path: { orgId } }) =>
        Organizations.delete(orgId).pipe(withAuthContext),
      )
      .handle("listMembers", ({ path: { orgId } }) =>
        Organizations.listMembers(orgId).pipe(withAuthContext),
      )
      .handle("listInvitations", ({ path: { orgId } }) =>
        Organizations.listInvitations(orgId).pipe(withAuthContext),
      )
      .handle("removeMember", ({ path: { orgId, userId } }) =>
        Organizations.removeMember(orgId, userId).pipe(withAuthContext),
      )
      .handle("invite", ({ path: { orgId }, payload }) =>
        Organizations.invite(orgId, payload).pipe(withAuthContext),
      )
      .handle("getForInvitation", ({ path: { invitationId }, urlParams }) =>
        Organizations.forInvitation(invitationId, urlParams.code).pipe(
          withAuthContext,
        ),
      )
      .handle("acceptInvitation", ({ path: { invitationId }, payload }) =>
        Organizations.acceptInvitation(invitationId, payload.code).pipe(
          withAuthContext,
        ),
      )
      .handle("transferOwnership", ({ path: { orgId }, payload }) =>
        Organizations.transferOwnership(orgId, payload.userId).pipe(
          withAuthContext,
        ),
      )
      .handle("transferBillingContact", ({ path: { orgId }, payload }) =>
        Organizations.transferBillingContact(orgId, payload.userId).pipe(
          withAuthContext,
        ),
      ),
);
