import { prisma } from '../db';
import { verifySession, verifyInvite } from '../auth/tokens';

export interface AuthedSender {
  identity: string;
  role: 'agent' | 'customer';
  name: string;
}

// Authenticate a session participant the same way the chat socket does: agents
// present their session cookie and must own the session; customers present their
// session cookie (set on join) or the signed invite token. A client-supplied
// identity is never trusted. Shared by the chat WS and file upload/download.
export async function authenticateParticipant(
  cookieToken: string | undefined,
  inviteToken: string | undefined,
  sessionId: string,
): Promise<AuthedSender | null> {
  if (cookieToken) {
    try {
      const c = verifySession(cookieToken);
      if (c.role === 'agent') {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (session && session.createdById === c.sub) {
          return { identity: `agent-${c.sub.slice(0, 8)}`, role: 'agent', name: c.name };
        }
      } else if (c.role === 'customer' && c.sessionId === sessionId) {
        return { identity: c.sub, role: 'customer', name: c.name };
      }
    } catch {
      // fall through to invite check
    }
  }
  if (inviteToken) {
    try {
      const ic = verifyInvite(inviteToken);
      if (ic.sessionId === sessionId) {
        const invite = await prisma.invite.findUnique({ where: { id: ic.inviteId } });
        if (invite) {
          return {
            identity: `customer-${invite.id.slice(0, 8)}`,
            role: 'customer',
            name: invite.customerName ?? 'Customer',
          };
        }
      }
    } catch {
      // fall through
    }
  }
  return null;
}
