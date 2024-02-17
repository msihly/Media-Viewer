import { computed } from "mobx";
import {
  applySnapshot,
  getSnapshot,
  Model,
  model,
  modelAction,
  ModelCreationData,
  prop,
} from "mobx-keystone";
import { ANIMATED_EXT_REG_EXP, dayjs, VIDEO_EXT_REG_EXP } from "utils";

@model("mediaViewer/File")
export class File extends Model({
  dateCreated: prop<string>(),
  dateModified: prop<string>(),
  diffusionParams: prop<string>(null),
  duration: prop<number>(null),
  ext: prop<string>(),
  frameRate: prop<number>(null),
  hasFaceModels: prop<boolean>(false),
  hash: prop<string>(),
  height: prop<number>(),
  id: prop<string>(),
  isArchived: prop<boolean>(),
  originalHash: prop<string>(null),
  originalName: prop<string>(null),
  originalPath: prop<string>(),
  path: prop<string>(),
  rating: prop<number>(),
  size: prop<number>(),
  tagIds: prop<string[]>(null),
  tagIdsWithAncestors: prop<string[]>(null),
  thumbPaths: prop<string[]>(null),
  width: prop<number>(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  update(file: Partial<ModelCreationData<File>>) {
    applySnapshot(this, { ...getSnapshot(this), ...file });
  }

  @modelAction
  updateTags({
    addedTagIds,
    dateModified = dayjs().toISOString(),
    removedTagIds,
  }: {
    addedTagIds?: string[];
    dateModified?: string;
    removedTagIds?: string[];
  }) {
    this.tagIds = this.tagIds
      .filter((tagId) => !removedTagIds?.includes(tagId))
      .concat(addedTagIds?.filter?.((tagId) => !this.tagIds.includes(tagId)) ?? []);
    this.dateModified = dateModified;
  }

  /* ----------------------------- GETTERS ----------------------------- */
  @computed
  get isAnimated() {
    return ANIMATED_EXT_REG_EXP.test(this.ext);
  }

  @computed
  get isVideo() {
    return VIDEO_EXT_REG_EXP.test(this.ext);
  }

  @computed
  get totalFrames() {
    return this.frameRate * this.duration;
  }
}
