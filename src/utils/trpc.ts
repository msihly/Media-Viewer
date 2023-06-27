import { Socket, io } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import env from "../env";
import { TRPCRouter } from "../server.js";

export let socket: Socket<DefaultEventsMap, DefaultEventsMap>;

export const setupSocketIO = () => {
  socket = io(`ws://localhost:${env.SOCKET_PORT}`);
  return socket;
};

// @ts-expect-error
export const trpc = createTRPCProxyClient<TRPCRouter>({
  links: [httpBatchLink({ url: `http://localhost:${+env?.SERVER_PORT || 3738}` })],
});