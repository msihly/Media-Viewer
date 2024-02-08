import fs from "fs/promises";
import path from "path";
import env from "env";
import {
  _async,
  _await,
  clone,
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
import * as db from "database";
import { FileImport, ImportBatch } from ".";
import { copyFileForImport } from "./import-queue";
import {
  dayjs,
  extendFileName,
  handleErrors,
  PromiseQueue,
  removeEmptyFolders,
  trpc,
  uniqueArrayMerge,
} from "utils";

export type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  editorFilePaths: prop<string[]>(() => []).withSetter(),
  editorRootFolderIndex: prop<number>(0).withSetter(),
  editorRootFolderPath: prop<string>("").withSetter(),
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
    deleteOnImport,
    id,
    imports,
    tagIds = [],
  }: {
    collectionTitle?: string;
    createdAt: string;
    deleteOnImport: boolean;
    id: string;
    imports: FileImport[];
    tagIds?: string[];
  }) {
    this.importBatches.push(
      new ImportBatch({
        collectionTitle,
        completedAt: null,
        createdAt,
        deleteOnImport,
        id,
        imports: imports.map((imp) => clone(imp)),
        startedAt: null,
        tagIds,
      })
    );
  }

  @modelAction
  _deleteBatches(ids: string[]) {
    this.importBatches = this.importBatches.filter((batch) => !ids.includes(batch.id));
  }

  @modelAction
  clearValues({ diffusionParams = false, tagIds = false, tagsToUpsert = false } = {}) {
    this.editorImports.forEach((imp) =>
      imp.update({
        ...(diffusionParams ? { diffusionParams: null } : {}),
        ...(tagIds ? { tagIds: [] } : {}),
        ...(tagsToUpsert ? { tagsToUpsert: [] } : {}),
      })
    );
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
          tagIds: uniqueArrayMerge([...batch.tagIds].flat(), addedIds).filter(
            (id) => !removedIds.includes(id)
          ),
        });
    });
  }

  @modelAction
  overwriteBatches(batches: ImportBatch[]) {
    this.importBatches = batches;
  }

  @modelAction
  queueImportBatch(batchId: string) {
    const DEBUG = false;

    this.queue.add(async () => {
      const batch = this.getById(batchId);

      if (DEBUG)
        console.debug(
          "Starting importBatch:",
          JSON.stringify({ batch: { ...batch, id: batchId } }, null, 2)
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
        if (DEBUG) console.debug("Completing importBatch:", batchId);
        const batch = this.getById(batchId);

        const duplicateFileIds = batch.imports
          .filter((file) => file.status === "DUPLICATE")
          .map((file) => file.fileId);
        if (duplicateFileIds.length) {
          try {
            const res = await trpc.editFileTags.mutate({
              fileIds: duplicateFileIds,
              addedTagIds: [...batch.tagIds].flat(),
              withSub: false,
            });
            if (!res.success) throw new Error(res.error);
          } catch (err) {
            console.error("Error adding tags to duplicate files:", err);
          }
        }

        if (batch.deleteOnImport) {
          try {
            const parentDirs = [...new Set(batch.imports.map((file) => path.dirname(file.path)))];
            await Promise.all(
              parentDirs.map((dir) => removeEmptyFolders(dir, { removeEmptyParent: true }))
            );
          } catch (err) {
            console.error("Error removing empty folders:", err);
          }
        }

        const res = await this.completeImportBatch({ batchId });
        if (!res.success) throw new Error(res.error);
        if (DEBUG) console.debug("Completed importBatch:", batchId);
      });
    });
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  completeImportBatch = _async(function* (this: ImportStore, { batchId }: { batchId: string }) {
    return yield* _await(
      handleErrors(async () => {
        const rootStore = getRootStore<RootStore>(this);
        const batch = this.getById(batchId);

        let collectionId: string = null;
        if (batch.collectionTitle) {
          const res = await rootStore.fileCollectionStore.createCollection({
            fileIdIndexes: batch.completed.map((f, i) => ({ fileId: f.fileId, index: i })),
            title: batch.collectionTitle,
          });
          if (!res.success) throw new Error(res.error);
          collectionId = res.data.id;
        }

        const completedAt = (await trpc.completeImportBatch.mutate({ collectionId, id: batchId }))
          ?.data;
        batch.update({ collectionId, completedAt });

        rootStore.homeStore.reloadDisplayedFiles({ rootStore });
        rootStore.tagStore.refreshTagCounts([...batch.tagIds].flat());
      })
    );
  });

  @modelFlow
  createImportBatches = _async(function* (
    this: ImportStore,
    batches: {
      collectionTitle?: string;
      deleteOnImport: boolean;
      imports: FileImport[];
      tagIds?: string[];
    }[]
  ) {
    return yield* _await(
      handleErrors(async () => {
        const createdAt = dayjs().toISOString();

        const batchRes = await trpc.createImportBatches.mutate(
          batches.map((b) => ({
            ...b,
            createdAt,
            imports: b.imports.map((imp) => imp.$ as ModelCreationData<FileImport>),
            tagIds: b.tagIds ? [...new Set(b.tagIds)].flat() : [],
          }))
        );
        if (!batchRes.success) throw new Error(batchRes?.error);

        await this.loadImportBatches();
      })
    );
  });

  @modelFlow
  deleteImportBatches = _async(function* (this: ImportStore, { ids }: db.DeleteImportBatchesInput) {
    return yield* _await(
      handleErrors(async () => {
        this.queue.clear();

        const deleteRes = await trpc.deleteImportBatches.mutate({ ids });
        if (!deleteRes?.success) return false;
        this._deleteBatches(ids);

        this.batches.forEach(
          (batch) => batch.status === "PENDING" && this.queueImportBatch(batch.id)
        );
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
        const rootStore = getRootStore<RootStore>(this);

        const batch = this.getById(batchId);
        const fileImport = batch?.getByPath(filePath);

        if (!batch || !fileImport) {
          console.error({
            batch: batch?.toString?.({ withData: true }),
            fileImport: fileImport?.toString?.({ withData: true }),
          });
          throw new Error("Invalid batch or fileImport");
        }

        if (fileImport.status !== "PENDING")
          return console.warn(
            `File already imported (Status: ${fileImport.status}):`,
            fileImport.path
          );

        const tagIds = [...batch.tagIds, ...fileImport.tagIds].flat();

        if (fileImport.tagsToUpsert?.length) {
          await Promise.all(
            fileImport.tagsToUpsert.map(async (t) => {
              const tag = rootStore.tagStore.getByLabel(t.label);
              if (tag) tagIds.push(tag.id);
              else {
                const parentTags = t.parentLabels?.length
                  ? t.parentLabels.map((l) => rootStore.tagStore.getByLabel(l)).filter(Boolean)
                  : null;

                const parentIds = parentTags?.map((t) => t.id) ?? [];

                const res = await rootStore.tagStore.createTag({
                  aliases: [...t.aliases],
                  label: t.label,
                  parentIds,
                });
                if (!res.success) throw new Error(res.error);

                tagIds.push(res.data.id);
              }
            })
          );
        }

        const copyRes = await copyFileForImport({
          deleteOnImport: batch.deleteOnImport,
          fileImport,
          targetDir: env.OUTPUT_DIR,
          tagIds: [...new Set(tagIds)],
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
  loadDiffusionParams = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const paramFilePaths = this.editorImports.reduce((acc, cur) => {
          if (cur.extension !== ".jpg") return acc;
          const paramFileName = extendFileName(cur.path, "txt");
          if (this.editorFilePaths.find((p) => p === paramFileName)) acc.push(paramFileName);
          return acc;
        }, [] as string[]);

        const paramFiles = await Promise.all(
          paramFilePaths.map(async (p) => {
            const params = await fs.readFile(p, { encoding: "utf8" });
            return { params, path: p };
          })
        );

        this.editorImports.forEach((imp) => {
          const paramFile = paramFiles.find((p) => p.path === extendFileName(imp.path, "txt"));
          if (paramFile) imp.update({ diffusionParams: paramFile.params });
        });
      })
    );
  });

  @modelFlow
  loadImportBatches = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        this.queue.clear();

        const res = await trpc.listImportBatches.mutate();
        if (res.success) {
          const batches = res.data.map(
            (batch) =>
              new ImportBatch({
                ...batch,
                imports: batch.imports.map((imp) => new FileImport(imp)),
              })
          );

          this.overwriteBatches(batches);

          batches.forEach((batch) => batch.status === "PENDING" && this.queueImportBatch(batch.id));
        }
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
    return this.importBatches.filter((batch) => [...batch.tagIds].flat().includes(tagId));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get batches() {
    return [...this.importBatches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  @computed
  get completedBatches() {
    return this.batches.filter((batch) => batch.completedAt);
  }

  @computed
  get editorRootFolder() {
    return (
      this.editorRootFolderPath.length &&
      this.editorRootFolderPath.split(path.sep)[this.editorRootFolderIndex]
    );
  }

  @computed
  get incompleteBatches() {
    return this.batches.filter((batch) => !batch.completedAt);
  }
}
