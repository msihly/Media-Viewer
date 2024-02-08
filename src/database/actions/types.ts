import { File, FileCollection, RegExMap } from "database";
import { FileImport, RootStore, SelectedImageTypes, SelectedVideoTypes } from "store";
import { ModelCreationData } from "mobx-keystone";
import { ImportStatus } from "components";

/* -------------------------------- COLLECTIONS ------------------------------- */
export type CreateCollectionInput = {
  fileIdIndexes: { fileId: string; index: number }[];
  title: string;
  withSub?: boolean;
};

export type DeleteCollectionInput = { id: string };

export type ListCollectionsInput = { ids?: string[] };

export type LoadCollectionsInput = { collectionIds?: string[]; withOverwrite?: boolean };

export type LoadSearchResultsInput = { page?: number; rootStore: RootStore };

export type OnCollectionCreatedInput = { collection: FileCollection };

export type UpdateCollectionInput = Partial<FileCollection> & { id: string };

/* ------------------------------ FILE IMPORTS ------------------------------ */
export type AddTagsToBatchInput = { batchId: string; tagIds: string[] };

export type CompleteImportBatchInput = { collectionId?: string; id: string };

export type CreateImportBatchesInput = {
  collectionTitle?: string;
  createdAt: string;
  deleteOnImport: boolean;
  imports: ModelCreationData<FileImport>[];
  tagIds?: string[];
}[];

export type DeleteImportBatchesInput = { ids: string[] };

export type RemoveTagsFromBatchInput = { batchId: string; tagIds: string[] };

export type StartImportBatchInput = { id: string };

export type UpdateFileImportByPathInput = {
  batchId: string;
  errorMsg?: string;
  fileId: string;
  filePath?: string;
  status?: ImportStatus;
  thumbPaths?: string[];
};

/* ---------------------------------- FILES --------------------------------- */
export type AddTagsToFilesInput = { fileIds: string[]; tagIds: string[] };

export type ArchiveFilesInput = { fileIds: string[] };

export type CreateFilterPipelineInput = {
  excludedAnyTagIds: string[];
  includedAllTagIds: IncludedAllTagItem[];
  includedAnyTagIds: string[];
  includeTagged: boolean;
  includeUntagged: boolean;
  isArchived: boolean;
  isSortDesc: boolean;
  selectedImageTypes: SelectedImageTypes;
  selectedVideoTypes: SelectedVideoTypes;
  sortKey: string;
};

export type DeleteFilesInput = { fileIds: string[] };

export type EditFileTagsInput = {
  addedTagIds?: string[];
  batchId?: string;
  fileIds: string[];
  removedTagIds?: string[];
};

export type GetFileByHashInput = { hash: string };

export type GetShiftSelectedFilesInput = CreateFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  isSortDesc: boolean;
  selectedIds: string[];
  sortKey: string;
};

export type ImportFileInput = {
  dateCreated: string;
  diffusionParams: string;
  duration: number;
  ext: string;
  frameRate: number;
  hash: string;
  height: number;
  originalName: string;
  originalPath: string;
  path: string;
  size: number;
  tagIds: string[];
  thumbPaths: string[];
  width: number;
};

export type IncludedAllTagItem = string | string[];

export type ListFaceModelsInput = { ids?: string[] };

export type ListFileIdsForCarouselInput = CreateFilterPipelineInput & {
  clickedId: string;
  isSortDesc: boolean;
  sortKey: string;
};

export type ListFilesInput = { ids?: string[]; withFaceModels?: boolean };

export type ListFilesByTagIdsInput = { tagIds: string[] };

export type ListFilteredFilesInput = CreateFilterPipelineInput & {
  isSortDesc: boolean;
  page: number;
  pageSize: number;
  sortKey: string;
};

export type LoadFaceModelsInput = { fileIds?: string[]; withOverwrite?: boolean };

export type LoadFilesInput = { fileIds?: string[]; withOverwrite?: boolean };

export type RefreshFileInput = { curFile?: File; id?: string; withThumbs?: boolean };

export type RefreshSelectedFilesInput = { withThumbs?: boolean };

export type RemoveTagsFromFilesInput = { fileIds: string[]; tagIds: string[] };

export type SetFileFaceModelsInput = {
  faceModels: {
    box: { height: number; width: number; x: number; y: number };
    /** JSON representation of Float32Array[] */
    descriptors: string;
    fileId: string;
    tagId: string;
  }[];
  id: string;
};

export type SetFileIsArchivedInput = { fileIds: string[]; isArchived: boolean };

export type SetFileRatingInput = { fileIds: string[]; rating: number };

export type UpdateFileInput = Partial<File> & { id: string };

/* ---------------------------------- TAGS ---------------------------------- */
export type CreateTagInput = {
  aliases?: string[];
  childIds?: string[];
  label: string;
  parentIds?: string[];
  regExMap?: RegExMap;
  withSub?: boolean;
};

export type DeleteTagInput = { id: string };

export type DetectFacesInput = { imagePath: string };

export type EditTagInput = Partial<CreateTagInput> & { id: string };

export type MergeTagsInput = Omit<Required<CreateTagInput>, "withSub"> & {
  tagIdToKeep: string;
  tagIdToMerge: string;
};

export type RecalculateTagCountsInput = { tagIds: string[]; withSub?: boolean };

export type RefreshTagRelationsInput = {
  changedChildIds?: { added?: string[]; removed?: string[] };
  changedParentIds?: { added?: string[]; removed?: string[] };
  dateModified: string;
  tagId: string;
  withSub?: boolean;
};

export type RemoveChildTagIdsFromTagsInput = { childTagIds: string[]; tagIds: string[] };

export type RemoveParentTagIdsFromTagsInput = { parentTagIds: string[]; tagIds: string[] };

export type SetTagCountInput = { count: number; id: string };
