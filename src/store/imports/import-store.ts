import {
  _async,
  _await,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { computed } from "mobx";
import { RootStore } from "store";
import { FileImport, ImportBatch } from ".";
import { copyFileForImport } from "./import-queue";
import {
  dayjs,
  handleErrors,
  PromiseQueue,
  removeEmptyFolders,
  trpc,
  uniqueArrayMerge,
} from "utils";
import env from "env";
import path from "path";

export type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  editorFilePaths: prop<string[]>(() => []).withSetter(),
  editorFolderPaths: prop<string[]>(() => []).withSetter(),
  editorRootFolderIndex: prop<number>(0).withSetter(),
  editorImports: prop<FileImport[]>(() => []).withSetter(),
  importBatches: prop<ImportBatch[]>(() => []),
  isImportEditorOpen: prop<boolean>(false).withSetter(),
  isImportManagerOpen: prop<boolean>(false).withSetter(),
}) {
  queue: PromiseQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _createImportBatch({
    collectionTitle,
    createdAt,
    id,
    imports,
    tagIds = [],
  }: {
    collectionTitle?: string;
    createdAt: string;
    id: string;
    imports: ModelCreationData<FileImport>[];
    tagIds?: string[];
  }) {
    this.importBatches.push(
      new ImportBatch({
        collectionTitle,
        completedAt: null,
        createdAt,
        deleteOnImport: false,
        id,
        imports: imports.map((imp) => new FileImport(imp)),
        startedAt: null,
        tagIds,
      })
    );
  }

  @modelAction
  _deleteBatch(id: string) {
    this.importBatches = this.importBatches.filter((batch) => batch.id !== id);
  }

  @modelAction
  _deleteAllBatches() {
    this.importBatches = [];
  }

  @modelAction
  editBatchTags({
    addedIds = [],
    batchIds = [],
    removedIds = [],
  }: {
    addedIds?: string[];
    batchIds?: string[];
    removedIds?: string[];
  }) {
    if (!addedIds?.length && !removedIds?.length) return false;

    this.importBatches.forEach((batch) => {
      if (!batchIds.length || batchIds.includes(batch.id))
        batch.update({
          tagIds: uniqueArrayMerge(batch.tagIds, addedIds).filter((id) => !removedIds.includes(id)),
        });
    });
  }

  @modelAction
  overwrite(importBatches: ImportBatchInput[]) {
    this.importBatches = importBatches.map(
      (batch) =>
        new ImportBatch({ ...batch, imports: batch.imports.map((imp) => new FileImport(imp)) })
    );
  }

  @modelAction
  queueImportBatch(batchId: string) {
    const DEBUG = true;

    this.queue.add(async () => {
      const batch = this.getById(batchId);

      if (DEBUG)
        console.debug(
          "Starting importBatch:",
          JSON.stringify({ batchId, files: batch.imports }, null, 2)
        );

      const res = await trpc.startImportBatch.mutate({ id: batchId });
      if (!res.success) throw new Error(res.error);
      this.getById(batchId)?.update({ startedAt: res.data });

      batch.imports.forEach((file) => {
        this.queue.add(async () => {
          if (DEBUG) console.debug("Importing file:", JSON.stringify({ ...file }, null, 2));
          const res = await this.importFile({ batchId, filePath: file.path });
          if (!res.success) throw new Error(res.error);
        });
      });

      this.queue.add(async () => {
        const batch = this.getById(batchId);

        if (DEBUG) console.debug("Completing importBatch:", batchId);

        const duplicateFileIds = batch.imports
          .filter((file) => file.status === "DUPLICATE")
          .map((file) => file.fileId);
        if (duplicateFileIds.length) {
          try {
            const res = await trpc.addTagsToFiles.mutate({
              fileIds: duplicateFileIds,
              tagIds: batch.tagIds,
            });
            if (!res.success) throw new Error(res.error);
          } catch (err) {
            console.error("Error adding tags to duplicate files:", err);
          }
        }

        if (batch.collectionTitle) {
          try {
            const res = await trpc.createCollection.mutate({
              fileIdIndexes: batch.completed.map((f, i) => ({ fileId: f.fileId, index: i })),
              title: batch.collectionTitle,
            });
            if (!res.success) throw new Error(res.error);
          } catch (err) {
            console.error("Error creating collection:", err);
          }
        }

        if (batch.deleteOnImport) {
          try {
            const parentDirs = [...new Set(batch.imports.map((file) => path.dirname(file.path)))];
            await Promise.all(parentDirs.map((dir) => removeEmptyFolders(dir)));
          } catch (err) {
            console.error("Error removing empty folders:", err);
          }
        }

        const res = await this.completeImportBatch({ id: batchId });
        if (!res.success) throw new Error(res.error);
        if (DEBUG) console.debug("Completed importBatch:", batchId);
      });
    });
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  completeImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const rootStore = getRootStore<RootStore>(this);
        await rootStore.homeStore.reloadDisplayedFiles({ rootStore });

        const batch = this.getById(id);
        await Promise.all(batch.tagIds.map((id) => rootStore.tagStore.refreshTagCount({ id })));

        const completedAt = (await trpc.completeImportBatch.mutate({ id }))?.data;
        batch.update({ completedAt });
      })
    );
  });

  @modelFlow
  createImportBatch = _async(function* (
    this: ImportStore,
    {
      collectionTitle,
      deleteOnImport,
      imports,
      tagIds,
    }: {
      collectionTitle?: string;
      deleteOnImport: boolean;
      imports: ModelCreationData<FileImport>[];
      tagIds?: string[];
    }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const createdAt = dayjs().toISOString();

        const batchRes = await trpc.createImportBatch.mutate({
          collectionTitle,
          createdAt,
          deleteOnImport,
          imports,
          tagIds,
        });
        if (!batchRes.success) throw new Error(batchRes?.error);
        const id = batchRes.data._id.toString();
        if (!id) throw new Error("No id returned from createImportBatch");

        this._createImportBatch({ collectionTitle, createdAt, id, imports, tagIds });
        this.queueImportBatch(id);

        return true;
      })
    );
  });

  @modelFlow
  deleteAllImportBatches = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const deleteRes = await trpc.deleteAllImportBatches.mutate();
        if (!deleteRes?.success) return false;
        this._deleteAllBatches();
      })
    );
  });

  @modelFlow
  deleteImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const deleteRes = await trpc.deleteImportBatch.mutate({ id });
        if (!deleteRes?.success) return false;
        this._deleteBatch(id);
      })
    );
  });

  @modelFlow
  importFile = _async(function* (
    this: ImportStore,
    { batchId, filePath }: { batchId: string; filePath: string }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const batch = this.getById(batchId);
        const fileImport = batch?.getByPath(filePath);

        if (!batch || !fileImport || fileImport?.status !== "PENDING") {
          console.error({
            batch: batch?.toString?.({ withData: true }),
            fileImport: fileImport?.toString?.({ withData: true }),
          });
          throw new Error("Invalid batch or fileImport");
        }

        const copyRes = await copyFileForImport({
          deleteOnImport: batch.deleteOnImport,
          fileObj: fileImport,
          targetDir: env.OUTPUT_DIR,
          tagIds: batch.tagIds,
        });

        const errorMsg = copyRes.error ?? null;
        const fileId = copyRes.file?.id ?? null;
        const status = !copyRes?.success
          ? "ERROR"
          : copyRes?.isDuplicate
          ? "DUPLICATE"
          : "COMPLETE";
        const thumbPaths = copyRes.file?.thumbPaths ?? [];

        const updateRes = await trpc.updateFileImportByPath.mutate({
          batchId,
          errorMsg,
          fileId,
          filePath,
          status,
          thumbPaths,
        });
        if (!updateRes?.success) throw new Error(updateRes?.error);

        try {
          batch.updateImport(filePath, { errorMsg, fileId, status, thumbPaths });
        } catch (err) {
          console.error("Error updating import:", err);
        }
      })
    );
  });

  @modelFlow
  loadImportBatches = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listImportBatches.mutate();
        if (res.success) this.overwrite(res.data);

        this.batches.forEach(
          (batch) => batch.status === "PENDING" && this.queueImportBatch(batch.id)
        );
      })
    );
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getByCreatedAt(createdAt: string) {
    return this.importBatches.find((batch) => batch.createdAt === createdAt);
  }

  getById(id: string) {
    return this.importBatches.find((batch) => batch.id === id);
  }

  listByTagId(tagId: string) {
    return this.importBatches.filter((batch) => batch.tagIds.includes(tagId));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get batches() {
    return [...this.importBatches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  @computed
  get completedBatches() {
    return this.batches.filter((batch) => batch.completedAt?.length > 0);
  }

  @computed
  get incompleteBatches() {
    return this.batches.filter((batch) => batch.imports?.length > 0 && batch.nextImport);
  }

  @computed
  get editorRootFolder() {
    return this.editorRootPath.split(path.sep)[this.editorRootFolderIndex];
  }

  @computed
  get editorRootPath() {
    return this.editorFilePaths[0]
      ? path.dirname(this.editorFilePaths[0])
      : this.editorFolderPaths[0];
  }
}
