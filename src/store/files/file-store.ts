import { promises as fs } from "fs";
import path from "path";
import md5File from "md5-file";
import { computed } from "mobx";
import {
  _async,
  _await,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { FaceModel, RootStore } from "store";
import {
  EditFileTagsInput,
  LoadFilesInput,
  RefreshFileInput,
  RefreshSelectedFilesInput,
  SetFileRatingInput,
} from "database";
import { File, mongoFileToMobX } from ".";
import {
  dayjs,
  generateFramesThumbnail,
  getVideoInfo,
  handleErrors,
  IMAGE_EXT_REG_EXP,
  PromiseQueue,
  splitArray,
  THUMB_WIDTH,
  trpc,
  VIDEO_EXT_REG_EXP,
} from "utils";
import { toast } from "react-toastify";

@model("mediaViewer/FileStore")
export class FileStore extends Model({
  activeFileId: prop<string | null>(null).withSetter(),
  files: prop<File[]>(() => []),
  isInfoModalOpen: prop<boolean>(false).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  selectedIds: prop<string[]>(() => []),
}) {
  infoRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  overwrite(files: ModelCreationData<File>[]) {
    this.files = files.map((f) => new File(f));
  }

  @modelAction
  toggleFilesSelected(selected: { id: string; isSelected?: boolean }[]) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id)
    );
  }

  @modelAction
  updateFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >
  ) {
    try {
      fileIds.forEach((id) => this.getById(id)?.update?.(updates));
    } catch (err) {
      console.error("Error updating files:", err.message);
    }
  }

  @modelAction
  updateFileTags({
    addedTagIds,
    fileIds,
    removedTagIds,
  }: {
    addedTagIds: string[];
    fileIds: string[];
    removedTagIds: string[];
  }) {
    fileIds.forEach((id) => this.getById(id)?.updateTags?.({ addedTagIds, removedTagIds }));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  deleteFiles = _async(function* (
    this: FileStore,
    {
      fileIds,
      isUndelete = false,
      rootStore,
    }: { fileIds: string[]; isUndelete?: boolean; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        if (!fileIds?.length) return false;

        if (isUndelete) {
          await trpc.setFileIsArchived.mutate({ fileIds, isArchived: false });
          toast.success(`${fileIds.length} files unarchived`);
        } else {
          const res = await trpc.listFiles.mutate({ ids: fileIds });
          if (!res.success) return false;
          const files = res.data;

          const [deleted, archived] = splitArray(files, (f) => f.isArchived);
          const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

          if (archivedIds?.length > 0) {
            await trpc.setFileIsArchived.mutate({ fileIds: archivedIds, isArchived: true });
            toast.success(`${archivedIds.length} files archived`);
          }

          if (deletedIds?.length > 0) {
            await trpc.deleteFiles.mutate({ fileIds: deletedIds });
            await Promise.all(
              deleted.flatMap((file) =>
                this.listByHash(file.hash).length === 1
                  ? [
                      fs.unlink(file.path),
                      ...file.thumbPaths.map((thumbPath) => fs.unlink(thumbPath)),
                    ]
                  : []
              )
            );

            await rootStore.tagStore.refreshTagCounts([
              ...new Set(deleted.flatMap((f) => f.tagIds)),
            ]);

            toast.success(`${deletedIds.length} files deleted`);
          }
        }

        this.toggleFilesSelected(fileIds.map((id) => ({ id, isSelected: false })));

        return true;
      })
    );
  });

  @modelFlow
  editFileTags = _async(function* (
    this: FileStore,
    { addedTagIds = [], batchId, fileIds, removedTagIds = [] }: EditFileTagsInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.editFileTags.mutate({
          addedTagIds,
          batchId,
          fileIds,
          removedTagIds,
        });

        if (!res.success) throw new Error(res.error);
        toast.success(`${fileIds.length} files updated`);
      })
    );
  });

  @modelFlow
  loadFiles = _async(function* (
    this: FileStore,
    { fileIds, withOverwrite = true }: LoadFilesInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        if (!fileIds?.length) return [];
        const filesRes = await trpc.listFiles.mutate({ ids: fileIds });
        if (filesRes.success && withOverwrite) this.overwrite(filesRes.data.map(mongoFileToMobX));
        return filesRes.data;
      })
    );
  });

  @modelFlow
  refreshFile = _async(function* (
    this: FileStore,
    { curFile, id, withThumbs = false }: RefreshFileInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        if (!curFile && !id) throw new Error("No file or id provided");
        const file = !curFile ? this.getById(id) : new File(mongoFileToMobX(curFile));
        const sharp = !file.isAnimated ? (await import("sharp")).default : null;

        const [hash, { mtime, size }, imageInfo, videoInfo] = await Promise.all([
          md5File(file.path),
          fs.stat(file.path),
          !file.isAnimated ? sharp(file.path).metadata() : null,
          file.isAnimated ? getVideoInfo(file.path) : null,
        ]);

        const updates: Partial<File> = {
          dateModified: dayjs(mtime).isAfter(file.dateModified)
            ? mtime.toISOString()
            : file.dateModified,
          duration: file.isAnimated ? videoInfo?.duration : file.duration,
          frameRate: file.isAnimated ? videoInfo?.frameRate : file.frameRate,
          hash,
          height: file.isAnimated ? videoInfo?.height : imageInfo?.height,
          originalHash: file.originalHash ?? hash,
          size,
          width: file.isAnimated ? videoInfo?.width : imageInfo?.width,
        };

        if (withThumbs) {
          const dirPath = path.dirname(file.path);

          const thumbPaths = file.isAnimated
            ? Array(9)
                .fill("")
                .map((_, i) =>
                  path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`)
                )
            : [path.join(dirPath, `${hash}-thumb${file.ext}`)];

          await (file.isAnimated
            ? generateFramesThumbnail(file.path, dirPath, hash, videoInfo?.duration)
            : sharp(file.path, { failOn: "none" }).resize(null, THUMB_WIDTH).toFile(thumbPaths[0]));

          updates["thumbPaths"] = thumbPaths;
        }

        await trpc.updateFile.mutate({ id, ...updates });
        file.update?.(updates);

        return updates;
      })
    );
  });

  @modelFlow
  refreshSelectedFiles = _async(function* (
    this: FileStore,
    { withThumbs = false }: RefreshSelectedFilesInput = {}
  ) {
    return yield* _await(
      handleErrors(async () => {
        let completedCount = 0;
        const totalCount = this.selectedIds.length;

        const toastId = toast.info(() => `Refreshed ${completedCount} files' info...`, {
          autoClose: false,
        });

        const filesRes = await this.loadFiles({ fileIds: this.selectedIds, withOverwrite: false });
        if (!filesRes?.success) throw new Error("Failed to load files");

        filesRes.data.map((curFile) =>
          this.infoRefreshQueue.add(async () => {
            await this.refreshFile({ curFile, withThumbs });

            completedCount++;
            const isComplete = completedCount === totalCount;

            toast.update(toastId, {
              autoClose: isComplete ? 5000 : false,
              render: `Refreshed ${completedCount} files${isComplete ? "." : "..."}`,
            });
          })
        );
      })
    );
  });

  @modelFlow
  setFileRating = _async(function* (this: FileStore, { fileIds = [], rating }: SetFileRatingInput) {
    return yield* _await(
      handleErrors(async () => {
        if (!fileIds.length) return;
        await trpc.setFileRating.mutate({ fileIds, rating });
      })
    );
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getById(id: string) {
    return this.files.find((f) => f.id === id);
  }

  listByHash(hash: string) {
    return this.files.filter((f) => f.hash === hash);
  }

  listByIds(ids: string[]) {
    return this.files.filter((f) => ids.includes(f.id));
  }

  listByTagId(tagId: string) {
    return this.files.filter((f) => f.tagIds.includes(tagId));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get archived() {
    return this.files.filter((f) => f.isArchived);
  }

  @computed
  get images() {
    return this.files.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
  }

  @computed
  get videos() {
    return this.files.filter((f) => VIDEO_EXT_REG_EXP.test(f.ext));
  }
}
