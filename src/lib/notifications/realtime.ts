import { DurableObject } from 'cloudflare:workers';
import type { RealtimeNotification, RealtimeNotificationMessage } from './types';

export type RealtimeConnection = {
  userId: string;
  organizationId: string;
  memberId: string;
  role: string;
};

export class OrganizationRealtime extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket diperlukan.', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const memberId = new URL(request.url).searchParams.get('memberId');
    const userId = new URL(request.url).searchParams.get('userId');
    const organizationId = new URL(request.url).searchParams.get('organizationId');
    const role = new URL(request.url).searchParams.get('role');
    if (!memberId || !userId || !organizationId || !role) {
      return new Response('Metadata koneksi tidak lengkap.', { status: 400 });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, organizationId, memberId, role } satisfies RealtimeConnection);
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(notification: RealtimeNotification): Promise<void> {
    const message: RealtimeNotificationMessage = { type: 'notification.created', notification };
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      const connection = socket.deserializeAttachment() as RealtimeConnection | null;
      if (connection?.organizationId !== notification.organizationId || connection.memberId !== notification.recipientMemberId) continue;
      try { socket.send(encoded); } catch { socket.close(1011, 'Pengiriman gagal'); }
    }
  }

  webSocketMessage(): void {
    // Client messages are intentionally ignored. This channel is server-push only.
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }
}
