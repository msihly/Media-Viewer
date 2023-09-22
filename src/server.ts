import path from "path";
import fs from "fs/promises";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { Server } from "socket.io";
import * as db from "./database";
import { CONSTANTS, logToFile, setupSocketIO } from "./utils";
import env from "./env";

/* ----------------------------- DATABASE SERVER ---------------------------- */
const createDbServer = async () => {
  logToFile("debug", "Creating Mongo server...");
  const dbPath = env.DB_PATH || path.join(path.resolve(), "MongoDB", "media-viewer");
  const port = +env.DB_PORT || 27070;

  const dbPathExists = await fs.stat(dbPath).catch(() => false);
  if (!dbPathExists) await fs.mkdir(dbPath, { recursive: true });

  const mongoServer = await MongoMemoryReplSet.create({
    instanceOpts: [{ dbPath, port, storageEngine: "wiredTiger" }],
    replSet: { dbName: "media-viewer", name: "rs0" },
  });

  const databaseUri = mongoServer.getUri();
  logToFile("debug", "Mongo server created:", databaseUri);

  logToFile("debug", "Connecting to database:", databaseUri, "...");
  await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);
  logToFile("debug", "Connected to database.");

  // logToFile("debug", "Creating database indexes...");
  // await db.FileModel.ensureIndexes();
  // logToFile("debug", "Database indexes created.");

  // logToFile("debug", "Syncing database indexes...");
  // await Mongoose.syncIndexes();
  // logToFile("debug", "Database indexes synced.");
};

/* ----------------------------- API / tRPC ROUTER ------------------------------ */
const t = initTRPC.create();
const tRouter = t.router;
const tProc = t.procedure;

/** All resources defined as mutation to deal with max length URLs in GET requests.
 * @see https://github.com/trpc/trpc/discussions/1936
 */
const trpcRouter = tRouter({
  addChildTagIdsToTags: tProc
    .input((input: unknown) => input as db.AddChildTagIdsToTagsInput)
    .mutation(({ input }) => db.addChildTagIdsToTags(input)),
  addParentTagIdsToTags: tProc
    .input((input: unknown) => input as db.AddParentTagIdsToTagsInput)
    .mutation(({ input }) => db.addParentTagIdsToTags(input)),
  addTagsToBatch: tProc
    .input((input: unknown) => input as db.AddTagsToBatchInput)
    .mutation(({ input }) => db.addTagsToBatch(input)),
  addTagsToFiles: tProc
    .input((input: unknown) => input as db.AddTagsToFilesInput)
    .mutation(({ input }) => db.addTagsToFiles(input)),
  completeImportBatch: tProc
    .input((input: unknown) => input as db.CompleteImportBatchInput)
    .mutation(({ input }) => db.completeImportBatch(input)),
  createImportBatch: tProc
    .input((input: unknown) => input as db.CreateImportBatchInput)
    .mutation(({ input }) => db.createImportBatch(input)),
  createTag: tProc
    .input((input: unknown) => input as db.CreateTagInput)
    .mutation(({ input }) => db.createTag(input)),
  deleteAllImportBatches: tProc.mutation(db.deleteAllImportBatches),
  deleteFiles: tProc
    .input((input: unknown) => input as db.DeleteFilesInput)
    .mutation(({ input }) => db.deleteFiles(input)),
  deleteImportBatch: tProc
    .input((input: unknown) => input as db.DeleteImportBatchInput)
    .mutation(({ input }) => db.deleteImportBatch(input)),
  deleteTag: tProc
    .input((input: unknown) => input as db.DeleteTagInput)
    .mutation(({ input }) => db.deleteTag(input)),
  editTag: tProc
    .input((input: unknown) => input as db.EditTagInput)
    .mutation(({ input }) => db.editTag(input)),
  getFileByHash: tProc
    .input((input: unknown) => input as db.GetFileByHashInput)
    .mutation(({ input }) => db.getFileByHash(input)),
  importFile: tProc
    .input((input: unknown) => input as db.ImportFileInput)
    .mutation(({ input }) => db.importFile(input)),
  listFiles: tProc
    .input((input: unknown) => input as db.ListFilesInput)
    .mutation(({ input }) => db.listFiles(input)),
  listFilesByTagIds: tProc
    .input((input: unknown) => input as db.ListFilesByTagIdsInput)
    .mutation(({ input }) => db.listFilesByTagIds(input)),
  listFilteredFileIds: tProc
    .input((input: unknown) => input as db.listFilteredFileIdsInput)
    .mutation(({ input }) => db.listFilteredFileIds(input)),
  listImportBatches: tProc.mutation(db.listImportBatches),
  listTags: tProc.mutation(db.getAllTags),
  onFilesDeleted: tProc
    .input((input: unknown) => input as db.OnFilesDeletedInput)
    .mutation(({ input }) => db.onFilesDeleted(input)),
  onFilesUpdated: tProc
    .input((input: unknown) => input as db.OnFilesUpdatedInput)
    .mutation(({ input }) => db.onFilesUpdated(input)),
  onFileTagsUpdated: tProc
    .input((input: unknown) => input as db.OnFileTagsUpdatedInput)
    .mutation(({ input }) => db.onFileTagsUpdated(input)),
  onTagCreated: tProc
    .input((input: unknown) => input as db.OnTagCreatedInput)
    .mutation(({ input }) => db.onTagCreated(input)),
  onTagDeleted: tProc
    .input((input: unknown) => input as db.OnTagDeletedInput)
    .mutation(({ input }) => db.onTagDeleted(input)),
  onTagUpdated: tProc
    .input((input: unknown) => input as db.OnTagUpdatedInput)
    .mutation(({ input }) => db.onTagUpdated(input)),
  recalculateTagCounts: tProc
    .input((input: unknown) => input as db.RecalculateTagCountsInput)
    .mutation(({ input }) => db.recalculateTagCounts(input)),
  removeChildTagIdsFromTags: tProc
    .input((input: unknown) => input as db.RemoveChildTagIdsFromTagsInput)
    .mutation(({ input }) => db.removeChildTagIdsFromTags(input)),
  removeParentTagIdsFromTags: tProc
    .input((input: unknown) => input as db.RemoveParentTagIdsFromTagsInput)
    .mutation(({ input }) => db.removeParentTagIdsFromTags(input)),
  removeTagFromAllFiles: tProc
    .input((input: unknown) => input as db.RemoveTagFromAllFilesInput)
    .mutation(({ input }) => db.removeTagFromAllFiles(input)),
  removeTagFromAllBatches: tProc
    .input((input: unknown) => input as db.RemoveTagFromAllBatchesInput)
    .mutation(({ input }) => db.removeTagFromAllBatches(input)),
  removeTagFromAllChildTags: tProc
    .input((input: unknown) => input as db.RemoveTagFromAllChildTagsInput)
    .mutation(({ input }) => db.removeTagFromAllChildTags(input)),
  removeTagFromAllParentTags: tProc
    .input((input: unknown) => input as db.RemoveTagFromAllParentTagsInput)
    .mutation(({ input }) => db.removeTagFromAllParentTags(input)),
  removeTagsFromBatch: tProc
    .input((input: unknown) => input as db.RemoveTagsFromBatchInput)
    .mutation(({ input }) => db.removeTagsFromBatch(input)),
  removeTagsFromFiles: tProc
    .input((input: unknown) => input as db.RemoveTagsFromFilesInput)
    .mutation(({ input }) => db.removeTagsFromFiles(input)),
  setFileIsArchived: tProc
    .input((input: unknown) => input as db.SetFileIsArchivedInput)
    .mutation(({ input }) => db.setFileIsArchived(input)),
  setFileRating: tProc
    .input((input: unknown) => input as db.SetFileRatingInput)
    .mutation(({ input }) => db.setFileRating(input)),
  setTagCount: tProc
    .input((input: unknown) => input as db.SetTagCountInput)
    .mutation(({ input }) => db.setTagCount(input)),
  startImportBatch: tProc
    .input((input: unknown) => input as db.StartImportBatchInput)
    .mutation(({ input }) => db.startImportBatch(input)),
  updateFile: tProc
    .input((input: unknown) => input as db.UpdateFileInput)
    .mutation(({ input }) => db.updateFile(input)),
  updateFileImportByPath: tProc
    .input((input: unknown) => input as db.UpdateFileImportByPathInput)
    .mutation(({ input }) => db.updateFileImportByPath(input)),
});
export type TRPCRouter = typeof trpcRouter;

/* ----------------------------- CREATE SERVER ----------------------------- */
export interface SocketEmitEvents {
  filesDeleted: (args: { fileIds: string[] }) => void;
  filesUpdated: (args: { fileIds: string[]; updates: Partial<db.File> }) => void;
  fileTagsUpdated: (args: {
    addedTagIds: string[];
    batchId?: string;
    fileIds?: string[];
    removedTagIds: string[];
  }) => void;
  tagCreated: (args: { tag: db.Tag }) => void;
  tagDeleted: (args: { tagId: string }) => void;
  tagUpdated: (args: { tagId: string; updates: Partial<db.Tag> }) => void;
}

export type SocketEmitEvent = keyof SocketEmitEvents;

export interface SocketEvents extends SocketEmitEvents {
  connected: () => void;
}

module.exports = (async () => {
  logToFile("debug", "Creating database server...");
  await createDbServer();
  logToFile("debug", "Database server created.");

  logToFile("debug", "Creating tRPC server...");
  const server = createHTTPServer({ router: trpcRouter });

  const serverPort = +env.SERVER_PORT || 3334;
  // @ts-expect-error
  server.listen(serverPort, () =>
    logToFile("debug", `tRPC server listening on port ${serverPort}...`)
  );

  const socketPort = +env.SOCKET_PORT || 3335;
  const io = new Server<SocketEvents, SocketEvents>(+env.SOCKET_PORT || 3335);

  io.on("connection", (socket) => {
    logToFile("debug", `Socket server listening on port ${socketPort}.`);
    socket.emit("connected");

    socket.on("filesDeleted", (...args) => socket.broadcast.emit("filesDeleted", ...args));
    socket.on("filesUpdated", (...args) => socket.broadcast.emit("filesUpdated", ...args));
    socket.on("fileTagsUpdated", (...args) => socket.broadcast.emit("fileTagsUpdated", ...args));
    socket.on("tagCreated", (...args) => socket.broadcast.emit("tagCreated", ...args));
    socket.on("tagDeleted", (...args) => socket.broadcast.emit("tagDeleted", ...args));
    socket.on("tagUpdated", (...args) => socket.broadcast.emit("tagUpdated", ...args));
  });

  setupSocketIO();

  logToFile("debug", "Servers created.");
  return { io, server, trpcRouter };
})();
